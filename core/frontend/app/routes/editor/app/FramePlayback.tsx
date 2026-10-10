import _ from "lodash";

import { FuncUtils } from "sta/common";

import type { EditableFrame, FrameSortFunctionSpec } from "../nav";
import { FrameSortFunction, FramePath } from "../nav";
import type { SceneContext } from "../scene";
import { VanillaEventDispatcher } from "../utils";

export interface FramePlaybackOptions {
  sortFunc?: FrameSortFunctionSpec;
  stride?: number;
  fps?: number;
}

export interface FramePlaybackEventMap {
  change: {};
}

interface PlaybackFrame {
  frame: EditableFrame;
  status: "pending" | "success" | "failed";
}

/**
 * Helper class to traverse between frames along a path.
 */
export class FramePlayback extends VanillaEventDispatcher<FramePlaybackEventMap> {
  readonly context: SceneContext<any>;

  #sortFunc: FrameSortFunctionSpec;

  get sortFunc(): FrameSortFunctionSpec {
    return this.#sortFunc;
  }

  set sortFunc(value: FrameSortFunctionSpec) {
    if (this.#sortFunc !== value) {
      this.#sortFunc = value;

      this.#resetPath();
    }
  }

  #stride: number;

  get stride(): number {
    return this.#stride;
  }

  set stride(value: number) {
    if (this.#stride !== value) {
      this.#stride = value;

      this.#resetPath();
    }
  }

  #path: FramePath;

  get path(): FramePath {
    return this.#path;
  }

  #resetPath(): void {
    const {
      context: { currentFrame, frames },
      sortFunc,
      stride,
    } = this;

    const sortedFrames = sortFunc.sortedFrames(frames);

    // Such that the path always includes the current frame
    const currentSortedIdx =
      currentFrame == null ? null : sortedFrames.indexOf(currentFrame);
    const offset = currentSortedIdx == null ? 0 : currentSortedIdx % stride;

    let idxsInPath: number[];
    if (stride > 0) {
      idxsInPath = _.range(offset, sortedFrames.length, stride);
    } else if (stride < 0) {
      idxsInPath = _.rangeRight(offset, sortedFrames.length, -stride);
    } else {
      idxsInPath = currentSortedIdx == null ? [] : [currentSortedIdx];
    }

    const framesInPath = idxsInPath.map((idx) => sortedFrames[idx]);

    this.#path = new FramePath(framesInPath);

    this.#resetFrames();
  }

  get currentFrame(): EditableFrame | null {
    return this.context.currentFrame;
  }

  get currentId(): number | null {
    const currentFrame = this.currentFrame;
    if (currentFrame == null) return null;

    return currentFrame.id;
  }

  set currentId(value: number | null) {
    if (this.currentId !== value) {
      const frame =
        value == null
          ? null
          : (this.context.frames.elements.find(
              (f: EditableFrame) => f.id === value,
            ) ?? null);

      void this.context.displayFrame(frame);
    }
  }

  get currentIdx(): number | null {
    const currentFrame = this.currentFrame;
    if (currentFrame == null) return null;

    return this.path.getIdxOf(currentFrame);
  }

  set currentIdx(value: number | null) {
    if (this.currentIdx !== value) {
      const frame = value == null ? null : (this.path.frames.at(value) ?? null);

      void this.context.displayFrame(frame);
    }
  }

  #fps: number;

  get fps(): number {
    return this.#fps;
  }

  set fps(value: number) {
    if (this.#fps !== value) {
      this.#fps = value;

      this.dispatchEvent({ type: "change" });
    }
  }

  get #playIntervalMillis(): number {
    return 1000 / this.#fps;
  }

  get #bufferIntervalMillis(): number {
    return 1000 / (this.#fps * 2);
  }

  get maxBufferSize(): number {
    const { frameCacheSize } = this.context.config;

    // Ensure that frames first loaded in the buffer will not be reloaded as it fills up
    return Math.max(0, Math.min(frameCacheSize - 1, this.fps * 2));
  }

  get currentBufferSize(): number {
    return this.#bufferIdx - this.#playIdx;
  }

  #playbackFrames: PlaybackFrame[] = [];

  #bufferIdx = 0;

  #playIdx = 0;

  /**
   * Identifies the current playback-frame sequence. Incremented whenever
   * the sequence is rebuilt, so a play action pending across a rebuild
   * can detect that its continuation is stale.
   */
  #framesGeneration = 0;

  getBufferText(): string {
    let chars: string[] = this.#playbackFrames.map(({ status, frame }, i) => {
      if (frame === this.currentFrame) return "●";
      if (i < this.#playIdx) return "-";
      if (status === "pending") return "P";
      if (status === "success") return "S";
      if (status === "failed") return "F";

      return "?";
    });

    const WINDOW_LEN = 24;
    const charsLen = chars.length;
    if (charsLen > WINDOW_LEN) {
      const currentIdx = chars.indexOf("●");
      const windowStartIdx = Math.max(
        0,
        Math.min(currentIdx - 3, charsLen - WINDOW_LEN),
      );
      const windowEndIdx = windowStartIdx + WINDOW_LEN;

      chars = chars.slice(windowStartIdx, windowEndIdx);
      if (windowStartIdx > 0) chars.splice(0, 1, "⋯");
      if (windowEndIdx < charsLen - 1) chars.splice(chars.length - 1, 1, "⋯");
    }

    return chars.join("");
  }

  readonly #bufferRunner: FuncUtils.RepeatingTimer =
    new FuncUtils.RepeatingTimer({
      periodMillis: (): number => this.#bufferIntervalMillis,
      action: (): void => {
        if (!this.isPlaying) return;
        if (this.currentBufferSize >= this.maxBufferSize) return;

        const frameToBuffer = this.#playbackFrames.at(this.#bufferIdx);
        if (frameToBuffer === undefined) return;

        if (frameToBuffer.status === "pending") {
          const { frame: nextFrame } = frameToBuffer;

          this.context
            .requireFrame(nextFrame)
            .then(() => {
              frameToBuffer.status = "success";
            })
            .catch((reason: unknown) => {
              console.error(
                "Failed to buffer frame:",
                nextFrame,
                "Reason:",
                reason,
              );

              frameToBuffer.status = "failed";
            })
            .finally(() => {
              this.dispatchEvent({ type: "change" });
            });
        } else {
          // The frame has already been buffered (whether success or fail)
        }

        this.#bufferIdx += 1;

        this.dispatchEvent({ type: "change" });
      },
    });

  readonly #playbackRunner: FuncUtils.RepeatingTimer =
    new FuncUtils.RepeatingTimer({
      periodMillis: (): number => this.#playIntervalMillis,
      action: (): void => {
        void this.#playNextFrame();
      },
    });

  async #playNextFrame(): Promise<void> {
    if (!this.isPlaying) return;

    const frameToPlay = this.#playbackFrames.at(this.#playIdx);
    if (frameToPlay === undefined) {
      // No more frames to play
      this.isPlaying = false;
      return;
    }

    if (frameToPlay.status === "pending") return;

    // A branch/source change can reset the playback frames while a
    // display is still pending; the late continuation must not
    // advance the new tuple's play index (skipping its first frame).
    const framesGeneration = this.#framesGeneration;

    if (frameToPlay.status === "success") {
      const { frame: nextFrame } = frameToPlay;

      // Triggers #onNavFrame
      await this.context.displayFrame(nextFrame).catch((reason: unknown) => {
        console.error("Failed to play frame:", nextFrame, "Reason:", reason);
      });
    } else {
      // Skip the failed frame
    }

    if (framesGeneration !== this.#framesGeneration) return;

    this.#playIdx += 1;

    this.dispatchEvent({ type: "change" });
  }

  #getFramesToBuffer(): EditableFrame[] {
    const currentIdx = this.currentIdx;
    if (currentIdx == null) return [];

    const path = this.path;

    return path.frames.slice(currentIdx, path.length);
  }

  #resetFrames(): void {
    const isPlaying = this.isPlaying;

    if (isPlaying) {
      this.#playbackRunner.stop();
    }

    this.#bufferRunner.stop();

    this.#playbackFrames = this.#getFramesToBuffer().map(
      (frame: EditableFrame) => ({
        frame: frame,
        status: "pending" as const,
      }),
    );
    this.#bufferIdx = 0;
    this.#playIdx = 0;
    this.#framesGeneration += 1;

    this.#bufferRunner.start();

    if (isPlaying) {
      this.#playbackRunner.start();
    }

    this.dispatchEvent({ type: "change" });
  }

  get isPlaying(): boolean {
    return this.#playbackRunner.isActive;
  }

  set isPlaying(value: boolean) {
    if (this.isPlaying !== value) {
      this.#playbackRunner.isActive = value;

      this.dispatchEvent({ type: "change" });
    }
  }

  get isBuffering(): boolean {
    return (
      this.isPlaying &&
      this.#playbackFrames.some(({ status }) => status === "pending")
    );
  }

  #onNavFrame = (): void => {
    const currentFrame = this.currentFrame;

    if (currentFrame == null || !this.path.has(currentFrame)) {
      this.#resetPath();
    } else if (this.#playbackFrames.at(this.#playIdx)?.frame !== currentFrame) {
      this.#resetFrames();
    }

    this.dispatchEvent({ type: "change" });
  };

  constructor(context: SceneContext<any>, options: FramePlaybackOptions = {}) {
    super();

    this.context = context;
    this.#sortFunc = options.sortFunc ?? FrameSortFunction.TXY;
    this.#stride = options.stride ?? 5;
    this.#fps = options.fps ?? 3;

    this.#resetPath();

    this.context.addEventListener("nav-frame", this.#onNavFrame);
  }

  dispose(): void {
    this.context.removeEventListener("nav-frame", this.#onNavFrame);

    this.#playbackRunner.stop();
    this.#bufferRunner.stop();

    this.#playbackFrames = [];

    this.dispatchEvent({ type: "change" });
  }
}
