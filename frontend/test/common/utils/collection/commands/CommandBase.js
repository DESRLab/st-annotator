import fc from 'fast-check';

/**
 * @template K, V, TReal, TValFunc
 * @implements {fc.Command<Map<K, V>, TReal>}
 */
export class CommandBase {

    /**
     * @readonly
     * @type {TValFunc}
     */
    valFunc;

    /**
     * Creates a new command for modifying a mapping.
     * 
     * @param {TValFunc} valFunc A function that checks the consistency between
     * the mapping and the class to test with respect to a particular method.
     */
    constructor(valFunc) {
        this.valFunc = valFunc;
    }

    /**
     * @type {(m: ReadonlyMap<K, V>) => boolean}
     * @abstract
     */
    check(m) { throw new Error('Not implemented'); }

    /**
     * @type {(m: Map<K, V>, r: TReal) => void}
     * @abstract
     */
    run(m, r) { throw new Error('Not implemented'); }

    /**
     * @type {(m: Map<K, V>, r: TReal) => void}
     */
    validate(m, r) { throw new Error('Not implemented'); }
}
