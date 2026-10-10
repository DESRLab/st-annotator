import { afterEach, describe, expect, it, vi } from "vitest";

import { FramePlayback } from "../../../../../app/routes/editor/app/FramePlayback";
import type { FrameSortFunctionSpec } from "../../../../../app/routes/editor/nav";

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

/** Sorts frames by ascending id, independent of the axis-based spec fixtures. */
const SORT_BY_ID: FrameSortFunctionSpec = {
  sortedFrames: (frames: any) =>
    frames.elements.slice().sort((a: any, b: any) => a.id - b.id),
};

/** Sorts frames by descending id, to exercise a sort change mid-playback. */
const SORT_BY_ID_DESC: FrameSortFunctionSpec = {
  sortedFrames: (frames: any) =>
    frames.elements.slice().sort((a: any, b: any) => b.id - a.id),
};

interface BufferRequest {
  frame: { id: number };
  resolve: () => void;
  reject: (reason: unknown) => void;
}

/**
 * A playback rig with held `requireFrame` requests: the test settles each
 * buffer request explicitly, so buffer/play interleavings are deterministic
 * under fake timers. fps defaults to 1 (play every 1000ms, buffer every 500ms).
 */
function createRig(
  options: {
    frameIds: number[];
    currentIdx?: number;
    stride?: number;
    fps?: number;
    frameCacheSize?: number;
  } = { frameIds: [] },
) {
  const frames = options.frameIds.map((id) => ({
    id,
    hash: () => String(id),
  }));
  const bufferRequests: BufferRequest[] = [];

  const context = new EventSource();
  context.config = { frameCacheSize: options.frameCacheSize ?? 8 };
  context.frames = { elements: frames };
  context.currentFrame = frames[options.currentIdx ?? 0] ?? null;
  context.displayFrame = vi.fn(async (frame: { id: number } | null) => {
    context.currentFrame = frame;
    context.dispatchEvent({ type: "nav-frame", frame });
  });
  context.requireFrame = vi.fn((frame: { id: number }) => {
    let resolve!: () => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    bufferRequests.push({ frame, resolve, reject });
    return promise;
  });

  const playback = new FramePlayback(context as any, {
    sortFunc: SORT_BY_ID,
    stride: options.stride ?? 1,
    fps: options.fps ?? 1,
  });

  return { context, playback, frames, bufferRequests };
}

let activeRig: ReturnType<typeof createRig> | null = null;

function rig(options: Parameters<typeof createRig>[0]) {
  activeRig = createRig(options);
  return activeRig;
}

/**
 * Advances playback by the given number of frames at fps=1, settling every
 * buffer request encountered along the way. Each step covers one buffer tick
 * (500ms) and one play interval (1000ms); play ticks that catch a frame
 * still buffering hold the position, so steps stay aligned with frames.
 */
async function playSteps(count: number) {
  for (let i = 0; i < count; i++) {
    await vi.advanceTimersByTimeAsync(500);
    for (const request of activeRig!.bufferRequests) request.resolve();
    await vi.advanceTimersByTimeAsync(1000);
  }
}

afterEach(() => {
  activeRig?.playback.dispose();
  activeRig = null;
  vi.useRealTimers();
});

describe("FramePlayback sequencing", () => {
  it("keeps exactly one timer per runner across a play-pause-play burst", async () => {
    vi.useFakeTimers();
    const { playback, context, frames, bufferRequests } = rig({
      frameIds: [1, 2, 3, 4],
    });

    // The buffer runner is always scheduled; the play runner only while playing.
    expect(vi.getTimerCount()).toBe(1);

    playback.isPlaying = true;
    expect(vi.getTimerCount()).toBe(2);

    // A play-pause-play burst in one tick must not accumulate timers.
    playback.isPlaying = false;
    expect(vi.getTimerCount()).toBe(1);
    playback.isPlaying = true;
    expect(vi.getTimerCount()).toBe(2);

    // The burst also must not double-advance: after one buffer settles,
    // exactly one play tick fires over the next play interval.
    await vi.advanceTimersByTimeAsync(500);
    expect(bufferRequests).toHaveLength(1);
    bufferRequests[0].resolve();
    await vi.advanceTimersByTimeAsync(1000);

    expect(context.displayFrame).toHaveBeenCalledTimes(1);
    expect(context.displayFrame).toHaveBeenLastCalledWith(frames[0]);
  });

  it("keeps a paused playback idle while an in-flight buffer settles, then resumes in order", async () => {
    vi.useFakeTimers();
    const { playback, context, frames, bufferRequests } = rig({
      frameIds: [1, 2, 3],
    });

    playback.isPlaying = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(bufferRequests).toHaveLength(1);

    // Pause while the first frame is still buffering.
    playback.isPlaying = false;
    expect(playback.isBuffering).toBe(false);

    bufferRequests[0].resolve();
    await vi.advanceTimersByTimeAsync(0);

    // The late buffer completion must not display anything by itself...
    expect(context.displayFrame).not.toHaveBeenCalled();

    // ...and nothing plays while paused.
    await vi.advanceTimersByTimeAsync(5000);
    expect(context.displayFrame).not.toHaveBeenCalled();
    expect(playback.isPlaying).toBe(false);

    // Resuming continues from the same play position: no late jump past
    // the frame buffered before the pause.
    playback.isPlaying = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(context.displayFrame).toHaveBeenCalledTimes(1);
    expect(context.displayFrame).toHaveBeenLastCalledWith(frames[0]);
  });

  it("rebuilds the path around the current frame when stride changes mid-playback", async () => {
    vi.useFakeTimers();
    const { playback, context, frames } = rig({ frameIds: [1, 2, 3, 4] });

    playback.isPlaying = true;
    // Two play steps: display f1, then advance to f2.
    await playSteps(2);
    expect(context.currentFrame).toBe(frames[1]);

    // Stride changes mid-playback: the path must still contain the
    // current frame, and playback resumes from it along the new path.
    playback.stride = 2;
    expect(playback.path.frames.map(({ id }) => id)).toEqual([2, 4]);

    // The rebuilt buffer re-buffers the current frame first, then the
    // next frame of the new path; the current frame re-displays once
    // before playback continues along the new path.
    await playSteps(2);

    expect(context.displayFrame.mock.calls.map(([frame]) => frame)).toEqual([
      frames[0],
      frames[1],
      frames[1],
      frames[3],
    ]);
    expect(context.currentFrame).toBe(frames[3]);
  });

  it("applies an fps change without recreating timers", async () => {
    vi.useFakeTimers();
    const { playback, context, frames, bufferRequests } = rig({
      frameIds: [1, 2, 3],
      fps: 2,
    });

    playback.isPlaying = true;
    // One buffered play step at fps 2 (play period 500ms, buffer 250ms).
    await vi.advanceTimersByTimeAsync(250);
    for (const request of bufferRequests) request.resolve();
    await vi.advanceTimersByTimeAsync(500);
    for (const request of bufferRequests) request.resolve();
    expect(context.displayFrame).toHaveBeenCalledTimes(1);
    expect(context.displayFrame).toHaveBeenLastCalledWith(frames[0]);

    // fps 2 -> 4: the play period becomes 250ms (buffer 125ms) without
    // any change in the number of scheduled timers.
    playback.fps = 4;
    expect(vi.getTimerCount()).toBe(2);

    // The next play tick runs on the pre-change schedule; the ticks
    // after it run at the new 250ms period.
    await vi.advanceTimersByTimeAsync(250);
    expect(context.displayFrame).toHaveBeenCalledTimes(2);
    expect(context.displayFrame).toHaveBeenLastCalledWith(frames[1]);

    await vi.advanceTimersByTimeAsync(250);
    expect(context.displayFrame).toHaveBeenCalledTimes(3);
    expect(context.currentFrame).toBe(frames[2]);
  });

  it("rebuilds the path for the new order when the sort changes mid-playback", async () => {
    vi.useFakeTimers();
    const { playback, context, frames } = rig({ frameIds: [1, 2, 3, 4] });

    playback.isPlaying = true;
    await playSteps(2);
    expect(context.currentFrame).toBe(frames[1]);

    // Descending sort mid-playback: the path reverses but still contains
    // the current frame, and playback continues along the new order.
    playback.sortFunc = SORT_BY_ID_DESC;
    expect(playback.path.frames.map(({ id }) => id)).toEqual([4, 3, 2, 1]);

    await playSteps(2);

    // The current frame re-displays once after the rebuild, then playback
    // continues with the next frame of the descending path.
    expect(context.displayFrame.mock.calls.map(([frame]) => frame)).toEqual([
      frames[0],
      frames[1],
      frames[1],
      frames[0],
    ]);
    expect(context.currentFrame).toBe(frames[0]);
  });

  it("resets the buffer around a manually navigated frame after pause", async () => {
    vi.useFakeTimers();
    const { playback, context, frames, bufferRequests } = rig({
      frameIds: [1, 2, 3, 4],
    });

    playback.isPlaying = true;
    await playSteps(1);
    playback.isPlaying = false;

    // Manual navigation right after pause: the playback frames rebuild
    // around the newly displayed frame.
    await context.displayFrame(frames[3]);
    expect(playback.path.has(frames[3])).toBe(true);
    expect(playback.currentIdx).toBe(3);
    expect(playback.isPlaying).toBe(false);

    playback.isPlaying = true;
    await vi.advanceTimersByTimeAsync(500);
    const buffered = bufferRequests.at(-1)!;
    expect(buffered.frame).toBe(frames[3]);
    buffered.resolve();
    await vi.advanceTimersByTimeAsync(1000);

    expect(context.displayFrame).toHaveBeenLastCalledWith(frames[3]);
  });

  it("stops playing when the end of the path is reached", async () => {
    vi.useFakeTimers();
    const { playback, bufferRequests } = rig({ frameIds: [1, 2] });

    playback.isPlaying = true;
    await vi.advanceTimersByTimeAsync(500);
    for (const request of bufferRequests) request.resolve();
    await vi.advanceTimersByTimeAsync(500);
    for (const request of bufferRequests) request.resolve();

    // Play through both frames, then the runner stops itself.
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(playback.isPlaying).toBe(false);
  });
});

describe("FramePlayback failures and context changes", () => {
  it("skips a failed frame exactly once and continues with the rest", async () => {
    vi.useFakeTimers();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const { playback, context, frames, bufferRequests } = rig({
      frameIds: [1, 2, 3],
    });

    playback.isPlaying = true;

    // Buffer frame 1 (success) and frame 2 (will fail).
    await vi.advanceTimersByTimeAsync(500);
    bufferRequests[0].resolve();
    await vi.advanceTimersByTimeAsync(500);
    bufferRequests[1].reject(new Error("frame 2 unavailable"));
    await vi.advanceTimersByTimeAsync(0);

    // The failure is reported once and marked in the buffer text.
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(playback.getBufferText()).toContain("F");

    // Buffer frame 3, then play: frame 1 displays, frame 2 is skipped
    // exactly once (never re-buffered, never displayed), frame 3 displays.
    await vi.advanceTimersByTimeAsync(500);
    bufferRequests[2].resolve();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(context.displayFrame.mock.calls.map(([frame]) => frame)).toEqual([
      frames[0],
      frames[2],
    ]);
    expect(context.requireFrame).toHaveBeenCalledTimes(3);
    expect(playback.isPlaying).toBe(false);

    consoleError.mockRestore();
  });

  it("resets around the new tuple on a branch change and never plays stale frames", async () => {
    vi.useFakeTimers();
    const { playback, context, frames, bufferRequests } = rig({
      frameIds: [1, 2, 3, 4],
    });

    playback.isPlaying = true;
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(500);
    // Two old-tuple buffer requests are in flight when the branch changes.
    expect(bufferRequests).toHaveLength(2);

    // A branch/task change replaces the frames and navigates to the new tuple.
    const newFrames = [
      { id: 101, hash: () => "101" },
      { id: 102, hash: () => "102" },
    ];
    context.frames.elements = newFrames;
    context.displayFrame(newFrames[0]);
    context.displayFrame.mockClear();

    // Playback keeps playing, but reset around the new tuple.
    expect(playback.isPlaying).toBe(true);
    expect(playback.path.frames).toEqual(newFrames);

    // The stale in-flight buffer completions settle afterwards; they must
    // not display anything and must not be attributed to the new tuple.
    bufferRequests[0].resolve();
    bufferRequests[1].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(context.displayFrame).not.toHaveBeenCalled();

    // Playback continues with the new tuple's frames, in order.
    await vi.advanceTimersByTimeAsync(500);
    bufferRequests[2].resolve();
    await vi.advanceTimersByTimeAsync(1000);
    bufferRequests[3]?.resolve();
    await vi.advanceTimersByTimeAsync(500);
    await vi.advanceTimersByTimeAsync(1000);

    expect(context.displayFrame.mock.calls.map(([frame]) => frame)).toEqual([
      newFrames[0],
      newFrames[1],
    ]);
    expect(
      context.displayFrame.mock.calls.every(([frame]) =>
        newFrames.includes(frame),
      ),
    ).toBe(true);
    expect(
      frames.every(
        (frame) => !context.displayFrame.mock.calls.some(([f]) => f === frame),
      ),
    ).toBe(true);
    // The end of the new path stops playback.
    expect(playback.isPlaying).toBe(false);
  });

  it("does not skip the first frame of a rebuilt tuple when a stale display settles late", async () => {
    vi.useFakeTimers();
    const { playback, context, frames } = rig({ frameIds: [1, 2, 3, 4] });

    // Held displays: a play's navigation can stay pending across a
    // context reset.
    const displays: {
      frame: { id: number } | null;
      resolve: () => void;
    }[] = [];
    context.displayFrame = vi.fn((frame: { id: number } | null) => {
      let resolve!: () => void;
      const promise = new Promise<void>((res) => {
        resolve = res;
      });
      displays.push({ frame, resolve });
      context.currentFrame = frame;
      context.dispatchEvent({ type: "nav-frame", frame });
      return promise;
    });

    playback.isPlaying = true;
    await vi.advanceTimersByTimeAsync(500);
    activeRig!.bufferRequests[0].resolve();
    await vi.advanceTimersByTimeAsync(1000);
    // The play tick is now awaiting the (held) display of frame 1.
    expect(displays).toHaveLength(1);
    expect(displays[0].frame).toBe(frames[0]);

    // A branch/source change resets playback around a new tuple while
    // the old display is still pending.
    const newFrames = [
      { id: 101, hash: () => "101" },
      { id: 102, hash: () => "102" },
    ];
    context.frames.elements = newFrames;
    context.currentFrame = newFrames[0];
    context.dispatchEvent({ type: "nav-frame", frame: newFrames[0] });
    expect(playback.path.frames).toEqual(newFrames);
    expect(playback.isPlaying).toBe(true);

    // The stale display settles late; its continuation must not advance
    // the new tuple's play index.
    displays[0].resolve();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(500);
    activeRig!.bufferRequests.at(-1)!.resolve();
    await vi.advanceTimersByTimeAsync(1000);

    // The first frame of the new tuple still plays next (not skipped).
    expect(displays).toHaveLength(2);
    expect(displays[1].frame).toBe(newFrames[0]);
  });

  it("stops all timers and detaches from the context on dispose", async () => {
    vi.useFakeTimers();
    const { playback, context, frames } = rig({ frameIds: [1, 2, 3] });

    playback.isPlaying = true;
    expect(vi.getTimerCount()).toBe(2);

    playback.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(playback.getBufferText()).toBe("");

    // A navigation after disposal no longer reaches the playback.
    await context.displayFrame(frames[2]);
    expect(playback.isPlaying).toBe(false);
  });
});
