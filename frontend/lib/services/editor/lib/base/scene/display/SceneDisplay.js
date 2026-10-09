/**
 * @typedef {import('three')} THREE
 */

/**
 * @typedef {import('./SceneWindow').SceneWindow} SceneWindow
 */

/**
 * @typedef {Record<string, SceneWindow>} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('../SceneContext').SceneContext<WM>} SceneContext
 */

/**
 * Interface for objects that define how a scene is displayed to the user.
 * 
 * @interface
 * @template {WindowMapper} WM The windows defined in the scene display.
 */
export class SceneDisplay {

    /**
     * A handle to the state of the scene.
     * 
     * @type {SceneContext<WM>}
     * @abstract
     */
    get context() { throw new Error('Not implemented'); }

    /**
     * The DOM element representing this display.
     * 
     * @type {HTMLDivElement}
     * @abstract
     */
    get dom() { throw new Error('Not implemented'); }

    /**
     * A canvas onto which each component window of this display is rendered.
     * 
     * @type {HTMLCanvasElement}
     * @abstract
     */
    get canvas() { throw new Error('Not implemented'); }

    /**
     * Contains each component window of this display.
     * 
     * @type {WM}
     * @abstract
     */
    get windows() { throw new Error('Not implemented'); }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * @abstract
     */
    dispose() {
        throw new Error('Not implemented');
    }
}

/**
 * Abstract base implementation of {@link SceneDisplay}.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 * @implements {SceneDisplay<WM>}
 */
export class BaseSceneDisplay {

    /**
     * A handle to the state of the scene.
     * 
     * @readonly
     * @type {SceneContext<WM>}
     */
    context;

    /**
     * The DOM element representing this display.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * A canvas onto which each component window of this display is rendered.
     * 
     * @readonly
     * @type {HTMLCanvasElement}
     */
    canvas;

    /**
     * Contains each component window of this display.
     * 
     * @readonly
     * @type {WM}
     */
    windows;

    /**
     * Creates a new default display.
     * 
     * @protected
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {WM} windows Contains each component window of this display.
     */
    constructor(context, windows) {
        this.context = context;

        this.dom = document.createElement('div');
        this.dom.id = 'display-container';
        this.dom.style.position = 'absolute';
        this.dom.style.top = '0';
        this.dom.style.left = '0';
        this.dom.style.width = '100%';
        this.dom.style.height = '100%';

        this.canvas = document.createElement('canvas');
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.dom.appendChild(this.canvas);

        this.windows = windows;
        for (const window of Object.values(windows)) {
            this.dom.appendChild(window.dom);
        }
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const window of Object.values(this.windows)) {
            window.dispose();
        }
    }
}
