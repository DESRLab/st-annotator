import { describe, expect, it, vi } from "vitest";

import {
  makeGetFunc,
  tempMemoize,
} from "../../../lib/common/lib/utils/FuncUtils";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("tempMemoize", () => {
  it("shares pending calls and clears only the fulfilled key", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const next = deferred<string>();
    const operation = vi
      .fn((_key: string) => first.promise)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
      .mockReturnValueOnce(next.promise);
    const memoized = tempMemoize(operation);
    const a = memoized("a");
    const b = memoized("b");
    expect(memoized("a")).toBe(a);
    expect(memoized("b")).toBe(b);
    expect(operation.mock.calls).toEqual([["a"], ["b"]]);

    first.resolve("first result");
    await expect(a).resolves.toBe("first result");
    expect(memoized("b")).toBe(b);
    const again = memoized("a");
    expect(again).not.toBe(a);
    expect(operation.mock.calls).toEqual([["a"], ["b"], ["a"]]);
    // Complete the remaining calls in a different order from their creation.
    next.resolve("new result");
    second.resolve("second result");
    await expect(Promise.all([b, again])).resolves.toEqual([
      "second result",
      "new result",
    ]);
  });

  it("propagates rejection and permits a subsequent attempt", async () => {
    const pending = deferred<string>();
    const error = new Error("failed");
    const operation = vi.fn(() => pending.promise);
    const memoized = tempMemoize(operation);
    const result = memoized();
    expect(memoized()).toBe(result);
    const rejected = expect(result).rejects.toBe(error);
    pending.reject(error);
    await rejected;

    operation.mockResolvedValueOnce("retried");
    await expect(memoized()).resolves.toBe("retried");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("compares arguments by strict value and object identity", async () => {
    const object = {};
    const pending = deferred<string>();
    const operation = vi.fn((..._args: unknown[]) => pending.promise);
    const memoized = tempMemoize(operation);
    const shared = memoized(object, 1);
    expect(memoized(object, 1)).toBe(shared);
    const distinct = [
      memoized({}, 1),
      memoized(object, 2),
      memoized(null),
      memoized(NaN),
      memoized(NaN),
    ];
    expect(new Set([shared, ...distinct]).size).toBe(6);
    expect(operation).toHaveBeenCalledTimes(6);
    pending.resolve("result");
    await expect(Promise.all([shared, ...distinct])).resolves.toEqual(
      Array(6).fill("result"),
    );
  });
});

describe("makeGetFunc", () => {
  it("returns the supplied constant, preserving its identity", () => {
    for (const value of [undefined, null, false, 0, NaN, "value", {}, []]) {
      const get = makeGetFunc<unknown[], unknown>(value);
      expect(get()).toBe(value);
      expect(get("ignored", 42)).toBe(value);
    }
  });

  it("invokes the supplied getter with its arguments", () => {
    const result = {};
    const getter = vi.fn((key: string, count: number) => result);
    const get = makeGetFunc(getter);
    expect(get("key", 3)).toBe(result);
    expect(getter).toHaveBeenCalledOnce();
    expect(getter).toHaveBeenCalledWith("key", 3);
  });
});
