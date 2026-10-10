import { expect } from "chai";
import fc from "fast-check";

import type { CollectionUtils } from "../../../../../lib/common/lib/utils";
import type { DefaultMapValidator } from "../validators";

import { CommandBase } from "./CommandBase";

type DefaultMap<K, V> = CollectionUtils.DefaultMap<K, V>;

export class Command<K, V> extends CommandBase<
  K,
  V,
  DefaultMap<K, V>,
  DefaultMapValidator<K, V>
> {
  readonly entries: readonly [K, V][];

  /**
   * Creates a new command for modifying a mapping.
   *
   * @param allEntries An array of key-value pairs to consider in the
   * test.
   * @param valFunc A function that checks the consistency between
   * the mapping and bimap with respect to a particular method.
   */
  constructor(
    allEntries: readonly [K, V][],
    valFunc: DefaultMapValidator<K, V>,
  ) {
    super(valFunc);
    this.entries = allEntries;
  }

  validate(m: Map<K, V>, r: DefaultMap<K, V>): void {
    this.valFunc(this.entries, r, m);
  }
}

export class GetOrSetCommand<K, V> extends Command<K, V> {
  readonly key: K;

  /**
   * Creates a new command to get an entry in a mapping. If the entry does not exist,
   * it is added to the mapping.
   *
   * @param allEntries An array of key-value pairs to consider in the
   * test.
   * @param valFunc A function that checks the consistency between
   * the mapping and bimap with respect to a particular method.
   * @param key The key of the entry.
   */
  constructor(
    allEntries: readonly [K, V][],
    valFunc: DefaultMapValidator<K, V>,
    key: K,
  ) {
    super(allEntries, valFunc);

    this.key = key;
  }

  check(m: ReadonlyMap<K, V>): boolean {
    return true;
  }

  run(m: Map<K, V>, r: DefaultMap<K, V>): void {
    const [firstValue, secondValue] = [r.defaultFactory(), r.defaultFactory()];
    if (firstValue !== secondValue) {
      throw new Error(
        "For testing purposes, defaultFactory must return the same object each time it is called.",
      );
    }

    let mValue: V | undefined;
    if (m.has(this.key)) {
      mValue = m.get(this.key);
    } else {
      mValue = r.defaultFactory();
      m.set(this.key, mValue);
    }

    const rValue = r.get(this.key);

    expect(rValue).to.equal(mValue, "inconsistent result of get()");

    this.validate(m, r);
  }

  toString() {
    return `GetOrSetCommand[key=${fc.stringify(this.key)}]`;
  }
}

export class SetCommand<K, V> extends Command<K, V> {
  readonly key: K;

  readonly value: V;

  /**
   * Creates a new command to set an entry in a mapping.
   *
   * @param allEntries An array of key-value pairs to consider in the
   * test.
   * @param valFunc A function that checks the consistency between
   * the mapping and bimap with respect to a particular method.
   * @param key The key of the entry.
   * @param value The value of the entry.
   */
  constructor(
    allEntries: readonly [K, V][],
    valFunc: DefaultMapValidator<K, V>,
    key: K,
    value: V,
  ) {
    super(allEntries, valFunc);

    this.key = key;
    this.value = value;
  }

  check(m: ReadonlyMap<K, V>): boolean {
    return true;
  }

  run(m: Map<K, V>, r: DefaultMap<K, V>): void {
    m.set(this.key, this.value);
    r.set(this.key, this.value);

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
   * @param allEntries An array of key-value pairs to consider in the
   * test.
   * @param valFunc A function that checks the consistency between
   * the mapping and bimap with respect to a particular method.
   * @param key The key of the entry.
   */
  constructor(
    allEntries: readonly [K, V][],
    valFunc: DefaultMapValidator<K, V>,
    key: K,
  ) {
    super(allEntries, valFunc);

    this.key = key;
  }

  check(m: ReadonlyMap<K, V>): boolean {
    return true;
  }

  run(m: Map<K, V>, r: DefaultMap<K, V>): void {
    const mValue = m.delete(this.key);
    const rValue = r.delete(this.key);

    expect(rValue).to.equal(mValue, "inconsistent result of delete()");

    this.validate(m, r);
  }

  toString() {
    return `RemoveCommand[key=${fc.stringify(this.key)}]`;
  }
}

export class ClearCommand<K, V> extends Command<K, V> {
  /**
   * Creates a new command to clear a mapping.
   *
   * @param allEntries An array of key-value pairs to consider in the
   * test.
   * @param valFunc A function that checks the consistency between
   * the mapping and bimap with respect to a particular method.
   */
  constructor(
    allEntries: readonly [K, V][],
    valFunc: DefaultMapValidator<K, V>,
  ) {
    super(allEntries, valFunc);
  }

  check(m: ReadonlyMap<K, V>): boolean {
    return true;
  }

  run(m: Map<K, V>, r: DefaultMap<K, V>): void {
    m.clear();
    r.clear();

    this.validate(m, r);
  }

  toString() {
    return "ClearCommand[]";
  }
}
