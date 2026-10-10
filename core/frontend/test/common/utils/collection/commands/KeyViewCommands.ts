import fc from "fast-check";

import type { CollectionUtils } from "../../../../../lib/common/lib/utils";
import type { KeyViewValidator } from "../validators";

import { CommandBase } from "./CommandBase";

type KeyView<K> = CollectionUtils.KeyView<K>;

export class Command<K, V> extends CommandBase<
  K,
  V,
  KeyView<K>,
  KeyViewValidator<K>
> {
  readonly allKeys: readonly K[];

  /**
   * Creates a new command for modifying a mapping.
   *
   * @param allKeys An array of keys to consider in the test.
   * @param valFunc A function that checks the consistency between
   * the mapping and key view with respect to a particular method.
   */
  constructor(allKeys: readonly K[], valFunc: KeyViewValidator<K>) {
    super(valFunc);
    this.allKeys = allKeys;
  }

  validate(m: Map<K, V>, r: KeyView<K>): void {
    this.valFunc(this.allKeys, r, new Set(m.keys()));
  }
}

export class SetCommand<K, V> extends Command<K, V> {
  readonly key: K;

  readonly value: V;

  /**
   * Creates a new command to set an entry in a mapping.
   *
   * @param allKeys An array of keys to consider in the test.
   * @param valFunc A function that checks the consistency between
   * the mapping and key view with respect to a particular method.
   * @param key The key of the entry.
   * @param value The value of the entry.
   */
  constructor(
    allKeys: readonly K[],
    valFunc: KeyViewValidator<K>,
    key: K,
    value: V,
  ) {
    super(allKeys, valFunc);

    this.key = key;
    this.value = value;
  }

  check(m: ReadonlyMap<K, V>): boolean {
    return true;
  }

  run(m: Map<K, V>, r: KeyView<K>): void {
    m.set(this.key, this.value);

    this.validate(m, r);
  }

  toString() {
    return `SetCommand[key=${fc.stringify(this.key)}, value=${fc.stringify(this.value)}]`;
  }
}

export class DeleteCommand<K, V> extends Command<K, V> {
  readonly key: K;

  /**
   * Creates a new command to delete an entry from a mapping.
   *
   * @param allKeys An array of keys to consider in the test.
   * @param valFunc A function that checks the consistency between
   * the mapping and key view with respect to a particular method.
   * @param key The key of the entry.
   */
  constructor(allKeys: readonly K[], valFunc: KeyViewValidator<K>, key: K) {
    super(allKeys, valFunc);

    this.key = key;
  }

  check(m: ReadonlyMap<K, V>): boolean {
    return true;
  }

  run(m: Map<K, V>, r: KeyView<K>): void {
    m.delete(this.key);

    this.validate(m, r);
  }

  toString() {
    return `DeleteCommand[key=${fc.stringify(this.key)}]`;
  }
}

export class ClearCommand<K, V> extends Command<K, V> {
  /**
   * Creates a new command to clear a mapping.
   *
   * @param allKeys An array of keys to consider in the test.
   * @param valFunc A function that checks the consistency between
   * the mapping and key view with respect to a particular method.
   */
  constructor(allKeys: readonly K[], valFunc: KeyViewValidator<K>) {
    super(allKeys, valFunc);
  }

  check(m: ReadonlyMap<K, V>): boolean {
    return true;
  }

  run(m: Map<K, V>, r: KeyView<K>): void {
    m.clear();

    this.validate(m, r);
  }

  toString() {
    return "ClearCommand[]";
  }
}
