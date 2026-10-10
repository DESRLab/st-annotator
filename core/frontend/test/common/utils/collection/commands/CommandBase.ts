import type { Command } from "fast-check";

export abstract class CommandBase<K, V, TReal, TValFunc> implements Command<
  Map<K, V>,
  TReal
> {
  readonly valFunc: TValFunc;

  /**
   * Creates a new command for modifying a mapping.
   *
   * @param valFunc A function that checks the consistency between
   * the mapping and the class to test with respect to a particular method.
   */
  constructor(valFunc: TValFunc) {
    this.valFunc = valFunc;
  }

  abstract check(m: ReadonlyMap<K, V>): boolean;

  abstract run(m: Map<K, V>, r: TReal): void;

  validate(m: Map<K, V>, r: TReal): void {
    throw new Error("Not implemented");
  }
}
