import type { LocalSelectionData } from "../controls/SelectionEditControl.tsx";

import { LabelSelection } from "./LabelSelection";

export type ReadonlyLabelSelection = Pick<
  LabelSelection,
  | "pointCoords"
  | "centerPoint"
  | "addEventListener"
  | "removeEventListener"
  | "dispatchEvent"
  | "getSelection"
>;

/**
 * Since the selection's `three.js` representation can be modified directly,
 * we have to periodically check whether it has been updated to fire
 * the change events.
 *
 * However, it is too costly to continuously monitor all selection objects,
 * so this class is used to monitor specific selection obejcts.
 *
 * The monitored selection is the one the active Draw state assigned, so the poll
 * only ever runs inside an already-dirty manipulation window. A feature that
 * monitors a selection outside manipulation has to emit its own dirty event or
 * accept eventual consistency: a detected change is dispatched up to the
 * interval late.
 */
export class LabelSelectionReformMonitor {
  #selection: ReadonlyLabelSelection | null;

  /** The selection object to monitor, if any. */
  get selection(): ReadonlyLabelSelection | null {
    return this.#selection;
  }

  set selection(value: ReadonlyLabelSelection | null) {
    if (this.#selection !== value) {
      this.#selection = value;

      this.#setPrevTransform(value);
    }
  }

  #prevTransform: LocalSelectionData | null = null;

  /**
   * Updates the value of `this.#prevTransform` according to a selection object.
   */
  #setPrevTransform(selection: ReadonlyLabelSelection | null): void {
    if (selection == null) {
      this.#prevTransform = null;
      return;
    }

    this.#prevTransform = {
      pointCoords: [...selection.pointCoords],
      centerPoint: selection.centerPoint.clone(),
    };
  }

  /**
   * Monitors any modifications on label selection data points on
   * its threejs object to dispatch corresponding change event.
   */
  #monitorReform = (): void => {
    const selection = this.#selection;
    const prevTransform = this.#prevTransform;
    if (selection == null) return;

    if (!(selection instanceof LabelSelection)) {
      console.error(selection);
      throw new Error("Incorrect type of selection");
    }

    if (prevTransform != null) {
      if (!selection.centerPoint.equals(prevTransform.centerPoint)) {
        selection.dispatchEvent({
          type: "change",
          obj: selection,
          propertyKey: "points",
        });
      }
    }

    this.#setPrevTransform(selection);
  };

  readonly #MONITOR_REFORM_INTERVAL_MS: number = 100;

  #monitorReformTimer: ReturnType<typeof setInterval>;

  /**
   * Creates a new object to monitor changes to the transform of a bounding box.
   */
  constructor(selection: ReadonlyLabelSelection | null = null) {
    this.#selection = selection;
    this.#setPrevTransform(selection);

    this.#monitorReformTimer = setInterval(
      this.#monitorReform,
      this.#MONITOR_REFORM_INTERVAL_MS,
    );
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   */
  dispose(): void {
    clearInterval(this.#monitorReformTimer);
  }
}
