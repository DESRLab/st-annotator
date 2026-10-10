import { default as React } from "react";

import type { ReadonlyLabelVector } from "../data";

import type {
  InteractContext,
  InteractContextUsage,
  MainWindowMapper,
} from "./InteractContext";
import { InteractState } from "./InteractState";

const SELECT_VECTOR_HINT = (
  <>
    Hover and click on a vector to select, or press <kbd>Esc</kbd> to cancel
  </>
);

/**
 * Represents the state when the user can select a vector object.
 */
export class SelectVectorState<
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
          keyCombo: "escape",
          name: "Cancel select vector",
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
   * @param isReadonly `true` if the labels cannot be edited; otherwise, `false`.
   * @returns The requested information.
   */
  getUsage(isReadonly: boolean): InteractContextUsage {
    return {
      mainWindow: {
        cursorClass: "crosshair",
        controlCamera: true,
        hiddenCanvas: true,
      },
      vectorSelector: {
        hover: true,
        select: async ({ object: vector }: { object: ReadonlyLabelVector }) => {
          await this.context.transitionEditVector({
            vectorId: vector.id,
            vector,
          });
        },
      },
    };
  }

  /**
   * Gets the text to display as a hint to the user when this layer is active.
   *
   * If the text is an empty string, no hint is displayed.
   *
   * @param isReadonly `true` if the labels cannot be edited; otherwise, `false`.
   * @returns The requested hint.
   */
  getHint(isReadonly: boolean): React.ReactNode {
    return SELECT_VECTOR_HINT;
  }
}
