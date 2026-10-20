import { Color, Raycaster, Vector3 } from "three";
import type { Points, BufferGeometry, PointsMaterial } from "three";
import {
  isE2EProbeEnabled,
  LabelDataLayer,
  WindowPointer,
  EventSubscriptions,
  isLabelElementContributor,
  sameLabelElement,
} from "sta/app/editor";
import type {
  EditorLayerFactoryEnv,
  EditorWindowMapper,
  LabelElementEndpoint,
  LabelElementProvider,
  LabelElementReference,
  UUID,
  EditableBranch,
  LocalOperationEffectFactory,
  SceneContextEventMap,
  SceneLayerEventMap,
  DataViewEventMap,
  LayerStateEventMap,
  InteractControllerEventMap,
  ScenePointerEvent,
} from "sta/app/editor";

import { RelationView } from "./RelationView";
import type { RelationUpdateField } from "./RelationView";
import type { Relation, RelationGroup } from "./RelationIndex";
import {
  RelationActions,
  RelationOverlay,
  RelationPreferences,
  RelationTools,
} from "./RelationPanels.react";
import { RelationVisual, endpointMarker } from "./RelationVisual";
import { getRelationTooltipParts } from "./RelationTooltip";
import type { RelationTooltipPart } from "./RelationVisual";
import type { RelationPluginIntents, RelationSlice } from "./RelationSlice";
import { getRelationSettings } from "./RelationSettings";
import type { RelationSettings } from "./RelationSettings";

export function idKey(id: UUID): string {
  return typeof id === "string" ? id : id.wireKey;
}
function endpointText(reference: LabelElementReference): string {
  return `${reference.type} ${idKey(reference.id)}`;
}

/** Finds the nearest visible label, regardless of which plugin owns it. */
export function pickEndpoint(
  endpoints: Iterable<LabelElementEndpoint>,
  raycaster: Raycaster,
  excluded: LabelElementReference | null = null,
): LabelElementEndpoint | null {
  let closest: LabelElementEndpoint | null = null;
  let distance = Infinity;
  for (const endpoint of endpoints) {
    if (excluded != null && sameLabelElement(endpoint.reference, excluded))
      continue;
    for (const hit of endpoint.raycast(raycaster)) {
      if (hit.distance < distance) {
        closest = endpoint;
        distance = hit.distance;
      }
    }
  }
  return closest;
}

export class RelationLayer extends LabelDataLayer<
  EditorWindowMapper,
  import("./RelationIndex").RelationIndex
> {
  readonly #providers: readonly LabelElementProvider[];
  readonly #subscriptions = new EventSubscriptions();
  readonly #indexSubscriptions = new EventSubscriptions();
  readonly #branches = new Map<EditableBranch, LocalOperationEffectFactory>();
  readonly #pointer: WindowPointer;
  readonly #raycaster = new Raycaster();
  #version = 0;
  #settings: RelationSettings;
  #dirty = true;
  #classId: number | null = null;
  #observedClassId: number | undefined;
  #selectedId: string | null = null;
  #cycling = false;
  readonly #hiddenRelations = new Set<UUID>();

  #relationHidden(id: UUID): boolean {
    return [...this.#hiddenRelations].some((hiddenId) =>
      sameLabelElement(
        { type: "relation", id: hiddenId },
        { type: "relation", id },
      ),
    );
  }
  #hoveredId: string | null = null;
  #mode: RelationSlice["mode"] = "edit";
  #first: LabelElementReference | null = null;
  #hovered: LabelElementReference | null = null;
  #error: string | null = null;
  #endpoints: LabelElementEndpoint[] = [];
  #visuals: { relation: Relation | null; visual: RelationVisual }[] = [];
  #marker: Points<BufferGeometry, PointsMaterial> | null = null;
  #width = 1;
  #height = 1;
  #down: { x: number; y: number; pointerId: number } | null = null;
  declare readonly dataView: RelationView;

  constructor(env: EditorLayerFactoryEnv) {
    super(env.context, "Relations", new RelationView(env.context));
    this.#settings = getRelationSettings(env.context.config);
    this.#providers = Object.values(env.layers).flatMap((layer) =>
      isLabelElementContributor(layer) ? [layer.labelElementProvider] : [],
    );
    for (const provider of this.#providers)
      this.#subscriptions.addDisposer(provider.subscribe(this.#change));
    this.#subscriptions.add<
      SceneContextEventMap<EditorWindowMapper>,
      "isNavigating-changed"
    >(this.context, "isNavigating-changed", this.#change);
    this.#subscriptions.add<
      SceneContextEventMap<EditorWindowMapper>,
      "nav-frame"
    >(this.context, "nav-frame", () => {
      this.cancel();
      this.#registerBranch();
    });
    this.#subscriptions.add<
      SceneContextEventMap<EditorWindowMapper>,
      "nav-label-branch"
    >(this.context, "nav-label-branch", () => {
      this.#selectedId = null;
      this.#classId = null;
      this.cancel();
      this.#registerBranch();
    });
    this.#subscriptions.add<
      SceneContextEventMap<EditorWindowMapper>,
      "layer-activate"
    >(this.context, "layer-activate", () => {
      if (!this.isActive) this.cancel();
      this.#change();
    });
    this.#subscriptions.add<LayerStateEventMap, "change">(
      this.state,
      "change",
      () => {
        if (!this.state.enabled) this.cancel();
        this.#change();
      },
    );
    this.#subscriptions.add<DataViewEventMap, "beforeload">(
      this.dataView,
      "beforeload",
      () => {
        this.#indexSubscriptions.dispose();
        this.cancel();
      },
    );
    this.#subscriptions.add<DataViewEventMap, "afterload">(
      this.dataView,
      "afterload",
      () => {
        const index = this.dataView.data;
        if (index != null) {
          this.#indexSubscriptions.add<{ change: {} }, "change">(
            index,
            "change",
            this.#change,
          );
          if (
            this.#classId == null ||
            !index.selectableClassIds.includes(this.#classId)
          )
            this.#classId = index.selectableClassIds[0] ?? null;
        }
        this.#registerBranch();
        this.#change();
      },
    );
    this.#raycaster.params.Points.threshold = 0.5;
    this.#raycaster.params.Line.threshold = 0.25;
    // Line2 uses a separate screen-space threshold: add 6 pixels on each side.
    this.#raycaster.params.Line2 = { threshold: 12 };
    this.#pointer = new WindowPointer(this.context.display.windows.main);
    const interactor = this.#pointer.createInteractor({
      raycaster: this.#raycaster,
    });
    this.#subscriptions.addDisposer(() => interactor.dispose());
    this.#subscriptions.add<InteractControllerEventMap, "pointerleave">(
      interactor,
      "pointerleave",
      () => {
        if (this.#hoveredId == null && this.#hovered == null) return;
        this.#hoveredId = null;
        this.#hovered = null;
        this.#change();
      },
    );
    this.#subscriptions.add<InteractControllerEventMap, "pointermove">(
      interactor,
      "pointermove",
      () => {
        if (!this.#canInteract()) return;
        const hoveredId = this.#mode === "select" ? this.#pickRelation() : null;
        if (hoveredId !== this.#hoveredId) {
          this.#hoveredId = hoveredId;
          this.#change();
        }
        if (this.#mode === "edit" || this.#mode === "select") return;
        const hovered =
          pickEndpoint(this.#visibleEndpoints(), this.#raycaster, this.#first)
            ?.reference ?? null;
        if (
          hovered != null &&
          this.#hovered != null &&
          sameLabelElement(hovered, this.#hovered)
        )
          return;
        if (hovered == null && this.#hovered == null) return;
        this.#hovered = hovered;
        this.#change();
      },
    );
    this.#subscriptions.add<InteractControllerEventMap, "pointerdown">(
      interactor,
      "pointerdown",
      (event) => {
        if (event.button === 0 && this.#canInteract())
          this.#down = {
            x: event.clientX,
            y: event.clientY,
            pointerId: event.pointerId,
          };
      },
    );
    this.#subscriptions.add<InteractControllerEventMap, "pointerup">(
      interactor,
      "pointerup",
      (event) => this.#click(event),
    );
    this.#subscriptions.add<InteractControllerEventMap, "pointercancel">(
      interactor,
      "pointercancel",
      () => {
        this.#down = null;
      },
    );
    const actions = [
      {
        keyCombo: "s",
        name: "Select relation",
        handler: () => {
          if (this.#canInteract()) this.setMode("select");
        },
      },
      {
        keyCombo: "d",
        name: "Draw relation",
        handler: () => {
          if (this.#canInteract() && this.#classId != null)
            this.setMode("create");
        },
      },
    ];
    const preferences = [
      {
        keyCombo: "t",
        name: "Toggle relation tooltips",
        handler: () =>
          this.#setSettings({
            ...this.#settings,
            showTooltips: !this.#settings.showTooltips,
          }),
      },
    ];
    const context = [
      {
        keyCombo: "tab",
        name: "Cycle and isolate relations",
        handler: () => this.#cycleRelation(),
      },
      {
        keyCombo: "h",
        name: "Toggle hide in scene",
        handler: () => {
          const selected = this.#selected();
          if (selected != null && this.#canInteract())
            this.#setHidden(
              idKey(selected.id),
              !this.#relationHidden(selected.id),
            );
        },
      },
      {
        keyCombo: "escape",
        name: "Cancel relation creation",
        handler: () => this.cancel(),
      },
      {
        keyCombo: "delete",
        name: "Delete selected relation",
        handler: () => {
          const selected = this.#selected();
          if (selected != null && this.#canInteract())
            void this.#write("delete", selected);
        },
      },
    ];
    for (const binding of [...actions, ...preferences, ...context])
      this.keydownHandler.register(binding);
    this.setControlsSections([
      { title: "Actions", keybinds: actions },
      { title: "Preferences", keybinds: preferences },
      { title: "Context", keybinds: context },
    ]);
    this.#registerBranch();
  }

  #change = (): void => {
    const selected = this.#selected();
    if (
      selected == null ||
      !this.#canInteract() ||
      !this.state.isVisible("main")
    )
      this.#cycling = false;
    if (
      selected != null &&
      selected.relation_class_id !== this.#observedClassId
    )
      this.#classId = this.dataView.data?.selectableClassIds.includes(
        selected.relation_class_id,
      )
        ? selected.relation_class_id
        : null;
    this.#observedClassId = selected?.relation_class_id;
    const endpoints = this.#visibleEndpoints();
    const visible = (reference: LabelElementReference) =>
      endpoints.some((endpoint) =>
        sameLabelElement(endpoint.reference, reference),
      );
    if (
      this.#cycling &&
      selected != null &&
      (!visible(selected.source) || !visible(selected.target))
    )
      this.#cycling = false;
    if (this.#first != null && !visible(this.#first)) {
      this.#first = null;
      this.#hovered = null;
    }
    if (this.#hovered != null && !visible(this.#hovered)) this.#hovered = null;
    const hovered = [...(this.dataView.data?.relations.values() ?? [])].find(
      (relation) => idKey(relation.id) === this.#hoveredId,
    );
    const enabled = this.#canInteract() && this.state.isVisible("main");
    const drawing =
      this.#mode === "create" ||
      this.#mode === "source" ||
      this.#mode === "target";
    let highlight: LabelElementReference[] = [];
    if (
      enabled &&
      this.#mode === "select" &&
      hovered != null &&
      visible(hovered.source) &&
      visible(hovered.target)
    ) {
      highlight = [hovered.source, hovered.target];
    } else this.#hoveredId = null;
    if (enabled && drawing) {
      for (const reference of [this.#first, this.#hovered]) {
        if (
          reference != null &&
          !highlight.some((item) => sameLabelElement(item, reference))
        )
          highlight.push(reference);
      }
    }
    for (const provider of this.#providers) {
      provider.setIsolation(
        this,
        this.#cycling && selected != null
          ? [selected.source, selected.target]
          : null,
      );
      const references =
        provider.visible && provider.branch === this.context.currentLabelBranch
          ? highlight
          : [];
      if (drawing && references.length > 0)
        provider.setHighlights(this, references, { r: 1, g: 1, b: 0 });
      else provider.setHighlights(this, references);
    }
    this.#version++;
    this.#dirty = true;
    this.refreshHint();
    this.requestRender();
  };
  #canInteract(): boolean {
    return (
      this.isActive &&
      this.state.enabled &&
      !this.dataView.isLoading &&
      this.dataView.data != null &&
      !this.context.isNavigating
    );
  }
  #visibleEndpoints(): LabelElementEndpoint[] {
    return this.#providers
      .filter(
        (provider) =>
          provider.visible &&
          provider.branch === this.context.currentLabelBranch,
      )
      .flatMap((provider) => [...provider.elements()]);
  }
  #endpoint(
    reference: LabelElementReference,
  ): LabelElementEndpoint | undefined {
    return this.#endpoints.find((endpoint) =>
      sameLabelElement(endpoint.reference, reference),
    );
  }
  #selected(): Relation | undefined {
    return [...(this.dataView.data?.relations.values() ?? [])].find(
      (relation) => idKey(relation.id) === this.#selectedId,
    );
  }
  #registerBranch(): void {
    const branch = this.context.currentLabelBranch;
    const frame = this.context.currentFrame;
    if (branch == null || frame == null || this.#branches.has(branch)) return;
    const factory: LocalOperationEffectFactory = async (operation) => {
      if (
        operation.deletedElements == null ||
        operation.deletedElements.length === 0
      )
        return null;
      const currentFrame = this.context.currentFrame;
      if (currentFrame?.label_branch_id !== branch.id)
        throw new Error("Relation frame is not loaded");
      return this.dataView.deletionEffect(
        currentFrame,
        operation.deletedElements,
      );
    };
    branch.operationEffectFactories.add(factory);
    this.#branches.set(branch, factory);
  }
  #cycleRelation(advance = true): void {
    if (!this.#canInteract() || !this.state.isVisible("main")) return;
    const endpoints = this.#visibleEndpoints();
    const has = (reference: LabelElementReference) =>
      endpoints.some((endpoint) =>
        sameLabelElement(endpoint.reference, reference),
      );
    const groups = (this.dataView.data?.groups() ?? []).filter(
      ({ relation }) => has(relation.source) && has(relation.target),
    );
    if (groups.length === 0) return;
    const current = groups.findIndex((group) =>
      group.members.some((relation) => idKey(relation.id) === this.#selectedId),
    );
    const nextId =
      !advance && current >= 0
        ? this.#selectedId
        : idKey(groups[(current + 1) % groups.length].relation.id);
    this.#cycling = true;
    this.#select(nextId);
  }

  cancel(): void {
    this.#cycling = false;
    this.#first = null;
    this.#hovered = null;
    this.#hoveredId = null;
    this.#mode = "edit";
    this.#down = null;
    this.#change();
  }
  setMode(mode: RelationSlice["mode"]): void {
    this.#cycling = false;
    this.#first = null;
    this.#hovered = null;
    this.#hoveredId = null;
    this.#mode = mode;
    this.#error = null;
    this.#change();
  }
  async #write(
    mode: "create" | "update" | "delete",
    relation: Omit<Relation, "id"> & { id?: UUID },
    fields?: readonly RelationUpdateField[],
  ): Promise<void> {
    const index = this.dataView.data;
    const siblings =
      mode === "delete"
        ? (index
            ?.groups()
            .find((group) =>
              group.members.some((item) => item.id === relation.id),
            )?.members ?? [])
        : [];
    try {
      const id = await this.dataView.write(mode, relation, fields);
      this.#error = null;
      if (
        mode === "delete" &&
        relation.id != null &&
        this.#canInteract() &&
        this.dataView.data === index &&
        this.#selectedId === idKey(relation.id) &&
        index?.get(relation.id) == null
      ) {
        const remaining = siblings.filter(
          (item) => index?.get(item.id) != null,
        );
        const next =
          remaining.find((item) =>
            sameLabelElement(item.source, relation.source),
          ) ?? remaining[0];
        this.#select(next == null ? null : idKey(next.id));
        return;
      }
      // Queued creation must not replace the selection after a frame change.
      if (
        mode === "create" &&
        id != null &&
        this.dataView.data === index &&
        this.#canInteract()
      ) {
        this.#select(idKey(id));
        return;
      }
    } catch (error) {
      this.#error = error instanceof Error ? error.message : String(error);
    }
    this.#change();
  }
  #pickRelation(): string | null {
    let closest: Relation | null = null;
    let distance = Infinity;
    for (const { relation, visual } of this.#visuals) {
      if (relation == null) continue;
      const hit = this.#raycaster.intersectObject(visual.line, false)[0];
      if (hit != null && hit.distance < distance) {
        closest = relation;
        distance = hit.distance;
      }
    }
    return closest == null ? null : idKey(closest.id);
  }
  #click(event: ScenePointerEvent): void {
    const down = this.#down;
    this.#down = null;
    if (
      down?.pointerId !== event.pointerId ||
      Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4 ||
      !this.#canInteract()
    )
      return;
    if (this.#mode === "edit") return;
    this.#endpoints = this.#visibleEndpoints();
    if (this.#mode === "select") {
      this.#select(this.#pickRelation());
      return;
    }
    const endpoint = pickEndpoint(
      this.#endpoints,
      this.#raycaster,
      this.#first,
    );
    if (endpoint == null) return;
    if (this.#mode === "source" || this.#mode === "target") {
      this.#replaceEndpoint(this.#mode, endpoint.reference);
      return;
    }
    if (this.#first == null) {
      this.#first = endpoint.reference;
      this.#change();
      return;
    }
    if (
      sameLabelElement(this.#first, endpoint.reference) ||
      this.#classId == null
    )
      return;
    void this.#write("create", {
      source: this.#first,
      target: endpoint.reference,
      relation_class_id: this.#classId,
    });
    this.#first = null;
    this.#change();
  }
  #select(id: string | null): void {
    this.#selectedId = id;
    this.#hoveredId = null;
    this.#mode = "edit";
    this.#first = null;
    const relation = this.#selected();
    if (relation != null)
      this.#classId = this.dataView.data?.selectableClassIds.includes(
        relation.relation_class_id,
      )
        ? relation.relation_class_id
        : null;
    this.#change();
  }
  #replaceEndpoint(
    endpoint: "source" | "target",
    reference: LabelElementReference,
  ): void {
    const selected = this.#selected();
    if (selected == null || !this.#canInteract()) return;
    const relation = { ...selected, [endpoint]: reference };
    if (
      sameLabelElement(relation.source, relation.target) ||
      sameLabelElement(selected[endpoint], reference)
    )
      return;
    void this.#write("update", relation, [endpoint]);
    this.cancel();
  }
  #setSettings(settings: RelationSettings): void {
    this.#settings = {
      ...settings,
      hoverColor: { ...settings.hoverColor },
      selectColor: { ...settings.selectColor },
    };
    this.#change();
  }
  #setHidden(id: string, hidden: boolean): void {
    const group = this.dataView.data
      ?.groups()
      .find((item) => item.members.some((member) => idKey(member.id) === id));
    for (const member of group?.members ?? []) {
      if (hidden) this.#hiddenRelations.add(member.id);
      else {
        for (const hiddenId of this.#hiddenRelations) {
          if (
            sameLabelElement(
              { type: "relation", id: hiddenId },
              { type: "relation", id: member.id },
            )
          )
            this.#hiddenRelations.delete(hiddenId);
        }
      }
    }
    this.#change();
  }

  createEditorIntents(): RelationPluginIntents {
    return {
      relation: {
        cycle: () => this.#cycleRelation(),
        setIsolation: (enabled) => {
          if (enabled) this.#cycleRelation(false);
          else this.cancel();
        },
        setSettings: (settings) => this.#setSettings(settings),
        setMode: (mode) => this.setMode(mode),
        cancel: () => this.cancel(),
        select: (id) => this.#select(id),
        setHidden: (id, hidden) => this.#setHidden(id, hidden),
        replaceEndpoint: (endpoint, id) => {
          const candidate = this.#visibleEndpoints().find(
            (item) => endpointText(item.reference) === id,
          );
          if (candidate != null)
            this.#replaceEndpoint(endpoint, candidate.reference);
        },
        setClass: (id, relationId) => {
          if (!this.dataView.data?.selectableClassIds.includes(id)) return;
          if (relationId != null) {
            if (
              ![...this.dataView.data.relations.values()].some(
                (relation) => idKey(relation.id) === relationId,
              )
            )
              return;
            this.#select(relationId);
          }
          this.#classId = id;
          const selected = this.#selected();
          if (selected != null && this.#mode === "edit")
            void this.#write("update", { ...selected, relation_class_id: id }, [
              "relation_class_id",
            ]);
          this.#change();
        },
        add: async () => {
          const selected = this.#selected();
          if (selected == null || this.#classId == null || !this.#canInteract())
            return;
          await this.#write("create", {
            source: selected.source,
            target: selected.target,
            relation_class_id: this.#classId,
          });
        },
        remove: async () => {
          const relation = this.#selected();
          if (relation != null) await this.#write("delete", relation);
        },
      },
    };
  }
  mapEditorSlice(previous: RelationSlice | null): RelationSlice {
    if (previous?.version === this.#version) return previous;
    const index = this.dataView.data;
    // Hidden endpoint layers still supply inspector metadata for the branch.
    const endpoints = this.#providers
      .filter((provider) => provider.branch === this.context.currentLabelBranch)
      .flatMap((provider) =>
        [...provider.elements()].map((endpoint) => ({
          endpoint,
          visible: provider.visible,
        })),
      );
    const has = (ref: LabelElementReference) =>
      endpoints.some(
        ({ endpoint, visible }) =>
          visible && sameLabelElement(endpoint.reference, ref),
      );
    const objectClassName = (ref: LabelElementReference) =>
      endpoints.find(({ endpoint }) =>
        sameLabelElement(endpoint.reference, ref),
      )?.endpoint.objectClassName ?? null;
    return {
      version: this.#version,
      settings: this.#settings,
      disabled: !this.#canInteract(),
      loading: this.dataView.isLoading,
      error: this.#error ?? this.dataView.loadError,
      mode: this.#mode,
      cycling: this.#cycling,
      classId: this.#classId,
      selectedId: this.#selectedId,
      hoveredId: this.#hoveredId,
      active: this.isActive,
      firstEndpoint: this.#first == null ? null : endpointText(this.#first),
      endpoints: endpoints.map(({ endpoint, visible }) => {
        const reference = endpoint.reference;
        const id = reference.id;
        const displayId = typeof id === "string" ? id : id.orElse(id.wireKey);
        return {
          id: endpointText(reference),
          type: reference.type,
          text: `${displayId} — ${endpoint.objectClassName ?? "(Unclassified)"}`,
          visible,
        };
      }),
      classes:
        index == null
          ? []
          : index.selectableClassIds.flatMap((id) => {
              const item = index.classes.get(id);
              return item == null ? [] : [item];
            }),
      relations: (index?.groups() ?? []).map((group) => {
        const relation =
          group.members.find((item) => idKey(item.id) === this.#selectedId) ??
          group.relation;
        const displayId = (item: Relation) =>
          typeof item.id === "string"
            ? item.id
            : item.id.orElse(item.id.wireKey);
        return {
          id: idKey(relation.id),
          displayId: group.members.map(displayId).join(" / "),
          records: group.members.map((item) => ({
            id: idKey(item.id),
            displayId: displayId(item),
            name: index?.classes.get(item.relation_class_id)?.name ?? "",
            classId: item.relation_class_id,
            reversed: !sameLabelElement(item.source, relation.source),
            source: endpointText(item.source),
            target: endpointText(item.target),
          })),
          name: getRelationTooltipParts(group, index!.classes)
            .map((part) => part.text)
            .join(""),
          source: endpointText(relation.source),
          sourceClassName: objectClassName(relation.source),
          target: endpointText(relation.target),
          targetClassName: objectClassName(relation.target),
          visible: has(relation.source) && has(relation.target),
          hidden: group.members.some((item) => this.#relationHidden(item.id)),
        };
      }),
    };
  }
  subscribeEditorSlice(listener: () => void): () => void {
    const subscriptions = new EventSubscriptions();
    subscriptions.add<SceneLayerEventMap, "render-request">(
      this,
      "render-request",
      listener,
    );
    return () => subscriptions.dispose();
  }
  getE2EProbeLabelPoint(id: string, _subIndex: number | null): Vector3 | null {
    if (!isE2EProbeEnabled()) return null;
    const relation = this.dataView.data?.get(id);
    if (relation == null) return null;
    const endpoints = this.#visibleEndpoints();
    const source = endpoints.find((endpoint) =>
      sameLabelElement(endpoint.reference, relation.source),
    );
    const target = endpoints.find((endpoint) =>
      sameLabelElement(endpoint.reference, relation.target),
    );
    return source == null || target == null
      ? null
      : new Vector3()
          .copy(source.center)
          .add(target.center)
          .multiplyScalar(0.5);
  }
  getE2EProbeTransformHandle(_mode: string, _subIndex: number | null): null {
    return null;
  }
  getE2EProbeHoveredLabel(): string | null {
    if (!isE2EProbeEnabled()) return null;
    return (
      this.#hoveredId ??
      (typeof this.#hovered?.id === "string" ? this.#hovered.id : null)
    );
  }
  getE2EProbeSelectorRaycast(raycaster: Raycaster) {
    if (!isE2EProbeEnabled()) return null;
    const endpoints = this.#visibleEndpoints();
    const hit = pickEndpoint(endpoints, raycaster, this.#first);
    return {
      count: endpoints.length,
      hitId: hit == null ? null : idKey(hit.reference.id),
    };
  }
  getE2EProbeSelectorState() {
    return !isE2EProbeEnabled()
      ? null
      : {
          hoverEnabled: this.#canInteract(),
          ray: {
            origin: this.#raycaster.ray.origin.clone(),
            direction: this.#raycaster.ray.direction.clone(),
          },
        };
  }
  get prefsView() {
    return <RelationPreferences />;
  }
  get overlayView() {
    return <RelationOverlay />;
  }
  get actionsView() {
    return <RelationActions />;
  }
  get toolsView() {
    return <RelationTools />;
  }
  get objectTreeView() {
    return null;
  }
  getHint(): string {
    if (this.#cycling)
      return "Tab cycles relations. Escape restores all labels.";
    if (this.#mode === "create")
      return this.#first == null
        ? "Click the source label element."
        : "Click the target label element. Escape cancels.";
    if (this.#mode === "source" || this.#mode === "target")
      return `Click the new ${this.#mode} label element. Escape cancels.`;
    return this.#mode === "select"
      ? "Select a relation to edit its class or endpoints."
      : "Press S to select a relation or D to draw one.";
  }
  setOverlaySize(width: number, height: number): void {
    this.#width = width;
    this.#height = height;
    for (const { visual } of this.#visuals) visual.setResolution(width, height);
    this.requestRender();
  }
  #clearVisuals(): void {
    for (const { visual } of this.#visuals) visual.dispose();
    this.#visuals = [];
    if (this.#marker != null) {
      this.#marker.geometry.dispose();
      this.#marker.material.dispose();
      this.#marker = null;
    }
    this.objects.clear();
  }
  render(): void {
    if (!this.#dirty) return;
    this.#dirty = false;
    this.#clearVisuals();
    this.#endpoints = this.#visibleEndpoints();
    const index = this.dataView.data;
    const add = (
      source: LabelElementEndpoint,
      target: LabelElementEndpoint,
      color: number,
      tooltip: readonly RelationTooltipPart[],
      relation: Relation | null,
      group?: RelationGroup,
    ) => {
      const selected =
        group?.members.some((item) => idKey(item.id) === this.#selectedId) ??
        false;
      const hovered =
        group?.members.some((item) => idKey(item.id) === this.#hoveredId) ??
        false;
      const highlight =
        relation == null
          ? null
          : selected
            ? this.#settings.selectColor
            : hovered
              ? this.#settings.hoverColor
              : null;
      const visual = new RelationVisual(
        source.center,
        target.center,
        highlight == null
          ? color
          : new Color(highlight.r, highlight.g, highlight.b).getHex(),
        this.#settings.showTooltips
          ? tooltip.map((part) => part.text).join("")
          : "",
        selected || hovered
          ? this.#settings.lineWidth * 1.6
          : this.#settings.lineWidth,
        this.#settings.lineWidth,
        group?.members.some(
          (item) => !sameLabelElement(item.source, relation!.source),
        ) ?? false,
        tooltip,
      );
      visual.setResolution(this.#width, this.#height);
      this.objects.add(visual.objects);
      this.#visuals.push({ relation, visual });
    };
    for (const group of index?.groups() ?? []) {
      if (this.#cycling) {
        if (!group.members.some((item) => idKey(item.id) === this.#selectedId))
          continue;
      } else if (group.members.some((item) => this.#relationHidden(item.id)))
        continue;
      const relation = group.relation;
      const source = this.#endpoint(relation.source);
      const target = this.#endpoint(relation.target);
      const definition = index?.classes.get(relation.relation_class_id);
      if (source != null && target != null && definition != null)
        add(
          source,
          target,
          definition.color_rgb,
          getRelationTooltipParts(group, index!.classes),
          relation,
          group,
        );
    }
    const first = this.#first == null ? undefined : this.#endpoint(this.#first);
    if (first != null) {
      this.#marker = endpointMarker(first.center);
      this.objects.add(this.#marker);
      const target =
        this.#hovered == null ? undefined : this.#endpoint(this.#hovered);
      if (
        target != null &&
        !sameLabelElement(first.reference, target.reference)
      )
        add(first, target, 0xffff00, [], null);
    }
    this.refreshObjects();
  }
  dispose(): void {
    this.#subscriptions.dispose();
    for (const provider of this.#providers) {
      provider.setHighlights(this, []);
      provider.setIsolation(this, null);
    }
    this.#indexSubscriptions.dispose();
    this.#pointer.dispose();
    for (const [branch, factory] of this.#branches)
      branch.operationEffectFactories.delete(factory);
    this.#branches.clear();
    this.#clearVisuals();
    super.dispose();
  }
}
