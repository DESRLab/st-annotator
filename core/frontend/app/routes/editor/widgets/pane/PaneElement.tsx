import type { Expand } from "sta/common";

import { VanillaEventDispatcher } from "../../utils";

/**
 * Base interface for pane elements.
 */
export interface _PaneElement<P> {
  /**
   * Disposes of this pane element. Do not use it afterwards.
   */
  dispose(): void;

  /**
   * Updates this pane element with the given parameters (props).
   */
  render(params: Readonly<P>): void;

  /**
   * Updates the parameters with the ones that are currently represented by this pane element.
   */
  updateParams(params: P): void;
}

/**
 * Represents an element of a `tweakpane` pane containing information to display to the user.
 */
export type PaneElement<P, E extends {}> = Expand<
  _PaneElement<P> & VanillaEventDispatcher<E>
>;

/**
 * Attaches event handlers to a `tweakpane` element.
 */
export function bindHandlers<
  P,
  E extends {},
  EventNames extends readonly string[],
  THandler extends Record<
    EventNames[number],
    (element: PaneElement<P, E>, ev: any) => void
  >,
>(
  paneElem: PaneElement<P, E>,
  eventNames: [...EventNames],
  handlers: Partial<THandler>,
  tweakpaneElem: {
    on<EventName extends EventNames[number]>(
      eventName: EventName,
      handler: (ev: Parameters<THandler[EventName]>[1]) => void,
    ): unknown;
  },
): void {
  for (const eventName of eventNames) {
    const handler = handlers[eventName];

    if (handler !== undefined) {
      tweakpaneElem.on(eventName, (ev: any) => handler(paneElem, ev));
    }
  }
}

/**
 * Attempts to assign each attribute in `attrs` to `target`.
 */
export function safeAssign<T>(target: object, attrs: Readonly<T>): Partial<T> {
  const unsafeEntries: Record<string, unknown> = {};

  // The target is written to reflectively, so treat it as an indexable record.
  const targetRecord = target as Record<string, unknown>;

  for (const [k, v] of Object.entries(attrs)) {
    if (k in target) {
      // Avoid unnecessary updates
      if (targetRecord[k] !== v) {
        try {
          targetRecord[k] = v;
        } catch {
          unsafeEntries[k] = v;
        }
      }
    } else {
      unsafeEntries[k] = v;
    }
  }

  // Each entry originates from `attrs`, so the record corresponds to a partial `T`.
  return unsafeEntries as Partial<T>;
}
