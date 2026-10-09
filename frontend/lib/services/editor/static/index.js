/**
 * Contains the entry points for the annotation editor frontend.
 * 
 * Note: Only the portions meant to be used by downstream/plugin libraries
 * are exported from this module.
 * 
 * @module sta/services/editor/static
 */

import 'jquery';
import 'jstree';
import 'jstree/dist/themes/default-dark/style.min.css';

/**
 * @typedef {import('../lib/base').WindowMapper} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('../lib/base').App<WM>} App
 */

/**
 * @typedef {object} LoadOptions
 * @property {'annotate' | 'review'} mode The mode of the application.
 * @property {number} [taskId] Pre-selects the task with the given unique identifier.
 * @property {number} [frameId] Pre-selects the frame with the given unique identifier.
 */

/**
 * Initializes the editor interface and appends it to the given DOM element.
 * 
 * Plugin libraries can create a page that browses data items by including a script that calls
 * this function by invoking {@link loadEditor} in {@link window.onload}.
 * 
 * (The script is included in `python/sta_services/editor/templates/base.html`.)
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @param {HTMLElement} dom The element to append the interface to.
 * @param {LoadOptions} loadOptions The options to apply when loading the interface.
 * @param {App<WM>} app Contains the interface to append.
 */
export async function initApp(dom, loadOptions, app) {
    try {
        dom.appendChild(app.dom);

        const { context, menus } = app;
        const { taskId: loadTaskId, frameId: loadFrameId } = loadOptions;

        try {
            const loadTask = context.tasks.elements.find((task) => task.id === loadTaskId);

            if (loadTask == null) {
                const firstTask = context.tasks.elements.at(0) ?? null;
                await context.displayTask(firstTask);
            } else {
                await context.displayTaskById(loadTask.id);
            }
        } catch (error) {
            // Should still load the application
            console.warn('Unable to set initial task:');
            console.warn(error);
        }

        try {
            if (context.currentTaskId != null) {
                const frames = await context.views.getFrames(context.currentTaskId, null, null);
                const loadFrame = frames.find((frame) => frame.id === loadFrameId);

                if (loadFrame == null) {
                    const firstSourceGroup = context.sourceGroups.elements.at(0) ?? null;
                    await context.displaySourceGroup(firstSourceGroup);

                    const firstLabelBranch = context.labelBranches.elements.at(0) ?? null;
                    await context.displayLabelBranch(firstLabelBranch);

                    const sortFunc = menus.project.playback.sortFunc;
                    const firstFrame = sortFunc.sortedFrames(context.frames).at(0) ?? null;
                    await context.displayFrame(firstFrame);
                } else {
                    const loadSourceGroup = context.sourceGroups.elements
                        .find((group) => group.id === loadFrame.source_group_id) ?? null;
                    await context.displaySourceGroup(loadSourceGroup);

                    const loadLabelBranch = context.labelBranches.elements
                        .find((branch) => branch.id === loadFrame.label_branch_id) ?? null;
                    await context.displayLabelBranch(loadLabelBranch);

                    await context.displayFrameById(loadFrame.id);
                }
            }
        } catch (error) {
            // Should still load the application
            console.warn('Unable to set initial frame:');
            console.warn(error);
        }
    } catch (error) {
        console.error('Unable to load the application:', error);
        alert(`Failed to load the application. Please reload the window.\n\n${error}`);

        throw error;
    }
}

/**
 * Loads the editor interface in the current webpage.
 * 
 * The script bundle should call this function when the page is loaded.
 * 
 * @param {(dom: HTMLElement, loadOptions: LoadOptions) => Promise<void>} showFn
 * A function that displays the interface.
 */
export async function loadEditor(showFn) {
    const main = document.body.querySelector('main');
    if (!(main instanceof HTMLElement)) {
        throw new Error('Cannot find main element');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const urlOptions = {
        taskId: Number(urlParams.get('task_id') ?? undefined),
        frameId: Number(urlParams.get('frame_id') ?? undefined),
    };

    /** @type {LoadOptions} */
    const options = {
        // @ts-expect-error
        mode: $EDITOR_MODE,
        taskId: Number.isNaN(urlOptions.taskId) ? undefined : urlOptions.taskId,
        frameId: Number.isNaN(urlOptions.frameId) ? undefined : urlOptions.frameId,
    };

    await showFn(main, options);
}
