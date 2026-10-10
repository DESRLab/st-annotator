import { default as React } from "react";
import * as THREE from "three";

import { Placeholder, memoizeRender } from "sta/app/editor";
import type { RenderMemo } from "sta/app/editor";

import type { ReadonlyLabelVector, VectorParams } from "../data";
import type { VectorCreator } from "../tools";

import type {
  InteractContext,
  InteractContextUsage,
  MainWindowMapper,
} from "./InteractContext";
import { InteractState } from "./InteractState";

/**
 * Represents the state when the user can create a vector object.
 */
export class DrawVectorState<
  WM extends MainWindowMapper,
> extends InteractState<WM> {
  /**
   * The creator tool selected to draw a vector object.
   */
  get activatedVectorCreator(): VectorCreator | null {
    return this.context.activatedVectorCreator;
  }

  /**
   * Whether a vector object is being created.
   */
  get isCreatingVector(): boolean {
    const activatedVectorCreator = this.activatedVectorCreator;

    if (activatedVectorCreator == null) return false;

    return activatedVectorCreator.isCreating;
  }

  readonly #hintMemo: RenderMemo = {};

  /**
   * Creates a new state instance.
   *
   * This is called right before the state of the context is transitioned to this one.
   *
   * @param context The context containing this state.
   */
  constructor(context: InteractContext<WM>) {
    super({
      context: context,
      keydownBinds: [
        {
          keyCombo: "escape",
          name: "cancel draw vector",
          handler: () => {
            if (this.activatedVectorCreator?.isCreating) {
              this.activatedVectorCreator?.abort();
            } else {
              this.context.transitionNavigate();
            }
          },
        },
        {
          keyCombo: "g",
          name: "finish draw vector",
          handler: () => {
            this.activatedVectorCreator?.finish();
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
    this.activatedVectorCreator?.abort();

    super.dispose();
  }

  /**
   * Gets the CSS class (without `cursor-` prefix) for the main window
   * while the user is not actively drawing.
   *
   * @returns The requested class.
   */
  #getPassiveCursorClass(): string {
    const drawMode = this.context.drawMode;

    switch (drawMode) {
      case "polygon":
        return "crosshair";
      case "polyline":
        return "crosshair";
      case "point":
        return "crosshair";
      default:
        return "default";
    }
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
    const { isCreatingVector } = this;
    let cursorClass;
    if (isReadonly) {
      cursorClass = "not-allowed";
    } else {
      cursorClass = this.#getPassiveCursorClass();
    }

    return {
      mainWindow: {
        cursorClass: cursorClass,
        controlCamera: !isCreatingVector,
        hiddenCanvas: false,
      },
      vectorSelector: isReadonly ? undefined : { hover: !isCreatingVector },
      vectorCreator: isReadonly
        ? undefined
        : {
            abort: () => {
              this.activatedVectorCreator?.abort();
            },
            finish: async (event: { vertices: readonly THREE.Vector3[] }) => {
              const vertices = event.vertices;
              const vector = this.#initVector(vertices);
              const { dataView } = this.context;

              if (vector !== null) {
                const registeredVector = await dataView.addLabelVector(vector);
                await this.context.transitionEditVector({
                  vectorId: registeredVector.id,
                  vector: registeredVector,
                });

                this.#disposeVector(vector);
              }
            },
          },
      labelInspector: isReadonly ? undefined : { enabled: !isCreatingVector },
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
    return memoizeRender(
      this.#hintMemo,
      [this.isCreatingVector, this.activatedVectorCreator?.vectorType],
      () => {
        const { isCreatingVector, activatedVectorCreator } = this;
        if (isCreatingVector) {
          return (
            <>
              Double click pointer to finish drawing, or press <kbd>Esc</kbd> to
              abort
            </>
          );
        }

        return (
          <>
            Click and drag to draw {activatedVectorCreator?.vectorType}, or
            press <kbd>Esc</kbd> to cancel
          </>
        );
      },
    );
  }

  /**
   * Constructs a new vector object.
   *
   * @param vertices The vertices in ThreeJS coordinates
   * shaping a vector geometry.
   * @returns The newly created vector object.
   */
  #initVector(vertices: readonly THREE.Vector3[]): ReadonlyLabelVector | null {
    const { sceneContext, dataView } = this.context;
    const activatedVectorCreator = this.activatedVectorCreator;

    if (activatedVectorCreator === null) return null;

    let vectorParams: VectorParams | null = null;

    const currentTimestamp =
      sceneContext.currentFrame?.getTimestampCenter() ?? null;
    const vectorType = activatedVectorCreator.vectorType;
    const format = sceneContext.config.coordinateFormat;
    const verticesInDB = vertices.map((vertex: THREE.Vector3) =>
      format.toDatabaseCoords(vertex),
    );

    vectorParams = {
      id: new Placeholder(),
      timestamp: currentTimestamp,
      vertices: verticesInDB,
      vectorType: vectorType,
    };

    const vector = dataView.addLabelVectorLocalOnly(vectorParams);

    return vector;
  }

  /**
   * @param vector The vector object to be deleted locally.
   */
  #disposeVector(vector: ReadonlyLabelVector) {
    const { dataView } = this.context;
    dataView.deleteLabelVectorLocalOnly(vector);
  }
}
