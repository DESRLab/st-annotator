import { expect } from 'chai';
import fc from 'fast-check';

import { CommandBase } from './CommandBase';

/**
 * @template K, V
 * @typedef {import('../../../../../lib/common/lib/utils').CollectionUtils.DefaultMap<K, V>} DefaultMap
 */

/**
 * @template K, V
 * @typedef {import('../validators').DefaultMapValidator<K, V>} DefaultMapValidator
 */

/**
 * @template K, V
 * @augments {CommandBase<K, V, DefaultMap<K, V>, DefaultMapValidator<K, V>>}
 */
export class Command extends CommandBase {

    /**
     * @readonly
     * @type {ReadonlyArray<[K, V]>}
     */
    entries;

    /**
     * Creates a new command for modifying a mapping.
     * 
     * @param {ReadonlyArray<[K, V]>} allEntries An array of key-value pairs to consider in the
     * test.
     * @param {DefaultMapValidator<K, V>} valFunc A function that checks the consistency between
     * the mapping and bimap with respect to a particular method.
     */
    constructor(allEntries, valFunc) {
        super(valFunc);
        this.entries = allEntries;
    }

    /**
     * @type {(m: Map<K, V>, r: DefaultMap<K, V>) => void}
     */
    validate(m, r) {
        this.valFunc(this.entries, r, m);
    }
}

/**
 * @template K, V
 * @augments {Command<K, V>}
 */
export class GetOrSetCommand extends Command {

    /**
     * @readonly
     * @type {K}
     */
    key;

    /**
     * Creates a new command to get an entry in a mapping. If the entry does not exist,
     * it is added to the mapping.
     * 
     * @param {ReadonlyArray<[K, V]>} allEntries An array of key-value pairs to consider in the
     * test.
     * @param {DefaultMapValidator<K, V>} valFunc A function that checks the consistency between
     * the mapping and bimap with respect to a particular method.
     * @param {K} key The key of the entry.
     */
    constructor(allEntries, valFunc, key) {
        super(allEntries, valFunc);

        this.key = key;
    }

    /**
     * @type {(m: ReadonlyMap<K, V>) => boolean}
     */
    check(m) { return true; }

    /**
     * @type {(m: Map<K, V>, r: DefaultMap<K, V>) => void}
     */
    run(m, r) {
        const [firstValue, secondValue] = [r.defaultFactory(), r.defaultFactory()];
        if (firstValue !== secondValue) {
            throw new Error('For testing purposes, defaultFactory must return the same object each time it is called.');
        }

        /**
         * @type {V | undefined}
         */
        let mValue;
        if (m.has(this.key)) {
            mValue = m.get(this.key);
        } else {
            mValue = r.defaultFactory();
            m.set(this.key, mValue);
        }

        const rValue = r.get(this.key);

        expect(rValue).to.equal(mValue, 'inconsistent result of get()');

        this.validate(m, r);
    }

    toString() {
        return `GetOrSetCommand[key=${fc.stringify(this.key)}]`;
    }
}

/**
 * @template K, V
 * @augments {Command<K, V>}
 */
export class SetCommand extends Command {

    /**
     * @readonly
     * @type {K}
     */
    key;

    /**
     * @readonly
     * @type {V}
     */
    value;

    /**
     * Creates a new command to set an entry in a mapping.
     * 
     * @param {ReadonlyArray<[K, V]>} allEntries An array of key-value pairs to consider in the
     * test.
     * @param {DefaultMapValidator<K, V>} valFunc A function that checks the consistency between
     * the mapping and bimap with respect to a particular method.
     * @param {K} key The key of the entry.
     * @param {V} value The value of the entry.
     */
    constructor(allEntries, valFunc, key, value) {
        super(allEntries, valFunc);

        this.key = key;
        this.value = value;
    }

    /**
     * @type {(m: ReadonlyMap<K, V>) => boolean}
     */
    check(m) { return true; }

    /**
     * @type {(m: Map<K, V>, r: DefaultMap<K, V>) => void}
     */
    run(m, r) {
        m.set(this.key, this.value);
        r.set(this.key, this.value);

        this.validate(m, r);
    }

    toString() {
        return `SetCommand[key=${fc.stringify(this.key)}, value=${fc.stringify(this.value)}]`;
    }
}

/**
 * @template K, V
 * @augments {Command<K, V>}
 */
export class DeleteCommand extends Command {

    /**
     * @readonly
     * @type {K}
     */
    key;

    /**
     * Creates a new command to delete an entry from a mapping.
     * 
     * @param {ReadonlyArray<[K, V]>} allEntries An array of key-value pairs to consider in the
     * test.
     * @param {DefaultMapValidator<K, V>} valFunc A function that checks the consistency between
     * the mapping and bimap with respect to a particular method.
     * @param {K} key The key of the entry.
     */
    constructor(allEntries, valFunc, key) {
        super(allEntries, valFunc);

        this.key = key;
    }

    /**
     * @type {(m: ReadonlyMap<K, V>) => boolean}
     */
    check(m) { return true; }

    /**
     * @type {(m: Map<K, V>, r: DefaultMap<K, V>) => void}
     */
    run(m, r) {
        const mValue = m.delete(this.key);
        const rValue = r.delete(this.key);

        expect(rValue).to.equal(mValue, 'inconsistent result of delete()');

        this.validate(m, r);
    }

    toString() {
        return `RemoveCommand[key=${fc.stringify(this.key)}]`;
    }
}

/**
 * @template K, V
 * @augments {Command<K, V>}
 */
export class ClearCommand extends Command {

    /**
     * Creates a new command to clear a mapping.
     * 
     * @param {ReadonlyArray<[K, V]>} allEntries An array of key-value pairs to consider in the
     * test.
     * @param {DefaultMapValidator<K, V>} valFunc A function that checks the consistency between
     * the mapping and bimap with respect to a particular method.
     */
    constructor(allEntries, valFunc) {
        super(allEntries, valFunc);
    }

    /**
     * @type {(m: ReadonlyMap<K, V>) => boolean}
     */
    check(m) { return true; }

    /**
     * @type {(m: Map<K, V>, r: DefaultMap<K, V>) => void}
     */
    run(m, r) {
        m.clear();
        r.clear();

        this.validate(m, r);
    }

    toString() {
        return 'ClearCommand[]';
    }
}
