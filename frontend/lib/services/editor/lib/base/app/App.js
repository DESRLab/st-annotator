import * as THREE from 'three';
import WEBGL from 'three/examples/jsm/capabilities/WebGL';
import Stats from 'three/examples/jsm/libs/stats.module';

import { SceneRenderer } from '../scene';
import { DraggablePanel } from '../widgets';

import { ComposableKeybindHandler, KeybindHandlerGlobalContext } from './Keybinds';
import { ControlsMenu } from './widgets';

/**
 * @typedef {import('../scene').WindowMapper} WindowMapper
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('../scene').LayerCollection<WM>} LayerCollection
 */

/**
 * @template {WindowMapper} WM
 * @typedef {import('../scene').SceneContext<WM>} SceneContext
 */

/**
 * @typedef {import('./widgets').LayersMenu} LayersMenu
 */

/**
 * @typedef {import('./widgets').ProjectMenu} ProjectMenu
 */

/**
 * @typedef {import('./widgets').ObjectTreeMenu} ObjectTreeMenu
 */

/**
 * @typedef {import('./widgets').PreferencesMenu} PreferencesMenu
 */

/**
 * @typedef {import('./widgets').ToolsMenu} ToolsMenu
 */

/**
 * @typedef {import('./widgets').Menu} Menu
 */

/**
 * @typedef {import('./Keybinds').Keybind} Keybind
 */

/**
 * @typedef {Record<keyof MenuMapper, HTMLDivElement>} PanelsContent
 */

/**
 * @typedef {object} AppViewParams
 * @property {HTMLDivElement} displayElem Displays the `three.js` scene.
 * @property {HTMLDivElement} layersOverlay Contains the overlay of each layer.
 * @property {PanelsContent} panelsContent Contains the content of each panel.
 * @property {HTMLDivElement} statsElem Displays the performance monitor.
 */

/**
 * View class for {@link App}.
 */
export class AppView {

    /**
     * The DOM element representing the application.
     * 
     * @readonly
     * @type {HTMLDivElement}
     */
    dom;

    /**
     * @readonly
     * @type {Record<keyof PanelsContent, DraggablePanel>}
     */
    #panels;

    /**
     * Observes the DOM of this object for resize events.
     * 
     * @readonly
     * @type {ResizeObserver}
     */
    #observer;

    /**
     * Displays a hint to the user.
     * 
     * @readonly
     * @type {HTMLSpanElement}
     */
    #hintDom;

    /**
     * The text to display as a hint to the user.
     * 
     * @type {string}
     */
    get hintText() { return this.#hintDom.innerHTML; }

    set hintText(value) { this.#hintDom.innerHTML = value; }

    /**
     * Aligns the panels in the application.
     */
    #alignPanels = () => {
        this.#panels.project.alignTop().alignLeft();

        this.#panels.tools.alignCenterVertical().alignLeft();

        this.#panels.controls.alignTop().alignRight();

        this.#panels.prefs.alignBottom().alignLeft();
        this.#panels.prefs.top -= 160;

        this.#panels.layers.alignBottom().alignRight();
    };

    /**
     * Creates a view for a {@link App}.
     * 
     * @param {AppViewParams} params The parameters to pass to the view.
     */
    constructor(params) {
        this.dom = document.createElement('div');
        this.dom.className = 'app';

        if (!WEBGL.isWebGL2Available()) {
            this.dom.appendChild(WEBGL.getWebGL2ErrorMessage());
        } else {
            this.dom.appendChild(params.displayElem);
        }

        this.dom.appendChild(params.layersOverlay);

        const panelsContent = params.panelsContent;

        const projectPanel = new DraggablePanel({
            title: 'Project',
            content: panelsContent.project,
        });
        panelsContent.project.style.width = '384px';
        panelsContent.project.style.maxHeight = '360px';

        const toolsPanel = new DraggablePanel({
            title: 'Tools',
            content: panelsContent.tools,
        });
        panelsContent.tools.style.width = '384px';
        panelsContent.tools.style.maxHeight = '160px';

        const prefsPanel = new DraggablePanel({
            title: 'Preferences',
            content: panelsContent.prefs,
        });
        panelsContent.prefs.style.width = '384px';
        panelsContent.prefs.style.maxHeight = '240px';

        const layersPanel = new DraggablePanel({
            title: 'Layers',
            content: panelsContent.layers,
        });
        panelsContent.layers.style.width = '384px';
        panelsContent.layers.style.maxHeight = '240px';

        const controlsPanel = new DraggablePanel({
            title: 'Controls',
            content: panelsContent.controls,
        });
        controlsPanel.dom.style.width = '384px';
        controlsPanel.dom.style.maxHeight = '240px';

        this.#panels = {
            project: projectPanel,
            tools: toolsPanel,
            prefs: prefsPanel,
            layers: layersPanel,
            controls: controlsPanel,
        };

        for (const panel of Object.values(this.#panels)) {
            this.dom.appendChild(panel.dom);
        }

        this.#observer = new ResizeObserver(this.#alignPanels);
        this.#observer.observe(this.dom);

        const topMid = document.createElement('div');
        topMid.className = 'top-mid';
        {
            const hintContainer = document.createElement('div');
            hintContainer.className = 'hint';
            {
                this.#hintDom = document.createElement('span');
                hintContainer.appendChild(this.#hintDom);
            }
            topMid.appendChild(hintContainer);
        }
        this.dom.appendChild(topMid);

        this.dom.appendChild(params.statsElem);

        this.#alignPanels();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#observer.unobserve(this.dom);

        for (const panel of Object.values(this.#panels)) {
            panel.dispose();
        }
    }
}

/**
 * @typedef {object} MenuMapper
 * @property {ProjectMenu} project The controller for the Project panel.
 * @property {ToolsMenu} tools The controller for the Tools panel.
 * @property {PreferencesMenu} prefs The controller for the Preferences panel.
 * @property {LayersMenu} layers The controller for the Layers panel.
 * @property {ControlsMenu} controls The controller for the Controls panel.
 */

/**
 * Interface through which components can control the active scene.
 * 
 * @template {WindowMapper} WM The windows defined in the scene display.
 */
export class App {

    /**
     * @readonly
     * @type {AppView}
     */
    #view;

    /**
     * The DOM element containing this application.
     * 
     * @type {HTMLDivElement}
     */
    get dom() { return this.#view.dom; }

    /**
     * A handle to the state of the scene in this application.
     * 
     * @readonly
     * @type {SceneContext<WM>}
     */
    context;

    /**
     * Contains each layer in this application.
     * 
     * @readonly
     * @type {LayerCollection<WM>}
     */
    layers;

    /**
     * Contains each menu in this application.
     * 
     * @readonly
     * @type {MenuMapper}
     */
    menus;

    /**
     * @readonly
     * @type {KeybindHandlerGlobalContext}
     */
    #keydownGlobalCtx;

    /**
     * Handles the event when a key is pressed in this application.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     */
    keydownHandler;

    /**
     * @readonly
     * @type {KeybindHandlerGlobalContext}
     */
    #keyupGlobalCtx;

    /**
     * Handles the event when a key is released in this application.
     * 
     * @readonly
     * @type {ComposableKeybindHandler}
     */
    keyupHandler;

    /**
     * Contains all `three.js` objects to display in the application.
     * 
     * @readonly
     * @type {THREE.Scene}
     */
    #scene;

    /**
     * Renders the scene in this application.
     * 
     * @readonly
     * @type {SceneRenderer<WM>}
     */
    #renderer;

    /**
     * The JavaScript performance monitor of the application.
     * 
     * @type {Stats}
     */
    #stats;

    /**
     * Handles the event the window is about to be unloaded.
     * 
     * @param {BeforeUnloadEvent} event The event to handle.
     * @returns {string} If not empty, displays a prompt with this text to the user.
     */
    #onBeforeUnload = (event) => {
        if (this.context.hasUnsavedChanges) {
            event.returnValue = 'Are you sure you want to leave the page? Some labelsets still have unsaved changes.';

            event.preventDefault();
            event.stopPropagation();
        }

        return event.returnValue;
    };

    /**
     * Creates a new application instance.
     * 
     * @param {SceneContext<WM>} context A handle to the state of the scene.
     * @param {LayerCollection<WM>} layers Contains each layer in this application.
     * @param {Omit<MenuMapper, 'controls'>} menus Contains each menu in this application.
     * (Except for the controls menu; that one is created by the application object.)
     */
    constructor(context, layers, menus) {
        this.context = context;
        this.layers = layers;
        this.menus = {
            ...menus,
            controls: new ControlsMenu({
                Project: menus.project.keydownHandler,
                Tools: menus.tools.keydownHandler,
                Preferences: menus.prefs.keydownHandler,
                Layers: menus.layers.keydownHandler,
            }, layers),
        };

        this.#scene = new THREE.Scene();
        this.#scene.add(this.layers.objects);

        this.#renderer = new SceneRenderer(this.context.display);

        this.#stats = new Stats();
        this.#stats.dom.style.removeProperty('left');
        this.#stats.dom.style.setProperty('right', '0');

        this.#view = new AppView({
            displayElem: this.context.display.dom,
            layersOverlay: this.layers.overlays,
            panelsContent: {
                project: this.menus.project.dom,
                tools: this.menus.tools.dom,
                prefs: this.menus.prefs.dom,
                layers: this.menus.layers.dom,
                controls: this.menus.controls.dom,
            },
            statsElem: this.#stats.dom,
        });

        window.addEventListener('beforeunload', this.#onBeforeUnload);

        this.keydownHandler = new ComposableKeybindHandler([], [
            ...Object.values(this.menus).map(({ keydownHandler }) => keydownHandler),
            this.layers.keydownHandler,
        ]);
        this.keyupHandler = new ComposableKeybindHandler([], [
            ...Object.values(this.menus).map(({ keyupHandler }) => keyupHandler),
            this.layers.keyupHandler,
        ]);

        this.#keydownGlobalCtx = new KeybindHandlerGlobalContext(this.keydownHandler, 'keydown');
        this.#keyupGlobalCtx = new KeybindHandlerGlobalContext(this.keyupHandler, 'keyup');

        this.#animate();
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#keydownGlobalCtx.dispose();
        this.#keyupGlobalCtx.dispose();

        this.keydownHandler.dispose();
        this.keyupHandler.dispose();

        window.removeEventListener('beforeunload', this.#onBeforeUnload);

        for (const menu of Object.values(this.menus)) {
            menu.dispose();
        }

        this.layers.dispose();

        this.context.dispose();
    }

    /**
     * Gets the text to display as a hint to the user.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @returns {string} The requested hint.
     */
    getHint() {
        if (this.context.currentFrame == null) {
            if (this.menus.project.task == null) {
                return 'Choose a task to open';
            }
            if (this.menus.project.labelBranch == null) {
                return 'Choose a branch to open';
            }

            return 'Select a frame to open';
        }

        return this.layers.getHint();
    }

    /**
     * Begins the rendering loop.
     */
    #animate = () => {
        this.render();
    };

    /**
     * Updates the display in this application.
     * 
     * It is called during each animation frame.
     */
    render() {
        window.requestAnimationFrame(this.#animate);

        this.#stats.begin();

        this.layers.render();
        this.#renderer.render(this.#scene);

        this.#view.hintText = this.getHint();

        this.#stats.end();
    }
}
