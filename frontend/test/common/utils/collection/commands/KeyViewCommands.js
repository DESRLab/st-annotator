import fc from 'fast-check';

import { CommandBase } from './CommandBase';

/**
 * @template K
 * @typedef {import('../../../../../lib/common/lib/utils').CollectionUtils.KeyView<K>} KeyView
 */

/**
 * @template K
 * @typedef {import('../validators').KeyViewValidator<K>} KeyViewValidator
 */

/**
 * @template K, V
 * @augments {CommandBase<K, V, KeyView<K>, KeyViewValidator<K>>}
 */
export class Command extends CommandBase {

    /**
     * @readonly
     * @type {ReadonlyArray<K>}
     */
    allKeys;

    /**
     * Creates a new command for modifying a mapping.
     * 
     * @param {ReadonlyArray<K>} allKeys An array of keys to consider in the test.
     * @param {KeyViewValidator<K>} valFunc A function that checks the consistency between
     * the mapping and key view with respect to a particular method.
     */
    constructor(allKeys, valFunc) {
        super(valFunc);
        this.allKeys = allKeys;
    }

    /**
     * @type {(m: Map<K, V>, r: KeyView<K>) => void}
     */
    validate(m, r) {
        this.valFunc(this.allKeys, r, new Set(m.keys()));
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
     * @param {ReadonlyArray<K>} allKeys An array of keys to consider in the test.
     * @param {KeyViewValidator<K>} valFunc A function that checks the consistency between
     * the mapping and key view with respect to a particular method.
     * @param {K} key The key of the entry.
     * @param {V} value The value of the entry.
     */
    constructor(allKeys, valFunc, key, value) {
        super(allKeys, valFunc);

        this.key = key;
        this.value = value;
    }

    /**
     * @type {(m: ReadonlyMap<K, V>) => boolean}
     */
    check(m) { return true; }

    /**
     * @type {(m: Map<K, V>, r: KeyView<K>) => void}
     */
    run(m, r) {
        m.set(this.key, this.value);

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
     * @param {ReadonlyArray<K>} allKeys An array of keys to consider in the test.
     * @param {KeyViewValidator<K>} valFunc A function that checks the consistency between
     * the mapping and key view with respect to a particular method.
     * @param {K} key The key of the entry.
     */
    constructor(allKeys, valFunc, key) {
        super(allKeys, valFunc);

        this.key = key;
    }

    /**
     * @type {(m: ReadonlyMap<K, V>) => boolean}
     */
    check(m) { return true; }

    /**
     * @type {(m: Map<K, V>, r: KeyView<K>) => void}
     */
    run(m, r) {
        m.delete(this.key);

        this.validate(m, r);
    }

    toString() {
        return `DeleteCommand[key=${fc.stringify(this.key)}]`;
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
     * @param {ReadonlyArray<K>} allKeys An array of keys to consider in the test.
     * @param {KeyViewValidator<K>} valFunc A function that checks the consistency between
     * the mapping and key view with respect to a particular method.
     */
    constructor(allKeys, valFunc) {
        super(allKeys, valFunc);
    }

    /**
     * @type {(m: ReadonlyMap<K, V>) => boolean}
     */
    check(m) { return true; }

    /**
     * @type {(m: Map<K, V>, r: KeyView<K>) => void}
     */
    run(m, r) {
        m.clear();

        this.validate(m, r);
    }

    toString() {
        return 'ClearCommand[]';
    }
}
