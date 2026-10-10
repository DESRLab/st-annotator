import type { Placeholder } from "sta/app/editor";

import type { _BBoxIndex } from "../BBoxIndex";

/**
 * Thrown by an operation whose target label no longer exists in the index it
 * is applied to (e.g. the label was deleted before a stale callback queued by
 * the UI could run). Callers such as the data view convert this into a
 * deterministic no-op instead of leaking the exception or corrupting the
 * branch history.
 */
export class StaleTargetError extends Error {}

/**
 * Abstract base class for operations that can be applied on a collection of
 * bounding box labels.
 */
export abstract class BBoxOperation<P, R extends {} | null> {
  /**
   * The display name of this operation.
   */
  abstract get displayName(): string;

  /**
   * The name of this operation, which is sent to the backend.
   */
  abstract get opName(): string;

  /**
   * The parameters of this operation, which is sent to the backend.
   * May contain {@link Placeholder} instances.
   */
  readonly opParams: P;

  /**
   * The result of this operation, expressed as a {@link Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  abstract get opResult(): Placeholder<R> | null;

  /**
   * Creates a new operation.
   *
   * Subclasses should create new objects from a static method that
   * generates the parameters before passing it to this constructor.
   */
  protected constructor(opParams: P) {
    this.opParams = opParams;
  }

  /**
   * Applies this operation to a collection of bounding box labels.
   */
  abstract applyIndex(index: _BBoxIndex): void;

  /**
   * Reverts the changes applied by this operation to a collection of
   * bounding box labels.
   */
  abstract undoIndex(index: _BBoxIndex): void;
}
