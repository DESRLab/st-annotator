import { InteractState } from './InteractState';

/**
 * @template {MainWindowMapper} WM 
 * @typedef {import('./InteractContext').InteractContext<WM>} InteractContext
 */

/**
 * @typedef {import('./InteractState').MainWindowMapper} MainWindowMapper
 */

/**
 * @typedef {import('./InteractState').InteractContextUsage} InteractContextUsage
 */

/**
 * Represents the state when the user can select selection.
 * 
 * @template {MainWindowMapper} WM The windows defined in the scene display.
 * @augments InteractState<WM>
 */
export class SelectSelectionState extends InteractState {
    /**
     * Creates a new state instance.
     * 
     * This is called right before the state of the context is transitioned to this one.
     * 
     * @param {InteractContext<WM>} context The context containing this state.
     */
    constructor(context) {
        super({
            context: context,
            keydownBinds: [
                {
                    keyCombo: 'escape',
                    name: 'Cancel select selection',
                    handler: () => {
                        this.context.transitionNavigate();
                    },
                },
            ],
        });
    }

    /**
     * Disposes of this object. Do not use it afterwards.
     * 
     * This is called right before the state of the context is transitioned from this one.
     */
    dispose() {
        super.dispose();
    }

    /**
     * Specifies how this state uses the context.
     * 
     * This is called during each animation frame, and when an event is emitted by a component.
     * 
     * @param {boolean} isReadonly `true` if the labels cannot be edited; otherwise, `false`.
     * @returns {InteractContextUsage} The requested information.
     */
    getUsage(isReadonly) {
        return {
            mainWindow: {
                cursorClass: 'crosshair',
                controlCamera: true,
            },
            selectionSelector: {
                hover: true,
                select: async ({ object: selection }) => {
                    await this.context.transitionEditSelection({ selectionId: selection.id });
                },
            },
        };
    }

    /**
     * Gets the text to display as a hint to the user when this layer is active.
     * 
     * If the text is an empty string, no hint is displayed.
     * 
     * @param {boolean} isReadonly `true` if the labels cannot be edited; otherwise, `false`.
     * @returns {string} The requested hint.
     */
    getHint(isReadonly) {
        return 'Hover and click on a selection to select, or press [Esc] to cancel';
    }
}
