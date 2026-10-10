import { default as React } from "react";

import type {
  MainWindowMapper,
  InteractContext,
  InteractContextUsage,
} from "./InteractContext";
import { InteractState } from "./InteractState";

const SELECT_BOX_HINT = (
  <>
    Hover and click on a box to select, or press <kbd>Esc</kbd> to cancel
  </>
);

/** Represents the state when the user can select a bounding box. */
export class SelectBoxState<
  WM extends MainWindowMapper,
> extends InteractState<WM> {
  /** Creates a new state instance.
   * This is called right before the state of the context is transitioned to this one. */
  constructor(context: InteractContext<WM>) {
    super({
      context: context,
      keydownBinds: [
        {
          keyCombo: "escape",
          name: "Cancel select box",
          handler: () => {
            this.context.transitionNavigate();
          },
        },
      ],
    });
  }

  /** Disposes of this object. Do not use it afterwards.
   * This is called right before the state of the context is transitioned from this one. */
  dispose(): void {
    super.dispose();
  }

  /** Specifies how this state uses the context.
   * This is called when an event is emitted by a component that can change
   * how this state uses the context. */
  getUsage(isReadonly: boolean): InteractContextUsage {
    return {
      mainWindow: {
        cursorClass: "crosshair",
        controlCamera: true,
      },
      boxSelector: {
        hover: true,
        select: ({ object: box }) => {
          void this.context.transitionEditBox({ boxId: box.id, box });
        },
      },
      // Selecting a box from the inspector's box picker should mirror the
      // scene selector in this state: pick the addressed box and drop into
      // its edit state. Without this, the label inspector reports no
      // selectBox usage and the entire inspector is disabled while the
      // bounding-box layer is in its select action.
      labelInspector: isReadonly
        ? undefined
        : {
            selectBox: ({ value: box }) => {
              if (box == null) {
                this.context.transitionNavigate();
              } else {
                void this.context.transitionEditBox({ boxId: box.id, box });
              }
            },
          },
    };
  }

  /** Gets the content to display as a hint to the user when this layer is active.
   * If `null`, no hint is displayed. */
  getHint(isReadonly: boolean): React.ReactNode {
    return SELECT_BOX_HINT;
  }
}
