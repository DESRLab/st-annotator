import { expect } from "chai";
import fc from "fast-check";

import type { CollectionUtils } from "../../../../../lib/common/lib/utils";

type DefaultMap<K, V> = CollectionUtils.DefaultMap<K, V>;

export type Validator<K, V> = (
  allEntries: readonly [K, V][],
  defaultMap: DefaultMap<K, V>,
  map: ReadonlyMap<K, V>,
) => void;

export class DefaultMapValidators<K, V> {
  validateForEach(
    allEntries: readonly [K, V][],
    defaultMap: DefaultMap<K, V>,
    map: ReadonlyMap<K, V>,
  ): void {
    const [biMapArr, refArr]: [unknown[], unknown[]] = [[], []];

    defaultMap.forEach((v, k) => {
      biMapArr.push(v, k);
    });

    map.forEach((v, k) => {
      refArr.push(v, k);
    });

    expect(biMapArr).to.eql(refArr);
  }

  validateHas(
    allEntries: readonly [K, V][],
    defaultMap: DefaultMap<K, V>,
    map: ReadonlyMap<K, V>,
  ): void {
    for (const [k] of allEntries) {
      expect(defaultMap.has(k)).to.equal(
        map.has(k),
        `inconsistent result for key=${fc.stringify(k)}`,
      );
    }
  }

  validateSize(
    allEntries: readonly [K, V][],
    defaultMap: DefaultMap<K, V>,
    map: ReadonlyMap<K, V>,
  ): void {
    expect(defaultMap.size).to.equal(map.size);
  }

  validateIterator(
    allEntries: readonly [K, V][],
    defaultMap: DefaultMap<K, V>,
    map: ReadonlyMap<K, V>,
  ): void {
    expect([...defaultMap]).to.eql([...map]);
  }

  validateValues(
    allEntries: readonly [K, V][],
    defaultMap: DefaultMap<K, V>,
    map: ReadonlyMap<K, V>,
  ): void {
    expect([...defaultMap.values()]).to.eql([...map.values()]);
  }

  validateKeys(
    allEntries: readonly [K, V][],
    defaultMap: DefaultMap<K, V>,
    map: ReadonlyMap<K, V>,
  ): void {
    expect([...defaultMap.keys()]).to.eql([...map.keys()]);
  }

  validateEntries(
    allEntries: readonly [K, V][],
    defaultMap: DefaultMap<K, V>,
    map: ReadonlyMap<K, V>,
  ): void {
    expect([...defaultMap.entries()]).to.eql([...map.entries()]);
  }
}
