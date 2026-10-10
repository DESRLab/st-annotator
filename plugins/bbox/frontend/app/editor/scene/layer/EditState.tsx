import { default as React } from "react";

import { memoizeRender } from "sta/app/editor";
import type { RenderMemo } from "sta/app/editor";

import { LabelBox } from "../data";
import type { UUID } from "../data";

import type {
  MainWindowMapper,
  InteractContext,
  InteractContextUsage,
} from "./InteractContext";
import { InteractState } from "./InteractState";

export interface EditStateParams {
  trackId: UUID | null;
  boxId: UUID | null;
}

/** Represents the state when the user can edit labels. */
export class EditState<WM extends MainWindowMapper> extends InteractState<WM> {
  /** Whether a bounding box is being transformed. */
  get isTransformingBox(): boolean {
    return this.context.boxTransformer.isTransforming;
  }

  /** The parameters of this state. */
  readonly params: EditStateParams;

  readonly #hintMemo: RenderMemo = {};

  /** Creates a new state instance.
   * This is called right before the state of the context is transitioned to this one. */
  constructor(context: InteractContext<WM>, params: EditStateParams) {
    super({
      context: context,
      keydownBinds: [
        {
          keyCombo: "h",
          name: "Toggle hide in scene",
          handler: () => {
            this.context.toggleSelectedBoxHidden();
          },
        },
        {
          keyCombo: "escape",
          name: "Cancel edit box",
          handler: () => {
            if (this.isTransformingBox) {
              this.#abortCreateBox();
            } else {
              this.context.transitionNavigate();
            }
          },
        },
        {
          keyCombo: "alt",
          name: "Rotate box heading",
          handler: () => {
            this.#rotateSelectedBoxHeading();
          },
        },
        {
          keyCombo: "delete",
          name: "Delete box",
          handler: () => {
            this.#deleteSelectedBox();
          },
        },
        {
          keyCombo: "ctrl + c",
          name: "Copy box",
          handler: () => {
            this.#copySelectedBox();
          },
        },
        {
          keyCombo: "ctrl + v",
          name: "Paste box",
          handler: () => {
            this.#pasteSelectedBox();
          },
        },
      ],
    });

    this.params = params;

    this.#setup(this.params);
  }

  /** Setups this object. */
  #setup({ trackId, boxId }: EditStateParams): void {
    const {
      trackInspector,
      boxInspector,
      boxMonitor,
      boxSelector,
      boxTransformer,
      boxClipboard,
    } = this.context;

    trackInspector.selectedId = trackId;
    boxInspector.selectedId = boxId;

    // This box, if it exists, is guaranteed to exist in the collection
    const box = boxInspector.selectedBox;
    boxMonitor.box = box;

    if (box) {
      boxSelector.selectedObj = box;
      boxTransformer.select(box);
      boxClipboard.select(box);
    } else {
      boxSelector.selectedObj = null;
      boxClipboard.deselect();
      boxTransformer.deselect();
    }
  }

  /** Disposes of this object. Do not use it afterwards.
   * This is called right before the state of the context is transitioned from this one. */
  dispose(): void {
    this.#setup({ trackId: null, boxId: null });

    super.dispose();
  }

  /** Specifies how this state uses the context.
   * This is called when an event is emitted by a component that can change
   * how this state uses the context. */
  getUsage(isReadonly: boolean): InteractContextUsage {
    const { isTransformingBox } = this;

    return {
      mainWindow: {
        cursorClass: "all-scroll",
        controlCamera: !isTransformingBox,
      },
      data: {
        beforeLoad: () => {
          // Ensure the components are operating on the correct object
          // in case it gets replaced
          this.#setup(this.params);
        },
        afterLoad: () => {
          // Ensure the components are operating on the correct object
          // in case it gets replaced
          this.#setup(this.params);
        },
        branchEdit: () => {
          // Ensure the components are operating on the correct object
          // in case it gets replaced
          this.#setup(this.params);
        },
      },
      boxTransformer: isReadonly
        ? undefined
        : {
            checkpoint: (event) => {
              const { obj, mode, prevTransform } = event;

              // Project the live three.js vectors into a plain pose record
              const newPose = {
                center: {
                  x: obj.center.x,
                  y: obj.center.y,
                  z: obj.center.z,
                },
                angle: obj.angle,
                size: {
                  x: obj.size.x,
                  y: obj.size.y,
                  z: obj.size.z,
                },
              };

              // Derives the pose before the transformation, so that
              // the operation can be undone without reverting the box
              const prevPose = LabelBox.poseFromTransform(
                obj.config,
                prevTransform,
              );

              // Reapplies the transformation
              void this.context.dataView.updateLabelBoxTransform(
                obj,
                mode,
                newPose,
                prevPose,
              );
            },
          },
      labelInspector: isReadonly
        ? undefined
        : {
            selectTrack: ({ value: track }) => {
              const trackId = track?.id ?? null;
              const { boxId } = this.params;

              this.context.transitionEdit({ trackId, boxId });
            },
            selectBox: ({ value: box }) => {
              if (box == null) {
                const { trackId } = this.params;

                this.context.transitionEdit({
                  trackId,
                  boxId: null,
                });
              } else {
                void this.context.transitionEditBox({
                  boxId: box.id,
                  box,
                });
              }
            },
          },
      labelClipboard: isReadonly
        ? undefined
        : {
            pasteBox: (event) => {
              void (async () => {
                const currentTimestamp =
                  this.context.sceneContext.currentFrame?.getTimestampCenter() ??
                  null;

                const box = await this.context.dataView.addLabelBox({
                  ...event.clipboard,
                  timestamp: currentTimestamp,
                });

                await this.context.transitionEditBox({
                  boxId: box.id,
                  box,
                });
              })();
            },
          },
    };
  }

  /** Gets the content to display as a hint to the user when this layer is active.
   * If `null`, no hint is displayed. */
  getHint(isReadonly: boolean): React.ReactNode {
    return memoizeRender(
      this.#hintMemo,
      [isReadonly, this.isTransformingBox, this.params.boxId != null],
      () => {
        const { isTransformingBox } = this;

        if (isTransformingBox) {
          return (
            <>
              Hold <kbd>Shift</kbd> to apply constraints; release the pointer to
              finish transforming, or press <kbd>Esc</kbd> to abort
            </>
          );
        }

        const hasSelectedBox = this.params.boxId != null;
        if (hasSelectedBox) {
          if (isReadonly) return <>The scene is currently in read-only mode</>;

          return (
            <>
              Click and drag the gizmo to transform, press <kbd>Alt</kbd> to
              rotate heading, press <kbd>Del</kbd> to delete, or press{" "}
              <kbd>Esc</kbd> to deselect
            </>
          );
        }

        // These keybinds are defined in BBoxLayer
        return isReadonly ? (
          <>
            Press <kbd>S</kbd> to select a box
          </>
        ) : (
          <>
            Press <kbd>S</kbd> to select a box, or press <kbd>D</kbd> to draw a
            box
          </>
        );
      },
    );
  }

  /** Cancels transformation of the current bounding box, if any. */
  #abortCreateBox(): void {
    this.context.boxTransformer.abort();
  }

  /** Rotates the heading of the selected bounding box, if any. */
  #rotateSelectedBoxHeading(): void {
    this.context.boxTransformer.rotateHeading();
  }

  /** Deletes the selected bounding box, if any, from the scene. */
  #deleteSelectedBox(): void {
    const box = this.context.boxInspector.selectedBox;
    if (box) {
      void this.context.dataView.deleteLabelBox(box);

      this.context.transitionNavigate();
    }
  }

  /** Copies the current bounding box, if any. */
  #copySelectedBox(): void {
    this.context.boxClipboard.copy();
  }

  /** Pastes the current bounding box, if any. */
  #pasteSelectedBox(): void {
    this.context.boxClipboard.paste();
  }
}
