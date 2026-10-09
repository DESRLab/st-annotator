import _ from 'lodash';
import * as THREE from 'three';

import { FuncUtils } from '../../../../../common/lib/utils';

import { FrameSortFunction, FramePath } from '../nav';

/**
 * @typedef {import('../scene').SceneContext<any>} SceneContext
 */

/**
 * @typedef {import('../nav').EditableFrame} EditableFrame
 */

/**
 * @typedef {import('../nav').NavigatorAxis} NavigatorAxis
 */

/**
 * @typedef {object} FramePlaybackOptions
 * @property {FrameSortFunction} [sortFunc=FrameSortFunction.TXY] The function used to sort
 * the available frames to form the path.
 * @property {number} [stride=5] The distance (in terms of index in the available frames) between
 * each frame to include in the path.
 * @property {number} [fps=3] The number of frames to play per second.
 */

/**
 * Defines each event that can be dispatched by {@link FramePlayback}.
 * 
 * @typedef {object} FramePlaybackEventMap
 * @property {{}} change The event when the state of the playback has been updated.
 */

/**
 * @typedef {{
 *     frame: EditableFrame;
 *     status: 'pending' | 'success' | 'failed';
 * }} PlaybackFrame
 */

/**
 * Helper class to traverse between frames along a path.
 * 
 * @augments THREE.EventDispatcher<FramePlaybackEventMap>
 */
export class FramePlayback extends THREE.EventDispatcher {

    /**
     * Represents the active scene.
     * 
     * @readonly
     * @type {SceneContext}
     */
    context;

    /**
     * @type {FrameSortFunction}
     */
    #sortFunc;

    /**
     * The function used to sort the available frames to form the path.
     * 
     * @type {FrameSortFunction}
     */
    get sortFunc() { return this.#sortFunc; }

    set sortFunc(value) {
        if (this.#sortFunc !== value) {
            this.#sortFunc = value;

            this.#resetPath();
        }
    }

    /**
     * @type {number}
     */
    #stride;

    /**
     * The distance (in terms of index in the available frames) between
     * each frame to include in the path.
     * 
     * @type {number}
     */
    get stride() { return this.#stride; }

    set stride(value) {
        if (this.#stride !== value) {
            this.#stride = value;

            this.#resetPath();
        }
    }

    /**
     * @type {FramePath}
     */
    #path;

    /**
     * The path along which the frames are traversed.
     * 
     * @type {FramePath}
     */
    get path() { return this.#path; }

    /**
     * Resets the path along which the frames are traversed.
     */
    #resetPath() {
        const { context: { currentFrame, frames }, sortFunc, stride } = this;

        const sortedFrames = sortFunc.sortedFrames(frames);

        // Such that the path always includes the current frame
        const currentSortedIdx = (currentFrame == null) ? null
            : sortedFrames.indexOf(currentFrame);
        const offset = (currentSortedIdx == null) ? 0
            : currentSortedIdx % stride;

        /**
         * @type {number[]}
         */
        let idxsInPath;
        if (stride > 0) {
            idxsInPath = _.range(offset, sortedFrames.length, stride);
        } else if (stride < 0) {
            idxsInPath = _.rangeRight(offset, sortedFrames.length, -stride);
        } else {
            idxsInPath = (currentSortedIdx == null) ? [] : [currentSortedIdx];
        }

        const framesInPath = idxsInPath.map((idx) => sortedFrames[idx]);

        this.#path = new FramePath(framesInPath);

        this.#resetFrames();
    }

    /**
     * The active frame in the context.
     * 
     * @type {?EditableFrame}
     */
    get currentFrame() { return this.context.currentFrame; }

    /**
     * The unique identifier of the current frame.
     * 
     * @type {?number}
     */
    get currentId() {
        const currentFrame = this.currentFrame;
        if (currentFrame == null) return null;

        return currentFrame.id;
    }

    set currentId(value) {
        if (this.currentId !== value) {
            const frame = (value == null) ? null
                : (this.context.frames.elements.find((f) => f.id === value) ?? null);

            this.context.displayFrame(frame);
        }
    }

    /**
     * The index of the current frame in the path of this playback.
     * 
     * @type {?number}
     */
    get currentIdx() {
        const currentFrame = this.currentFrame;
        if (currentFrame == null) return null;

        return this.path.getIdxOf(currentFrame);
    }

    set currentIdx(value) {
        if (this.currentIdx !== value) {
            const frame = (value == null) ? null : (this.path.frames.at(value) ?? null);

            this.context.displayFrame(frame);
        }
    }

    /**
     * @type {number}
     */
    #fps;

    /**
     * The number of frames to play per second.
     * 
     * @type {number}
     */
    get fps() { return this.#fps; }

    set fps(value) {
        if (this.#fps !== value) {
            this.#fps = value;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * @type {number}
     */
    get #playIntervalMillis() { return 1000 / this.#fps; }

    /**
     * @type {number}
     */
    get #bufferIntervalMillis() { return 1000 / (this.#fps * 2); }

    /**
     * The maximum number of frames to buffer.
     * 
     * @type {number}
     */
    get maxBufferSize() {
        const { frameCacheSize } = this.context.config;

        // Ensure that frames first loaded in the buffer will not be reloaded as it fills up
        return Math.max(0, Math.min(frameCacheSize - 1, this.fps * 2));
    }

    /**
     * The number of frames that are waiting to be played.
     * 
     * @type {number}
     */
    get currentBufferSize() {
        return this.#bufferIdx - this.#playIdx;
    }

    /**
     * Stores each upcoming frame to display in the video.
     * 
     * @type {PlaybackFrame[]}
     */
    #playbackFrames = [];

    /**
     * The index of the next frame in `this.#framesToPlay` to load.
     * 
     * @type {number}
     */
    #bufferIdx = 0;

    /**
     * The index of the next frame in `this.#framesToPlay` to display.
     * 
     * @type {number}
     */
    #playIdx = 0;

    /**
     * Returns a representation of the status of each frame to play.
     * 
     * @returns {string} A representation of the status of each frame to play.
     */
    getBufferText() {
        /**
         * @type {string[]}
         */
        let chars = this.#playbackFrames.map(({ status, frame }, i) => {
            if (frame === this.currentFrame) return '●';
            if (i < this.#playIdx) return '-';
            if (status === 'pending') return 'P';
            if (status === 'success') return 'S';
            if (status === 'failed') return 'F';

            return '?';
        });

        const WINDOW_LEN = 24;
        const charsLen = chars.length;
        if (charsLen > WINDOW_LEN) {
            const currentIdx = chars.indexOf('●');
            const windowStartIdx = Math.max(0, Math.min(currentIdx - 3, charsLen - WINDOW_LEN));
            const windowEndIdx = windowStartIdx + WINDOW_LEN;

            chars = chars.slice(windowStartIdx, windowEndIdx);
            if (windowStartIdx > 0) chars.splice(0, 1, '⋯');
            if (windowEndIdx < charsLen - 1) chars.splice(chars.length - 1, 1, '⋯');
        }

        return chars.join('');
    }

    /**
     * Buffers each frame in sequence.
     * 
     * @readonly
     * @type {FuncUtils.RepeatingTimer}
     */
    #bufferRunner = new FuncUtils.RepeatingTimer({
        periodMillis: () => this.#bufferIntervalMillis,
        action: () => {
            if (!this.isPlaying) return;
            if (this.currentBufferSize >= this.maxBufferSize) return;

            const frameToBuffer = this.#playbackFrames.at(this.#bufferIdx);
            if (frameToBuffer === undefined) return;

            if (frameToBuffer.status === 'pending') {
                const { frame: nextFrame } = frameToBuffer;

                this.context.requireFrame(nextFrame)
                    .then(() => {
                        frameToBuffer.status = 'success';
                    })
                    .catch((reason) => {
                        console.error('Failed to buffer frame:', nextFrame, 'Reason:', reason);

                        frameToBuffer.status = 'failed';
                    })
                    .finally(() => {
                        this.dispatchEvent({ type: 'change' });
                    });
            } else {
                // The frame has already been buffered (whether success or fail)
            }

            this.#bufferIdx += 1;

            this.dispatchEvent({ type: 'change' });
        },
    });

    /**
     * Plays each frame in sequence.
     * 
     * @readonly
     * @type {FuncUtils.RepeatingTimer}
     */
    #playbackRunner = new FuncUtils.RepeatingTimer({
        periodMillis: () => this.#playIntervalMillis,
        action: async () => {
            if (!this.isPlaying) return;

            const frameToPlay = this.#playbackFrames.at(this.#playIdx);
            if (frameToPlay === undefined) {
                // No more frames to play
                this.isPlaying = false;
                return;
            }

            if (frameToPlay.status === 'pending') return;

            if (frameToPlay.status === 'success') {
                const { frame: nextFrame } = frameToPlay;

                // Triggers #onNavFrame
                await this.context.displayFrame(nextFrame)
                    .catch((reason) => {
                        console.error('Failed to play frame:', nextFrame, 'Reason:', reason);
                    });
            } else {
                // Skip the failed frame
            }

            this.#playIdx += 1;

            this.dispatchEvent({ type: 'change' });
        },
    });

    /**
     * Gets the frames that need to be eventually buffered during playback.
     * 
     * @returns {EditableFrame[]} The requested frames.
     */
    #getFramesToBuffer() {
        const currentIdx = this.currentIdx;
        if (currentIdx == null) return [];

        const path = this.path;

        return path.frames.slice(currentIdx, path.length);
    }

    /**
     * Resets the frames to buffer and play.
     */
    #resetFrames() {
        const isPlaying = this.isPlaying;

        if (isPlaying) {
            this.#playbackRunner.stop();
        }

        this.#bufferRunner.stop();

        this.#playbackFrames = this.#getFramesToBuffer()
            .map((frame) => ({ frame: frame, status: 'pending' }));
        this.#bufferIdx = 0;
        this.#playIdx = 0;

        this.#bufferRunner.start();

        if (isPlaying) {
            this.#playbackRunner.start();
        }

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * `true` if the playback is playing; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isPlaying() { return this.#playbackRunner.isActive; }

    set isPlaying(value) {
        if (this.isPlaying !== value) {
            this.#playbackRunner.isActive = value;

            this.dispatchEvent({ type: 'change' });
        }
    }

    /**
     * `true` if the playback is playing, but waiting for frames to be buffered;
     * otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isBuffering() {
        return this.isPlaying
            && this.#playbackFrames.some(({ status }) => status === 'pending');
    }

    /**
     * Handles the event when the context navigates to a different frame.
     */
    #onNavFrame = () => {
        const currentFrame = this.currentFrame;

        if (currentFrame == null || !this.path.has(currentFrame)) {
            this.#resetPath();
        } else if (this.#playbackFrames.at(this.#playIdx)?.frame !== currentFrame) {
            this.#resetFrames();
        }

        this.dispatchEvent({ type: 'change' });
    };

    /**
     * Creates a new helper to traverse between frames along a path.
     * 
     * @param {SceneContext} context Represents the active scene.
     * @param {FramePlaybackOptions} options Optional parameters to apply to the helper.
     */
    constructor(context, options = {}) {
        super();

        this.context = context;
        this.#sortFunc = options.sortFunc ?? FrameSortFunction.TXY;
        this.#stride = options.stride ?? 5;
        this.#fps = options.fps ?? 3;

        this.#resetPath();

        this.context.addEventListener('nav-frame', this.#onNavFrame);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.context.removeEventListener('nav-frame', this.#onNavFrame);

        this.#playbackRunner.stop();
        this.#bufferRunner.stop();

        this.#playbackFrames = [];

        this.dispatchEvent({ type: 'change' });
    }
}
