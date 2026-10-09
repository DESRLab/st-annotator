import _ from 'lodash';
import * as THREE from 'three';

import { ThreeUtils } from 'sta/common/utils';
import {
    LabelDataLayer,
    WindowPointer, SceneObjectsGroup, DraggablePanel,
    AccordionPaneController, ControlsMenu,
} from 'sta/services/editor/base';

import { getSettings } from '../../config';

import { SelectionEditControls } from '../controls';
import { SegmentationView, LabelSelectionReformMonitor, ShortUUID } from '../data';
import { LassoCurator, PolygonCurator, RectangleCurator, BrushCurator } from '../tools';
import { PointCloudUtils } from '../utils';
import {
    DrawModePaneController, ActionPaneController,
    LabelInstanceInspector, LabelSelectionInspector,
    SegmentationSettingsPaneController,
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
 * @typedef {import('sta-pcd/editor').PointCloudLayer<WM>} PointCloudLayer
 */

/**
 * @typedef {import('../data').ReadonlySegmentationIndex} ReadonlySegmentationIndex
 */

/**
 * @typedef {import('../data').ReadonlyLabelSelection} ReadonlyLabelSelection
 */

/**
 * @typedef {import('../data').ReadonlyLabelInstance} ReadonlyLabelInstance
 */

/**
 * @typedef {import('../widgets').SegmentationSettingsPaneControllerParams} SegmentationSettingsPaneControllerParams
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
 * Facilitates user interaction with the segmentation labels for the current frame.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments {LabelDataLayer<WM, ReadonlySegmentationIndex>}
 */
export class SegmentationLayer extends LabelDataLayer {
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

        this.#instanceInspectorPanel.dom.hidden = !(isActive);
        this.#selectionInspectorPanel.dom.hidden = !(isActive);

        this.#interactContext.disabled = !isActive || (data == null);
    };

    /**
     * @readonly
     * @type {InteractContext<WM>}
     */
    #interactContext;

    /**
     * Observes the overlay DOM of this object for resize events.
     * 
     * @readonly
     * @type {ResizeObserver}
     */
    #observer;

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

        /**
         * @type {?PointCloudUtils}
         */
        let pcdUtils = null;

        if (pcd != null) {
            pcdUtils = new PointCloudUtils(pcd.buffer.clone(), pcd.position.clone(), pcd.pointSize);
        }

        this.#interactContext.pointCloudUtils = pcdUtils;
    };

    /**
     * A tooltip for each selection being displayed.
     * 
     * @readonly
     * @type {HTMLDivElement[]}
     */
    #tooltips = [];

    /**
     * Contains the contents of the inspector pane.
     * 
     * @readonly
     * @type {DraggablePanel}
     */
    #inspectorTabber;

    /**
     * Contains the contents of the instance inspector.
     * 
     * @readonly
     * @type {DraggablePanel}
     */
    #instanceInspectorPanel;

    /**
     * Contains the contents of the selection inspector.
     * 
     * @readonly
     * @type {DraggablePanel}
     */
    #selectionInspectorPanel;

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
            keyCombo: 'p',
            name: 'Query with Polygon',
            handler: () => {
                this.#interactContext.drawModeInput.setDrawMode('polygon');
            },
        },
        {
            keyCombo: 'o',
            name: 'Query with Rectangle',
            handler: () => {
                this.#interactContext.drawModeInput.setDrawMode('box');
            },
        },
        {
            keyCombo: 'l',
            name: 'Query with Lasso',
            handler: () => {
                this.#interactContext.drawModeInput.setDrawMode('lasso');
            },
        },
        {
            keyCombo: 'b',
            name: 'Query with Brush',
            handler: () => {
                this.#interactContext.drawModeInput.setDrawMode('brush');
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
            name: 'Select selection',
            handler: () => {
                this.#interactContext.actionInput.toggleSelect();
            },
        },
        {
            keyCombo: 'd',
            name: 'Create/Edit a selection',
            handler: () => {
                this.#interactContext.actionInput.toggleDraw();
            },
        },
    ];

    /**
     * Specifies the settings to apply to the segmentation labels.
     * 
     * @readonly
     * @type {SegmentationSettingsPaneController}
     */
    #settingsInput;

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
     * @param {PaneControllerChangeEvent<SegmentationSettingsPaneControllerParams>} event
     * The event to handle.
     */
    #onSettingsChange = (event) => {
        const {
            strokeColor, brushDiameter,
            timeIdxRange, brushHueStyle,
        } = event.outputData;
        const dataView = this.#interactContext.dataView;
        const brush = this.#interactContext.selectionController.curators.brush;

        dataView.timeIdxRange = timeIdxRange;
        brush.diameter = brushDiameter;
        brush.hue = brushHueStyle;

        const selectionCurators = Object
            .values(this.#interactContext.selectionController.curators);

        for (const curator of selectionCurators) {
            curator.strokeColor = strokeColor.clone();
        }
    };

    /**
     * Creates a new layer for segmentation labels.
     * 
     * @template {MainWindowMapper} WM The windows defined in the scene display.
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {PointCloudLayer<WM>} pointCloudLayer A layer that displays the point cloud.
     * @returns {SegmentationLayer<WM>} The newly created data layer.
     */
    static create(context, name, pointCloudLayer) {
        // timeWidth is set when #onSettingsChange is called
        const dataView = SegmentationView.create(context, 0);

        return new SegmentationLayer(context, name, dataView, pointCloudLayer);
    }

    /**
     * Aligns the panels in the application.
     */
    #alignPanels = () => {
        this.#instanceInspectorPanel.alignCenterVertical().alignRight();
        this.#instanceInspectorPanel.top -= 192;

        this.#selectionInspectorPanel.alignCenterVertical().alignRight();
        this.#selectionInspectorPanel.top -= 16;
    };

    /**
     * Creates a new display for label data that updates based on the current frame.
     * 
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {string} name The display name of this layer.
     * @param {SegmentationView} dataView A view of the data to display in the layer.
     * @param {PointCloudLayer< WM>} pointCloudLayer A layer that displays the point cloud.
     */
    constructor(context, name, dataView, pointCloudLayer) {
        super(context, name, dataView);

        const config = context.config;
        const settings = getSettings(config);

        this.pointCloudLayer = pointCloudLayer;

        const pointer = new WindowPointer(this.context.display.windows.main);

        const selectionSelectRaycaster = new THREE.Raycaster();
        ThreeUtils.setRaycasterPointsThreshold(selectionSelectRaycaster, 0.5);

        const thisLayer = this;
        const selectionSelectorGroup = new SceneObjectsGroup({
            objects: {
                [Symbol.iterator]() {
                    return thisLayer.iterLabelSelections();
                },
            },
            raycastFunc: (obj, raycaster) => obj.raycast(raycaster),
        });

        const selectionSelector = pointer.createSelectController({
            groups: [{ group: selectionSelectorGroup, priority: 0 }],
            raycaster: selectionSelectRaycaster,
        });

        const canvas = document.createElement('canvas');
        canvas.id = 'segmentation-canvas';
        canvas.hidden = true;
        this.overlayElem.appendChild(canvas);

        this.#observer = new ResizeObserver(() => {
            const { width: newWidth, height: newHeight } = this.overlayElem.getBoundingClientRect();

            canvas.height = newHeight;
            canvas.width = newWidth;

            this.#alignPanels();
        });
        this.#observer.observe(this.overlayElem);

        const selectionCuratorRaycaster = new THREE.Raycaster();
        ThreeUtils.setRaycasterPointsThreshold(selectionCuratorRaycaster, 0.25);

        const polygonCurator = new PolygonCurator(pointer, selectionCuratorRaycaster, canvas);
        const lassoCurator = new LassoCurator(pointer, selectionCuratorRaycaster, canvas);
        const rectangleCurator = new RectangleCurator(pointer, selectionCuratorRaycaster, canvas);
        const brushCurator = new BrushCurator(pointer, selectionCuratorRaycaster, canvas);

        this.overlayElem.appendChild(brushCurator.cursor);

        const actionInputDom = document.createElement('div');
        const actionInput = ActionPaneController.create(actionInputDom, {
            inputtedData: { action: 'navigate' },
        });
        this.actionsElem = actionInputDom;

        const drawModeInputDom = document.createElement('div');
        const drawModeInput = DrawModePaneController.create(drawModeInputDom, {
            inputtedData: { drawMode: 'box' },
        });

        const selectionController = new SelectionEditControls(
            {
                polygon: polygonCurator,
                lasso: lassoCurator,
                box: rectangleCurator,
                brush: brushCurator,
            },
        );

        const toolsDom = document.createElement('div');
        {
            this.#toolsAccordion = AccordionPaneController.create(
                toolsDom,
                {
                    Draw: drawModeInput.dom,
                    Modify: selectionController.dom,
                },
            );
        }
        this.toolsElem = toolsDom;

        const selectionMonitor = new LabelSelectionReformMonitor();

        const selectionInspector = new LabelSelectionInspector({
            labelsView: dataView,
            autoInstances: true,
        });

        const instanceInspector = new LabelInstanceInspector({
            labelsView: dataView,
        });

        this.#instanceInspectorPanel = new DraggablePanel({
            title: 'Object Instance',
            content: instanceInspector.dom,
        });
        instanceInspector.dom.style.width = '384px';
        instanceInspector.dom.style.maxHeight = '256px';
        this.#instanceInspectorPanel.dom.hidden = true;
        this.#instanceInspectorPanel.dom.style.pointerEvents = 'auto';
        this.#instanceInspectorPanel.dom.style.touchAction = 'auto';
        this.overlayElem.appendChild(this.#instanceInspectorPanel.dom);

        this.#selectionInspectorPanel = new DraggablePanel({
            title: 'Selection Points',
            content: selectionInspector.dom,
        });
        selectionInspector.dom.style.width = '384px';
        selectionInspector.dom.style.maxHeight = '256px';
        this.#selectionInspectorPanel.dom.hidden = true;
        this.#selectionInspectorPanel.dom.style.pointerEvents = 'auto';
        this.#selectionInspectorPanel.dom.style.touchAction = 'auto';
        this.overlayElem.appendChild(this.#selectionInspectorPanel.dom);

        const settingsInputDom = document.createElement('div');
        {
            this.#settingsInput = SegmentationSettingsPaneController.create(settingsInputDom, {
                inputtedData: settings,
                settings: {
                    disabled: false,
                    hidden: false,
                    maxTimeIdxRange: 10,
                    maxBrushDiameter: 100,
                    maxBrushHueStyle: 1,
                },
            });
        }
        this.prefsElem = settingsInputDom;

        this.#interactContext = new InteractContext({
            sceneContext: context,
            dataView: dataView,
            canvas: canvas,
            selectionSelector: selectionSelector,
            actionInput: actionInput,
            drawModeInput: drawModeInput,
            pointCloudUtils: null,
            selectionInspector: selectionInspector,
            instanceInspector: instanceInspector,
            selectionMonitor: selectionMonitor,
            selectionController: selectionController,
        });

        this.#interactContext.layerIsActive = this.isActive;

        this.context.addEventListener('layer-activate', this.#onLayerActivate);

        this.pointCloudLayer.dataView.addEventListener('beforeload', this.#onUpdatePointCloud);
        this.pointCloudLayer.dataView.addEventListener('afterload', this.#onUpdatePointCloud);

        for (const keybind of [
            ...this.TOOLS_KEYDOWN_BINDS,
            ...this.ACTIONS_KEYDOWN_BINDS,
        ]) {
            this.keydownHandler.register(keybind);
        }

        this.#settingsInput.bindOutputData(this.#onSettingsChange);

        this.#interactContext.addEventListener('change', this.#onInteractStateChange);

        if (this.#interactContext.currentState == null) {
            throw new Error('currentState not initialized');
        }
        this.#updateControlsElem(this.#interactContext.currentState);

        this.#alignPanels();
    }

    dispose() {
        this.context.removeEventListener('layer-activate', this.#onLayerActivate);

        const selectionCurators = this.#interactContext.selectionController.curators;
        this.#inspectorTabber.dispose();

        for (const curator of Object.values(selectionCurators)) {
            curator.dispose();
        }

        this.#interactContext.selectionSelector.dispose();
        this.#interactContext.drawModeInput.dispose();
        this.#interactContext.removeEventListener('change', this.#onInteractStateChange);
        this.#interactContext.dispose();

        this.#toolsAccordion.dispose();
        this.#settingsInput.dispose();

        super.dispose();
    }

    /**
     * Iterates through each selection label to display.
     * 
     * @returns {IterableIterator<ReadonlyLabelSelection>} An iterator that yields such items.
     * @yields {ReadonlyLabelSelection} Each selection label to display.
     */
    * iterLabelSelections() {
        const dataView = this.#interactContext.dataView;

        if (dataView === undefined) return;

        for (const selection of dataView.iterLabelSelections()) yield selection;
    }

    /**
     * Iterates through each object instance to display.
     * 
     * @returns {IterableIterator<ReadonlyLabelInstance>} An iterator that yields such items.
     * @yields {ReadonlyLabelInstance} Each object instance to display.
     */
    * iterLabelInstances() {
        const dataView = this.#interactContext.dataView;

        // This may be called in the constructor so it may not be initialized yet
        if (dataView === undefined) return;

        for (const instance of dataView.iterLabelInstances()) yield instance;
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
     * Updates how an instance is displayed.
     * 
     * @param {ReadonlyLabelInstance} instance The object instance to update.
     * @returns {ReadonlyLabelInstance} The updated object instance.
     */
    #renderInstance(instance) {
        const dataView = this.#interactContext.dataView;

        const displayParams = {
            minTimestamp: dataView.getMinTimestampInRange(),
            maxTimestamp: dataView.getMaxTimestampInRange(),
        };

        dataView.setLabelInstanceDisplayParams(instance, displayParams);

        return instance;
    }

    /**
     * Updates how a selection is displayed.
     * 
     * @param {ReadonlyLabelSelection} selection The bounding selection to update.
     * @returns {ReadonlyLabelSelection} The updated selection.
     */
    #renderSelection(selection) {
        const dataView = this.#interactContext.dataView;
        const pcd = this.pointCloudLayer.dataView?.data;
        const {
            selectedSelectionColor,
            hoveredSelectionColor,
            showPerceivedClass,
        } = this.#settingsInput.outputData;

        /**
         * @type {Readonly<number>}
         */
        let showPointSize = pcd ? pcd.pointSize : 0.5;

        /**
         * @type {?Readonly<THREE.Color>}
         */
        let showColor;

        if (selection === this.#interactContext.selectionSelector.selectedObj) {
            showColor = new THREE.Color(selectedSelectionColor);
        } else if (selection === this.#interactContext.selectionSelector.hoveredObj) {
            showColor = new THREE.Color(hoveredSelectionColor);
            showPointSize += 1;
        } else {
            showColor = null;
        }

        const currentFrame = this.context.currentFrame;

        const displayOptions = {
            showPointSize: showPointSize,
            showCenter: currentFrame == null
                || !currentFrame.containsTimestamp(selection.timestamp),
            showPerceivedClass: showPerceivedClass,
            showColor: showColor,
        };

        dataView.setLabelSelectionDisplayParams(selection, displayOptions);

        return selection;
    }

    /**
     * Updates the tooltip for a selection.
     * 
     * @param {HTMLDivElement} tooltip The tooltip to update.
     * @param {ReadonlyLabelSelection} selection The selection associated with the tooltip.
     * @returns {HTMLDivElement} The updated tooltip.
     */
    #renderTooltip(tooltip, selection) {
        const currentFrame = this.context.currentFrame;
        const mainCamera = this.#interactContext.mainWindow.getCamera();
        const { showTooltips } = this.#settingsInput.outputData;
        const showTimestampDiff = true;

        const selectionId = selection.id;
        const instanceId = selection.entityId;
        const selectionTimestamp = selection.timestamp;
        const selectionNDC = selection.centerPoint.clone().project(mainCamera);

        const instanceIdStr = (instanceId == null) ? '' : `T{${new ShortUUID(instanceId)}}`;
        const selectionIdStr = (selectionId == null) ? '' : `B{${new ShortUUID(selectionId)}}`;
        const idText = [instanceIdStr, selectionIdStr].filter((s) => s.length > 0).join(' | ');

        let tsText = '';
        if (showTimestampDiff) {
            const currentTimestamp = currentFrame?.getTimestampCenter() ?? null;

            if (currentTimestamp == null || selectionTimestamp == null
                || currentFrame?.containsTimestamp(selectionTimestamp)) {
                tsText = `(t = ${selectionTimestamp?.toISOString() ?? null})`;
            } else {
                const timeDiffTotalMillis = selectionTimestamp.getTime()
                    - currentTimestamp.getTime();
                const timeDiffTotalSecs = timeDiffTotalMillis / 1000;

                const timeDiffSign = (timeDiffTotalSecs >= 0) ? '+' : '-';
                const timeDiffAbsSecs = Math.abs(timeDiffTotalSecs);

                tsText = `(t ${timeDiffSign} ${timeDiffAbsSecs.toFixed(2)}s)`;
            }
        }

        let classText = '';
        const displayClass = selection.displayClass;
        if (displayClass == null) {
            classText = '&lt;Unclassified&gt;';
        } else {
            classText = `[${displayClass.name}]`;
        }

        const relPos = ThreeUtils.getNDCRelPos(selectionNDC);

        tooltip.innerHTML = [idText, tsText, classText].filter((s) => s.length > 0).join('<br>');
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
        const { dataView } = this.#interactContext;

        this.#interactContext.layerIsActive = this.isActive;
        this.#interactContext.render();

        // Avoid querying frames when the task is changing
        if (this.context.isNavigating) return;

        this.objects.clear();

        const { data } = dataView;
        if (data == null) return;

        const tooltips = this.#tooltips;
        const selections = [...this.iterLabelSelections()];

        // Adjust the number of tooltips to match the current number of selections
        const currentTooltipCount = tooltips.length;
        const targetTooltipCount = selections.length;

        if (currentTooltipCount < targetTooltipCount) {
            _.range(targetTooltipCount - currentTooltipCount).forEach(() => {
                const tooltip = document.createElement('div');

                // Avoid conflict with Bootstrap's tooltips
                tooltip.className = 'selection-tooltip';

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

        selections.forEach((selection, i) => {
            this.#renderSelection(selection);
            this.objects.add(selection.asObject3D());

            this.#renderTooltip(tooltips[i], selection);
        });

        for (const instance of this.iterLabelInstances()) {
            if (data.getLabelInstanceElements(instance.id).size > 0) {
                this.#renderInstance(instance);
                this.objects.add(instance.asObject3D());
            }
        }
    }
}
