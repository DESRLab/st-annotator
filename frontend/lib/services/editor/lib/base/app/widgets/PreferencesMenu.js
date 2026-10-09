import { TabberPaneController } from '../../widgets';

import { LayerBasedView } from './LayerBasedView';
import { BaseMenu, Menu } from './Menu';

/**
 * @typedef {import('../../scene').LayerCollection<any>} LayerCollection
 */

/**
 * Interface for objects that represent a menu that displays the preferences of the application.
 * 
 * @interface
 */
export class PreferencesMenu extends Menu {}

/**
 * Displays the preferences of the application.
 * 
 * @implements {PreferencesMenu}
 */
export class BasePreferencesMenu extends BaseMenu {

    /**
     * An accordion containing each sub-menu.
     * 
     * @readonly
     * @type {TabberPaneController}
     */
    #accordion;

    /**
     * @readonly
     * @type {LayerBasedView}
     */
    #layerPrefs;

    /**
     * Contains each layer in the application.
     * 
     * @type {LayerCollection}
     */
    get layers() { return this.#layerPrefs.layers; }

    /**
     * Contains each sub-menu for settings that are applied
     * regardless of the active layer.
     * 
     * @readonly
     * @type {Record<string, HTMLElement>}
     */
    globalSettingsTabs;

    /**
     * Creates a new menu for the preferences of the application.
     * 
     * @param {LayerCollection} layers Contains each layer in the application.
     * @returns {PreferencesMenu} The newly created menu.
     */
    static create(layers) {
        return new BasePreferencesMenu(layers);
    }

    /**
     * Creates a new menu for the preferences of the application.
     * 
     * @param {LayerCollection} layers Contains each layer in the application.
     * @param {Record<string, HTMLElement>} globalSettingsTabs Contains each sub-menu for
     * settings that are applied regardless of the active layer.
     */
    constructor(layers, globalSettingsTabs = {}) {
        super();

        if ('Layer' in globalSettingsTabs) {
            throw new Error('This class generates a tab called "Layer", which conflicts with the one given in `globalSettingsTabs`');
        }

        this.#layerPrefs = new LayerBasedView(layers, (layer) => layer.prefsElem);
        this.globalSettingsTabs = globalSettingsTabs;

        this.#accordion = TabberPaneController.create(
            this.dom,
            {
                ...globalSettingsTabs,
                Layer: this.#layerPrefs.dom,
            },
        );
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     */
    dispose() {
        this.#layerPrefs.dispose();

        this.#accordion.dispose();

        super.dispose();
    }
}
