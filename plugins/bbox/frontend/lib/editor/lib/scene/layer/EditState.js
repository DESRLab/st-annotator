import { InteractState } from './InteractState';

/**
 * @typedef {import('sta/services/editor/core').MainWindow} MainWindow
 */

/**
 * @typedef {import('../data').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('../data').UUID} UUID
 */

/**
 * @template {MainWindowMapper} WM 
 * @typedef {import('./InteractContext').InteractContext<WM>} InteractContext
 */

/**
 * @typedef {import('./InteractState').MainWindowMapper} MainWindowMapper
 */

/**
 * @typedef {import('./InteractState').InteractContextUsage} InteractContextUsage
 */

/**
 * @typedef {object} EditStateParams
 * @property {?UUID} trackId The unique identifier of the object track to edit.
 * @property {?UUID} boxId The unique identifier of the bounding box to edit.
 */

/**
 * Represents the state when the user can edit labels.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments InteractState<WM>
 */
export class EditState extends InteractState {

    /**
     * Whether a bounding box is being transformed.
     * 
     * @type {boolean}
     */
    get isTransformingBox() { return this.context.boxTransformer.isTransforming; }

    /**
     * The parameters of this state.
     * 
     * @readonly
     * @type {EditStateParams}
     */
    params;

    /**
     * Creates a new state instance.
     * 
     * This is called right before the state of the context is transitioned to this one.
     * 
     * @param {InteractContext<WM>} context The context containing this state.
     * @param {EditStateParams} params The parameters of this state.
     */
    constructor(context, params) {
        super({
            context: context,
            keydownBinds: [
                {
                    keyCombo: 'escape',
                    name: 'Cancel edit box',
                    handler: () => {
                        if (this.isTransformingBox) {
                            this.#abortCreateBox();
                        } else {
                            this.context.transitionNavigate();
                        }
                    },
                },
                {
                    keyCombo: 'alt',
                    name: 'Rotate box heading',
                    handler: () => {
                        this.#rotateSelectedBoxHeading();
                    },
                },
                {
                    keyCombo: 'delete',
                    name: 'Delete box',
                    handler: () => {
                        this.#deleteSelectedBox();
                    },
                },
                {
                    keyCombo: 'ctrl + c',
                    name: 'Copy box',
                    handler: () => {
                        this.#copySelectedBox();
                    },
                },
                {
                    keyCombo: 'ctrl + v',
                    name: 'Paste box',
                    handler: () => {
                        this.#pasteSelectedBox();
                    },
                },
            ],
        });

        this.params = params;

        this.#setup(this.params);
    }

    /**
     * Setups this object.
     * 
     * @param {EditStateParams} params The parameters to this method.
     */
    #setup({ trackId, boxId }) {
        const {
            trackInspector, boxInspector, boxMonitor,
            boxSelector, boxTransformer, boxClipboard,
        } = this.context;

        trackInspector.selectedId = trackId;
        boxInspector.selectedId = boxId;

        // This box, if it exists, is guaranteed to exist in the collection
        const box = boxInspector.selectedBox;
        boxMonitor.box = box;

        if (box) {
            boxSelector.selectedObj = box;
            boxTransformer.select(box);
            boxClipboard.select(box);
        } else {
            boxSelector.selectedObj = null;
            boxClipboard.deselect();
            boxTransformer.deselect();
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * This is called right before the state of the context is transitioned from this one.
     */
    dispose() {
        this.#setup({ trackId: null, boxId: null });

        super.dispose();
    }

    /**
     * Specifies how this state uses the context.
     * 
     * This is called during each animation frame, and when an event is emitted by a component.
     * 
     * @param {boolean} isReadonly `true` if the labels cannot be edited; otherwise, `false`.
     * @returns {InteractContextUsage} The requested information.
     */
    getUsage(isReadonly) {
        const { isTransformingBox } = this;

        return {
            mainWindow: {
                cursorClass: 'all-scroll',
                controlCamera: !isTransformingBox,
            },
            data: {
                beforeLoad: () => {
                    // Ensure the components are operating on the correct object
                    // in case it gets replaced
                    this.#setup(this.params);
                },
                afterLoad: () => {
                    // Ensure the components are operating on the correct object
                    // in case it gets replaced
                    this.#setup(this.params);
                },
                branchEdit: () => {
                    // Ensure the components are operating on the correct object
                    // in case it gets replaced
                    this.#setup(this.params);
                },
            },
            boxTransformer: isReadonly ? undefined : {
                checkpoint: async (event) => {
                    const { obj, mode, prevTransform } = event;

                    const newPose = {
                        center: obj.center.clone(),
                        angle: obj.angle,
                        size: obj.size.clone(),
                    };

                    // Need to revert the box so that the operation can be undone
                    const obj3D = obj.asObject3D();
                    obj3D.position.copy(prevTransform.position);
                    obj3D.rotation.copy(prevTransform.rotation);
                    obj3D.scale.copy(prevTransform.scale);

                    // Reapplies the transformation
                    await this.context.dataView.updateLabelBoxTransform(obj, mode, newPose);
                },
            },
            labelInspector: isReadonly ? undefined : {
                selectTrack: ({ value: track }) => {
                    const trackId = track?.id ?? null;
                    const { boxId } = this.params;

                    this.context.transitionEdit({ trackId, boxId });
                },
                selectBox: async ({ value: box }) => {
                    const boxId = box?.id ?? null;

                    if (boxId == null) {
                        const { trackId } = this.params;

                        this.context.transitionEdit({ trackId, boxId });
                    } else {
                        await this.context.transitionEditBox({ boxId });
                    }
                },
            },
            labelClipboard: isReadonly ? undefined : {
                pasteBox: async (event) => {
                    const currentTimestamp = this.context.sceneContext.currentFrame
                        ?.getTimestampCenter() ?? null;

                    const box = await this.context.dataView.addLabelBox({
                        ...event.clipboard,
                        timestamp: currentTimestamp,
                    });

                    await this.context.transitionEditBox({ boxId: box.id });
                },
            },
        };
    }

    /**
     * Gets the text to display as a hint to the user when this layer is active.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @param {boolean} isReadonly `true` if the labels cannot be edited; otherwise, `false`.
     * @returns {string} The requested hint.
     */
    getHint(isReadonly) {
        const { isTransformingBox } = this;

        if (isTransformingBox) {
            return 'Hold [Shift] to apply constraints; release the pointer to finish transforming, or press [Esc] to abort';
        }

        const hasSelectedBox = (this.params.boxId != null);
        if (hasSelectedBox) {
            if (isReadonly) return 'The scene is currently in read-only mode';

            return 'Click and drag the gizmo to transform, press [Alt] to rotate heading, press [Del] to delete, or press [Esc] to deselect';
        }

        // These keybinds are defined in BBoxLayer
        const drawDesc = isReadonly ? '' : ', or [D] to draw a box';
        return `Press [S] to select a box${drawDesc}`;
    }

    /**
     * Cancels transformation of the current bounding box, if any.
     */
    #abortCreateBox() {
        this.context.boxTransformer.abort();
    }

    /**
     * Rotates the heading of the selected bounding box, if any.
     */
    #rotateSelectedBoxHeading() {
        this.context.boxTransformer.rotateHeading();
    }

    /**
     * Deletes the selected bounding box, if any, from the scene.
     */
    #deleteSelectedBox() {
        const box = this.context.boxInspector.selectedBox;
        if (box) {
            this.context.dataView.deleteLabelBox(box);

            this.context.transitionNavigate();
        }
    }

    /**
     * Copies the current bounding box, if any.
     */
    #copySelectedBox() {
        this.context.boxClipboard.copy();
    }

    /**
     * Pastes the current bounding box, if any.
     */
    #pasteSelectedBox() {
        this.context.boxClipboard.paste();
    }
}
