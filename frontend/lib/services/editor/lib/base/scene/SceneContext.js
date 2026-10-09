import { Queue } from 'async-await-queue';
import * as THREE from 'three';

import { EditorConfig } from '../config';
import { FrameNavigator } from '../nav';

/**
 * @typedef {import('../../../../../common/lib/spatial').CoordBounds} CoordBounds
 */

/**
 * @typedef {import('../../../../project/lib').TaskState} TaskState
 */

/**
 * @typedef {import('../../../../source/lib').SourceGroupState} SourceGroupState
 */

/**
 * @typedef {import('../labelset').EditableBranch} EditableBranch
 */

/**
 * @typedef {import('../nav').SourceGroupIndex} SourceGroupIndex
 */

/**
 * @typedef {import('../nav').LabelsetBranchIndex} LabelsetBranchIndex
 */

/**
 * @typedef {import('../nav').EditableFrame} EditableFrame
 */

/**
 * @typedef {import('../nav').FrameIndex} FrameIndex
 */

/**
 * @typedef {import('../nav').FrameNavigatorEventMap} FrameNavigatorEventMap
 */

/**
 * @typedef {import('../nav').FrameSelectors} FrameSelectors
 */

/**
 * @typedef {import('../nav').TaskIndex} TaskIndex
 */

/**
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * @typedef {import('./display').WindowMapper} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('./display').SceneDisplay<WM>} SceneDisplay
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('./layer').LayerCollection<WM>} LayerCollection
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('./layer').LayerCollectionEventMap<WM>} LayerCollectionEventMap
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('./layer').SceneLayer<WM>} SceneLayer
 */

/**
 * Represents the event when a source group is opened.
 * - `prevGroup`: The group that was previously opened.
 * - `group`: The group that is now opened.
 * 
 * @typedef {{
 *     prevGroup: ?SourceGroupState;
 *     group: ?SourceGroupState;
 * }} NavSourceGroupEvent
 */

/**
 * Represents the event when a label branch is opened.
 * - `prevBranch`: The branch that was previously opened.
 * - `branch`: The branch that is now opened.
 * 
 * @typedef {{
 *     prevBranch: ?EditableBranch;
 *     branch: ?EditableBranch;
 * }} NavLabelBranchEvent
 */

/**
 * Represents the event when a frame is displayed.
 * - `prevFrame`: The frame that was previously displayed.
 * - `frame`: The frame that is now displayed.
 * 
 * @typedef {{
 *     prevFrame: ?EditableFrame;
 *     frame: ?EditableFrame;
 * }} NavFrameEvent
 */

/**
 * Defines each event that can be dispatched by {@link SceneContext}.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @typedef {object} SceneContextEventMap
 * @property {LayerCollectionEventMap<WM>['layer-activate']} layer-activate
 * The event when another layer becomes active.
 * @property {{}} isNavigating-changed The event when the `isNavigating` attribute has been changed.
 * @property {NavSourceGroupEvent} nav-source-group The event when a source group is opened.
 * @property {NavLabelBranchEvent} nav-label-branch The event when a label branch is opened.
 * @property {NavFrameEvent} nav-frame The event when a frame is displayed.
 * @property {FrameNavigatorEventMap['edit-branch']} edit-branch
 * The event when a branch is edited.
 * @property {FrameNavigatorEventMap['edit-frame']} edit-frame
 * The event when a frame is edited.
 */

/**
 * Interface through which components can control the active scene.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @augments {THREE.EventDispatcher<SceneContextEventMap<WM>>}
 */
export class SceneContext extends THREE.EventDispatcher {

    /**
     * The configuration of the application.
     * 
     * @readonly
     * @type {EditorConfig}
     */
    config;

    /**
     * The interface of the application with the backend.
     * 
     * @readonly
     * @type {EditorViews}
     */
    views;

    /**
     * Navigates between the frames to display in the scene.
     * 
     * @readonly
     * @type {FrameNavigator}
     */
    #nav;

    /**
     * The tasks available to the project.
     * 
     * @type {TaskIndex}
     */
    get tasks() { return this.#nav.tasks; }

    /**
     * The currently selected task, or `null` if none.
     * 
     * @type {?TaskState}
     */
    get currentTask() { return this.#nav.task; }

    /**
     * The unique identifier of the selected task, or `null` if none.
     * 
     * @type {?number}
     */
    get currentTaskId() { return this.#nav.taskId; }

    /**
     * The source groups available to the task.
     * 
     * @type {SourceGroupIndex}
     */
    get sourceGroups() { return this.#nav.sourceGroups; }

    /**
     * The currently selected source group, or `null` if none.
     * 
     * @type {?SourceGroupState}
     */
    get currentSourceGroup() { return this.#nav.sourceGroup; }

    /**
     * The label branches available to the task.
     * 
     * @type {LabelsetBranchIndex}
     */
    get labelBranches() { return this.#nav.labelBranches; }

    /**
     * The currently selected label branch, or `null` if none.
     * 
     * @type {?EditableBranch}
     */
    get currentLabelBranch() { return this.#nav.labelBranch; }

    /**
     * `true` if any branch has unsaved changes; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get hasUnsavedChanges() { return this.#nav.hasUnsavedChanges; }

    /**
     * The frames available to the task.
     * 
     * @type {FrameIndex}
     */
    get frames() { return this.#nav.frames; }

    /**
     * The currently selected frame, or `null` if none.
     * 
     * @type {?EditableFrame}
     */
    get currentFrame() { return this.#nav.frame; }

    /**
     * The unique identifier of the selected frame, or `null` if none.
     * 
     * @type {?number}
     */
    get currentFrameId() { return this.#nav.frameId; }

    /**
     * The source data selector of the selected frame, or `null` if none.
     * 
     * @type {?number}
     */
    get currentSourceGroupId() { return this.#nav.sourceGroupId; }

    /**
     * The source data selector of the selected frame, or `null` if none.
     * 
     * @type {?number}
     */
    get currentLabelBranchId() { return this.#nav.labelBranchId; }

    /**
     * The `x` boundaries of the selected frame, or `null` if none.
     * 
     * @type {?CoordBounds}
     */
    get currentXBounds() { return this.#nav.xBounds; }

    /**
     * The `y` boundaries of the selected frame, or `null` if none.
     * 
     * @type {?CoordBounds}
     */
    get currentYBounds() { return this.#nav.yBounds; }

    /**
     * The `z` boundaries of the selected frame, or `null` if none.
     * 
     * @type {?CoordBounds}
     */
    get currentZBounds() { return this.#nav.zBounds; }

    /**
     * The `t` boundaries of the selected frame, or `null` if none.
     * 
     * @type {?CoordBounds}
     */
    get currentTBounds() { return this.#nav.tBounds; }

    /**
     * Defines how the scene is displayed.
     * 
     * @type {?SceneDisplay<WM>}
     */
    #display;

    /**
     * Defines how the scene is displayed.
     * 
     * This is initially `null` because the display itself require this context,
     * resulting in a circular dependency. As a result, displays should not refer to
     * this attribute at construction time.
     * 
     * @type {SceneDisplay<WM>}
     */
    get display() {
        if (this.#display == null) {
            throw new Error('This context has not been bound to a SceneDisplay');
        }

        return this.#display;
    }

    /**
     * @type {?LayerCollection<WM>}
     */
    #layers;

    /**
     * The collection of layers available in the scene.
     * 
     * This is initially `null` because the layers themselves require this context,
     * resulting in a circular dependency. As a result, layers should not refer to
     * this attribute at construction time.
     * 
     * @type {LayerCollection<WM>}
     */
    get layers() {
        if (this.#layers == null) {
            throw new Error('This context has not been bound to a LayerCollection');
        }

        return this.#layers;
    }

    /**
     * The layer that is currently active, or `null` if none.
     * 
     * @type {?SceneLayer<WM>}
     */
    get activeLayer() { return this.#layers?.activeLayer ?? null; }

    /**
     * Handles the event when a branch has been edited.
     * 
     * @param {FrameNavigatorEventMap['edit-branch']} event The event to handle.
     */
    #onEditBranch = (event) => {
        this.dispatchEvent({ type: 'edit-branch', branch: event.branch });
    };

    /**
     * Handles the event when a frame has been edited.
     * 
     * @param {FrameNavigatorEventMap['edit-frame']} event The event to handle.
     */
    #onEditFrame = (event) => {
        this.dispatchEvent({ type: 'edit-frame', frame: event.frame });
    };

    /**
     * Handles the event when a layer has been activated.
     * 
     * @param {LayerCollectionEventMap<WM>['layer-activate']} event The event to handle.
     */
    #onLayerActivate = (event) => {
        this.dispatchEvent({ type: 'layer-activate', activeLayer: event.activeLayer });
    };

    /**
     * Creates a new scene context with its contents already loaded.
     * 
     * @template {WindowMapper} WM The windows defined in the scene display.
     * @param {EditorViews} views The interface of the application with the backend.
     * @returns {Promise<SceneContext<WM>>} A promise that resolves to the newly created
     * context.
     */
    static async create(views) {
        const config = new EditorConfig(await views.getConfigData());
        const nav = await FrameNavigator.create(views);
        return new SceneContext(config, views, nav);
    }

    /**
     * Creates a new scene context to coordinate its components.
     * 
     * @protected
     * @param {EditorConfig} config The configuration of the application.
     * @param {EditorViews} views The interface of the application with the backend.
     * @param {FrameNavigator} nav Navigates between the frames to display in the scene.
     */
    constructor(config, views, nav) {
        super();

        this.config = config;
        this.views = views;
        this.#nav = nav;

        this.#display = null;
        this.#layers = null;

        this.#nav.addEventListener('edit-branch', this.#onEditBranch);
        this.#nav.addEventListener('edit-frame', this.#onEditFrame);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#nav.removeEventListener('edit-branch', this.#onEditBranch);
        this.#nav.removeEventListener('edit-frame', this.#onEditFrame);

        this.#layers?.removeEventListener('layer-activate', this.#onLayerActivate);
    }

    /**
     * Binds a display to this context.
     * 
     * @param {SceneDisplay<WM>} display The display to bind.
     * @returns {Promise<void>} A promise representing the task.
     */
    async bindDisplay(display) {
        this.#display = display;
    }

    /**
     * Binds a collection of layers to this context, and initializes them such that
     * the data displayed corresponds to the current frame.
     * 
     * @param {LayerCollection<WM>} layers The collection of layers to bind.
     * @returns {Promise<void>} A promise representing the task.
     */
    async bindLayers(layers) {
        this.#layers?.removeEventListener('layer-activate', this.#onLayerActivate);

        this.#layers = layers;
        this.#layers.addEventListener('layer-activate', this.#onLayerActivate);

        await this.displayFrame(this.currentFrame);
    }

    /**
     * Tests if a layer is the currently active one.
     * 
     * @param {SceneLayer<WM>} layer The query layer.
     * @returns {boolean} `true` if the given layer is currently active; otherwise, `false`.
     */
    isLayerActive(layer) {
        if (this.#layers == null) return false;

        return this.#layers.activeLayer === layer;
    }

    /**
     * Requests that data be loaded in memory for a frame (in the current branch).
     * 
     * Unlike {@link SceneContext#displayFrame}, the frame is not actually displayed to the user.
     * However, subsequently calling {@link SceneContext#displayFrame} should almost immediately
     * display the frame, since the data has already been loaded (unless the cache has expired).
     * 
     * Requires that this context be bound to a {@link LayerCollection}
     * (see {@link SceneContext#bindLayers}).
     * 
     * @param {EditableFrame} frame The frame to load.
     * @returns {Promise<void>} A promise representing the task.
     */
    async requireFrame(frame) {
        const { layers: { dataLayers } } = this;

        await Promise.all(dataLayers.map((layer) => layer.dataView.getData(frame)));
    }

    /**
     * Ensures that all navigation operations are run sequentially.
     * 
     * @type {Queue<symbol>}
     */
    #navQueue = new Queue(1, 0);

    /**
     * `true` if a navigation operation is currently in progress.
     * 
     * @type {boolean}
     */
    get isNavigating() {
        const { waiting, running } = this.#navQueue.stat();
        return waiting > 0 || running > 0;
    }

    /**
     * Runs a navigation operation inside the lock.
     * 
     * @param {() => Promise<void>} navFn A function that (directly or indirectly) sets
     * {@link SceneContext#currentFrame} and/or {@link SceneContext#currentLabelBranch}.
     * @returns {Promise<void>} A promise representing the task.
     */
    async #runInNavContext(navFn) {
        return this.#navQueue.run(async () => {
            this.dispatchEvent({ type: 'isNavigating-changed' });

            const prevFrame = this.currentFrame;
            const prevSourceGroup = this.currentSourceGroup;
            const prevLabelBranch = this.currentLabelBranch;

            await navFn();

            const currentFrame = this.currentFrame;
            const currentSourceGroup = this.currentSourceGroup;
            const currentLabelBranch = this.currentLabelBranch;

            if (prevFrame?.id !== currentFrame?.id) {
                // Run this in the background; do not await
                currentFrame?.updateLastViewedAt();

                this.dispatchEvent({
                    type: 'nav-frame',
                    prevFrame: prevFrame,
                    frame: currentFrame,
                });

                const { layers: { dataLayers } } = this;

                await Promise.all(dataLayers.map((layer) => layer.dataView.setFrame(currentFrame)));
            }

            if (prevSourceGroup?.id !== currentSourceGroup?.id) {
                this.dispatchEvent({
                    type: 'nav-source-group',
                    prevGroup: prevSourceGroup,
                    group: currentSourceGroup,
                });
            }

            if (prevLabelBranch?.id !== currentLabelBranch?.id) {
                this.dispatchEvent({
                    type: 'nav-label-branch',
                    prevBranch: prevLabelBranch,
                    branch: currentLabelBranch,
                });
            }
        }).finally(() => {
            this.dispatchEvent({ type: 'isNavigating-changed' });
        });
    }

    /**
     * Sets the active task, then displays the first available frame.
     * 
     * Requires that this context be bound to a {@link LayerCollection}
     * (see {@link SceneContext#bindLayers}).
     * 
     * @param {?TaskState} task The task to set.
     */
    async displayTask(task) {
        await this.#runInNavContext(async () => {
            await this.#nav.loadTask(task);
        });
    }

    /**
     * Sets the active task, then displays the first available frame.
     * 
     * Requires that this context be bound to a {@link LayerCollection}
     * (see {@link SceneContext#bindLayers}).
     * 
     * @param {?number} taskId The unique identifier of the task to set.
     */
    async displayTaskById(taskId) {
        await this.#runInNavContext(async () => {
            await this.#nav.loadTaskById(taskId);
        });
    }

    /**
     * Sets the active source group, then displays the first available frame.
     * 
     * Concurrent calls to this method are run sequentially.
     * 
     * Requires that this context be bound to a {@link LayerCollection}
     * (see {@link SceneContext#bindLayers}).
     * 
     * @param {?SourceGroupState} group The source group to display.
     */
    async displaySourceGroup(group) {
        await this.#runInNavContext(async () => {
            await this.#nav.loadSourceGroup(group);
        });
    }

    /**
     * Sets the active label branch, then displays the first available frame.
     * 
     * Concurrent calls to this method are run sequentially.
     * 
     * Requires that this context be bound to a {@link LayerCollection}
     * (see {@link SceneContext#bindLayers}).
     * 
     * @param {?EditableBranch} branch The label branch to display.
     */
    async displayLabelBranch(branch) {
        await this.#runInNavContext(async () => {
            await this.#nav.loadLabelBranch(branch);
        });
    }

    /**
     * Loads and displays a frame to the user (in the current branch).
     * 
     * Concurrent calls to this method are run sequentially.
     * 
     * Requires that this context be bound to a {@link LayerCollection}
     * (see {@link SceneContext#bindLayers}).
     * 
     * @param {?EditableFrame} frame The frame to display.
     */
    async displayFrame(frame) {
        await this.#runInNavContext(async () => {
            await this.#nav.loadFrame(frame);
        });
    }

    /**
     * Loads and displays a frame to the user (in the current branch).
     * 
     * Concurrent calls to this method are run sequentially.
     * 
     * Requires that this context be bound to a {@link LayerCollection}
     * (see {@link SceneContext#bindLayers}).
     * 
     * @param {?number} frameId The unique identifier of the frame to display.
     */
    async displayFrameById(frameId) {
        await this.#runInNavContext(async () => {
            await this.#nav.loadFrameById(frameId);
        });
    }

    /**
     * Loads and displays the frame that most closely matches a set of selectors
     * to the user (in the current branch).
     * 
     * Concurrent calls to this method are run sequentially.
     * 
     * @param {FrameSelectors} selectors For each axis, the value to match against.
     * If an axis is omitted, the corresponding value of the current frame is used.
     */
    async displayFrameFromCurrent(selectors) {
        await this.#runInNavContext(async () => {
            await this.#nav.loadFrameFromCurrent(selectors);
        });
    }
}
