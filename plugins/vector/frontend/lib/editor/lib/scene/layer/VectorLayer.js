import _ from 'lodash';
import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';
import {
    LabelDataLayer,
    WindowPointer, SceneObjectsGroup, DraggablePanel,
    AccordionPaneController, ControlsMenu,
} from 'sta/services/editor/base';

import { getSettings } from '../../config';
import { VectorTransformer } from '../controls';
import { VectorView, LabelVectorReformMonitor, ShortUUID } from '../data';
import { PolygonCreator, PolylineCreator, PointCreator, LabelVectorClipboard } from '../tools';
import {
    DrawModePaneController, ActionPaneController,
    LabelVectorInspector, VectorSettingsPaneController,
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
 * @typedef {import('../data').ReadonlyVectorIndex} ReadonlyVectorIndex
 */

/**
 * @typedef {import('../data').ReadonlyLabelVector} ReadonlyLabelVector
 */

/**
 * @typedef {import('../widgets').VectorSettingsPaneControllerParams} VectorSettingsPaneControllerParams
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
 * Facilitate use interaction with the vector labels for the current frame.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments {LabelDataLayer<WM, ReadonlyVectorIndex>}
 */
export class VectorLayer extends LabelDataLayer {

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

        this.#inspectorPanel.dom.hidden = !(isActive);

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
     * A layer that displays the ground mesh for the current frame.
     * 
     * @readonly
     * @type {GroundMeshLayer<WM>}
     */
    groundMeshLayer;

    /**
     * Observes the overlay DOM of this object for resize events.
     * 
     * @readonly
     * @type {ResizeObserver}
     */
    #observer;

    /**
     * A tooltip for each bounding box being displayed.
     * 
     * @readonly
     * @type {HTMLDivElement[]}
     */
    #tooltips = [];

    /**
     * Contains the content of the inspector pane.
     * 
     * @readonly
     * @type {DraggablePanel}
     */
    #inspectorPanel;

    /**
     * Specifies the settings to apply to the vector labels.
     * 
     * @readonly
     * @type {VectorSettingsPaneController}
     */
    #settingsInput;

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
            keyCombo: 'k',
            name: 'Draw Polygon',
            handler: () => {
                this.#interactContext.drawModeInput.setDrawMode('polygon');
            },
        },
        {
            keyCombo: 'l',
            name: 'Draw line',
            handler: () => {
                this.#interactContext.drawModeInput.setDrawMode('polyline');
            },
        },
        {
            keyCombo: 'p',
            name: 'Draw Point',
            handler: () => {
                this.#interactContext.drawModeInput.setDrawMode('point');
            },
        },
        {
            keyCombo: 'w',
            name: 'Toggle translate single vertex',
            handler: () => {
                this.#interactContext.vectorTransformer.toggleControlsEnabled('vertex');
            },
        },
        {
            keyCombo: 'e',
            name: 'Toggle translate all vertices',
            handler: () => {
                this.#interactContext.vectorTransformer.toggleControlsEnabled('vertices');
            },
        },
    ];

    /**
     * @readonly
     * @type {ReadonlyArray<Keybind>}
     */
    ACTIONS_KEYDOWN_BINDS = [
        {
            keyCombo: 's',
            name: 'Select vector',
            handler: () => {
                this.#interactContext.actionInput.toggleSelect();
            },
        },
        {
            keyCombo: 'd',
            name: 'Draw vector',
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
     * Handles the event when the settings in the input have been updated.
     * 
     * @param {PaneControllerChangeEvent<VectorSettingsPaneControllerParams>} event
     * The event to handle
     */
    #onSettingsChange = (event) => {
        const { strokeColor: newStrokeColor, strokeWidth: newStrokeWidth } = event.outputData;

        const vectorCreators = Object.values(this.#interactContext.vectorCreators);

        for (const creator of vectorCreators) {
            creator.strokeColor = newStrokeColor.clone();
            creator.strokeWidth = newStrokeWidth;
        }
    };

    /**
     * Creates a new layer for vector labels.
     * 
     * @template {MainWindowMapper} WM The windows defined in the scene display.
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {PointCloudLayer<WM>} pointCloudLayer A layer that displays the point cloud.
     * @param {GroundMeshLayer<WM>} groundMeshLayer A layer that displays the ground mesh.
     * @returns {VectorLayer<WM>} The newly created data layer.
     */
    static create(context, name, pointCloudLayer, groundMeshLayer) {
        const dataView = VectorView.create(context, 0);

        return new VectorLayer(context, name, dataView, pointCloudLayer, groundMeshLayer);
    }

    /**
     * Aligns the panels in the application.
     */
    #alignPanels = () => {
        this.#inspectorPanel.alignCenterVertical().alignRight();
    };

    /**
     * Creates a new display for label data that updates based on the current frame.
     * 
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {VectorView} dataView A view of the data to display in the layer.
     * @param {PointCloudLayer<WM>} pointCloudLayer A layer that displays the point cloud.
     * @param {GroundMeshLayer<WM>} groundMeshLayer A layer that displays the ground mesh.
     */
    constructor(context, name, dataView, pointCloudLayer, groundMeshLayer) {
        super(context, name, dataView);

        const config = context.config;
        const layerSettings = getSettings(config);

        this.pointCloudLayer = pointCloudLayer;
        this.groundMeshLayer = groundMeshLayer;

        const pointer = new WindowPointer(context.display.windows.main);

        const thisLayer = this;

        const vectorSelectRaycaster = new THREE.Raycaster();
        ThreeUtils.setRaycasterLineThreshold(vectorSelectRaycaster, 0.25);
        ThreeUtils.setRaycasterPointsThreshold(vectorSelectRaycaster, 0.25);

        const vectorSelectorGroup = new SceneObjectsGroup({
            objects: {
                [Symbol.iterator]() {
                    return thisLayer.iterLabelVectors();
                },
            },
            raycastFunc: (obj, raycaster) => obj.raycast(raycaster),
        });

        const vectorSelector = pointer.createSelectController({
            groups: [{ group: vectorSelectorGroup, priority: 0 }],
            raycaster: vectorSelectRaycaster,
        });

        const vectCreatorRaycaster = new THREE.Raycaster();
        ThreeUtils.setRaycasterPointsThreshold(vectCreatorRaycaster, 0.25);

        const canvas = document.createElement('canvas');
        canvas.id = 'vector-canvas';
        canvas.hidden = true;
        this.overlayElem.appendChild(canvas);

        this.#observer = new ResizeObserver(() => {
            const { width: newWidth, height: newHeight } = this.overlayElem.getBoundingClientRect();

            canvas.height = newHeight;
            canvas.width = newWidth;

            this.#alignPanels();
        });
        this.#observer.observe(this.overlayElem);

        const format = config.coordinateFormat;
        const polygonCreator = new PolygonCreator(format, pointer, vectCreatorRaycaster, canvas);
        const polylineCreator = new PolylineCreator(format, pointer, vectCreatorRaycaster, canvas);
        const pointCreator = new PointCreator(format, pointer, vectCreatorRaycaster, canvas);

        const actionInputDom = document.createElement('div');
        const actionInput = ActionPaneController.create(actionInputDom, {
            inputtedData: { action: 'edit' },
            settings: {
                disabled: true,
                hidden: false,
            },
        });
        this.actionsElem = actionInputDom;

        const drawModeInputDom = document.createElement('div');
        const drawModeInput = DrawModePaneController.create(drawModeInputDom, {
            inputtedData: { drawMode: 'polyline' },
        });

        const vectorMonitor = new LabelVectorReformMonitor(context.config);

        const vectorInspector = new LabelVectorInspector({
            labelsView: dataView,
        });

        this.#inspectorPanel = new DraggablePanel({
            title: 'Vector Objects',
            content: vectorInspector.dom,
        });
        vectorInspector.dom.style.width = '384px';
        vectorInspector.dom.style.maxHeight = '256px';
        this.#inspectorPanel.dom.hidden = true;
        this.#inspectorPanel.dom.style.pointerEvents = 'auto';
        this.#inspectorPanel.dom.style.touchAction = 'auto';
        this.overlayElem.appendChild(this.#inspectorPanel.dom);

        const vectorTransformRaycaster = new THREE.Raycaster();
        ThreeUtils.setRaycasterPointsThreshold(vectorTransformRaycaster, 0.25);

        const vectorTransformer = new VectorTransformer(
            context.config,
            pointer,
            vectorTransformRaycaster,
        );

        const vectorClipboard = new LabelVectorClipboard();

        const toolsDom = document.createElement('div');
        {
            this.#toolsAccordion = AccordionPaneController.create(
                toolsDom,
                {
                    Draw: drawModeInput.dom,
                    Transform: vectorTransformer.dom,
                    Clipboard: vectorClipboard.dom,
                },
            );
        }
        this.toolsElem = toolsDom;

        const settingsInputDom = document.createElement('div');
        {
            this.#settingsInput = VectorSettingsPaneController.create(settingsInputDom, {
                inputtedData: layerSettings,
                settings: {
                    disabled: false,
                    hidden: false,
                },
            });
        }
        this.prefsElem = settingsInputDom;

        for (const keybind of [
            ...this.TOOLS_KEYDOWN_BINDS,
            ...this.ACTIONS_KEYDOWN_BINDS,
        ]) {
            this.keydownHandler.register(keybind);
        }

        this.#interactContext = new InteractContext({
            sceneContext: context,
            dataView: dataView,
            canvas: canvas,
            vectorCreators: {
                polygon: polygonCreator,
                polyline: polylineCreator,
                point: pointCreator,
            },
            drawModeInput: drawModeInput,
            vectorSelector: vectorSelector,
            vectorTransformer: vectorTransformer,
            vectorClipboard: vectorClipboard,
            vectorInspector: vectorInspector,
            actionInput: actionInput,
            vectorMonitor: vectorMonitor,
        });

        this.#settingsInput.bindOutputData(this.#onSettingsChange);

        this.context.addEventListener('layer-activate', this.#onLayerActivate);

        this.#interactContext.addEventListener('change', this.#onInteractStateChange);

        if (this.#interactContext.currentState == null) {
            throw new Error('currentState not initialized');
        }
        this.#updateControlsElem(this.#interactContext.currentState);

        this.#alignPanels();
    }

    dispose() {
        this.context.removeEventListener('layer-activate', this.#onLayerActivate);

        const vectorCreators = this.#interactContext.vectorCreators;

        for (const creator of Object.values(vectorCreators)) {
            creator.dispose();
        }

        this.#interactContext.vectorInspector.dispose();
        this.#interactContext.vectorTransformer.dispose();
        this.#interactContext.vectorSelector.dispose();
        this.#interactContext.drawModeInput.dispose();
        this.#interactContext.removeEventListener('change', this.#onInteractStateChange);
        this.#interactContext.dispose();

        this.#toolsAccordion.dispose();
        this.#inspectorPanel.dispose();
        this.#settingsInput.dispose();

        super.dispose();
    }

    /**
     * Iterates through each vector label to display.
     * 
     * @returns {IterableIterator<ReadonlyLabelVector>} An iterator that yields such items.
     * @yields {ReadonlyLabelVector} Each vector label to display.
     */
    * iterLabelVectors() {
        const dataView = this.#interactContext.dataView;

        if (dataView === undefined) return;

        for (const vector of dataView.iterLabelVectors()) yield vector;
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
     * Updates how a vector object is displayed
     * 
     * @param {ReadonlyLabelVector} vector The vector label to update.
     * @returns {ReadonlyLabelVector} The updated vector label. 
     */
    #renderVector(vector) {
        const dataView = this.#interactContext.dataView;
        const { selectedVectorColor, hoveredVectorColor } = this.#settingsInput.outputData;

        /**
         * @type {?Readonly<THREE.Color>}
         */
        let showColor;

        if (vector === this.#interactContext.vectorSelector.selectedObj) {
            showColor = new THREE.Color(selectedVectorColor);
        } else if (vector === this.#interactContext.vectorSelector.hoveredObj) {
            showColor = new THREE.Color(hoveredVectorColor);
        } else {
            showColor = null;
        }

        dataView.setLabelVectorDisplayParams(vector, { showColor });

        return vector;
    }

    /**
     * Updates the tooltip for a vector object.
     * 
     * @param {HTMLDivElement} tooltip The tooltip to update.
     * @param {ReadonlyLabelVector} vector The vector object associated with the tooltip.
     * @returns {HTMLDivElement} The updated tooltip.
     */
    #renderTooltip(tooltip, vector) {
        const currentFrame = this.context.currentFrame;
        const mainCamera = this.#interactContext.mainWindow.getCamera();
        const { showTooltips } = this.#settingsInput.outputData;
        const showTimestampDiff = true;

        const vectorId = vector.id;
        const vectorTimestamp = vector.timestamp;

        const vectorFirstVertexNDC = vector.vectorCoords.at(0)?.clone().project(mainCamera);
        if (vectorFirstVertexNDC == null) {
            throw Error(`Not a valid vector object with empty vertices ${vector.vectorCoords}`);
        }

        const vectorIdStr = (vectorId == null) ? '' : `P{${new ShortUUID(vectorId)}}`;
        const idText = vectorIdStr;

        let tsText = '';
        if (showTimestampDiff) {
            const currentTimestamp = currentFrame?.getTimestampCenter() ?? null;

            if (currentTimestamp == null || vectorTimestamp == null
                || currentFrame?.containsTimestamp(vectorTimestamp)) {
                tsText = `(t = ${vectorTimestamp?.toISOString() ?? null})`;
            } else {
                const timeDiffTotalMillis = vectorTimestamp.getTime() - currentTimestamp.getTime();
                const timeDiffTotalSecs = timeDiffTotalMillis / 1000;

                const timeDiffSign = (timeDiffTotalSecs >= 0) ? '+' : '-';
                const timeDiffAbsSecs = Math.abs(timeDiffTotalSecs);

                tsText = `(t ${timeDiffSign} ${timeDiffAbsSecs.toFixed(2)}s)`;
            }
        }

        let classText = '';
        const displayClass = vector.gtClass;
        if (displayClass == null) {
            classText = '&lt;Unclassified&gt;';
        } else {
            classText = `[${displayClass.name}]`;
        }

        const relPos = ThreeUtils.getNDCRelPos(vectorFirstVertexNDC);

        tooltip.innerHTML = [idText, tsText, classText].filter((s) => s.length > 0).join('<br>');
        tooltip.style.visibility = showTooltips ? 'visible' : 'hidden';
        tooltip.style.top = `${relPos.y * 100}%`;
        tooltip.style.left = `${relPos.x * 100}%`;

        return tooltip;
    }

    render() {
        const { dataView, vectorTransformer } = this.#interactContext;

        this.#interactContext.layerIsActive = this.isActive;
        this.#interactContext.render();

        // Avoid querying frames when the task is changing
        if (this.context.isNavigating) return;

        this.objects.clear();

        const { data } = dataView;
        if (data == null) return;

        const tooltips = this.#tooltips;
        const vectors = [...this.iterLabelVectors()];

        // Adjust the number of tooltips to match the current number of vector objects.
        const currentTooltipCount = tooltips.length;
        const targetTooltipCount = vectors.length;

        if (currentTooltipCount < targetTooltipCount) {
            _.range(targetTooltipCount - currentTooltipCount).forEach(() => {
                const tooltip = document.createElement('div');

                // Avoid conflict with Bootstrap's tooltips
                tooltip.className = 'vector-tooltip';

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

        vectors.forEach((vector, i) => {
            this.#renderVector(vector);
            this.objects.add(vector.asObject3D());

            this.#renderTooltip(tooltips[i], vector);
        });

        const vectorTransformerControls = vectorTransformer.getControls();
        if (vectorTransformerControls != null) {
            this.objects.add(vectorTransformerControls);
        }
    }
}
