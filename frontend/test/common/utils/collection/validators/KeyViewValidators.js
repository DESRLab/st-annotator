import { expect } from 'chai';
import fc from 'fast-check';

/**
 * @template K
 * @typedef {import('../../../../../lib/common/lib/utils').CollectionUtils.KeyView<K>} KeyView
 */

/**
 * @template K
 * @typedef {(
 *     allKeys: ReadonlyArray<K>,
 *     keyView: KeyView<K>,
 *     keySet: ReadonlySet<K>
 * ) => void} Validator
 */

/**
 * @template K
 */
export class KeyViewValidators {

    /**
     * @type {Validator<K>}
     */
    validateForEach(allKeys, keyView, keySet) {
        /**
         * @type {[unknown[], unknown[]]}
         */
        const [keyViewArr, refArr] = [[], []];

        keyView.forEach((v1, v2, set) => {
            expect(set).to.equal(keyView, 'incorrect value passed to set');

            keyViewArr.push(v1, v2);
        });

        keySet.forEach((v1, v2) => {
            refArr.push(v1, v2);
        });

        expect(keyViewArr).to.eql(refArr, 'inconsistent result');
    }

    /**
     * @type {Validator<K>}
     */
    validateHas(allKeys, keyView, keySet) {
        allKeys.forEach((k) => {
            expect(keyView.has(k)).to.equal(keySet.has(k), `inconsistent result for item=${fc.stringify(k)}`);
        });
    }

    /**
     * @type {Validator<K>}
     */
    validateSize(allKeys, keyView, keySet) {
        expect(keyView.size).to.equal(keySet.size);
    }

    /**
     * @type {Validator<K>}
     */
    validateIterator(allKeys, keyView, keySet) {
        expect([...keyView]).to.eql([...keySet]);
    }

    /**
     * @type {Validator<K>}
     */
    validateValues(allKeys, keyView, keySet) {
        expect([...keyView.values()]).to.eql([...keySet.values()]);
    }

    /**
     * @type {Validator<K>}
     */
    validateKeys(allKeys, keyView, keySet) {
        expect([...keyView.keys()]).to.eql([...keySet.keys()]);
    }

    /**
     * @type {Validator<K>}
     */
    validateEntries(allKeys, keyView, keySet) {
        expect([...keyView.entries()]).to.eql([...keySet.entries()]);
    }

}
