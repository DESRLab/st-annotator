import * as THREE from "three";

import { ThreeUtils } from "sta/common";

import type {
  LabelSelection,
  ReadonlyLabelSelection,
} from "../data/LabelSelection";
import type {
  PointPrompter,
  PointPrompterEventMap,
} from "../tools/PointPrompter";
import type {
  PromptMode,
  PromptModePaneControllerParams,
} from "../widgets/PromptModePane.react.tsx";

import { PointPrompt } from "./PointPrompts";

export interface PropertyChangeEvent {
  obj: LabelSelection;
  propertyKey: string;
}

/**
 * The points prompted to the labeling assistant.
 */
export interface PromptedData {
  points: THREE.Vector3[];
  labels: number[];
}

/**
 * Represents the local selection.
 */
export type LocalSelectionData = Readonly<{
  pointCoords: readonly THREE.Vector3[];
  centerPoint: Readonly<THREE.Vector3>;
}>;

export interface AssistedSelectionEditControlsEventMap {
  change: {};
  /** The event when a new selection has been created. */
  create: { promptData: PromptedData; maskThreshold: number };
  /** The event when modifying a selection has begun. */
  begin: { obj: ReadonlyLabelSelection | null };
  /** The event when modifying a selection has been aborted. */
  abort: { obj: ReadonlyLabelSelection | null };
  /** The event when a selection has been updated. */
  update: {
    obj: ReadonlyLabelSelection;
    promptData: PromptedData;
    maskThreshold: number;
    predict: boolean;
    mode: string;
  };
}

/**
 * Handles creation of a selection as well as modifications,
 * using masks predicted by the labeling assistant from point prompts.
 */
export class AssistedSelectionEditControl extends THREE.EventDispatcher<AssistedSelectionEditControlsEventMap> {
  /**
   * Captures the points prompted by the user.
   */
  readonly pointPrompter: PointPrompter;

  /** The selection's coordinate data at the beginning of the current edit state. */
  #startSelection: LocalSelectionData | null = null;

  #currentObj: ReadonlyLabelSelection | null = null;
  #predictionSelection: ReadonlyLabelSelection | null = null;

  markPredictionAvailable(obj: ReadonlyLabelSelection): void {
    if (obj === this.#currentObj) this.#predictionSelection = obj;
  }

  /** The object to be modified, if any. */
  get selectedObj(): ReadonlyLabelSelection | null {
    return this.#currentObj;
  }

  get hasSelection(): boolean {
    return this.#currentObj != null;
  }

  get isCreating(): boolean {
    return (
      !this.hasSelection && !this.disabled && this.promptMode === "foreground"
    );
  }

  get isEditing(): boolean {
    return this.hasSelection && !this.disabled;
  }

  /** The `three.js` representation of each prompted point. */
  readonly #prompts: PointPrompt = new PointPrompt();

  get prompts(): PointPrompt {
    return this.#prompts;
  }

  #promptedData: PromptedData = {
    points: [],
    labels: [],
  };

  /**
   * Sets or unsets the stored state of an object.
   *
   * @param obj The object to modify, or `null` to unset the state.
   * @param promptedData The points that have been prompted, if any.
   */
  #setState(
    obj: ReadonlyLabelSelection | null,
    promptedData: PromptedData | null,
  ): void {
    const previousObj = this.#currentObj;
    const keepsPrediction =
      previousObj != null &&
      promptedData != null &&
      this.#predictionSelection === previousObj;

    previousObj?.removeEventListener("change", this.#onObjChanged);
    this.#predictionSelection = null;

    if (obj == null) {
      this.#startSelection = null;
      this.#currentObj = null;
      this.#promptedData = { points: [], labels: [] };
      this.#prompts.clear();
    } else {
      const newObj = obj;

      if (promptedData != null) {
        // State transitions may hand this control the same object that it
        // previously dispatched. Own a copy so replacing/clearing the current
        // state can never empty the transition payload by aliasing its arrays.
        this.#promptedData = {
          points: promptedData.points.map((point) => point.clone()),
          labels: [...promptedData.labels],
        };
      } else {
        this.#promptedData = {
          labels: [1],
          points: [newObj.centerPoint.clone()],
        };
      }

      this.#startSelection = {
        pointCoords: [...newObj.pointCoords],
        centerPoint: newObj.centerPoint.clone(),
      };

      this.#prompts.add(this.#promptedData.points, this.#promptedData.labels);

      newObj.addEventListener("change", this.#onObjChanged);
      this.#currentObj = newObj;
      if (keepsPrediction) this.#predictionSelection = newObj;
    }
  }

  /**
   * Reset the current object when the object is modified from undo and redo.
   */
  #onObjChanged = (event: PropertyChangeEvent): void => {
    const currentObj = this.#currentObj;
    const startSelection = this.#startSelection;
    if (currentObj == null || startSelection == null) return;

    if (event.propertyKey === "points") {
      if (
        !ThreeUtils.areVerticesEqual(
          event.obj.pointCoords,
          startSelection.pointCoords,
        )
      ) {
        this.#setState(event.obj, this.#promptedData);
      }
    }
  };

  #disabled = false;

  /**
   * `true` if this editor is disabled; otherwise, `false.`
   *
   * If set to `true` while an object is being modified, aborts the process.
   */
  get disabled(): boolean {
    return this.#disabled;
  }

  set disabled(value: boolean) {
    if (this.#disabled !== value) {
      this.#disabled = value;

      if (value) {
        this.abort();
      }

      this.render();
    }
  }

  #promptMode: PromptMode = "foreground";

  /** The prompt mode to modify a selection. */
  get promptMode(): PromptMode {
    return this.#promptMode;
  }

  #numPrompts = 1;

  /** The number of prompted points required to predict a new mask. */
  get numPrompts(): number {
    return this.#numPrompts;
  }

  #maskThreshold = 0.5;

  /** The threshold applied to the predicted mask logits. */
  get maskThreshold(): number {
    return this.#maskThreshold;
  }

  set maskThreshold(value: number) {
    if (this.#maskThreshold !== value) {
      this.#maskThreshold = value;
      if (this.#predictionSelection === this.#currentObj) {
        this.#checkpoint(false);
      }
    }
  }

  /**
   * Creates a new assisted selection editor.
   *
   * @param pointPrompter The prompter tool to capture point clicks.
   */
  constructor(pointPrompter: PointPrompter) {
    super();

    this.pointPrompter = pointPrompter;

    this.pointPrompter.addEventListener("end", this.#onPrompterEnd);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    this.pointPrompter.removeEventListener("end", this.#onPrompterEnd);
  }

  get promptModePaneParams(): Pick<
    PromptModePaneControllerParams,
    "inputtedData" | "computedData" | "settings"
  > {
    return {
      inputtedData: {
        promptMode: this.#promptMode,
        numPrompts: this.#numPrompts,
        maskThreshold: this.#maskThreshold,
      },
      computedData: {},
      settings: {
        disabled: this.disabled,
        hidden: this.disabled,
        maxPrompts: 20,
        maxMaskThreshold: 1,
      },
    };
  }

  onPromptModeInputChange = (
    change: Partial<PromptModePaneControllerParams["inputtedData"]>,
  ): void => {
    if (change.promptMode != null) {
      this.#promptMode = change.promptMode;
    }
    if (change.numPrompts != null) {
      this.#numPrompts = change.numPrompts;
    }
    if (change.maskThreshold != null) {
      this.maskThreshold = change.maskThreshold;
    }

    this.render();
  };

  /**
   * Handles the event when a point has been prompted.
   */
  #onPrompterEnd = (event: PointPrompterEventMap["end"]): void => {
    if (this.disabled) return;

    // The prompter only distinguishes the pointer button; in background
    // mode, every prompt (including left-clicks) is a background prompt.
    const label = this.promptMode === "background" ? 0 : event.label;

    this.#promptedData.points.push(event.vertex);
    this.#promptedData.labels.push(label);
    this.#prompts.add(this.#promptedData.points, this.#promptedData.labels);

    this.#checkpoint(true);
  };

  /**
   * Dispatches the creation/update event of a selection based on
   * the prompted points, optionally requesting a new mask prediction.
   */
  #checkpoint(predict: boolean): void {
    const currentObj = this.#currentObj;
    // Every prediction represents exactly the prompts known when the click
    // completed. A later click must extend the next request without mutating
    // an earlier in-flight request or transition payload.
    const promptData: PromptedData = {
      points: this.#promptedData.points.map((point) => point.clone()),
      labels: [...this.#promptedData.labels],
    };
    const maskThreshold = this.maskThreshold;
    if (promptData.points.length === 0) return;

    if (currentObj == null) {
      if (promptData.points.length >= this.numPrompts) {
        this.dispatchEvent({
          type: "create",
          promptData: promptData,
          maskThreshold: maskThreshold,
        });
      }
    } else {
      this.dispatchEvent({
        type: "update",
        obj: currentObj,
        promptData: promptData,
        maskThreshold: maskThreshold,
        predict: predict,
        mode: this.promptMode === "foreground" ? "add" : "erase",
      });
    }
  }

  /**
   * Selects an object to edit. If null is passed, the control creates a new selection object.
   *
   * @param obj The object to edit.
   * @param promptedData The points that have been prompted, if any.
   */
  select(
    obj: ReadonlyLabelSelection | null,
    promptedData: PromptedData | null,
  ): void {
    // This method is also used to replace an edited selection after a backend
    // checkpoint. Do not abort/deselect first: doing so clears the accumulated
    // prompt arrays and removes their markers during every prediction.
    this.#setState(obj, promptedData);
  }

  /**
   * Deselects the object so it can no longer be modified.
   */
  deselect(): void {
    if (!this.hasSelection) return;

    this.abort();
    this.#setState(null, null);
  }

  /**
   * Aborts creating or editing a label selection data points.
   */
  abort(): void {
    const { disabled, pointPrompter } = this;
    this.#prompts.clear();
    this.#predictionSelection = null;

    if (disabled) {
      pointPrompter.abort();
    }

    const startSelection = this.#startSelection;
    const currentObj = this.#currentObj;

    if (currentObj != null && startSelection != null) {
      currentObj.getSelection().pointCoords = startSelection.pointCoords;
    }

    this.dispatchEvent({ type: "abort", obj: currentObj });
  }

  /**
   * Renders the available prompt mode inputs.
   */
  render(): void {
    this.dispatchEvent({ type: "change" });
  }
}
