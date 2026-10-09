import * as THREE from 'three';

import { Placeholder } from 'sta/services/editor/base';
import { ThreeUtils } from 'sta/common/utils';

import { LabelBox } from '../data/LabelBox';

import { InteractState } from './InteractState';

/**
 * @typedef {import('../data').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('../data').BoxParams} BoxParams
 */

/**
 * @typedef {import('../data').TrackParams} TrackParams
 */

/**
 * @typedef {import('../tools/LabelBoxCreator').LabelBoxDrawMode} LabelBoxDrawMode
 */

/**
 * @typedef {import('../widgets').DrawMode} DrawMode
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
 * Represents the state when the user can create a bounding box.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments InteractState<WM>
 */
export class DrawBoxState extends InteractState {

    /**
     * Whether a bounding box is being created.
     * 
     * @type {boolean}
     */
    get isCreatingBox() { return this.context.boxCreator.isCreating; }

    /**
     * The mode of drawing an object in the scene.
     * 
     * @type {DrawMode}
     */
    get drawMode() { return this.context.drawModeInput.inputtedData.drawMode; }

    /**
     * Creates a new state instance.
     * 
     * This is called right before the state of the context is transitioned to this one.
     * 
     * @param {InteractContext<WM>} context The context containing this state.
     */
    constructor(context) {
        super({
            context: context,
            keydownBinds: [
                {
                    keyCombo: 'escape',
                    name: 'Cancel draw box',
                    handler: () => {
                        if (this.isCreatingBox) {
                            this.#abortCreateBox();
                        } else {
                            this.context.transitionNavigate();
                        }
                    },
                },
                {
                    keyCombo: 'g',
                    name: 'Finish draw box',
                    handler: () => {
                        this.#finishCreateBox(true);
                    },
                },
            ],
        });
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * This is called right before the state of the context is transitioned from this one.
     */
    dispose() {
        this.#abortCreateBox();

        super.dispose();
    }

    /**
     * Gets the CSS class (without `cursor-` prefix) for the main window
     * while the user is not actively drawing.
     * 
     * @returns {string} The requested class.
     */
    #getPassiveCursorClass() {
        if (this.context.boxSelector.isHoveringObj) return 'copy';

        let first;
        switch (this.drawMode) {
            case 'corner2corner':
                first = 'add';
                break;
            case 'center2front':
                first = 'arrow';
                break;
            default:
                throw new Error(`Invalid drawMode: ${this.drawMode}`);
        }

        let second;
        const boxType = this.context.boxInspector.getBoxParams().boxType;
        switch (boxType) {
            case 'cuboid':
                second = 'square';
                break;
            case 'cylinder':
                second = 'circle';
                break;
            default:
                throw new Error(`Invalid boxType: ${boxType}`);
        }

        return `${first}-${second}`;
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
        const { isCreatingBox } = this;

        let cursorClass;
        if (isReadonly) {
            cursorClass = 'not-allowed';
        } else if (isCreatingBox) {
            cursorClass = 'cell';
        } else {
            cursorClass = this.#getPassiveCursorClass();
        }

        return {
            mainWindow: {
                cursorClass: cursorClass,
                controlCamera: !isCreatingBox,
                pointerdown: (event) => {
                    if (isReadonly) return;

                    if (event.button === 0) {
                        this.#beginCreateBox();
                    }
                },
                pointerup: (event) => {
                    if (isReadonly) return;

                    if (event.button === 0) {
                        this.#finishCreateBox();
                    }
                },
            },
            boxSelector: isReadonly ? undefined : { hover: !isCreatingBox },
            boxCreator: isReadonly ? undefined : {
                abort: (event) => {
                    this.#disposeBox(event.box);
                },
                finish: async (event) => {
                    const newBox = event.box;

                    const { x, y, z } = newBox.asObject3D().scale;
                    if (Math.abs(x) < 0.001 || Math.abs(y) < 0.001 || Math.abs(z) < 0.001) {
                        // Rejected: Too small
                    } else {
                        const { dataView, trackInspector } = this.context;

                        if (newBox.entityId == null) {
                            const trackParams = trackInspector.getTrackParams();
                            const registeredTrack = await dataView.addLabelTrack(trackParams);

                            if (!(newBox instanceof LabelBox)) {
                                throw new Error('Incorrect type of newBox');
                            }

                            newBox.entityId = registeredTrack.id;
                        }

                        if (dataView.hasLabelTrackLocalOnly(newBox.entityId)) {
                            const track = dataView.getLabelTrackLocalOnly(newBox.entityId);
                            const registeredTrack = await dataView.addLabelTrack(track);

                            if (!(newBox instanceof LabelBox)) {
                                throw new Error('Incorrect type of newBox');
                            }

                            newBox.entityId = registeredTrack.id;

                            this.#disposeTrack(track);
                        }

                        const registeredBox = await dataView.addLabelBox(newBox);

                        await this.context.transitionEditBox({ boxId: registeredBox.id });
                    }

                    this.#disposeBox(newBox);
                },
            },
            labelInspector: isReadonly ? undefined : { enabled: !isCreatingBox },
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
        const { context, isCreatingBox } = this;

        if (isCreatingBox) {
            if (context.boxCreator.isSizeFixed) {
                return 'Release the pointer to finish drawing, or press [Esc] to abort';
            }

            return 'Release the pointer to finish drawing, press [G] to use defaults, or press [Esc] to abort';
        }

        return 'Click and drag to draw, or press [Esc] to cancel';
    }

    /**
     * Constructs a new bounding box.
     * 
     * @returns {ReadonlyLabelBox} The newly created box.
     */
    #initBox() {
        const {
            sceneContext, dataView, mainWindow,
            boxCreator, boxSelector, boxInspector, trackInspector,
        } = this.context;

        /**
         * @type {BoxParams}
         */
        let boxParams;

        const config = sceneContext.config;
        const currentTimestamp = sceneContext.currentFrame?.getTimestampCenter() ?? null;
        const hoveredBox = boxSelector.hoveredObj;

        if (hoveredBox == null) {
            const raycaster = boxCreator.raycaster;
            const position = boxCreator.groundMesh?.raycast(raycaster).at(0)?.point
                ?? boxCreator.getPointerWorldPos();

            const centerWorldPos = new THREE.Vector3(0, 0, 0).unproject(mainWindow.getCamera());
            const topWorldPos = new THREE.Vector3(0, 1, 0).unproject(mainWindow.getCamera());
            const centerToTopWorld = topWorldPos.sub(centerWorldPos);
            const angle = Math.atan2(centerToTopWorld.x, centerToTopWorld.z);

            /**
             * @type {TrackParams}
             */
            const trackParams = {
                ...trackInspector.getTrackParams(),
                id: new Placeholder(),
            };

            const track = dataView.addLabelTrackLocalOnly(trackParams);

            boxParams = {
                ...boxInspector.getBoxParams(),
                id: new Placeholder(),
                timestamp: currentTimestamp,
                center: config.coordinateFormat.toDatabaseCoords(position),
                angle: angle,
                size: new THREE.Vector3().setScalar(ThreeUtils.EPSILON),
                entityId: trackInspector.selectedTrack?.id ?? track.id,
                showForwardIndicator: false,
            };
        } else {
            boxParams = {
                ...boxInspector.getBoxParams(),
                id: new Placeholder(),
                timestamp: currentTimestamp,
                center: hoveredBox.center,
                angle: hoveredBox.angle,
                size: hoveredBox.size,
                entityId: hoveredBox.entityId,
                showForwardIndicator: false,
            };
        }

        const box = dataView.addLabelBoxLocalOnly(boxParams);

        return box;
    }

    /**
     * Disposes of the new bounding box.
     * 
     * @param {ReadonlyLabelBox} box The newly created box, for validation.
     */
    #disposeBox(box) {
        const { dataView } = this.context;
        dataView.deleteLabelBoxLocalOnly(box);
    }

    /**
     * Disposes of the new track.
     * 
     * @param {ReadonlyLabelTrack} track The newly created track, for validation.
     */
    #disposeTrack(track) {
        const { dataView } = this.context;
        dataView.deleteLabelTrackLocalOnly(track);
    }

    /**
     * Begins creation of a bounding box, if no bounding box is already being created.
     */
    #beginCreateBox() {
        const { sceneContext, boxCreator, boxSelector } = this.context;

        /**
         * @type {LabelBoxDrawMode}
         */
        let drawMode;

        const currentTimestamp = sceneContext.currentFrame?.getTimestampCenter() ?? null;
        const hoveredBox = boxSelector.hoveredObj;

        if (hoveredBox == null) {
            drawMode = this.drawMode;
        } else {
            const t0 = hoveredBox.timestamp;
            if (t0 == null || currentTimestamp == null
                || t0.getTime() < currentTimestamp.getTime()) {
                drawMode = 'point2center';
            } else {
                drawMode = 'center2point';
            }
        }

        const box = this.#initBox();

        boxCreator.begin(drawMode, box);
    }

    /**
     * Cancels creation of the current bounding box, if any.
     */
    #abortCreateBox() {
        this.context.boxCreator.abort();
    }

    /**
     * Finishes creation of the existing bounding box, if any.
     * 
     * @param {boolean} applyDefaultSize If `true`, the size of the bounding box is set to the
     * default value as specified by its class.
     */
    #finishCreateBox(applyDefaultSize = false) {
        this.context.boxCreator.end(applyDefaultSize);
    }
}
