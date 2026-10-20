import { VanillaEventDispatcher, sameLabelElement } from "sta/app/editor";
import type {
  LabelElementReference,
  UUID,
  LocalOperationEffect,
} from "sta/app/editor";

export interface Relation {
  readonly id: UUID;
  readonly source: LabelElementReference;
  readonly target: LabelElementReference;
  readonly relation_class_id: number;
}
export interface RelationClass {
  readonly id: number;
  readonly name: string;
  readonly color_rgb: number;
}
export interface RelationGroup {
  readonly relation: Relation;
  readonly members: Relation[];
}

function endpointKey(reference: LabelElementReference): string {
  const id = reference.id;
  return JSON.stringify([
    reference.type,
    typeof id === "string" ? id : id.orElse(id.wireKey),
  ]);
}
/** Frame-local relations with branch-shared class definitions for undo and navigation. */
export class RelationIndex extends VanillaEventDispatcher<{ change: {} }> {
  readonly relations = new Map<UUID, Relation>();
  readonly classes: Map<number, RelationClass>;
  readonly selectableClassIds: readonly number[];
  constructor(
    relations: readonly Relation[],
    classes: readonly RelationClass[],
    selectable: readonly number[],
    private readonly onMutation?: (id: UUID, relation: Relation | null) => void,
    classesById = new Map<number, RelationClass>(),
  ) {
    super();
    this.classes = classesById;
    for (const relation of relations) this.relations.set(relation.id, relation);
    for (const definition of classes)
      this.classes.set(definition.id, definition);
    this.selectableClassIds = selectable;
  }
  get(id: UUID): Relation | undefined {
    return (
      this.relations.get(id) ??
      [...this.relations.values()].find((item) =>
        sameLabelElement(
          { type: "relation", id: item.id },
          { type: "relation", id },
        ),
      )
    );
  }
  /** One editor label per endpoint pair; directed records remain authoritative. */
  groups(): RelationGroup[] {
    const groups = new Map<string, RelationGroup>();
    for (const relation of this.relations.values()) {
      const key = JSON.stringify(
        [endpointKey(relation.source), endpointKey(relation.target)].sort(),
      );
      const group = groups.get(key);
      if (group != null) group.members.push(relation);
      else groups.set(key, { relation, members: [relation] });
    }
    return [...groups.values()];
  }
  set(relation: Relation): void {
    this.relations.set(relation.id, relation);
    this.onMutation?.(relation.id, relation);
    this.dispatchEvent({ type: "change" });
  }
  delete(id: UUID): void {
    const record = this.get(id);
    if (record == null) throw new Error("The relation no longer exists");
    this.relations.delete(record.id);
    this.onMutation?.(record.id, null);
    this.dispatchEvent({ type: "change" });
  }
  deletionEffect(
    endpoints: readonly LabelElementReference[],
  ): LocalOperationEffect {
    let removed: Relation[] = [];
    return {
      apply: () => {
        removed = [...this.relations.values()].filter((relation) =>
          endpoints.some(
            (endpoint) =>
              sameLabelElement(endpoint, relation.source) ||
              sameLabelElement(endpoint, relation.target),
          ),
        );
        for (const relation of removed) this.delete(relation.id);
      },
      undo: () => {
        for (const relation of removed) this.set(relation);
        removed = [];
      },
    };
  }
}
