import { default as React } from "react";
import * as THREE from "three";

import { Placeholder, memoizeRender } from "sta/app/editor";
import type { RenderMemo } from "sta/app/editor";
import { ThreeUtils } from "sta/common";

import type {
  ReadonlyLabelBox,
  ReadonlyLabelTrack,
  BoxParams,
  TrackParams,
  UUID,
} from "../data";
import { LabelBox } from "../data/LabelBox";
import type { LabelBoxDrawMode } from "../tools/LabelBoxCreator";
import type { DrawMode } from "../widgets";

import type {
  MainWindowMapper,
  InteractContext,
  InteractContextUsage,
} from "./InteractContext";
import { InteractState } from "./InteractState";

/** Represents the state when the user can create a bounding box. */
export class DrawBoxState<
  WM extends MainWindowMapper,
> extends InteractState<WM> {
  /** Whether a bounding box is being created. */
  get isCreatingBox(): boolean {
    return this.context.boxCreator.isCreating;
  }

  /** The mode of drawing an object in the scene. */
  get drawMode(): DrawMode {
    return this.context.drawMode;
  }

  readonly #hintMemo: RenderMemo = {};

  /**
   * The local-only placeholder track allocated for the draft in progress,
   * if any. It must not outlive the draft: a gesture that does not commit
   * disposes it together with the draft box.
   */
  #draftTrack: ReadonlyLabelTrack | null = null;

  /** Creates a new state instance.
   * This is called right before the state of the context is transitioned to this one. */
  constructor(context: InteractContext<WM>) {
    super({
      context: context,
      keydownBinds: [
        {
          keyCombo: "escape",
          name: "Cancel draw box",
          handler: () => {
            if (this.isCreatingBox) {
              this.#abortCreateBox();
            } else {
              this.context.transitionNavigate();
            }
          },
        },
        {
          keyCombo: "g",
          name: "Finish draw box",
          handler: () => {
            this.#finishCreateBox(true);
          },
        },
      ],
    });
  }

  /** Disposes of this object. Do not use it afterwards.
   * This is called right before the state of the context is transitioned from this one. */
  dispose(): void {
    this.#abortCreateBox();

    super.dispose();
  }

  /** Gets the CSS class (without `cursor-` prefix) for the main window
   * while the user is not actively drawing. */
  #getPassiveCursorClass(): string {
    if (this.context.boxSelector.isHoveringObj) return "copy";

    let first: string;
    switch (this.drawMode) {
      case "corner2corner":
        first = "add";
        break;
      case "center2front":
        first = "arrow";
        break;
      default:
        throw new Error(`Invalid drawMode: ${this.drawMode}`);
    }

    let second: string;
    const boxType = this.context.boxInspector.getBoxParams().boxType;
    switch (boxType) {
      case "cuboid":
        second = "square";
        break;
      case "cylinder":
        second = "circle";
        break;
      default:
        throw new Error(`Invalid boxType: ${boxType}`);
    }

    return `${first}-${second}`;
  }

  /** Specifies how this state uses the context.
   * This is called when an event is emitted by a component that can change
   * how this state uses the context. */
  getUsage(isReadonly: boolean): InteractContextUsage {
    const { isCreatingBox } = this;

    let cursorClass: string;
    if (isReadonly) {
      cursorClass = "not-allowed";
    } else if (isCreatingBox) {
      cursorClass = "cell";
    } else {
      cursorClass = this.#getPassiveCursorClass();
    }

    return {
      mainWindow: {
        cursorClass: cursorClass,
        controlCamera: !isCreatingBox,
        pointerdown: (event) => {
          if (isReadonly) return;

          if (event.button === 0) {
            this.#beginCreateBox();
          }
        },
        pointerup: (event) => {
          if (isReadonly) return;

          if (event.button === 0) {
            this.#finishCreateBox();
          }
        },
      },
      boxSelector: isReadonly ? undefined : { hover: !isCreatingBox },
      boxCreator: isReadonly
        ? undefined
        : {
            abort: (event) => {
              this.#disposeBox(event.box);
              this.#disposeDraftTrack();
            },
            finish: (event) => {
              const newBox = event.box;
              let gestureDraftTrack =
                newBox.entityId != null &&
                this.context.dataView.hasLabelTrackLocalOnly(newBox.entityId)
                  ? this.context.dataView.getLabelTrackLocalOnly(
                      newBox.entityId,
                    )
                  : null;
              void (async () => {
                const { x, y, z } = newBox.asObject3D().scale;
                if (
                  !event.applyDefaultSize &&
                  (Math.abs(x) < 0.001 ||
                    Math.abs(y) < 0.001 ||
                    Math.abs(z) < 0.001)
                ) {
                  // Rejected: Too small
                } else {
                  const { dataView, trackInspector } = this.context;

                  if (newBox.entityId == null) {
                    const trackParams = trackInspector.getTrackParams();
                    const registeredTrack =
                      await dataView.addLabelTrack(trackParams);

                    if (!(newBox instanceof LabelBox)) {
                      throw new Error("Incorrect type of newBox");
                    }

                    newBox.entityId = registeredTrack.id;
                  }

                  if (dataView.hasLabelTrackLocalOnly(newBox.entityId)) {
                    const track = dataView.getLabelTrackLocalOnly(
                      newBox.entityId,
                    );
                    // The commit consumes the gesture's placeholder
                    // track: it is registered below, so the draft
                    // cleanup must not dispose it a second time.
                    if (track === this.#draftTrack) this.#draftTrack = null;
                    const registeredTrack = await dataView.addLabelTrack(track);

                    if (!(newBox instanceof LabelBox)) {
                      throw new Error("Incorrect type of newBox");
                    }

                    newBox.entityId = registeredTrack.id;

                    this.#disposeTrack(track);
                    gestureDraftTrack = null;
                  }

                  const registeredBox = await dataView.addLabelBox(newBox);

                  await this.context.transitionEditBox({
                    boxId: registeredBox.id,
                    box: registeredBox,
                  });
                }
              })()
                .catch((error: unknown) => {
                  console.error("Failed to create bounding box:", error);
                  alert(`Failed to create bounding box.\n\n${error}`);
                })
                .finally(() => {
                  // The box goes first: the index refuses to delete a
                  // track that a box still refers to.
                  this.#disposeBox(newBox);
                  if (gestureDraftTrack != null) {
                    this.#disposeTrack(gestureDraftTrack);
                    if (this.#draftTrack === gestureDraftTrack)
                      this.#draftTrack = null;
                  }
                });
            },
          },
      labelInspector: isReadonly ? undefined : { enabled: !isCreatingBox },
    };
  }

  /** Gets the content to display as a hint to the user when this layer is active.
   * If `null`, no hint is displayed. */
  getHint(isReadonly: boolean): React.ReactNode {
    return memoizeRender(
      this.#hintMemo,
      [this.isCreatingBox, this.context.boxCreator.isSizeFixed],
      () => {
        const { context, isCreatingBox } = this;

        if (isCreatingBox) {
          if (context.boxCreator.isSizeFixed) {
            return (
              <>
                Release the pointer to finish drawing, or press <kbd>Esc</kbd>{" "}
                to abort
              </>
            );
          }

          return (
            <>
              Release the pointer to finish drawing, press <kbd>G</kbd> to use
              defaults, or press <kbd>Esc</kbd> to abort
            </>
          );
        }

        return (
          <>
            Click and drag to draw, or press <kbd>Esc</kbd> to cancel
          </>
        );
      },
    );
  }

  /** Constructs a new bounding box. */
  #initBox(): ReadonlyLabelBox {
    const {
      sceneContext,
      dataView,
      mainWindow,
      boxCreator,
      boxSelector,
      boxInspector,
      trackInspector,
    } = this.context;

    let boxParams: BoxParams;

    this.#draftTrack = null;

    const config = sceneContext.config;
    const currentTimestamp =
      sceneContext.currentFrame?.getTimestampCenter() ?? null;
    const hoveredBox = boxSelector.hoveredObj;

    if (hoveredBox == null) {
      const raycaster = boxCreator.raycaster;
      const position =
        boxCreator.groundMesh?.raycast(raycaster).at(0)?.point ??
        boxCreator.getPointerWorldPos();

      const centerWorldPos = new THREE.Vector3(0, 0, 0).unproject(
        mainWindow.getCamera(),
      );
      const topWorldPos = new THREE.Vector3(0, 1, 0).unproject(
        mainWindow.getCamera(),
      );
      const centerToTopWorld = topWorldPos.sub(centerWorldPos);
      const angle = Math.atan2(centerToTopWorld.x, centerToTopWorld.z);

      // The draft needs a track: attach it to the selected one if
      // present; otherwise allocate a local-only placeholder, which
      // the draft cleanup disposes unless the gesture commits it.
      const selectedTrack = trackInspector.selectedTrack;
      let entityId: UUID;
      if (selectedTrack != null) {
        entityId = selectedTrack.id;
      } else {
        const trackParams: TrackParams = {
          ...trackInspector.getTrackParams(),
          id: new Placeholder(),
        };

        this.#draftTrack = dataView.addLabelTrackLocalOnly(trackParams);
        entityId = this.#draftTrack.id;
      }

      boxParams = {
        ...boxInspector.getBoxParams(),
        id: new Placeholder(),
        timestamp: currentTimestamp,
        center: config.coordinateFormat.toDatabaseCoords(position),
        angle: angle,
        size: new THREE.Vector3().setScalar(ThreeUtils.EPSILON),
        entityId: entityId,
        showForwardIndicator: false,
      };
    } else {
      boxParams = {
        ...boxInspector.getBoxParams(),
        id: new Placeholder(),
        timestamp: currentTimestamp,
        center: hoveredBox.center,
        angle: hoveredBox.angle,
        size: hoveredBox.size,
        entityId: hoveredBox.entityId,
        showForwardIndicator: false,
      };
    }

    const box = dataView.addLabelBoxLocalOnly(boxParams);

    return box;
  }

  /** Disposes of the new bounding box. */
  #disposeBox(box: ReadonlyLabelBox): void {
    const { dataView } = this.context;
    dataView.deleteLabelBoxLocalOnly(box);
  }

  /** Disposes of the new track. */
  #disposeTrack(track: ReadonlyLabelTrack): void {
    const { dataView } = this.context;
    dataView.deleteLabelTrackLocalOnly(track);
  }

  /** Disposes of the placeholder track allocated for the current draft, if any. */
  #disposeDraftTrack(): void {
    if (this.#draftTrack == null) return;

    const track = this.#draftTrack;
    this.#draftTrack = null;
    this.#disposeTrack(track);
  }

  /** Begins creation of a bounding box, if no bounding box is already being created. */
  #beginCreateBox(): void {
    // A duplicate pointer-down (e.g. a second finger mid-gesture) must
    // not allocate a second draft: the creator would reject it, leaving
    // the local-only draft behind as a ghost.
    if (this.isCreatingBox) return;

    const { sceneContext, boxCreator, boxSelector } = this.context;

    let drawMode: LabelBoxDrawMode;

    const currentTimestamp =
      sceneContext.currentFrame?.getTimestampCenter() ?? null;
    const hoveredBox = boxSelector.hoveredObj;

    if (hoveredBox == null) {
      drawMode = this.drawMode;
    } else {
      const t0 = hoveredBox.timestamp;
      if (
        t0 == null ||
        currentTimestamp == null ||
        t0.getTime() < currentTimestamp.getTime()
      ) {
        drawMode = "point2center";
      } else {
        drawMode = "center2point";
      }
    }

    const box = this.#initBox();

    boxCreator.begin(drawMode, box);
  }

  /** Cancels creation of the current bounding box, if any. */
  #abortCreateBox(): void {
    this.context.boxCreator.abort();
  }

  /** Finishes creation of the existing bounding box, if any. */
  #finishCreateBox(applyDefaultSize = false): void {
    this.context.boxCreator.end(applyDefaultSize);
  }
}
