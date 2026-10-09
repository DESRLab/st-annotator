import { expect } from 'chai';
import fc from 'fast-check';

/**
 * @template K, V
 * @typedef {import('../../../../../lib/common/lib/utils').CollectionUtils.DefaultMap<K, V>} DefaultMap
 */

/**
 * @template K, V
 * @typedef {(
 *     allEntries: ReadonlyArray<[K, V]>,
 *     defaultMap: DefaultMap<K, V>,
 *     map: ReadonlyMap<K, V>
 * ) => void} Validator
 */

/**
 * @template K, V
 */
export class DefaultMapValidators {

    /**
     * @type {Validator<K, V>} 
     */
    validateForEach(allEntries, defaultMap, map) {
        /**
         * @type {[unknown[], unknown[]]}
         */
        const [biMapArr, refArr] = [[], []];

        defaultMap.forEach((v, k) => {
            biMapArr.push(v, k);
        });

        map.forEach((v, k) => {
            refArr.push(v, k);
        });

        expect(biMapArr).to.eql(refArr);
    }

    /**
     * @type {Validator<K, V>} 
     */
    validateHas(allEntries, defaultMap, map) {
        for (const [k] of allEntries) {
            expect(defaultMap.has(k)).to.equal(map.has(k), `inconsistent result for key=${fc.stringify(k)}`);
        }
    }

    /**
     * @type {Validator<K, V>}
     */
    validateSize(allEntries, defaultMap, map) {
        expect(defaultMap.size).to.equal(map.size);
    }

    /**
     * @type {Validator<K, V>}
     */
    validateIterator(allEntries, defaultMap, map) {
        expect([...defaultMap]).to.eql([...map]);
    }

    /**
     * @type {Validator<K, V>}
     */
    validateValues(allEntries, defaultMap, map) {
        expect([...defaultMap.values()]).to.eql([...map.values()]);
    }

    /**
     * @type {Validator<K, V>}
     */
    validateKeys(allEntries, defaultMap, map) {
        expect([...defaultMap.keys()]).to.eql([...map.keys()]);
    }

    /**
     * @type {Validator<K, V>}
     */
    validateEntries(allEntries, defaultMap, map) {
        expect([...defaultMap.entries()]).to.eql([...map.entries()]);
    }
}
