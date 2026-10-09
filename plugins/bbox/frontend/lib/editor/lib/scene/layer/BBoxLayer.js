import _ from 'lodash';
import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';
import {
    LabelDataLayer,
    WindowPointer, SceneObjectsGroup, DraggablePanel,
    AccordionPaneController, ControlsMenu,
} from 'sta/services/editor/base';
import { Transformer } from 'sta-gmesh/editor';

import { getSettings } from '../../config';

import { LabelBoxTransformMonitor, BBoxView, ShortUUID } from '../data';
import { LabelBoxClipboard, LabelBoxCreator } from '../tools';
import {
    ActionPaneController, DrawModePaneController,
    LabelBoxInspector, LabelTrackInspector,
    BBoxSettingsPaneController,
} from '../widgets';

import { InteractContext } from './InteractContext';

/* eslint-disable max-len */
/**
 * @template {WindowMapper} WM
 * @typedef {import('sta/services/editor/base').SceneContext<WM>} SceneContext
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('sta/services/editor/base').LayerCollectionEventMap<WM>} LayerCollectionEventMap
 */

/**
 * @typedef {import('sta/services/editor/base').Keybind} Keybind
 */

/**
 * @typedef {import('sta/services/editor/base').WindowMapper} WindowMapper
 */

/**
 * @typedef {import('sta/services/editor/base').PaneControllerDataTypes} PaneControllerDataTypes
 */

/**
 * @template {PaneControllerDataTypes} P
 * @typedef {import('sta/services/editor/base').PaneControllerChangeEvent<P>} PaneControllerChangeEvent
 */

/**
 * @typedef {import('sta/services/editor/core').MainWindow} MainWindow
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('sta-gmesh/editor').GroundMeshLayer<WM>} GroundMeshLayer
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('sta-pcd/editor').PointCloudLayer<WM>} PointCloudLayer
 */

/**
 * @typedef {import('../data').ReadonlyBBoxIndex} ReadonlyBBoxIndex
 */

/**
 * @typedef {import('../data').ReadonlyLabelBox} ReadonlyLabelBox
 */

/**
 * @typedef {import('../data').ReadonlyLabelTrack} ReadonlyLabelTrack
 */

/**
 * @typedef {import('../widgets').BBoxSettingsPaneControllerParams} BBoxSettingsPaneControllerParams
 */

/**
 * @typedef {import('./InteractContext').MainWindowMapper} MainWindowMapper
 */

/**
 * @template {MainWindowMapper} WM
 * @typedef {import('./InteractContext').InteractContextEventMap<WM>} InteractContextEventMap
 */

/**
 * @template {MainWindowMapper} WM
 * @typedef {import('./InteractContext').InteractState<WM>} InteractState
 */
/* eslint-enable max-len */

/**
 * Facilitates user interaction with the bounding box labels for the current frame.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments {LabelDataLayer<WM, ReadonlyBBoxIndex>}
 */
export class BBoxLayer extends LabelDataLayer {

    /**
     * Contains logic to run before the data to display is switched to a different one.
     * 
     * @protected
     */
    onBeforeUpdateData() {
        this.#settingsInput.updateSettings({ disabled: true });
        this.#interactContext.disabled = true;
    }

    /**
     * Contains logic to run after the data to display is switched to a different one.
     * 
     * @protected
     */
    onAfterUpdateData() {
        const { isActive } = this;
        const { data } = this.dataView;

        this.#settingsInput.updateSettings({ disabled: false });
        this.#interactContext.disabled = !isActive || (data == null);
    }

    /**
     * Handles the event when a layer has been activated.
     * 
     * @param {LayerCollectionEventMap<WM>['layer-activate']} event The event to handle.
     */
    #onLayerActivate = (event) => {
        const { isActive } = this;
        const { data } = this.dataView;

        this.#bboxInspectorPanel.dom.hidden = !(isActive);
        this.#trackInspectorPanel.dom.hidden = !(isActive);

        this.#interactContext.disabled = !isActive || (data == null);
    };

    /**
     * @readonly
     * @type {InteractContext<WM>}
     */
    #interactContext;

    /**
     * A layer that displays the point cloud for the current frame.
     * 
     * @readonly
     * @type {PointCloudLayer<WM>}
     */
    pointCloudLayer;

    /**
     * Handles the event when the active point cloud is switched to a different one.
     */
    #onUpdatePointCloud = () => {
        const { dataView } = this.pointCloudLayer;
        const pcd = dataView.data;

        this.#interactContext.boxCreator.pcd = pcd;
    };

    /**
     * A layer that displays the ground mesh for the current frame.
     * 
     * @readonly
     * @type {GroundMeshLayer<WM>}
     */
    groundMeshLayer;

    /**
     * Handles the event when the active ground mesh is switched to a different one.
     */
    #onUpdateGroundMesh = () => {
        const { state, dataView } = this.groundMeshLayer;
        const groundMesh = dataView.data;
        const meshIsVisible = groundMesh && state.enabled;

        this.#settingsInput.updateSettings({ disallowRelativeElevation: !meshIsVisible });

        this.#interactContext.boxCreator.groundMesh = groundMesh;
        this.#interactContext.boxTransformer.groundMesh = groundMesh;
    };

    /**
     * A tooltip for each bounding box being displayed.
     * 
     * @readonly
     * @type {HTMLDivElement[]}
     */
    #tooltips = [];

    /**
     * Contains the contents of the track inspector.
     * 
     * @readonly
     * @type {DraggablePanel}
     */
    #trackInspectorPanel;

    /**
     * Contains the contents of the bbox inspector.
     * 
     * @readonly
     * @type {DraggablePanel}
     */
    #bboxInspectorPanel;

    /**
     * Observes the DOM of this object for resize events.
     * 
     * @readonly
     * @type {ResizeObserver}
     */
    #observer;

    /**
     * An accordion containing each tool.
     * 
     * @readonly
     * @type {AccordionPaneController}
     */
    #toolsAccordion;

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    TOOLS_KEYDOWN_BINDS = [
        {
            keyCombo: 'f',
            name: 'Cycle draw origin',
            handler: () => {
                this.#interactContext.drawModeInput.cycleDrawMode();
            },
        },
        {
            keyCombo: 'w',
            name: 'Toggle translate gizmo',
            handler: () => {
                this.#interactContext.boxTransformer.toggleControlsEnabled('translate');
            },
        },
        {
            keyCombo: 'e',
            name: 'Toggle rotate gizmo',
            handler: () => {
                this.#interactContext.boxTransformer.toggleControlsEnabled('rotate');
            },
        },
        {
            keyCombo: 'r',
            name: 'Toggle scale gizmo',
            handler: () => {
                this.#interactContext.boxTransformer.toggleControlsEnabled('scale');
            },
        },
        {
            keyCombo: 'shift',
            name: 'Enable gizmo constraints',
            handler: () => {
                this.setApplyConstraints(true);
            },
        },
    ];

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    TOOLS_KEYUP_BINDS = [
        {
            keyCombo: 'shift',
            name: 'Disable gizmo constraints',
            handler: () => {
                this.setApplyConstraints(false);
            },
        },
    ];

    /**
     * Specifies the settings to apply to the bounding box labels.
     * 
     * @readonly
     * @type {BBoxSettingsPaneController}
     */
    #settingsInput;

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    PREFS_KEYDOWN_BINDS = [
        {
            keyCombo: 'q',
            name: 'Toggle box transparency',
            handler: () => {
                this.#settingsInput.toggleTransparency();
            },
        },
        {
            keyCombo: 't',
            name: 'Toggle box tooltips',
            handler: () => {
                this.#settingsInput.toggleTooltips();
            },
        },
    ];

    /**
     * Handles the event when the settings in the input have been updated.
     * 
     * @param {PaneControllerChangeEvent<BBoxSettingsPaneControllerParams>} event
     * The event to handle.
     */
    #onSettingsChange = (event) => {
        const dataView = this.#interactContext.dataView;
        const { timeIdxRange, maintainRelativeElevation } = event.outputData;

        dataView.timeIdxRange = timeIdxRange;

        this.#interactContext.boxCreator.disableRelElevation = !maintainRelativeElevation;
        this.#interactContext.boxTransformer.disableRelElevation = !maintainRelativeElevation;
    };

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    ACTIONS_KEYDOWN_BINDS = [
        {
            keyCombo: 's',
            name: 'Select box',
            handler: () => {
                this.#interactContext.actionInput.toggleSelect();
            },
        },
        {
            keyCombo: 'd',
            name: 'Draw box',
            handler: () => {
                this.#interactContext.actionInput.toggleDraw();
            },
        },
    ];

    /**
     * Updates the controls menu to display the keybinds in an interaction state,
     * replacing those of the previous interaction state.
     * 
     * @param {InteractState<WM>} interactState The interaction state for which to
     * display the keybinds.
     */
    #updateControlsElem = (interactState) => {
        this.keydownHandler.setChildren([interactState.keydownHandler]);
        this.keyupHandler.setChildren([interactState.keyupHandler]);

        const controlsContent = document.createElement('div');
        controlsContent.style.width = '100%';
        controlsContent.style.paddingLeft = 'var(--cnt-h-p)';
        controlsContent.innerHTML = [
            ControlsMenu.getControlsSectionHtmlText('Tools', this.TOOLS_KEYDOWN_BINDS),
            '',
            ControlsMenu.getControlsSectionHtmlText('Actions', this.ACTIONS_KEYDOWN_BINDS),
            '',
            ControlsMenu.getControlsSectionHtmlText('Preferences', this.PREFS_KEYDOWN_BINDS),
            '',
            ControlsMenu.getControlsSectionHtmlText(
                'Context',
                [...interactState.keydownHandler.iterSubtreeKeybinds()],
            ),
        ].join('<br>');

        this.controlsElem.textContent = '';
        this.controlsElem.replaceChildren(controlsContent);
    };

    /**
     * Handles the event when the active interaction state has changed.
     * 
     * @param {InteractContextEventMap<WM>['change']} event The event to handle.
     */
    #onInteractStateChange = (event) => {
        this.#updateControlsElem(event.currentState);
    };

    /**
     * Creates a new layer for bounding box labels.
     * 
     * @template {MainWindowMapper} WM The windows defined in the scene display.
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {PointCloudLayer<WM>} pointCloudLayer A layer that displays the point cloud.
     * @param {GroundMeshLayer<WM>} groundMeshLayer A layer that displays the ground mesh.
     * @returns {BBoxLayer<WM>} The newly created data layer.
     */
    static create(context, name, pointCloudLayer, groundMeshLayer) {
        // timeWidth is set when #onSettingsChange is called
        const dataView = BBoxView.create(context, 0);

        return new BBoxLayer(context, name, dataView, pointCloudLayer, groundMeshLayer);
    }

    /**
     * Aligns the panels in the application.
     */
    #alignPanels = () => {
        this.#trackInspectorPanel.alignCenterVertical().alignRight();
        this.#trackInspectorPanel.top -= 192;

        this.#bboxInspectorPanel.alignCenterVertical().alignRight();
        this.#bboxInspectorPanel.top -= 16;
    };

    /**
     * Creates a new display for label data that updates based on the current frame.
     * 
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {BBoxView} dataView A view of the data to display in the layer.
     * @param {PointCloudLayer<WM>} pointCloudLayer A layer that displays the point cloud.
     * @param {GroundMeshLayer<WM>} groundMeshLayer A layer that displays the ground mesh.
     */
    constructor(context, name, dataView, pointCloudLayer, groundMeshLayer) {
        super(context, name, dataView);

        const config = context.config;
        const settings = getSettings(config);

        this.pointCloudLayer = pointCloudLayer;
        this.groundMeshLayer = groundMeshLayer;

        const pointer = new WindowPointer(context.display.windows.main);

        const boxSelectRaycaster = new THREE.Raycaster();
        ThreeUtils.setRaycasterPointsThreshold(boxSelectRaycaster, 0.25);

        const thisLayer = this;
        const boxSelectorGroup = new SceneObjectsGroup({
            objects: {
                [Symbol.iterator]() {
                    return thisLayer.iterLabelBoxes();
                },
            },
            raycastFunc: (obj, raycaster) => obj.raycast(raycaster),
        });

        const boxSelector = pointer.createSelectController({
            groups: [{ group: boxSelectorGroup, priority: 0 }],
            raycaster: boxSelectRaycaster,
        });

        const boxMonitor = new LabelBoxTransformMonitor();

        const trackInspector = new LabelTrackInspector({
            labelsView: dataView,
        });
        const boxInspector = new LabelBoxInspector({
            labelsView: dataView,
            autoTracks: config.autoTracks,
        });

        this.#trackInspectorPanel = new DraggablePanel({
            title: 'Object Track',
            content: trackInspector.dom,
        });
        trackInspector.dom.style.width = '384px';
        trackInspector.dom.style.maxHeight = '256px';
        this.#trackInspectorPanel.dom.hidden = true;
        this.#trackInspectorPanel.dom.style.pointerEvents = 'auto';
        this.#trackInspectorPanel.dom.style.touchAction = 'auto';
        this.overlayElem.appendChild(this.#trackInspectorPanel.dom);

        this.#bboxInspectorPanel = new DraggablePanel({
            title: 'Bounding Box',
            content: boxInspector.dom,
        });
        boxInspector.dom.style.width = '384px';
        boxInspector.dom.style.maxHeight = '256px';
        this.#bboxInspectorPanel.dom.hidden = true;
        this.#bboxInspectorPanel.dom.style.pointerEvents = 'auto';
        this.#bboxInspectorPanel.dom.style.touchAction = 'auto';
        this.overlayElem.appendChild(this.#bboxInspectorPanel.dom);

        const boxCreator = new LabelBoxCreator(
            pointer,
            new THREE.Raycaster(),
            this.groundMeshLayer.dataView.data,
            this.pointCloudLayer.dataView.data,
        );

        const boxTransformRaycaster = new THREE.Raycaster();
        ThreeUtils.setRaycasterPointsThreshold(boxTransformRaycaster, 0.25);

        const boxTransformer = new Transformer(
            pointer,
            boxTransformRaycaster,
            (obj) => obj.asObject3D(),
            this.groundMeshLayer.dataView.data,
        );

        const boxClipboard = new LabelBoxClipboard();

        const actionInputDom = document.createElement('div');
        const actionInput = ActionPaneController.create(actionInputDom, {
            inputtedData: { action: 'edit' },
        });
        this.actionsElem = actionInputDom;

        const drawModeInputDom = document.createElement('div');
        const drawModeInput = DrawModePaneController.create(drawModeInputDom, {
            inputtedData: { drawMode: 'corner2corner' },
        });

        const toolsDom = document.createElement('div');
        {
            this.#toolsAccordion = AccordionPaneController.create(
                toolsDom,
                {
                    Draw: drawModeInput.dom,
                    Transform: boxTransformer.dom,
                    Clipboard: boxClipboard.dom,
                },
            );
        }
        this.toolsElem = toolsDom;

        const settingsInputDom = document.createElement('div');
        {
            this.#settingsInput = BBoxSettingsPaneController.create(settingsInputDom, {
                inputtedData: settings,
                settings: {
                    disabled: false,
                    hidden: false,
                    disallowRelativeElevation: false,
                    maxTimeIdxRange: 10,
                },
            });
        }
        this.prefsElem = settingsInputDom;

        for (const keybind of [
            ...this.TOOLS_KEYDOWN_BINDS,
            ...this.ACTIONS_KEYDOWN_BINDS,
            ...this.PREFS_KEYDOWN_BINDS,
        ]) {
            this.keydownHandler.register(keybind);
        }
        for (const keybind of this.TOOLS_KEYUP_BINDS) {
            this.keyupHandler.register(keybind);
        }

        this.#interactContext = new InteractContext({
            sceneContext: context,
            dataView: dataView,
            boxCreator: boxCreator,
            drawModeInput: drawModeInput,
            boxSelector: boxSelector,
            boxTransformer: boxTransformer,
            trackInspector: trackInspector,
            boxInspector: boxInspector,
            boxMonitor: boxMonitor,
            boxClipboard: boxClipboard,
            actionInput: actionInput,
        });

        // Avoid accessing attributes from event handlers before they are initialized
        this.context.addEventListener('layer-activate', this.#onLayerActivate);

        this.pointCloudLayer.dataView.addEventListener('beforeload', this.#onUpdatePointCloud);
        this.pointCloudLayer.dataView.addEventListener('afterload', this.#onUpdatePointCloud);

        this.groundMeshLayer.dataView.addEventListener('beforeload', this.#onUpdateGroundMesh);
        this.groundMeshLayer.dataView.addEventListener('afterload', this.#onUpdateGroundMesh);
        this.groundMeshLayer.state.addEventListener('change', this.#onUpdateGroundMesh);

        this.#settingsInput.bindOutputData(this.#onSettingsChange);

        this.#interactContext.addEventListener('change', this.#onInteractStateChange);

        if (this.#interactContext.currentState == null) {
            throw new Error('currentState not initialized');
        }
        this.#updateControlsElem(this.#interactContext.currentState);

        this.#observer = new ResizeObserver(this.#alignPanels);
        this.#observer.observe(this.overlayElem);

        this.#alignPanels();
    }

    dispose() {
        this.#observer.unobserve(this.overlayElem);

        this.context.removeEventListener('layer-activate', this.#onLayerActivate);

        this.pointCloudLayer.dataView.removeEventListener('beforeload', this.#onUpdatePointCloud);
        this.pointCloudLayer.dataView.removeEventListener('afterload', this.#onUpdatePointCloud);

        this.groundMeshLayer.dataView.removeEventListener('beforeload', this.#onUpdateGroundMesh);
        this.groundMeshLayer.dataView.removeEventListener('afterload', this.#onUpdateGroundMesh);
        this.groundMeshLayer.state.removeEventListener('change', this.#onUpdateGroundMesh);

        this.#interactContext.boxSelector.dispose();
        this.#interactContext.boxMonitor.dispose();
        this.#interactContext.trackInspector.dispose();
        this.#interactContext.boxInspector.dispose();
        this.#interactContext.boxCreator.dispose();
        this.#interactContext.boxTransformer.dispose();
        this.#interactContext.boxClipboard.dispose();
        this.#interactContext.drawModeInput.dispose();
        this.#interactContext.removeEventListener('change', this.#onInteractStateChange);
        this.#interactContext.dispose();

        this.#trackInspectorPanel.dispose();
        this.#bboxInspectorPanel.dispose();
        this.#toolsAccordion.dispose();

        this.#settingsInput.dispose();

        super.dispose();
    }

    /**
     * Iterates through each bounding box to display.
     * 
     * @returns {IterableIterator<ReadonlyLabelBox>} An iterator that yields such items.
     * @yields {ReadonlyLabelBox} Each bounding box to display.
     */
    * iterLabelBoxes() {
        const { dataView, boxCreator } = this.#interactContext;

        // This may be called in the constructor so it may not be initialized yet
        if (dataView === undefined) return;

        for (const box of dataView.iterLabelBoxes()) yield box;

        const newBox = boxCreator.newObj;
        if (newBox != null) yield newBox;
    }

    /**
     * Iterates through each object track to display.
     * 
     * @returns {IterableIterator<ReadonlyLabelTrack>} An iterator that yields such items.
     * @yields {ReadonlyLabelTrack} Each object track to display.
     */
    * iterLabelTracks() {
        const dataView = this.#interactContext.dataView;

        // This may be called in the constructor so it may not be initialized yet
        if (dataView === undefined) return;

        for (const track of dataView.iterLabelTracks()) yield track;
    }

    /**
     * Gets the text to display as a hint to the user when this layer is active.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @returns {string} The requested hint.
     */
    getHint() {
        return this.#interactContext.getHint();
    }

    /**
     * Updates how a track is displayed.
     * 
     * @param {ReadonlyLabelTrack} track The object track to update.
     * @returns {ReadonlyLabelTrack} The updated object track.
     */
    #renderTrack(track) {
        const dataView = this.#interactContext.dataView;

        const displayParams = {
            minTimestamp: dataView.getMinTimestampInRange(),
            maxTimestamp: dataView.getMaxTimestampInRange(),
        };

        dataView.setLabelTrackDisplayParams(track, displayParams);

        return track;
    }

    /**
     * Updates how a bounding box is displayed.
     * 
     * @param {ReadonlyLabelBox} box The bounding box to update.
     * @returns {ReadonlyLabelBox} The updated bounding box.
     */
    #renderBox(box) {
        const dataView = this.#interactContext.dataView;
        const {
            selectedBoxColor, hoveredBoxColor,
            showPerceivedClass, boxOpacity,
        } = this.#settingsInput.outputData;

        /**
         * @type {?Readonly<THREE.Color>}
         */
        let showColor;

        if (box === this.#interactContext.boxSelector.selectedObj) {
            showColor = new THREE.Color(selectedBoxColor);
        } else if (box === this.#interactContext.boxSelector.hoveredObj) {
            showColor = new THREE.Color(hoveredBoxColor);
        } else {
            showColor = null;
        }

        const currentFrame = this.context.currentFrame;

        const displayOptions = {
            opacity: boxOpacity,
            showFrame: currentFrame == null || currentFrame.containsTimestamp(box.timestamp),
            showPerceivedClass: showPerceivedClass,
            showColor: showColor,
        };

        dataView.setLabelBoxDisplayParams(box, displayOptions);

        return box;
    }

    /**
     * Updates the tooltip for a bounding box.
     * 
     * @param {HTMLDivElement} tooltip The tooltip to update.
     * @param {ReadonlyLabelBox} box The bounding box associated with the tooltip.
     * @returns {HTMLDivElement} The updated tooltip.
     */
    #renderTooltip(tooltip, box) {
        const currentFrame = this.context.currentFrame;
        const mainCamera = this.#interactContext.mainWindow.getCamera();
        const {
            showTooltips, showOcclusion,
            showTimestampDiff,
            showDistinctiveness, showTrackBoxId,
        } = this.#settingsInput.outputData;

        const boxId = box.id;
        const trackId = box.entityId;
        const boxTimestamp = box.timestamp;
        const boxNDC = box.asObject3D().position.clone().project(mainCamera);

        const trackIdStr = (trackId == null || !showTrackBoxId) ? '' : `T{${new ShortUUID(trackId)}}`;
        const boxIdStr = (boxId == null || !showTrackBoxId) ? '' : `B{${new ShortUUID(boxId)}}`;
        const idText = [trackIdStr, boxIdStr].filter((s) => s.length > 0).join(' | ');

        let tsText = '';
        if (showTimestampDiff) {
            const currentTimestamp = currentFrame?.getTimestampCenter() ?? null;

            if (currentTimestamp == null || boxTimestamp == null
                || currentFrame?.containsTimestamp(boxTimestamp)) {
                tsText = `(t = ${boxTimestamp?.toISOString() ?? null})`;
            } else {
                const timeDiffTotalMillis = boxTimestamp.getTime() - currentTimestamp.getTime();
                const timeDiffTotalSecs = timeDiffTotalMillis / 1000;

                const timeDiffSign = (timeDiffTotalSecs >= 0) ? '+' : '-';
                const timeDiffAbsSecs = Math.abs(timeDiffTotalSecs);

                tsText = `(t ${timeDiffSign} ${timeDiffAbsSecs.toFixed(2)}s)`;
            }
        }

        let classText = '';
        const displayClass = box.displayClass;
        if (displayClass == null) {
            classText = '&lt;Unclassified&gt;';
        } else {
            classText = `[${displayClass.name}]`;
        }

        const occlusionText = showOcclusion ? `O: ${box.occlusionLv.name}` : '';
        const distinctivenessText = showDistinctiveness ? `D: ${box.distinctiveLv.name}` : '';
        const descriptorText = [occlusionText, distinctivenessText]
            .filter((s) => s.length > 0)
            .join(' | ');

        const relPos = ThreeUtils.getNDCRelPos(boxNDC);

        tooltip.innerHTML = [idText, tsText, classText, descriptorText]
            .filter((s) => s.length > 0)
            .join('<br>');
        tooltip.style.visibility = showTooltips ? 'visible' : 'hidden';
        tooltip.style.top = `${relPos.y * 100}%`;
        tooltip.style.left = `${relPos.x * 100}%`;

        return tooltip;
    }

    /**
     * Updates the `three.js` objects and the DOM elements of this layer.
     * It is called during each animation frame while this layer is displayed.
     */
    render() {
        const { dataView, boxTransformer } = this.#interactContext;

        this.#interactContext.render();

        // Avoid querying frames when the task is changing
        if (this.context.isNavigating) return;

        this.objects.clear();

        const { data } = dataView;
        if (data == null) return;

        const tooltips = this.#tooltips;
        const boxes = [...this.iterLabelBoxes()];

        // Adjust the number of tooltips to match the current number of bboxes
        const currentTooltipCount = tooltips.length;
        const targetTooltipCount = boxes.length;

        if (currentTooltipCount < targetTooltipCount) {
            _.range(targetTooltipCount - currentTooltipCount).forEach(() => {
                const tooltip = document.createElement('div');

                // Avoid conflict with Bootstrap's tooltips
                tooltip.className = 'bbox-tooltip';

                tooltips.push(tooltip);
                this.overlayElem.appendChild(tooltip);
            });
        } else if (currentTooltipCount > targetTooltipCount) {
            _.range(currentTooltipCount - targetTooltipCount).forEach(() => {
                const tooltip = tooltips.pop();
                if (tooltip != null) {
                    this.overlayElem.removeChild(tooltip);
                }
            });
        }

        boxes.forEach((box, i) => {
            this.#renderBox(box);
            this.objects.add(box.asObject3D());

            this.#renderTooltip(tooltips[i], box);
        });

        for (const track of this.iterLabelTracks()) {
            this.#renderTrack(track);

            // Cannot use track.elements as we want it to be based on the boxes
            // instead of the vertices
            if (data.getLabelTrackElements(track.id).size > 0) {
                this.objects.add(track.asObject3D());
            }
        }

        const boxTransformerControls = boxTransformer.getControls();
        if (boxTransformerControls != null) {
            this.objects.add(boxTransformerControls);
        }
    }

    /**
     * Sets whether to apply constraints to the controls, where applicable.
     * 
     * @param {boolean} value If `true`, applies the constraints.
     * @returns {this} This object.
     */
    setApplyConstraints(value) {
        this.#interactContext.boxCreator.clipToAspect = value;
        this.#interactContext.boxTransformer.setApplyConstraints(value);

        return this;
    }
}
