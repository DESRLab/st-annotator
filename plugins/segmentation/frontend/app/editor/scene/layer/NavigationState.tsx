import { default as React } from "react";

import type {
  InteractContext,
  InteractContextUsage,
  MainWindowMapper,
} from "./InteractContext";
import { InteractState } from "./InteractState";

const NAVIGATION_HINT = (
  <>
    Hover and click on a selection to select, or press <kbd>Esc</kbd> to cancel
  </>
);

/**
 * Represents the state when the user can select selection.
 */
export class NavigationState<
  WM extends MainWindowMapper,
> extends InteractState<WM> {
  /**
   * Creates a new state instance.
   *
   * This is called right before the state of the context is transitioned to this one.
   */
  constructor(context: InteractContext<WM>) {
    super({
      context: context,
      keydownBinds: [
        {
          keyCombo: "s",
          name: "Select selection",
          handler: () => {
            this.context.toggleSelect();
          },
        },
        {
          keyCombo: "d",
          name: "Create a selection",
          handler: () => {
            this.context.toggleDraw();
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
  dispose(): void {
    super.dispose();
  }

  /**
   * Specifies how this state uses the context.
   *
   * This is called during each animation frame, and when an event is emitted by a component.
   */
  getUsage(isReadonly: boolean): InteractContextUsage {
    return {
      mainWindow: {
        cursorClass: "default",
        controlCamera: true,
      },
      selectionController: isReadonly
        ? undefined
        : {
            enabled: false,
          },
      labelInspector: isReadonly
        ? undefined
        : {
            enabled: true,
          },
    };
  }

  /**
   * Gets the text to display as a hint to the user when this layer is active.
   *
   * If the text is an empty string, no hint is displayed.
   */
  getHint(isReadonly: boolean): React.ReactNode {
    return NAVIGATION_HINT;
  }
}
