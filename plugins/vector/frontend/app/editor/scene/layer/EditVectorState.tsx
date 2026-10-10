import { default as React } from "react";

import { memoizeRender } from "sta/app/editor";
import type { RenderMemo } from "sta/app/editor";

import type { VectorTransformerEventMap } from "../controls/VectorTransformer.tsx";
import type { UUID } from "../data";
import type { LabelVectorClipboardEventMap } from "../tools";
import type { LabelVectorInspectorEventMap } from "../widgets";

import type {
  InteractContext,
  InteractContextUsage,
  MainWindowMapper,
} from "./InteractContext";
import { InteractState } from "./InteractState";

export interface EditStateParams {
  vectorId: UUID | null;
}

/**
 * Represents the state when the user can edit labels.
 */
export class EditState<WM extends MainWindowMapper> extends InteractState<WM> {
  /**
   * Whether a vector object is being transformed.
   */
  get isTransformingVector(): boolean {
    return this.context.vectorTransformer.isTransforming;
  }

  /**
   * The parameters of this state.
   */
  readonly params: EditStateParams;

  readonly #hintMemo: RenderMemo = {};

  /**
   *
   * @param context The context containing this state.
   * @param params  The parameters of this state.
   */
  constructor(context: InteractContext<WM>, params: EditStateParams) {
    super({
      context: context,
      keydownBinds: [
        {
          keyCombo: "escape",
          name: "Cancel edit vector",
          handler: () => {
            if (this.isTransformingVector) {
              this.#abortTransformVector();
            } else {
              this.context.transitionNavigate();
            }
          },
        },
        {
          keyCombo: "delete",
          name: "Delete vector",
          handler: () => {
            this.#deleteSelectedVector();
          },
        },
        {
          keyCombo: "ctrl + c",
          name: "Copy vector",
          handler: () => {
            this.#copySelectedVector();
          },
        },
        {
          keyCombo: "ctrl + v",
          name: "Paste vector",
          handler: () => {
            this.#pasteSelectedVector();
          },
        },
      ],
    });

    this.params = params;
    this.#setup(this.params);
  }

  /**
   * Setsup this object.
   *
   * @param params The parameters to this method.
   */
  #setup({ vectorId }: EditStateParams) {
    const {
      vectorTransformer,
      vectorMonitor,
      vectorSelector,
      vectorClipboard,
      vectorInspector,
    } = this.context;

    vectorInspector.selectedId = vectorId;

    const vector = vectorInspector.selectedVector;
    vectorMonitor.vector = vector;

    if (vector) {
      vectorSelector.selectedObj = vector;
      vectorTransformer.select(vector);
      vectorClipboard.select(vector);
    } else {
      vectorSelector.selectedObj = null;
      vectorClipboard.deselect();
      vectorTransformer.deselect();
    }
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   *
   * This is called right before the state of the context is transitioned from this one.
   */
  dispose() {
    this.#setup({ vectorId: null });

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
    const { isTransformingVector } = this;

    return {
      mainWindow: {
        cursorClass: "all-scroll",
        controlCamera: !isTransformingVector,
        hiddenCanvas: true,
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
      vectorTransformer: isReadonly
        ? undefined
        : {
            checkpoint: async (
              event: VectorTransformerEventMap["checkpoint"],
            ) => {
              const { obj, mode, prevTransform } = event;

              // The view API takes plain records; the transformer's
              // vertices are three.js vectors.
              const newVertices = {
                vertices: obj.vertices.map(({ x, y, z }) => ({
                  x,
                  y,
                  z,
                })),
              };

              // The undo vertices the operation must restore. Like
              // `obj.vertices` above, the drag-start vertices must be
              // converted from three.js coordinates to model
              // coordinates before crossing the view API.
              const format = obj.config.coordinateFormat;
              const prevVertices = prevTransform.vectorCoords.map((vertex) => {
                const { x, y, z } = format.toDatabaseCoords(vertex);
                return { x, y, z };
              });

              // Reapplies the transformation
              await this.context.dataView.updateLabelVectorGeometry(
                obj,
                mode,
                obj.vectorType,
                newVertices.vertices,
                prevVertices,
              );
            },
          },
      labelInspector: isReadonly
        ? undefined
        : {
            selectVector: async ({
              value: vector,
            }: LabelVectorInspectorEventMap["select-vector"]) => {
              if (vector == null) {
                this.context.transitionEdit({ vectorId: null });
              } else {
                await this.context.transitionEditVector({
                  vectorId: vector.id,
                  vector,
                });
              }
            },
          },
      labelClipboard: isReadonly
        ? undefined
        : {
            pasteVector: async (
              event: LabelVectorClipboardEventMap["paste"],
            ) => {
              const currentTimestamp =
                this.context.sceneContext.currentFrame?.getTimestampCenter() ??
                null;

              const vector = await this.context.dataView.addLabelVector({
                ...event.clipboard,
                timestamp: currentTimestamp,
              });

              await this.context.transitionEditVector({
                vectorId: vector.id,
                vector,
              });
            },
          },
    };
  }

  /**
   * Gets the content to display as a hint to the user when this layer is active.
   *
   * If `null`, no hint is displayed.
   *
   * @param isReadonly `true` if the labels cannot be edited; otherwise, `false`.
   * @returns The requested hint.
   */
  getHint(isReadonly: boolean): React.ReactNode {
    return memoizeRender(
      this.#hintMemo,
      [
        isReadonly,
        this.params.vectorId != null,
        this.context.vectorInspector.selectedVector?.vectorType,
      ],
      () => {
        const { vectorInspector } = this.context;

        const hasSelectedVector = this.params.vectorId != null;
        const vector = vectorInspector.selectedVector;
        if (hasSelectedVector && vector != null) {
          if (isReadonly) return <>The scene is currently in read-only mode</>;

          return (
            <>
              Drag the vertices of the {vector.vectorType} to reform, press{" "}
              <kbd>Del</kbd> to delete, or press <kbd>Esc</kbd> to deselect
            </>
          );
        }

        return isReadonly ? (
          <>
            Press <kbd>S</kbd> to select a vector
          </>
        ) : (
          <>
            Press <kbd>S</kbd> to select a vector, or press <kbd>D</kbd> to draw
            a vector
          </>
        );
      },
    );
  }

  /**
   * Cancels transformation of the current vector, if any.
   */
  #abortTransformVector() {
    this.context.vectorTransformer.abort();
  }

  /**
   * Deletes the selected vector, if any, from the scene.
   */
  #deleteSelectedVector() {
    const vector = this.context.vectorInspector.selectedVector;
    if (vector) {
      void this.context.dataView.deleteLabelVector(vector);

      this.context.transitionNavigate();
    }
  }

  /**
   * Copies the current vector object, if any.
   */
  #copySelectedVector() {
    this.context.vectorClipboard.copy();
  }

  /**
   * Pastes the current vector object, if any.
   */
  #pasteSelectedVector() {
    this.context.vectorClipboard.paste();
  }
}
