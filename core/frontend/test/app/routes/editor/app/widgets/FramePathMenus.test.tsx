/* @vitest-environment jsdom */

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderTestView as renderView } from "../../../../../../lib/common/lib/testing/react";

import {
  FramePathListView,
  FramePathMenuView,
} from "../../../../../../app/routes/editor/app/widgets/FramePathMenu.react.tsx";
import { FrameSortFunction } from "../../../../../../app/routes/editor/nav";
import {
  createEditableFrame,
  heldFrameStatusUpdates,
} from "./frameStatusFixtures";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = vi.fn();

class EventSource {
  #listeners = new Map<string, Set<(event: any) => void>>();
  [key: string]: any;

  addEventListener(type: string, listener: (event: any) => void) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    this.#listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: { type: string }) {
    for (const listener of this.#listeners.get(event.type) ?? []) {
      listener(event);
    }
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("FramePathListView", () => {
  it("renders frame row metadata and emits left and right selections", async () => {
    vi.mocked(Element.prototype.scrollIntoView).mockClear();
    const frameA = { id: 1 } as any;
    const frameB = { id: 2 } as any;
    const selections: any[] = [];
    const view = await renderView(
      <FramePathListView
        disabled={false}
        items={[
          {
            frame: frameA,
            id: 1,
            text: "[F{1}|#0] (t = 10, ...)",
            description: "frame one",
            disabled: false,
            isComplete: true,
          },
          {
            frame: frameB,
            id: 2,
            text: "[F{2}] (t = 20, ...)",
            description: "frame two",
            disabled: true,
            isComplete: false,
          },
        ]}
        onSelect={(frame, button) => selections.push({ frame, button })}
        selectedFrame={frameA}
      />,
    );

    const rows = view.container.querySelectorAll(
      '[data-test="editor-frame-row"]',
    ) as NodeListOf<HTMLElement>;
    expect(rows).toHaveLength(2);
    const frameList = view.container.querySelector(
      ".scrolllist.frame-path",
    ) as HTMLElement;
    expect(frameList).not.toBeNull();
    expect(frameList.style.height).toBe("128px");
    expect(frameList.style.overflowY).toBe("scroll");
    expect(frameList.style.overflowX).toBe("hidden");
    expect(frameList.style.resize).toBe("vertical");
    expect(rows[0].dataset.frameId).toBe("1");
    expect(rows[0].dataset.frameStatus).toBe("complete");
    expect(rows[0].className).toContain("scrolllist-item");
    expect(rows[0].className).toContain("selected");
    expect(rows[0].getAttribute("aria-selected")).toBe("true");
    await vi.waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
      });
    });
    expect(rows[1].className).toContain("disabled");
    expect(rows[1].getAttribute("aria-disabled")).toBe("true");

    await act(async () => {
      rows[0].click();
      rows[0].dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 2 }),
      );
      rows[1].click();
    });

    expect(selections).toEqual([
      { frame: frameA, button: 0 },
      { frame: frameA, button: 2 },
    ]);

    await view.unmount();
  });

  it("scrolls the current frame when its initially hidden tab becomes visible", async () => {
    let resizeCallback: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    const resizeObserver = {
      observe,
      disconnect,
    } as unknown as ResizeObserver;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback;
        }

        observe = observe;
        disconnect = disconnect;
      },
    );
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    const selectedFrame = { id: 10 } as any;
    const view = await renderView(
      <FramePathListView
        disabled={false}
        items={[
          {
            frame: selectedFrame,
            id: 10,
            text: "[F{10}|#9] (t = 10, ...)",
            description: "current frame",
            disabled: false,
            isComplete: false,
          },
        ]}
        onSelect={() => {}}
        selectedFrame={selectedFrame}
      />,
    );

    expect(observe).toHaveBeenCalledWith(
      view.container.querySelector('[data-test="editor-frame-row"]'),
    );
    await vi.waitFor(() =>
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2),
    );
    vi.mocked(Element.prototype.scrollIntoView).mockClear();

    await act(async () => {
      resizeCallback?.(
        [
          {
            contentRect: { width: 0, height: 0 },
          } as ResizeObserverEntry,
        ],
        resizeObserver,
      );
    });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();

    await act(async () => {
      resizeCallback?.(
        [
          {
            contentRect: { width: 240, height: 20 },
          } as ResizeObserverEntry,
        ],
        resizeObserver,
      );
    });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledOnce();
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
    });

    await view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});

describe("FramePathMenuView", () => {
  function createFrame(id: number, isComplete = false) {
    return {
      id,
      is_complete: isComplete,
      hash: () => String(id),
      getSpatialCenter: () => ({ x: id, y: id + 1, z: id + 2 }),
      getTimestampCenter: () => id + 3,
      // Mirror the async EditableFrame contract (always returns a Promise).
      async updateIsComplete(nextIsComplete: boolean) {
        this.is_complete = nextIsComplete;
      },
    };
  }

  function createPlayback(frames: any[]) {
    const context = new EventSource();
    context.frames = {
      elements: frames,
      axes: {
        xb: { getValue: (frame: any) => ({ center: frame.id }) },
        yb: { getValue: (frame: any) => ({ center: frame.id + 1 }) },
        zb: { getValue: (frame: any) => ({ center: frame.id + 2 }) },
        tb: { getValue: (frame: any) => ({ center: frame.id + 3 }) },
      },
      [Symbol.iterator]: function* iterator() {
        yield* frames;
      },
    };
    context.currentFrame = frames[0];
    context.isNavigating = false;
    context.displayedFrames = [];
    context.displayFrame = (frame: any) => {
      context.currentFrame = frame;
      context.displayedFrames.push(frame);
      context.dispatchEvent({ type: "nav-frame" });
    };

    const playback = new EventSource();
    playback.context = context;
    playback.sortFunc = FrameSortFunction.TXY;
    playback.stride = 1;
    playback.currentId = frames[0].id;
    playback.currentIdx = 0;
    playback.fps = 3;
    playback.isPlaying = false;
    playback.isBuffering = false;
    playback.path = {
      frames,
      length: frames.length,
      has: (frame: any) => frames.includes(frame),
      getIdxOf: (frame: any) => frames.indexOf(frame),
    };
    playback.getBufferText = () => "ready";

    return playback as any;
  }

  it("renders React frame rows in the native Tweakpane path container", async () => {
    const frames = [createFrame(1), createFrame(2, true)];
    const playback = createPlayback(frames);
    const view = await renderView(<FramePathMenuView playback={playback} />);

    expect(view.container.textContent).toContain("[F{1}|#0]");
    const rows = view.container.querySelectorAll(
      '[data-test="editor-frame-row"]',
    ) as NodeListOf<HTMLElement>;
    expect(rows).toHaveLength(2);
    const frameList = view.container.querySelector(
      ".scrolllist.frame-path",
    ) as HTMLElement;
    expect(frameList).not.toBeNull();
    expect(frameList.closest(".tp-htmlcontainerv_t")).not.toBeNull();
    expect(frameList.style.overflowY).toBe("scroll");
    expect(rows[1].dataset.frameStatus).toBe("complete");
    expect(rows[1].className).toContain("complete");

    await act(async () => {
      rows[1].click();
      rows[0].dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 2 }),
      );
    });

    expect(playback.context.displayedFrames).toEqual([frames[1]]);
    expect(frames[0].is_complete).toBe(true);

    await view.unmount();
  });

  it("routes rendered playback controls through the model while enforcing navigation guards", async () => {
    const frames = [createFrame(1), createFrame(2)];
    const playback = createPlayback(frames);
    const view = await renderView(<FramePathMenuView playback={playback} />);
    const buttons = [
      ...view.container.querySelectorAll(".tp-btnv_b"),
    ] as HTMLElement[];

    await act(async () => buttons[2].click());
    expect(playback.currentIdx).toBe(1);

    await act(async () => buttons[0].click());
    expect(playback.currentIdx).toBe(0);

    await act(async () => {
      playback.isPlaying = true;
      playback.dispatchEvent({ type: "change" });
    });
    await act(async () => buttons[2].click());
    expect(playback.currentIdx).toBe(0);

    await act(async () => {
      playback.isPlaying = false;
      playback.context.isNavigating = true;
      playback.context.dispatchEvent({ type: "isNavigating-changed" });
    });
    await act(async () => buttons[2].click());
    expect(playback.currentIdx).toBe(0);

    await act(async () => {
      playback.context.isNavigating = false;
      playback.context.dispatchEvent({ type: "isNavigating-changed" });
    });
    await act(async () => buttons[1].click());
    expect(playback.isPlaying).toBe(true);

    await view.unmount();
  });

  it("reconciles frame rows with serialized status toggles", async () => {
    const { updateFrameIsComplete, pending } = heldFrameStatusUpdates();
    const statusFrame = createEditableFrame(
      { updateFrameIsComplete },
      1,
      false,
    );
    const playback = createPlayback([statusFrame, createFrame(2, true)]);
    const view = await renderView(<FramePathMenuView playback={playback} />);

    const rowFor = (id: number): HTMLElement => {
      const row = view.container.querySelector(`[data-frame-id="${id}"]`);
      expect(row).not.toBeNull();
      return row as HTMLElement;
    };
    expect(rowFor(1).dataset.frameStatus).toBe("incomplete");

    // A rapid double right-click: both cycles read the pre-settle value,
    // so the second dedupes against the serialized first.
    await act(async () => {
      rowFor(1).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 2 }),
      );
      rowFor(1).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 2 }),
      );
    });
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    expect(updateFrameIsComplete).toHaveBeenCalledTimes(1);
    // No optimistic flip: the row stays incomplete until the request settles.
    expect(rowFor(1).dataset.frameStatus).toBe("incomplete");

    // The first update settles; the navigator relays `edit-frame`.
    await act(async () => {
      pending[0].resolve();
    });
    await act(async () => {
      playback.context.dispatchEvent({ type: "edit-frame" });
    });
    expect(statusFrame.is_complete).toBe(true);
    expect(rowFor(1).dataset.frameStatus).toBe("complete");
    expect(rowFor(1).className).toContain("complete");

    // A later cycle to the opposite value still goes through.
    await act(async () => {
      rowFor(1).dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 2 }),
      );
    });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => {
      pending[1].resolve();
    });
    await act(async () => {
      playback.context.dispatchEvent({ type: "edit-frame" });
    });

    // Last input wins, and the backend saw both transitions in order.
    expect(updateFrameIsComplete.mock.calls.map(([, value]) => value)).toEqual([
      true,
      false,
    ]);
    expect(statusFrame.is_complete).toBe(false);
    expect(rowFor(1).dataset.frameStatus).toBe("incomplete");

    await view.unmount();
  });

  it("applies completion toggles to the clicked row, not the paused playback position", async () => {
    const frames = [createFrame(1), createFrame(2)];
    for (const frame of frames) {
      frame.updateIsComplete = vi.fn().mockResolvedValue(undefined);
    }
    const playback = createPlayback(frames);
    // Playback is paused on the second frame while the user toggles the first.
    playback.context.currentFrame = frames[1];
    const view = await renderView(<FramePathMenuView playback={playback} />);

    const rows = view.container.querySelectorAll(
      '[data-test="editor-frame-row"]',
    ) as NodeListOf<HTMLElement>;
    await act(async () => {
      rows[0].dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 2 }),
      );
    });

    expect(frames[0].updateIsComplete).toHaveBeenCalledWith(true);
    expect(frames[1].updateIsComplete).not.toHaveBeenCalled();

    await view.unmount();
  });

  it("reports a failed status toggle from the frame list without leaking a rejection", async () => {
    const failure = new Error("status conflict");
    const { updateFrameIsComplete, pending } = heldFrameStatusUpdates();
    const statusFrame = createEditableFrame(
      { updateFrameIsComplete },
      1,
      false,
    );
    const playback = createPlayback([statusFrame, createFrame(2, true)]);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const view = await renderView(<FramePathMenuView playback={playback} />);

    const row = view.container.querySelector(
      '[data-frame-id="1"]',
    ) as HTMLElement;
    await act(async () => {
      row.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 2 }),
      );
    });
    await vi.waitFor(() => expect(pending).toHaveLength(1));

    await act(async () => {
      pending[0].reject(failure);
    });
    await act(async () => {
      playback.context.dispatchEvent({ type: "edit-frame" });
    });

    // The failure is reported once, the row keeps the last settled state,
    // and the frame stays ready for a retry.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]).toContain(failure);
    expect(statusFrame.is_complete).toBe(false);
    expect(row.dataset.frameStatus).toBe("incomplete");

    await view.unmount();
    errorSpy.mockRestore();
  });
});
