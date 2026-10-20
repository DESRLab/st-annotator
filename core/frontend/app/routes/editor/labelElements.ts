import type { Intersection, Raycaster, Vector3 } from "three";

import type { EditableBranch, Operation, UUID } from "./labelset";

/** Logical element identity; placeholders remain valid until the next save. */
export interface LabelElementReference {
  readonly type: string;
  readonly id: UUID;
}

/** Read-only geometry exposed by a label plugin for cross-plugin picking. */
export interface LabelElementEndpoint {
  readonly reference: LabelElementReference;
  /** Assigned object class, including a class inherited from a track or instance. */
  readonly objectClassName: string | null;
  readonly center: Readonly<Vector3>;
  raycast(raycaster: Raycaster): Intersection[];
}

export interface LabelElementHighlightColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** Structural contribution implemented by label layers, discovered at runtime. */
export interface LabelElementProvider {
  readonly branch: EditableBranch | null;
  readonly visible: boolean;
  elements(): Iterable<LabelElementEndpoint>;
  /** Transient highlights scoped to their contributor; an empty list releases them. */
  setHighlights(
    owner: object,
    elements: readonly LabelElementReference[],
    color?: LabelElementHighlightColor,
  ): void;
  /** Restricts scene labels to these elements; null releases this owner's filter. */
  setIsolation(
    owner: object,
    elements: readonly LabelElementReference[] | null,
  ): void;
  subscribe(listener: () => void): () => void;
}

/** Session-local visibility filters, independent of each label's hidden preference. */
export class LabelElementIsolation {
  readonly #requests = new Map<object, readonly LabelElementReference[]>();
  constructor(
    readonly type: string,
    readonly changed: () => void,
  ) {}

  get active(): boolean {
    return this.#requests.size > 0;
  }

  set(owner: object, elements: readonly LabelElementReference[] | null): void {
    const previous = this.#requests.get(owner);
    const next = elements?.filter((element) => element.type === this.type);
    if (next == null) {
      if (!this.#requests.delete(owner)) return;
    } else {
      if (
        previous?.length === next.length &&
        previous.every((element, index) =>
          sameLabelElement(element, next[index]),
        )
      )
        return;
      this.#requests.set(owner, next);
    }
    this.changed();
  }

  /** Null preserves local visibility; an active filter explicitly shows or hides. */
  visibility(id: UUID): boolean | null {
    if (!this.active) return null;
    return [...this.#requests.values()].every((elements) =>
      elements.some((element) =>
        sameLabelElement(element, { type: this.type, id }),
      ),
    );
  }
}

/** Shared highlight requests do not change an endpoint layer's selection or tools. */
export class LabelElementHighlights {
  readonly #requests = new Map<
    object,
    {
      elements: readonly LabelElementReference[];
      color?: LabelElementHighlightColor;
    }
  >();
  constructor(
    readonly type: string,
    readonly changed: () => void,
  ) {}
  set(
    owner: object,
    elements: readonly LabelElementReference[],
    color?: LabelElementHighlightColor,
  ): void {
    const next = elements.filter((element) => element.type === this.type);
    const request = this.#requests.get(owner);
    const previous = request?.elements ?? [];
    const nextColor = next.length === 0 ? undefined : color;
    if (
      previous.length === next.length &&
      previous.every((item, index) => sameLabelElement(item, next[index])) &&
      request?.color?.r === nextColor?.r &&
      request?.color?.g === nextColor?.g &&
      request?.color?.b === nextColor?.b
    )
      return;
    if (next.length === 0) this.#requests.delete(owner);
    else this.#requests.set(owner, { elements: next, color: nextColor });
    this.changed();
  }
  color(id: UUID): LabelElementHighlightColor | null {
    const reference = { type: this.type, id };
    for (const request of [...this.#requests.values()].reverse()) {
      if (
        request.color != null &&
        request.elements.some((item) => sameLabelElement(item, reference))
      )
        return request.color;
    }
    return null;
  }
  has(id: UUID): boolean {
    const reference = { type: this.type, id };
    return [...this.#requests.values()].some(({ elements }) =>
      elements.some((item) => sameLabelElement(item, reference)),
    );
  }
}

export interface LabelElementContributor {
  readonly labelElementProvider: LabelElementProvider;
}

/** Detects providers without introducing dependencies on label plugins. */
export function isLabelElementContributor(
  value: unknown,
): value is LabelElementContributor {
  return (
    value != null &&
    typeof value === "object" &&
    "labelElementProvider" in value
  );
}

/** Compares logical references, including ids resolved from local placeholders. */
export function sameLabelElement(
  a: LabelElementReference,
  b: LabelElementReference,
): boolean {
  if (a.type !== b.type) return false;
  if (a.id === b.id) return true;
  const aId = a.id;
  const bId = b.id;
  const left = typeof aId === "string" ? aId : aId.orElse(aId.wireKey);
  const right = typeof bId === "string" ? bId : bId.orElse(bId.wireKey);
  return left === right;
}

/** Additional local changes that belong to the same undoable operation. */
export interface LocalOperationEffect {
  apply(): void;
  undo(): void;
}

export type LocalOperationEffectFactory = (
  operation: Operation<unknown, {} | null>,
) => LocalOperationEffect | null | Promise<LocalOperationEffect | null>;

/** Wraps a label operation without changing its backend name, payload or result. */
export function withLocalOperationEffects<P, R extends {} | null>(
  operation: Operation<P, R>,
  effects: readonly LocalOperationEffect[],
): Operation<P, R> {
  if (effects.length === 0) return operation;
  let effectsApplied = false;
  return {
    displayName: operation.displayName,
    opName: operation.opName,
    opParams: operation.opParams,
    opResult: operation.opResult,
    deletedElements: operation.deletedElements,
    get isNoop() {
      return operation.isNoop;
    },
    applyLocal() {
      operation.applyLocal();
      if (operation.isNoop) return;
      let applied = 0;
      try {
        for (const effect of effects) {
          effect.apply();
          applied++;
        }
        effectsApplied = true;
      } catch (error) {
        for (let i = applied - 1; i >= 0; i--) effects[i].undo();
        operation.undoLocal();
        throw error;
      }
    },
    undoLocal() {
      operation.undoLocal();
      if (effectsApplied) {
        for (let i = effects.length - 1; i >= 0; i--) effects[i].undo();
        effectsApplied = false;
      }
    },
  };
}
