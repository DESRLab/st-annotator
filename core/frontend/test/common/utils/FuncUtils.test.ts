import { expect } from "chai";
import fc from "fast-check";
import type { AsyncCommand } from "fast-check";
import _ from "lodash";
import { spy } from "sinon";
import type { SinonSpy } from "sinon";
import { describe, it } from "vitest";

import { FuncUtils } from "../../../lib/common/lib/utils";

class Deferred<T> implements Promise<T> {
  #promise: Promise<T>;

  #resolve!: (value: T | PromiseLike<T>) => void;

  readonly value: T;

  /**
   * Creates a promise that can be resolved to a value on demand.
   *
   * @param value The resolved value.
   */
  constructor(value: T) {
    this.#promise = new Promise((resolve) => {
      this.#resolve = resolve;
    });
    this.value = value;
  }

  get [Symbol.toStringTag]() {
    return "Deferred";
  }

  // https://github.com/microsoft/TypeScript/issues/25373
  // @ts-expect-error - Deferred's stub then() deliberately deviates from the Promise contract (see link above)
  then<TResult1 extends {}, TResult2 extends {}>(
    onfulfilled?:
      ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?:
      ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): Promise<TResult1 | TResult2> {
    throw new Error("Not implemented");
  }

  // @ts-expect-error - Deferred's stub catch() deliberately deviates from the Promise contract
  catch<TResult extends {}>(
    onrejected?:
      ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null,
  ): Promise<T | TResult> {
    throw new Error("Not implemented");
  }

  /**
   * We need {@link FuncUtils.tempMemoize} to return this object instead of the wrapped promise.
   */
  // @ts-expect-error - finally() returns this instead of a Promise so tempMemoize can return the Deferred
  finally(onfinally?: (() => void) | undefined | null): this {
    this.#promise = this.#promise.finally(onfinally);
    return this;
  }

  /**
   * Resolves this promise.
   */
  resolve(): void {
    this.#resolve(this.value);
  }
}

class MemoizedFuncModel<TArgs extends any[], TValue> {
  readonly func: SinonSpy<TArgs, Deferred<TValue>>;

  readonly tasks = new Map<TArgs, Deferred<TValue>>();

  /**
   * Creates a model for a memoized function.
   *
   * @param func The function before being memoized.
   */
  constructor(func: SinonSpy<TArgs, Deferred<TValue>>) {
    this.func = func;
  }
}

type MemoizedFunc<TArgs extends any[], TValue> = (
  ...args: TArgs
) => Deferred<TValue>;

class CallCommand<TArgs extends any[], TValue> implements AsyncCommand<
  MemoizedFuncModel<TArgs, TValue>,
  MemoizedFunc<TArgs, TValue>
> {
  args: TArgs;

  /**
   * Creates a new command for calling a memoized function.
   *
   * @param args The arguments passed to the function.
   */
  constructor(args: TArgs) {
    this.args = args;
  }

  check(m: Readonly<MemoizedFuncModel<TArgs, TValue>>): boolean {
    return true;
  }

  async run(
    m: MemoizedFuncModel<TArgs, TValue>,
    r: MemoizedFunc<TArgs, TValue>,
  ): Promise<void> {
    const args = this.args;

    const isCallMemoized = [...m.tasks.keys()].some((cachedArgs) =>
      _.zip(args, cachedArgs).every(([a, b]) => a === b),
    );

    const initCallCount = m.func.callCount;
    const result = r(...args);
    const newCallCount = m.func.callCount;

    const expectedCallCount = initCallCount + (isCallMemoized ? 0 : 1);
    expect(newCallCount).to.equal(expectedCallCount, "incorrect call count");

    if (!isCallMemoized) {
      expect(m.func.lastCall.args).to.eql(args, "incorrect call args");
    }

    m.tasks.set(args, result);
  }

  toString() {
    return `CallCommand[args=${fc.stringify(this.args)}]`;
  }
}

class ResolveAllCommand<TArgs extends any[], TValue> implements AsyncCommand<
  MemoizedFuncModel<TArgs, TValue>,
  MemoizedFunc<TArgs, TValue>
> {
  check(m: Readonly<MemoizedFuncModel<TArgs, TValue>>): boolean {
    return true;
  }

  /**
   * This is async to ensure that {@link Promise.finally} is called immediately after
   * {@link Deferred.resolve}.
   */
  async run(
    m: MemoizedFuncModel<TArgs, TValue>,
    r: MemoizedFunc<TArgs, TValue>,
  ): Promise<void> {
    // Shuffle to make the tasks resolve in a different order than their calls
    _.shuffle([...m.tasks.values()]).forEach((v) => v.resolve());
    m.tasks.clear();
  }

  toString() {
    return "ResolveAllCommand[]";
  }
}

const makeArgsArbitrary = () =>
  fc.array(fc.anything({ maxDepth: 2 }), { maxLength: 3 });

const makeDepsArbitrary = () =>
  makeArgsArbitrary().chain((allArgs) =>
    fc.commands(
      [
        fc.shuffledSubarray(allArgs).map((args) => new CallCommand(args)),
        fc.constant(new CallCommand(allArgs)), // Encourage repeating the same invocation
        fc.constant(new ResolveAllCommand()),
      ],
      { size: "medium" },
    ),
  );

describe("FuncUtils.tempMemoize()", () => {
  it("check call history", async () => {
    await fc.assert(
      fc.asyncProperty(makeDepsArbitrary(), async (commands) => {
        const func = spy((...args) => new Deferred(args));
        const model = new MemoizedFuncModel(func);
        // @ts-expect-error - Deferred is not a real Promise, so it does not satisfy tempMemoize's signature
        const real = FuncUtils.tempMemoize(func);

        // @ts-expect-error - the Deferred-based real does not match the Promise-based type asyncModelRun expects
        await fc.asyncModelRun(() => ({ model, real }), commands);
      }),
      {
        examples: [
          // JSON.stringify converts both null and NaN to 'null',
          // but should be treated as separate
          [
            [
              new CallCommand([null]),
              new CallCommand([NaN]),
              new CallCommand([null]),
            ],
          ],
          // Different instances of an object with the same structure,
          // but should be treated as separate
          [
            [
              new CallCommand([{}]),
              new CallCommand([1]),
              new CallCommand([{}]),
            ],
          ],
        ],
      },
    );
  });
});

describe("FuncUtils.makeGetFunc()", () => {
  it("should return same result for raw and wrapped value", () => {
    fc.assert(
      fc.property(
        fc.anything({ maxDepth: 2 }),
        fc.array(fc.anything({ maxDepth: 2 })),
        fc.context(),
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
