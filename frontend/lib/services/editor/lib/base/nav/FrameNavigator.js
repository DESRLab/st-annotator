import * as THREE from 'three';

import { TypeUtils } from '../../../../../common/lib/utils';

import { ProjectNavigator } from './ProjectNavigator';
import { SceneNavigator } from './SceneNavigator';
import { LabelsetNavigator } from './LabelsetNavigator';
import { SourcesetNavigator } from './SourcesetNavigator';

/**
 * @typedef {import('../../../../../common/lib/spatial').CoordBounds} CoordBounds
 */

/**
 * @typedef {import('../../../../../common/lib/utils').Timestamp} Timestamp
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
 * @typedef {import('../views').EditorViews} EditorViews
 */

/**
 * @typedef {import('./EditableFrame').EditableFrame} EditableFrame
 */

/**
 * @typedef {import('./ProjectNavigator').TaskIndex} TaskIndex
 */

/**
 * @typedef {import('./SourcesetNavigator').SourceGroupIndex} SourceGroupIndex
 */

/**
 * @typedef {import('./LabelsetNavigator').LabelsetBranchIndex} LabelsetBranchIndex
 */

/**
 * @typedef {import('./SceneNavigator').FrameIndex} FrameIndex
 */

/**
 * Defines each event that can be dispatched by {@link FrameNavigator}.
 * 
 * @typedef {object} FrameNavigatorEventMap
 * @property {{}} change The event when the state of the navigator has been updated.
 * @property {{ branch: EditableBranch }} edit-branch The event when a branch in the navigator
 * has been edited.
 * @property {{ frame: EditableFrame }} edit-frame The event when a frame in the navigator
 * has been edited.
 */

/**
 * @typedef {{
 *     xBounds?: ?CoordBounds;
 *     yBounds?: ?CoordBounds;
 *     zBounds?: ?CoordBounds;
 *     tBounds?: ?CoordBounds;
 *     xCenter?: ?number;
 *     yCenter?: ?number;
 *     zCenter?: ?number;
 *     tCenter?: ?Timestamp;
 * }} FrameSelectors
 */

/**
 * Navigates between frames in the application.
 * 
 * @augments {THREE.EventDispatcher<FrameNavigatorEventMap>}
 */
export class FrameNavigator extends THREE.EventDispatcher {

    /**
     * The interface of the application with the server.
     * 
     * @readonly
     * @type {EditorViews}
     */
    views;

    /**
     * Navigates between tasks in the active project.
     * 
     * @readonly
     * @type {ProjectNavigator}
     */
    #projectNav;

    /**
     * The tasks available to the project.
     * 
     * @type {TaskIndex}
     */
    get tasks() { return this.#projectNav.tasks; }

    /**
     * The number of tasks available to the project.
     * 
     * @type {number}
     */
    get numTasks() { return this.#projectNav.numTasks; }

    /**
     * The currently selected task, or `null` if none.
     * 
     * @type {?TaskState}
     */
    get task() { return this.#projectNav.task; }

    /**
     * The unique identifier of the selected task;
     * set this property to select the corresponding task.
     * 
     * @type {?number}
     */
    get taskId() { return this.#projectNav.taskId; }

    /**
     * Selects and loads a task, along with its associated source groups and label branches.
     * 
     * @param {?TaskState} task The task to load.
     * @returns {Promise<void>} A promise that resolves when the given task and its
     * associated source groups and label branches have been loaded.
     */
    async loadTask(task) {
        if (this.task?.id === task?.id) return;
        if (this.#projectNav == null) return;

        const prevFrame = this.frame;

        this.#projectNav.task = task;

        await Promise.all([
            this.#loadSourcesetNav(this.task),
            this.#loadLabelsetNav(this.task),
        ]);

        if (prevFrame) {
            const closestFrame = this.#findClosestFrame(prevFrame);
            if (closestFrame) {
                await this.loadFrame(closestFrame);
                return;     // Avoid repeated 'change' event
            }
        }

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * Selects and loads a task, along with its associated source groups and label branches.
     * 
     * @param {?number} taskId The unique identifier of the task to load.
     * @returns {Promise<void>} A promise that resolves when the given task and its
     * associated source groups and label branches have been loaded.
     */
    async loadTaskById(taskId) {
        if (this.taskId === taskId) return;
        if (this.#projectNav == null) return;

        this.#projectNav.taskId = taskId;

        await Promise.all([
            this.#loadSourcesetNav(this.task),
            this.#loadLabelsetNav(this.task),
        ]);

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * Navigates between sourcesets in the active task.
     * 
     * @readonly
     * @type {SourcesetNavigator}
     */
    #sourcesetNav;

    async #unloadSourcesetNav() {
        await this.#sourcesetNav.load(null);
    }

    /**
     * Loads the wrapped sourceset navigator.
     * 
     * @param {?TaskState} task The task which the sourceset is based on.
     */
    async #loadSourcesetNav(task) {
        this.#unloadSourcesetNav();

        if (task != null) {
            await this.#sourcesetNav.load(task.id);
        }

        await this.#loadSceneNav(this.task, this.sourceGroup, this.labelBranch);
    }

    /**
     * The branches available to the task.
     * 
     * @type {SourceGroupIndex}
     */
    get sourceGroups() { return this.#sourcesetNav.groups; }

    /**
     * The number of branches available to the task.
     * 
     * @type {number}
     */
    get numSourceGroups() { return this.#sourcesetNav.numGroups; }

    /**
     * The currently selected source group, or `null` if none.
     * 
     * @type {?SourceGroupState}
     */
    get sourceGroup() { return this.#sourcesetNav.group; }

    /**
     * Selects and loads a source group.
     * 
     * @param {?SourceGroupState} group The group to load.
     * @returns {Promise<void>} A promise that resolves when the given group and its
     * associated frames have been loaded.
     */
    async loadSourceGroup(group) {
        if (this.sourceGroup?.id === group?.id) return;
        if (this.#sourcesetNav == null) return;

        const prevFrame = this.frame;

        this.#sourcesetNav.group = group;

        await this.#loadSceneNav(this.task, this.sourceGroup, this.labelBranch);

        if (prevFrame) {
            const closestFrame = this.#findClosestFrame(prevFrame);
            if (closestFrame) {
                await this.loadFrame(closestFrame);
                return;     // Avoid repeated 'change' event
            }
        }

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * Navigates between labelsets in the active task.
     * 
     * @readonly
     * @type {LabelsetNavigator}
     */
    #labelsetNav;

    /**
     * Each callback, when called, disposes of an event listener.
     * 
     * @type {(() => void)[]}
     */
    #disposeBranchEditCallbacks = [];

    async #unloadLabelsetNav() {
        for (const disposeBranchEdit of this.#disposeBranchEditCallbacks) {
            disposeBranchEdit();
        }

        await this.#labelsetNav.load(null);
    }

    /**
     * Loads the wrapped labelset navigator.
     * 
     * @param {?TaskState} task The task which the labelset is based on.
     */
    async #loadLabelsetNav(task) {
        this.#unloadLabelsetNav();

        if (task != null) {
            await this.#labelsetNav.load(task.id);

            for (const branch of this.#labelsetNav.branches.elements) {
                const handler = () => this.dispatchEvent({ type: 'edit-branch', branch: branch });

                branch.addEventListener('afterchange', handler);
                this.#disposeBranchEditCallbacks.push(() => {
                    branch.removeEventListener('afterchange', handler);
                });
            }
        }

        await this.#loadSceneNav(this.task, this.sourceGroup, this.labelBranch);
    }

    /**
     * The label branches available to the task.
     * 
     * @type {LabelsetBranchIndex}
     */
    get labelBranches() { return this.#labelsetNav.branches; }

    /**
     * The number of label branches available to the task.
     * 
     * @type {number}
     */
    get numLabelBranches() { return this.#labelsetNav.numBranches; }

    /**
     * `true` if any branch has unsaved changes; otherwise, `false`.
     * 
     * @type {boolean}
     */
    get hasUnsavedChanges() { return this.#labelsetNav.hasUnsavedChanges; }

    /**
     * The currently selected label branch, or `null` if none.
     * 
     * @type {?EditableBranch}
     */
    get labelBranch() { return this.#labelsetNav.branch; }

    /**
     * Selects and loads a label branch.
     * 
     * @param {?EditableBranch} branch The branch to load.
     * @returns {Promise<void>} A promise that resolves when the given branch and its
     * associated frames have been loaded.
     */
    async loadLabelBranch(branch) {
        if (this.labelBranch?.id === branch?.id) return;
        if (this.#labelsetNav == null) return;

        const prevFrame = this.frame;

        this.#labelsetNav.branch = branch;

        await this.#loadSceneNav(this.task, this.sourceGroup, this.labelBranch);

        if (prevFrame) {
            const closestFrame = this.#findClosestFrame(prevFrame);
            if (closestFrame) {
                await this.loadFrame(closestFrame);
                return;     // Avoid repeated 'change' event
            }
        }

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * Navigates between scenes in the active task.
     * 
     * @readonly
     * @type {SceneNavigator}
     */
    #sceneNav;

    /**
     * Each callback, when called, disposes of an event listener.
     * 
     * @type {(() => void)[]}
     */
    #disposeFrameEditCallbacks = [];

    async #unloadSceneNav() {
        for (const disposeFrameEdit of this.#disposeFrameEditCallbacks) {
            disposeFrameEdit();
        }

        await this.#sceneNav.load(null, null, null);
    }

    /**
     * Loads the wrapped scene navigator.
     * 
     * @param {?TaskState} task The task which the scene is based on.
     * @param {?SourceGroupState} sourceGroup The source group which the scene is based on.
     * @param {?EditableBranch} labelBranch The label branch which the scene is based on.
     */
    #loadSceneNav = async (task, sourceGroup, labelBranch) => {
        this.#unloadSceneNav();

        if (task != null && sourceGroup != null && labelBranch != null) {
            await this.#sceneNav.load(task.id, sourceGroup.id, labelBranch.id);

            for (const frame of this.#sceneNav.frames.elements) {
                const handler = () => this.dispatchEvent({ type: 'edit-frame', frame: frame });

                frame.addEventListener('edit', handler);
                this.#disposeBranchEditCallbacks.push(() => {
                    frame.removeEventListener('edit', handler);
                });
            }
        }
    };

    /**
     * The frames available to the task.
     * 
     * @type {FrameIndex}
     */
    get frames() { return this.#sceneNav.frames; }

    /**
     * The number of frames available to the task.
     * 
     * @type {number}
     */
    get numFrames() { return this.#sceneNav.numFrames; }

    /**
     * The currently selected frame, or `null` if none.
     * 
     * @type {?EditableFrame}
     */
    get frame() { return this.#sceneNav.frame; }

    /**
     * The unique identifier of the selected frame.
     * 
     * @type {?number}
     */
    get frameId() { return this.#sceneNav.frameId; }

    /**
     * Selects source data in the selected frame.
     * 
     * @type {?number}
     */
    get sourceGroupId() { return this.#sceneNav.sourceGroupId; }

    /**
     * Selects label data in the selected frame.
     * 
     * @type {?number}
     */
    get labelBranchId() { return this.#sceneNav.labelBranchId; }

    /**
     * The `x` boundaries of the selected frame.
     * 
     * @type {?CoordBounds}
     */
    get xBounds() { return this.#sceneNav.xBounds; }

    /**
     * The `y` boundaries of the selected frame.
     * 
     * @type {?CoordBounds}
     */
    get yBounds() { return this.#sceneNav.yBounds; }

    /**
     * The `z` boundaries of the selected frame.
     * 
     * @type {?CoordBounds}
     */
    get zBounds() { return this.#sceneNav.zBounds; }

    /**
     * The `t` boundaries of the selected frame.
     * 
     * @type {?CoordBounds}
     */
    get tBounds() { return this.#sceneNav.tBounds; }

    /**
     * The `x` center of the selected frame.
     * 
     * @type {?number}
     */
    get xCenter() { return this.#sceneNav?.xCenter; }

    /**
     * The `y` center of the selected frame.
     * 
     * @type {?number}
     */
    get yCenter() { return this.#sceneNav?.yCenter; }

    /**
     * The `z` center of the selected frame.
     * 
     * @type {?number}
     */
    get zCenter() { return this.#sceneNav?.zCenter; }

    /**
     * The `t` center of the selected frame.
     * 
     * @type {?Timestamp}
     */
    get tCenter() { return this.#sceneNav?.tCenter; }

    /**
     * Selects and loads a frame.
     * 
     * @param {?EditableFrame} frame The frame to load.
     * @returns {Promise<void>} A promise that resolves when the given frame has been loaded.
     */
    async loadFrame(frame) {
        if (this.frame?.id === frame?.id) return;
        if (this.#sceneNav == null) return;

        this.#sceneNav.frame = frame;

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * Selects and loads a frame.
     * 
     * @param {?number} frameId The unique identifier of the frame to load.
     * @returns {Promise<void>} A promise that resolves when the given frame has been loaded.
     */
    async loadFrameById(frameId) {
        if (this.frameId === frameId) return;
        if (this.#sceneNav == null) return;

        this.#sceneNav.frameId = frameId;

        this.dispatchEvent({ type: 'change' });
    }

    /**
     * Finds all frames that match the given selectors.
     * 
     * The results are sorted according to their distance from the current frame
     * from closest to furthest.
     * 
     * @param {FrameSelectors} selectors For each axis, the value to match against.
     * If an axis is omitted, the corresponding value of the current frame is used.
     * @param {number} idxTol Expands the search to potentially include frames that are not
     * exactly aligned along each axis. For each axis other than the given axis, if
     * its distance from the current frame is no greater than `idxTol` (in terms of index),
     * it is also included in the path; if multiple frames share the same value along the
     * given axis, only the frame with the shortest distance is included.
     * @returns {ReadonlyArray<EditableFrame>} An array of frames that
     * match the given selectors.
     */
    #findFramesFromCurrent(selectors, idxTol = 0) {
        /**
         * @type {<K extends keyof FrameSelectors>(obj: FrameSelectors, key: K
         * ) => Required<Pick<FrameSelectors, K>>[K]}
         */
        const getProp = (obj, key) => TypeUtils.getPropOrDefault(obj, key, this[key]);

        /**
         * @type {<K extends keyof FrameSelectors>(obj: FrameSelectors, key: K
         * ) => number}
         */
        const getIdxTol = (obj, key) => ((key in obj) ? 0 : idxTol);

        return this.frames.findInRangeOfValue(
            {
                xb: getProp(selectors, 'xBounds'),
                yb: getProp(selectors, 'yBounds'),
                zb: getProp(selectors, 'zBounds'),
                tb: getProp(selectors, 'tBounds'),
                xc: getProp(selectors, 'xCenter'),
                yc: getProp(selectors, 'yCenter'),
                zc: getProp(selectors, 'zCenter'),
                tc: getProp(selectors, 'tCenter'),
            },
            {
                xb: getIdxTol(selectors, 'xBounds'),
                yb: getIdxTol(selectors, 'yBounds'),
                zb: getIdxTol(selectors, 'zBounds'),
                tb: getIdxTol(selectors, 'tBounds'),
                xc: getIdxTol(selectors, 'xCenter'),
                yc: getIdxTol(selectors, 'yCenter'),
                zc: getIdxTol(selectors, 'zCenter'),
                tc: getIdxTol(selectors, 'tCenter'),
            },
        ).toSorted((a, b) => {
            const frame = this.frame;
            if (frame == null) return 0;

            const aDist = this.frames.frameIdxDistance(a, frame);
            const bDist = this.frames.frameIdxDistance(b, frame);

            return aDist - bDist;
        });
    }

    /**
     * Finds the frame that most closely matches the given selectors.
     * 
     * The results are sorted according to their distance from the current frame
     * from closest to furthest.
     * 
     * @param {EditableFrame} frame For each axis, the value to match against.
     * @returns {?EditableFrame} The closest frame, or `null` if no frames are available.
     */
    #findClosestFrame(frame) {
        return this.frames.elements.toSorted((a, b) => {
            const aDist = this.frames.frameIdxDistance(a, frame, { fuzzy: true });
            const bDist = this.frames.frameIdxDistance(b, frame, { fuzzy: true });

            return aDist - bDist;
        }).at(0) ?? null;
    }

    /**
     * Sets the current frame to the frame that most closely matches a set of selectors
     * to the user (in the current branch). Then, loads that frame.
     * 
     * @param {FrameSelectors} selectors For each axis, the value to match against.
     * If an axis is omitted, the corresponding value of the current frame is used.
     * @returns {Promise<void>} A promise that resolves when the given frame has been loaded.
     */
    async loadFrameFromCurrent(selectors) {
        if (this.#sceneNav == null) return;

        const [frame] = this.#findFramesFromCurrent(selectors, Number.MAX_SAFE_INTEGER);
        if (frame == null) {
            console.error(selectors);
            throw new Error('Cannot find matching frame');
        }

        await this.loadFrame(frame);
    }

    /**
     * Creates a new navigator for the application with its index already loaded.
     * 
     * @param {EditorViews} views The interface of the application with the server.
     * @returns {Promise<FrameNavigator>} A promise that resolves to the newly created
     * navigator.
     */
    static async create(views) {
        const nav = new FrameNavigator(views);

        await nav.load();

        return nav;
    }

    /**
     * Creates a new navigator for the application.
     * 
     * @protected
     * @param {EditorViews} views The interface of the application with the server.
     */
    constructor(views) {
        super();

        this.views = views;

        this.#projectNav = new ProjectNavigator(views);
        this.#sourcesetNav = new SourcesetNavigator(views);
        this.#labelsetNav = new LabelsetNavigator(views);
        this.#sceneNav = new SceneNavigator(views);
    }

    /**
     * Loads the index of this navigator.
     */
    async load() {
        await this.#projectNav.load();

        await this.loadTask(null);
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#unloadSceneNav();
        this.#unloadSourcesetNav();
        this.#unloadLabelsetNav();
    }
}
