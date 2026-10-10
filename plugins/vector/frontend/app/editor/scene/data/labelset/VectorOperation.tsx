import { Placeholder } from "sta/app/editor";

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
 * vector labels.
 */
export class VectorOperation<P, R extends {} | null> {
  /**
   * The display name of this operation.
   */
  get displayName(): string {
    throw new Error("Not implemented");
  }

  /**
   * The name of this operation, which is sent to the backend.
   */
  get opName(): string {
    throw new Error("Not implemented");
  }

  /**
   * The parameters of this operation, which is sent to the backend.
   * May contain {@link Placeholder} instances.
   */
  opParams: P;

  /**
   * The result of this operation, expressed as a {@link Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  get opResult(): Placeholder<R> | null {
    throw new Error("Not implemented");
  }

  /**
   * Creates a new operation.
   *
   * Subclasses should create new objects from a static method that
   * generates the parameters before passing it to this constructor.
   */
  constructor(opParams: P) {
    this.opParams = opParams;
  }

  /**
   * Applies this operation to a collection of vector  labels.
   */
  applyIndex(index: any) {
    throw new Error("Not implemented");
  }

  /**
   * Reverts the changes applied by this operation to a collection of
   * vector labels.
   */
  undoIndex(index: any) {
    throw new Error("Not implemented");
  }
}
