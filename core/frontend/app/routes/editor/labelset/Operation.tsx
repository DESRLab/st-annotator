import type { LabelDataView } from "../data";

import type { Placeholder } from "./Placeholder";

/**
 * Interface for operations that can be applied on a collection of labels.
 */
export interface Operation<P, R extends {} | null> {
  /** The display name of this operation. */
  readonly displayName: string;

  /** The name of this operation, which is sent to the backend. */
  readonly opName: string;

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
  readonly opResult: Placeholder<R> | null;

  /** Applies this operation to the local data. */
  applyLocal(): void;

  /** Reverts the changes applied by this operation to the local data. */
  undoLocal(): void;
}

/**
 * Abstract base implementation of {@link Operation}.
 */
export abstract class BaseOperation<
  D extends LabelDataView<any>,
  P,
  R extends {} | null,
> implements Operation<P, R> {
  /** A handle to the data modified by the operation. */
  readonly dataView: D;

  /** The parameters of the operation. */
  readonly opParams: P;

  /** The display name of this operation. */
  abstract get displayName(): string;

  /** The name of this operation, which is sent to the backend. */
  abstract get opName(): string;

  /**
   * The result of this operation, expressed as a {@link Placeholder}.
   *
   * It is resolved with the value returned from the backend after it is pushed there.
   */
  abstract get opResult(): Placeholder<R> | null;

  constructor(dataView: D, opParams: P) {
    this.dataView = dataView;
    this.opParams = opParams;
  }

  applyLocal(): void {
    throw new Error("Not implemented");
  }

  undoLocal(): void {
    throw new Error("Not implemented");
  }
}
