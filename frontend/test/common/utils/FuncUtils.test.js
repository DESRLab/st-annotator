import { expect } from 'chai';
import fc from 'fast-check';
import _ from 'lodash';
import { describe, it } from 'vitest';
import Sinon from 'sinon';

import { FuncUtils } from '../../../lib/common/lib/utils';

/**
 * @template T
 * @implements {Promise<T>}
 */
class Deferred {

    /**
     * @type {Promise<T>}
     */
    #promise;

    /**
     * @type {(value: T | PromiseLike<T>) => void}
     */
    #resolve;

    /**
     * @readonly
     * @type {T}
     */
    value;

    /**
     * Creates a promise that can be resolved to a value on demand.
     * 
     * @param {T} value The resolved value.
     */
    constructor(value) {
        this.#promise = new Promise((resolve) => {
            this.#resolve = resolve;
        });
        this.value = value;
    }

    get [Symbol.toStringTag]() { return 'Deferred'; }

    /**
     * @template {{}} TResult1
     * @template {{}} TResult2
     * @type {(
     *     onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
     *     onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
     * ) => Promise<TResult1 | TResult2>}
     */
    // https://github.com/microsoft/TypeScript/issues/25373
    // @ts-expect-error
    then(onfulfilled = undefined, onrejected = undefined) {
        throw new Error('Not implemented');
    }

    /**
     * @template {{}} TResult
     * @type {(
     *     onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
     * ) => Promise<T | TResult>}
     */
    // @ts-expect-error
    catch(onrejected) {
        throw new Error('Not implemented');
    }

    /**
     * We need {@link FuncUtils.tempMemoize} to return this object instead of the wrapped promise.
     * 
     * @type {(onfinally?: (() => void) | undefined | null) => this}
     */
    // @ts-expect-error
    finally(onfinally) {
        this.#promise = this.#promise.finally(onfinally);
        return this;
    }

    /**
     * Resolves this promise.
     */
    resolve() {
        this.#resolve(this.value);
    }
}

/**
 * @template {any[]} TArgs
 * @template TValue
 */
class MemoizedFuncModel {

    /**
     * @readonly
     * @type {Sinon.SinonSpy<TArgs, Deferred<TValue>>}
     */
    func;

    /**
     * @readonly
     * @type {Map<TArgs, Deferred<TValue>>}
     */
    tasks = new Map();

    /**
     * Creates a model for a memoized function.
     * 
     * @param {Sinon.SinonSpy<TArgs, Deferred<TValue>>} func The function before being memoized.
     */
    constructor(func) {
        this.func = func;
    }
}

/**
 * @template {any[]} TArgs
 * @template TValue
 * @typedef {(...args: TArgs) => Deferred<TValue>} MemoizedFunc
 */

/**
 * @template {any[]} TArgs
 * @template TValue
 * @implements {fc.AsyncCommand<MemoizedFuncModel<TArgs, TValue>, MemoizedFunc<TArgs, TValue>>}
 */
class CallCommand {

    /**
     * @type {TArgs}
     */
    args;

    /**
     * Creates a new command for calling a memoized function.
     * 
     * @param {TArgs} args The arguments passed to the function.
     */
    constructor(args) {
        this.args = args;
    }

    /**
     * @type {(m: Readonly<MemoizedFuncModel<TArgs, TValue>>) => boolean}
     */
    check(m) { return true; }

    /**
     * @type {(
     *     m: MemoizedFuncModel<TArgs, TValue>,
     *     r: MemoizedFunc<TArgs, TValue>,
     * ) => Promise<void>}
     */
    async run(m, r) {
        const args = this.args;

        const isCallMemoized = [...m.tasks.keys()]
            .some((cachedArgs) => _.zip(args, cachedArgs).every(([a, b]) => a === b));

        const initCallCount = m.func.callCount;
        const result = r(...args);
        const newCallCount = m.func.callCount;

        const expectedCallCount = initCallCount + (isCallMemoized ? 0 : 1);
        expect(newCallCount).to.equal(expectedCallCount, 'incorrect call count');

        if (!isCallMemoized) {
            expect(m.func.lastCall.args).to.eql(args, 'incorrect call args');
        }

        m.tasks.set(args, result);
    }

    toString() {
        return `CallCommand[args=${fc.stringify(this.args)}]`;
    }
}

/**
 * @template {any[]} TArgs
 * @template TValue
 * @implements {fc.AsyncCommand<MemoizedFuncModel<TArgs, TValue>, MemoizedFunc<TArgs, TValue>>}
 */
class ResolveAllCommand {

    /**
     * @type {(m: Readonly<MemoizedFuncModel<TArgs, TValue>>) => boolean}
     */
    check(m) { return true; }

    /**
     * This is async to ensure that {@link Promise.finally} is called immediately after
     * {@link Deferred.resolve}.
     * 
     * @type {(
     *     m: MemoizedFuncModel<TArgs, TValue>,
     *     r: MemoizedFunc<TArgs, TValue>,
     * ) => Promise<void>}
     */
    async run(m, r) {
        // Shuffle to make the tasks resolve in a different order than their calls
        _.shuffle([...m.tasks.values()]).forEach((v) => v.resolve());
        m.tasks.clear();
    }

    toString() {
        return 'ResolveAllCommand[]';
    }
}

const makeArgsArbitrary = () => fc.array(fc.anything({ maxDepth: 2 }), { maxLength: 3 });

const makeDepsArbitrary = () => makeArgsArbitrary().chain((allArgs) => (
    fc.commands([
        fc.shuffledSubarray(allArgs).map((args) => new CallCommand(args)),
        fc.constant(new CallCommand(allArgs)),      // Encourage repeating the same invocation
        fc.constant(new ResolveAllCommand()),
    ], { size: 'medium' })
));

describe('FuncUtils.tempMemoize()', () => {
    it('check call history', async () => {
        await fc.assert(
            fc.asyncProperty(
                makeDepsArbitrary(),
                // @ts-expect-error
                async (commands) => {
                    const func = Sinon.spy((...args) => new Deferred(args));
                    const model = new MemoizedFuncModel(func);
                    // @ts-expect-error
                    const real = FuncUtils.tempMemoize(func);

                    // @ts-expect-error
                    await fc.asyncModelRun(() => ({ model, real }), commands);
                },
            ),
            {
                examples: [
                    // JSON.stringify converts both null and NaN to 'null',
                    // but should be treated as separate
                    [[new CallCommand([null]), new CallCommand([NaN]), new CallCommand([null])]],
                    // Different instances of an object with the same structure,
                    // but should be treated as separate
                    [[new CallCommand([{}]), new CallCommand([1]), new CallCommand([{}])]],
                ],
            },
        );
    });
});

describe('FuncUtils.makeGetFunc()', () => {
    it('should return same result for raw and wrapped value', () => {
        fc.assert(
            fc.property(
                // @ts-expect-error
                fc.anything({ maxDepth: 2 }), fc.array(fc.anything({ maxDepth: 2 })), fc.context(),
                (value, args, ctx) => {
                    const fn1 = FuncUtils.makeGetFunc(value);
                    const fn2 = FuncUtils.makeGetFunc((...rest) => value);

                    const result1 = fn1(...args);
                    const result2 = fn2(...args);

                    if (Number.isNaN(result1)) {
                        expect(result2).to.be.NaN;
                    } else {
                        expect(result1).to.equal(result2);
                    }
                },
            ),
        );
    });
});
