import { TabberPaneController } from '../../widgets';
import { getKeybindHTMLText } from '../Keybinds';

import { LayerBasedView } from './LayerBasedView';
import { BaseMenu } from './Menu';

/**
 * @typedef {import('../../scene').LayerCollection<any>} LayerCollection
 */

/**
 * @typedef {import('../Keybinds').ComposableKeybindHandler} ComposableKeybindHandler
 */

/**
 * @typedef {import('../Keybinds').Keybind} Keybind
 */

/**
 * @typedef {import('./Menu').Menu} Menu
 */

/**
 * Displays the available controls in the application.
 * 
 * TODO: Dynamically update the list based on a registry.
 */
export class ControlsMenu extends BaseMenu {

    /**
     * Gets the HTML text to display in a section listing a collection of keybinds.
     * 
     * @param {string} title The title of the section.
     * @param {ReadonlyArray<Keybind>} keybinds The keybinds to include in the section.
     * @returns {string} Returns the resulting HTML text.
     */
    static getControlsSectionHtmlText(title, keybinds) {
        return [`<b>${title}</b>`]
            .concat(keybinds.map((keybind) => getKeybindHTMLText(keybind)))
            .join('<br>');
    }

    /**
     * An accordion containing each sub-menu.
     * 
     * @readonly
     * @type {TabberPaneController}
     */
    #accordion;

    /**
     * Contains each handler which keybinds to display in the General tab,
     * keyed by their section titles.
     * 
     * @readonly
     * @type {Record<string, ComposableKeybindHandler>}
     */
    generalHandlers;

    /**
     * @type {HTMLDivElement}
     */
    #generalControlsDom;

    #getGeneralControlsHtmlText() {
        /**
         * @type {string[]}
         */
        const lines = [];

        for (const [title, { children, keybinds }] of Object.entries(this.generalHandlers)) {
            const keybindsArr = [...keybinds]
                .concat(children.flatMap(({ keybinds: kb }) => [...kb]));

            if (keybindsArr.length > 0) {
                lines.push(ControlsMenu.getControlsSectionHtmlText(title, keybindsArr));
                lines.push('');
            }
        }

        return lines.join('<br>');
    }

    #updateGeneralControls = () => {
        const controlsContent = document.createElement('div');
        controlsContent.style.width = '100%';
        controlsContent.style.paddingLeft = 'var(--cnt-h-p)';
        controlsContent.innerHTML = this.#getGeneralControlsHtmlText();

        this.#generalControlsDom.replaceChildren(controlsContent);
    };

    /**
     * @readonly
     * @type {LayerBasedView}
     */
    #layerControls;

    /**
     * Contains each layer in the application.
     * 
     * @type {LayerCollection}
     */
    get layers() { return this.#layerControls.layers; }

    /**
     * Creates a new menu for the controls of the application.
     * 
     * @param {Record<string, ComposableKeybindHandler>} generalHandlers Contains each
     * handler which keybinds to display in the General tab, keyed by their section
     * titles.
     * @param {LayerCollection} layers Contains each layer in the application.
     */
    constructor(generalHandlers, layers) {
        super();

        this.dom.style.width = '100%';
        this.dom.className = 'keybinds';

        this.generalHandlers = generalHandlers;
        this.#layerControls = new LayerBasedView(layers, (layer) => layer.controlsElem);

        this.#generalControlsDom = document.createElement('div');
        this.#generalControlsDom.innerHTML = this.#getGeneralControlsHtmlText();

        for (const keybindHandler of Object.values(this.generalHandlers)) {
            keybindHandler.addEventListener('change', this.#updateGeneralControls);
        }

        this.#accordion = TabberPaneController.create(
            this.dom,
            {
                General: this.#generalControlsDom,
                Layer: this.#layerControls.dom,
            },
        );
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        for (const keybindHandler of Object.values(this.generalHandlers)) {
            keybindHandler.removeEventListener('change', this.#updateGeneralControls);
        }

        this.#accordion.dispose();

        super.dispose();
    }
}
