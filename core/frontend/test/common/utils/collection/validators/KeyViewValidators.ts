import { expect } from "chai";
import fc from "fast-check";

import type { CollectionUtils } from "../../../../../lib/common/lib/utils";

type KeyView<K> = CollectionUtils.KeyView<K>;

export type Validator<K> = (
  allKeys: readonly K[],
  keyView: KeyView<K>,
  keySet: ReadonlySet<K>,
) => void;

export class KeyViewValidators<K> {
  validateForEach(
    allKeys: readonly K[],
    keyView: KeyView<K>,
    keySet: ReadonlySet<K>,
  ): void {
    const [keyViewArr, refArr]: [unknown[], unknown[]] = [[], []];

    keyView.forEach((v1, v2, set) => {
      expect(set).to.equal(keyView, "incorrect value passed to set");

      keyViewArr.push(v1, v2);
    });

    keySet.forEach((v1, v2) => {
      refArr.push(v1, v2);
    });

    expect(keyViewArr).to.eql(refArr, "inconsistent result");
  }

  validateHas(
    allKeys: readonly K[],
    keyView: KeyView<K>,
    keySet: ReadonlySet<K>,
  ): void {
    allKeys.forEach((k) => {
      expect(keyView.has(k)).to.equal(
        keySet.has(k),
        `inconsistent result for item=${fc.stringify(k)}`,
      );
    });
  }

  validateSize(
    allKeys: readonly K[],
    keyView: KeyView<K>,
    keySet: ReadonlySet<K>,
  ): void {
    expect(keyView.size).to.equal(keySet.size);
  }

  validateIterator(
    allKeys: readonly K[],
    keyView: KeyView<K>,
    keySet: ReadonlySet<K>,
  ): void {
    expect([...keyView]).to.eql([...keySet]);
  }

  validateValues(
    allKeys: readonly K[],
    keyView: KeyView<K>,
    keySet: ReadonlySet<K>,
  ): void {
    expect([...keyView.values()]).to.eql([...keySet.values()]);
  }

  validateKeys(
    allKeys: readonly K[],
    keyView: KeyView<K>,
    keySet: ReadonlySet<K>,
  ): void {
    expect([...keyView.keys()]).to.eql([...keySet.keys()]);
  }

  validateEntries(
    allKeys: readonly K[],
    keyView: KeyView<K>,
    keySet: ReadonlySet<K>,
  ): void {
    expect([...keyView.entries()]).to.eql([...keySet.entries()]);
  }
}
