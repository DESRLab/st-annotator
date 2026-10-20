import { z } from "zod";
import {
  LabelDataView,
  Placeholder,
  readResponseJson,
  sameLabelElement,
} from "sta/app/editor";
import type {
  DataLoader,
  DownloadProgressListener,
  EditableFrame,
  SceneContext,
  EditorWindowMapper,
  Operation,
  UUID,
  LabelElementReference,
  LocalOperationEffect,
} from "sta/app/editor";
import { RelationIndex } from "./RelationIndex";
import type { Relation, RelationClass } from "./RelationIndex";

const referenceSchema = z.object({ type: z.string(), id: z.string().uuid() });
export const relationDataSchema = z.object({
  frame_id: z.number(),
  branch_id: z.number(),
  head_hash: z.string(),
  relations: z.array(
    z.object({
      id: z.string().uuid(),
      source: referenceSchema,
      target: referenceSchema,
      relation_class_id: z.number().int(),
    }),
  ),
  classes: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      color_rgb: z.number().int(),
    }),
  ),
  selectable_class_ids: z.array(z.number().int()),
});
/** Downloads are frame-scoped; local mutations are shared across a branch. */
export class RelationLoader implements DataLoader<RelationIndex> {
  readonly #indexes = new Map<string, RelationIndex>();
  // Keep tombstones and edits so a later frame response cannot revive stale data.
  readonly #changes = new Map<number, Map<UUID, Relation | null>>();
  readonly #classes = new Map<number, Map<number, RelationClass>>();
  // Endpoint deletions also cover relations first discovered in later frames.
  readonly #endpointDeletions = new Map<
    number,
    Set<{ applyTo(index: RelationIndex): void }>
  >();
  readonly #pending = new Map<string, Promise<RelationIndex>>();
  readonly #controllers = new Set<AbortController>();
  #disposed = false;
  readonly #context: SceneContext<EditorWindowMapper>;
  constructor(context: SceneContext<EditorWindowMapper>) {
    this.#context = context;
  }
  async getData(
    frame: EditableFrame,
    signal?: AbortSignal,
    onProgress?: DownloadProgressListener,
  ): Promise<RelationIndex> {
    if (this.#disposed) throw new DOMException("Disposed", "AbortError");
    const branchId = frame.label_branch_id;
    const key = `${branchId}:${frame.id}`;
    const cached = this.#indexes.get(key);
    if (cached != null) return cached;
    let pending = this.#pending.get(key);
    if (pending == null) {
      const controller = new AbortController();
      this.#controllers.add(controller);
      // A frame abort must not cancel a dependency of a queued deletion.
      pending = this.#context.views
        .bulkGetLabelData("relation", [frame.id], {}, controller.signal)
        .then(async (response) => {
          if (!response.ok) throw new Error(await response.text());
          const [data] = z
            .array(relationDataSchema)
            .parse(await readResponseJson(response, onProgress));
          if (data?.branch_id !== branchId || data.frame_id !== frame.id)
            throw new Error("Invalid relation branch response");
          if (this.#disposed) throw new DOMException("Disposed", "AbortError");
          let classes = this.#classes.get(branchId);
          if (classes == null) {
            classes = new Map();
            this.#classes.set(branchId, classes);
          }
          const classesChanged = data.classes.some((definition) => {
            const previous = classes.get(definition.id);
            return (
              previous?.name !== definition.name ||
              previous.color_rgb !== definition.color_rgb
            );
          });
          const index = new RelationIndex(
            data.relations,
            data.classes,
            data.selectable_class_ids,
            (id, relation) => this.#mutate(branchId, index, id, relation),
            classes,
          );
          for (const [id, relation] of this.#changes.get(branchId) ?? []) {
            const previous = index.get(id);
            if (previous != null) index.relations.delete(previous.id);
            if (relation != null) index.relations.set(relation.id, relation);
          }
          this.#indexes.set(key, index);
          for (const deletion of this.#endpointDeletions.get(branchId) ?? [])
            deletion.applyTo(index);
          if (classesChanged)
            for (const [cachedKey, cachedIndex] of this.#indexes)
              if (cachedKey.startsWith(`${branchId}:`) && cachedIndex !== index)
                cachedIndex.dispatchEvent({ type: "change" });
          return index;
        })
        .finally(() => {
          this.#pending.delete(key);
          this.#controllers.delete(controller);
        });
      this.#pending.set(key, pending);
    }
    const index = await pending;
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return index;
  }
  #mutate(
    branchId: number,
    origin: RelationIndex,
    id: UUID,
    relation: Relation | null,
  ): void {
    let changes = this.#changes.get(branchId);
    if (changes == null) {
      changes = new Map();
      this.#changes.set(branchId, changes);
    }
    changes.set(id, relation);
    for (const [key, index] of this.#indexes) {
      if (!key.startsWith(`${branchId}:`) || index === origin) continue;
      const previous = index.get(id);
      if (previous != null) index.relations.delete(previous.id);
      if (relation != null) index.relations.set(relation.id, relation);
      index.dispatchEvent({ type: "change" });
    }
  }
  async deletionEffect(
    frame: EditableFrame,
    endpoints: readonly LabelElementReference[],
  ): Promise<LocalOperationEffect> {
    await this.getData(frame);
    const branchId = frame.label_branch_id;
    let deletions = this.#endpointDeletions.get(branchId);
    if (deletions == null) {
      deletions = new Set();
      this.#endpointDeletions.set(branchId, deletions);
    }
    const effects: LocalOperationEffect[] = [];
    const deletion = {
      applyTo: (index: RelationIndex) => {
        const effect = index.deletionEffect(endpoints);
        effect.apply();
        effects.push(effect);
      },
    };
    return {
      apply: () => {
        deletions.add(deletion);
        for (const [key, index] of this.#indexes)
          if (key.startsWith(`${branchId}:`)) deletion.applyTo(index);
      },
      undo: () => {
        deletions.delete(deletion);
        for (const effect of [...effects].reverse()) effect.undo();
        effects.length = 0;
      },
    };
  }
  isCached(frame: EditableFrame): boolean {
    return this.#indexes.has(`${frame.label_branch_id}:${frame.id}`);
  }
  dispose(): void {
    this.#disposed = true;
    for (const controller of this.#controllers) controller.abort();
    this.#controllers.clear();
    this.#indexes.clear();
    this.#changes.clear();
    this.#classes.clear();
    this.#endpointDeletions.clear();
  }
}

export interface RelationParams {
  source?: LabelElementReference;
  target?: LabelElementReference;
  relation_class_id?: number;
  relation_id?: UUID;
}
/** Explicit intent also preserves a queued reset to the currently stored value. */
export type RelationUpdateField = "source" | "target" | "relation_class_id";
/** An operation retains its accepted frame index when the view navigates. */
export class RelationOperation implements Operation<RelationParams, string> {
  readonly opName: string;
  readonly displayName: string;
  readonly opParams: RelationParams;
  readonly opResult: Placeholder<string> | null;
  readonly #index: RelationIndex;
  readonly #mode: "create" | "update" | "delete";
  #next: Relation | null;
  readonly #updates: Partial<Omit<Relation, "id">>;
  #previous: Relation | undefined;
  constructor(
    index: RelationIndex,
    mode: "create" | "update" | "delete",
    relation: Omit<Relation, "id"> & { id?: UUID },
    fields?: readonly RelationUpdateField[],
  ) {
    this.#index = index;
    this.#mode = mode;
    this.opName = `relation-${mode}`;
    this.displayName = `${mode[0].toUpperCase()}${mode.slice(1)} Relation`;
    this.opResult = mode === "create" ? new Placeholder<string>() : null;
    const id = this.opResult ?? relation.id;
    if (id == null) throw new Error("A relation id is required");
    const previous = index.get(id);
    // Capture intent before queueing, then merge it with the state at execution.
    const changedFields =
      fields ??
      (["source", "target", "relation_class_id"] as const).filter(
        (field) =>
          previous == null ||
          (field === "relation_class_id"
            ? previous[field] !== relation[field]
            : !sameLabelElement(previous[field], relation[field])),
      );
    this.#updates = {
      ...(changedFields.includes("source") ? { source: relation.source } : {}),
      ...(changedFields.includes("target") ? { target: relation.target } : {}),
      ...(changedFields.includes("relation_class_id")
        ? { relation_class_id: relation.relation_class_id }
        : {}),
    };
    this.#next = mode === "delete" ? null : { ...relation, id };
    this.opParams =
      mode === "delete"
        ? { relation_id: id }
        : {
            source: relation.source,
            target: relation.target,
            relation_class_id: relation.relation_class_id,
            ...(mode === "update" ? { relation_id: id } : {}),
          };
    if (this.opResult != null)
      void this.opResult
        .getAsync()
        .then(() => this.#index.dispatchEvent({ type: "change" }));
  }
  applyLocal(): void {
    const id = this.opParams.relation_id ?? this.opResult;
    if (id == null) throw new Error("A relation id is required");
    this.#previous = this.#index.get(id);
    if (this.#mode !== "create" && this.#previous == null)
      throw new Error("The relation no longer exists");
    if (this.#mode === "update" && this.#previous != null) {
      this.#next = { ...this.#previous, ...this.#updates };
      Object.assign(this.opParams, {
        source: this.#next.source,
        target: this.#next.target,
        relation_class_id: this.#next.relation_class_id,
      });
    }
    if (this.#next == null) this.#index.delete(id);
    else this.#index.set(this.#next);
  }
  undoLocal(): void {
    if (this.#previous != null) this.#index.set(this.#previous);
    else if (this.#next != null) this.#index.delete(this.#next.id);
  }
}
export class RelationView extends LabelDataView<RelationIndex> {
  constructor(context: SceneContext<EditorWindowMapper>) {
    super(new RelationLoader(context), context);
  }
  deletionEffect(
    frame: EditableFrame,
    endpoints: readonly LabelElementReference[],
  ): Promise<LocalOperationEffect> {
    return (this.loader as RelationLoader).deletionEffect(frame, endpoints);
  }
  async write(
    mode: "create" | "update" | "delete",
    relation: Omit<Relation, "id"> & { id?: UUID },
    fields?: readonly RelationUpdateField[],
  ): Promise<UUID | void> {
    const branch = this.currentBranch;
    const index = this.data;
    if (
      index == null ||
      branch == null ||
      this.isLoading ||
      this.context.isNavigating ||
      this.frame?.label_branch_id !== branch.id
    )
      throw new Error("Relation data is not loaded");
    const operation = new RelationOperation(index, mode, relation, fields);
    await branch.apply(operation);
    return operation.opResult ?? undefined;
  }
}
