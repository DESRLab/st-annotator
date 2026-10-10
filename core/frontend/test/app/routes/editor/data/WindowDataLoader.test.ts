import { describe, expect, it, vi } from "vitest";

import { WindowDataLoader } from "../../../../../app/routes/editor/data/DataLoader";

interface TestFrame {
  id: number;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

class TestWindowLoader extends WindowDataLoader<readonly string[], string> {
  protected combineData(data: readonly string[]): readonly string[] {
    return data;
  }
}

function makeLoader(neighborResults: Map<number, Promise<string>>) {
  const current = { id: 2 } as TestFrame;
  const previous = { id: 1 } as TestFrame;
  const next = { id: 3 } as TestFrame;
  const lookup = {
    bulkGetData: vi.fn((frames: TestFrame[]) =>
      frames.length === 1 && frames[0].id === current.id
        ? Promise.resolve(["current"])
        : Promise.all(frames.map((frame) => neighborResults.get(frame.id)!)),
    ),
    getData: vi.fn((frame: TestFrame) => neighborResults.get(frame.id)),
    isCached: vi.fn().mockReturnValue(false),
  };
  const context = {
    frames: {
      elements: [previous, current, next],
      axes: {
        tb: { getValue: () => ({ center: null }) },
        xb: { getValue: () => ({ center: 0 }) },
        yb: { getValue: () => ({ center: 0 }) },
      },
    },
  };
  return {
    current,
    loader: new TestWindowLoader(lookup as never, context as never, 5),
    lookup,
    next,
    previous,
  };
}

describe("WindowDataLoader current-frame priority", () => {
  it("uses individual positions in the time path when timestamps are shared", () => {
    const { current, loader } = makeLoader(new Map());

    loader.timePathRange = 0;
    expect(loader.getFramesInWindow(current as never)).toEqual([current]);
  });

  it("resolves the current frame without waiting for neighbors", async () => {
    const previous = deferred<string>();
    const next = deferred<string>();
    const { current, loader, lookup } = makeLoader(
      new Map([
        [1, previous.promise],
        [3, next.promise],
      ]),
    );
    const onBackground = vi.fn();
    loader.addBackgroundLoadListener(onBackground);

    await expect(loader.getData(current as never)).resolves.toEqual([
      "current",
    ]);
    expect(lookup.bulkGetData).toHaveBeenCalledWith(
      [current],
      true,
      undefined,
      undefined,
    );
    expect(lookup.bulkGetData).toHaveBeenCalledTimes(2);
    expect(lookup.bulkGetData).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: 1 }), expect.objectContaining({ id: 3 })],
      true,
      undefined,
    );
    expect(onBackground).not.toHaveBeenCalled();

    next.resolve("next");
    await Promise.resolve();
    expect(onBackground).not.toHaveBeenCalled();

    previous.resolve("previous");
    await vi.waitFor(() => expect(onBackground).toHaveBeenCalledTimes(2));
    expect(onBackground).toHaveBeenNthCalledWith(1, current, ["previous"]);
    expect(onBackground).toHaveBeenNthCalledWith(2, current, ["next"]);
  });

  it("does not publish neighbors after the active load is aborted", async () => {
    const previous = deferred<string>();
    const next = deferred<string>();
    const { current, loader } = makeLoader(
      new Map([
        [1, previous.promise],
        [3, next.promise],
      ]),
    );
    const controller = new AbortController();
    const onBackground = vi.fn();
    loader.addBackgroundLoadListener(onBackground);

    await loader.getData(current as never, controller.signal);
    controller.abort();
    previous.resolve("previous");
    next.resolve("next");
    await Promise.all([previous.promise, next.promise]);
    await Promise.resolve();

    expect(onBackground).not.toHaveBeenCalled();
  });

  it("stops notifying a removed background listener", async () => {
    const previous = deferred<string>();
    const next = deferred<string>();
    const { current, loader } = makeLoader(
      new Map([
        [1, previous.promise],
        [3, next.promise],
      ]),
    );
    const onBackground = vi.fn();
    loader.addBackgroundLoadListener(onBackground);
    await loader.getData(current as never);
    loader.removeBackgroundLoadListener(onBackground);

    previous.resolve("previous");
    next.resolve("next");
    await Promise.all([previous.promise, next.promise]);
    await Promise.resolve();

    expect(onBackground).not.toHaveBeenCalled();
  });
});
