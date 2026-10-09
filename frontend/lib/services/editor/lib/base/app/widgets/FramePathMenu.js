import { SelectableScrollList } from '../../../../../../common/lib/widgets';

import { FrameSortFunction, NavigatorAxis } from '../../nav';

import { FramePathPaneController } from './FramePathPane';
import { BaseMenu } from './Menu';

/* eslint-disable max-len */
/**
 * @typedef {import('../../../../../../common/lib/utils').EquatableValue} EquatableValue
 */

/**
 * @template {EquatableValue | null} T
 * @typedef {import('../../../../../../common/lib/widgets').SelectableScrollListEventMap<T>} SelectableScrollListEventMap
 */

/**
 * @typedef {import('../../nav').EditableFrame} EditableFrame
 */

/**
 * @typedef {import('../../scene').SceneContext<any>} SceneContext
 */

/**
 * @typedef {import('../../widgets').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('../../widgets').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('../FramePlayback').FramePlayback} FramePlayback
 */

/**
 * @typedef {import('../Keybinds').Keybind} Keybind
 */

/**
 * @typedef {import('./FramePathPane').FramePathPaneControllerEventMap} FramePathPaneControllerEventMap
 */

/**
 * @typedef {import('./FramePathPane').FramePathPaneControllerParams} FramePathPaneControllerParams
 */
/* eslint-enable max-len */

/**
 * Allows the user to traverse a sequence of frames.
 */
export class FramePathMenu extends BaseMenu {

    /**
     * @readonly
     * @type {FramePathPaneController}
     */
    #pane;

    /**
     * @readonly
     * @type {SelectableScrollList<EditableFrame>}
     */
    #pathList;

    /**
     * Traverses the sequence of frames.
     * 
     * @readonly
     * @type {FramePlayback}
     */
    playback;

    /**
     * Represents the active scene.
     * 
     * @type {SceneContext}
     */
    get context() { return this.playback.context; }

    /**
     * The function used to sort the available frames to form the path.
     * 
     * @type {FrameSortFunction}
     */
    get sortFunc() { return this.playback.sortFunc; }

    set sortFunc(value) { this.playback.sortFunc = value; }

    /**
     * The distance (in terms of index in the available frames) between
     * each frame to include in the path.
     * 
     * @type {number}
     */
    get stride() { return this.playback.stride; }

    set stride(value) { this.playback.stride = value; }

    /**
     * The unique identifier of the current frame.
     * 
     * @type {?number}
     */
    get currentId() { return this.playback.currentId; }

    set currentId(value) { this.playback.currentId = value; }

    /**
     * The index of the current frame in the playback.
     * 
     * @type {?number}
     */
    get currentIdx() { return this.playback.currentIdx; }

    set currentIdx(value) { this.playback.currentIdx = value; }

    /**
     * The number of frames to play per second.
     * 
     * @type {number}
     */
    get fps() { return this.playback.fps; }

    set fps(value) { this.playback.fps = value; }

    /**
     * `true` if the playback is playing; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get isPlaying() { return this.playback.isPlaying; }

    set isPlaying(value) { this.playback.isPlaying = value; }

    /**
     * @type {boolean}
     */
    #showAllFrames = true;

    /**
     * If `true`, displays all frames, not just the ones in the current path.
     * 
     * @type {boolean}
     */
    get showAllFrames() { return this.#showAllFrames; }

    set showAllFrames(value) {
        if (this.#showAllFrames !== value) {
            this.#showAllFrames = value;

            this.#render(true);
        }
    }

    /**
     * Recreates each item in `this.#pathList`.
     * 
     * @param {boolean} scrollToSelection If `true`, the scroll position of the
     * item to select is maintained.
     */
    #recreatePathListItems(scrollToSelection) {
        const { sortFunc, showAllFrames } = this;
        const { currentFrame, frames } = this.context;
        const { path } = this.playback;

        /**
         * @type {NavigatorAxis}
         */
        let displayAxis;
        switch (sortFunc) {
            case FrameSortFunction.XYT:
            case FrameSortFunction.XTY:
                displayAxis = NavigatorAxis.X_BOUNDS;
                break;
            case FrameSortFunction.YXT:
            case FrameSortFunction.YTX:
                displayAxis = NavigatorAxis.Y_BOUNDS;
                break;
            case FrameSortFunction.TXY:
            case FrameSortFunction.TYX:
                displayAxis = NavigatorAxis.T_BOUNDS;
                break;
            default:
                throw new Error(`Invalid sortFunc: ${sortFunc}`);
        }

        /**
         * @type {Parameters<SelectableScrollList<EditableFrame>['setItems']>[0]}
         */
        const nextItems = sortFunc.sortedFrames(frames)
            .filter((frame) => showAllFrames || path.has(frame))
            .map((frame) => {
                const { id, is_complete: isComplete } = frame;
                const idx = path.getIdxOf(frame);

                const idText = (idx == null) ? `[F{${id}}]` : `[F{${id}}|#${idx}]`;
                const { x: xCenter, y: yCenter, z: zCenter } = frame.getSpatialCenter();
                const tCenter = frame.getTimestampCenter();

                /**
                 * @type {string}
                 */
                let attrText;
                switch (displayAxis) {
                    case NavigatorAxis.X_BOUNDS:
                        attrText = `(x = ${xCenter}, ...)`;
                        break;
                    case NavigatorAxis.Y_BOUNDS:
                        attrText = `(y = ${yCenter}, ...)`;
                        break;
                    case NavigatorAxis.Z_BOUNDS:
                        attrText = `(z = ${zCenter}, ...)`;
                        break;
                    case NavigatorAxis.T_BOUNDS:
                        attrText = `(t = ${tCenter}, ...)`;
                        break;
                    default:
                        throw new Error(`Invalid displayAxis: ${displayAxis}`);
                }

                const description = `x: ${xCenter}\n`
                    + `y: ${yCenter}\n`
                    + `z: ${zCenter}\n`
                    + `t: ${tCenter}\n`
                    + `Status: ${isComplete ? 'Complete' : 'Incomplete'} [Right-click to cycle]`;

                return {
                    value: frame,
                    text: `${idText} ${attrText}`,
                    description: description,
                    disabled: !path.has(frame),
                    modifyHTML: (dom) => {
                        dom.classList.remove('complete');

                        if (isComplete) dom.classList.add('complete');
                    },
                };
            });

        this.#pathList.setItemsAndValue(nextItems, currentFrame ?? undefined, scrollToSelection);
    }

    #getBufferText() {
        return `[${this.playback.getBufferText()}]`;
    }

    #getStatusText() {
        const { context, playback } = this;
        if (context.isNavigating) return 'Navigating';

        if (playback.isPlaying) {
            return (playback.isBuffering) ? 'Buffering' : 'Playing';
        }

        return 'Paused';
    }

    /**
     * Updates the view according to the data in the model.
     * 
     * @param {boolean} scrollPathToSelection If `true`, the scroll position of the
     * item to select in the path list is maintained.
     */
    #render(scrollPathToSelection) {
        const { sortFunc, stride, showAllFrames, currentId, currentIdx, fps, isPlaying } = this;
        const { isNavigating } = this.context;

        const minIdx = 0;
        const maxIdx = this.playback.path.length - 1;
        const disableNav = isPlaying || isNavigating;

        this.#pathList.disabled = disableNav;
        this.#recreatePathListItems(scrollPathToSelection);

        this.#pane.updateState({
            inputtedData: {
                sortFunc: sortFunc,
                stride: stride,
                showAllFrames: showAllFrames,
                currentId: currentId ?? -1,
                currentIdx: currentIdx ?? minIdx,
                fps: fps,
            },
            internalData: {
                pathElem: this.#pathList.dom,
                minIdx: minIdx,
                maxIdx: maxIdx,
                playPauseText: isPlaying ? 'Pause Video' : 'Play Video',
                statusText: this.#getStatusText(),
                bufferText: this.#getBufferText(),
            },
            settings: {
                disablePlayPause: minIdx === maxIdx,
                disableNav: disableNav,
                disableStepPrev: (currentIdx ?? minIdx) === minIdx,
                disableStepNext: (currentIdx ?? maxIdx) === maxIdx,
            },
        });
    }

    /**
     * Handles the event when an input in the pane has been changed.
     * 
     * @param {PaneControllerChangeEvent<FramePathPaneControllerParams>} event
     * The event to handle.
     */
    #onPaneChange = (event) => {
        const { sortFunc, stride, showAllFrames, currentId, currentIdx, fps } = event.outputData;

        if (this.sortFunc !== sortFunc || this.stride !== stride) {
            // This automatically updates the currentIdx to the current frame
            this.sortFunc = sortFunc;
            this.stride = stride;
        } else {
            if (this.currentId !== currentId) {
                if (this.context.frames.elements.find((frame) => frame.id === currentId)) {
                    this.currentId = currentId;
                } else {
                    // Force the text box back to its previous value
                    this.#render(true);
                }
            } else if (this.currentIdx !== currentIdx) {
                this.currentIdx = currentIdx;
            }
        }

        this.fps = fps;

        this.showAllFrames = showAllFrames;
    };

    /**
     * Handles the event when a frame item has been selected.
     * 
     * @param {SelectableScrollListEventMap<EditableFrame>['select']} event
     * The event to handle.
     */
    #onPathSelect = (event) => {
        const { value: frame, pointerEvent: { button } } = event;

        if (button === 0) {
            this.context.displayFrame(frame);
        } else if (button === 2) {
            frame.updateIsComplete(!frame.is_complete);
        }
    };

    /**
     * Handles the event when the user navigates to the previous frame.
     * 
     * @param {FramePathPaneControllerEventMap['click-stepPrev']} event The event to handle.
     */
    #onStepPrev = (event) => {
        const { currentIdx } = this;
        if (currentIdx == null) return;

        const minIdx = 0;
        this.currentIdx = Math.max(minIdx, currentIdx - 1);
    };

    /**
     * Handles the event when the user navigates to the next frame.
     * 
     * @param {FramePathPaneControllerEventMap['click-stepNext']} event The event to handle.
     */
    #onStepNext = (event) => {
        const { currentIdx } = this;
        if (currentIdx == null) return;

        const maxIdx = this.playback.path.length - 1;
        this.currentIdx = Math.min(maxIdx, currentIdx + 1);
    };

    /**
     * Handles the event when the user toggles whether to play or pause the playback.
     * 
     * @param {FramePathPaneControllerEventMap['click-playPause']} event The event to handle.
     */
    #onToggleIsPlaying = (event) => {
        this.isPlaying = !this.isPlaying;
    };

    /**
     * Handles the event when the state of the playback is updated.
     */
    #onPlaybackChange = () => {
        this.#render(true);
    };

    /**
     * Handles the event when the `isNavigating` status is changed.
     */
    #onIsNavigatingChange = () => {
        this.#render(false);
    };

    /**
     * Handles the event when a frame in the context has been edited.
     */
    #onEditFrame = () => {
        this.#render(true);
    };

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    KEYDOWN_BINDS = [
        {
            keyCombo: 'space',
            name: 'Play/Pause video',
            handler: () => {
                this.clickPlayPause();
            },
        },
    ];

    /**
     * Creates a new menu to traverse a sequence of frames.
     * 
     * @param {FramePlayback} playback Performs the playback.
     */
    constructor(playback) {
        super();

        for (const keybind of this.KEYDOWN_BINDS) {
            this.keydownHandler.register(keybind);
        }

        this.playback = playback;

        this.#pane = FramePathPaneController.create(this.dom);
        this.#pane.addEventListener('change', this.#onPaneChange);
        this.#pane.paneEvents.addEventListener('click-stepPrev', this.#onStepPrev);
        this.#pane.paneEvents.addEventListener('click-stepNext', this.#onStepNext);
        this.#pane.paneEvents.addEventListener('click-playPause', this.#onToggleIsPlaying);

        this.#pathList = new SelectableScrollList({ items: [] });
        this.#pathList.dom.style.minHeight = '128px';
        this.#pathList.dom.style.height = '128px';
        this.#pathList.dom.classList.add('frame-path');
        this.#pathList.addEventListener('select', this.#onPathSelect);

        this.playback.addEventListener('change', this.#onPlaybackChange);
        this.context.addEventListener('isNavigating-changed', this.#onIsNavigatingChange);
        this.context.addEventListener('edit-frame', this.#onEditFrame);

        this.#render(true);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.context.removeEventListener('edit-frame', this.#onEditFrame);
        this.context.removeEventListener('isNavigating-changed', this.#onIsNavigatingChange);
        this.playback.removeEventListener('change', this.#onPlaybackChange);

        this.#pathList.removeEventListener('select', this.#onPathSelect);
        this.#pathList.dispose();

        this.#pane.paneEvents.removeEventListener('click-stepPrev', this.#onStepPrev);
        this.#pane.paneEvents.removeEventListener('click-stepNext', this.#onStepNext);
        this.#pane.paneEvents.removeEventListener('click-playPause', this.#onToggleIsPlaying);
        this.#pane.removeEventListener('change', this.#onPaneChange);
        this.#pane.dispose();

        super.dispose();
    }

    /**
     * Clicks on the step previous button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickStepPrev() {
        this.#pane.clickStepPrevButton();
    }

    /**
     * Clicks on the step next button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickStepNext() {
        this.#pane.clickStepNextButton();
    }

    /**
     * Clicks on the play/pause button.
     * 
     * This is a no-op if the button is disabled.
     */
    clickPlayPause() {
        this.#pane.clickPlayPauseButton();
    }
}
