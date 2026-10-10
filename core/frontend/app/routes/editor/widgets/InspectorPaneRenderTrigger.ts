import { VanillaEventDispatcher } from "../utils";

export type InspectorPaneRenderTrigger<TEventMap extends object> = Readonly<{
  [TEventType in Extract<keyof TEventMap, string>]?:
    boolean | ((event: TEventMap[TEventType]) => boolean);
}>;

export interface InspectorLabelSource {
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

/** Combines trigger maps so an event refreshes when any map accepts it. */
export function composeRenderTriggers<TEventMap extends object>(
  ...triggers: readonly InspectorPaneRenderTrigger<TEventMap>[]
): InspectorPaneRenderTrigger<TEventMap> {
  type ErasedTrigger = Readonly<
    Record<string, boolean | ((event: never) => boolean)>
  >;
  const combined: Record<string, boolean | ((event: never) => boolean)> = {};
  const erasedTriggers = triggers as unknown as readonly ErasedTrigger[];
  const eventTypes = new Set(
    triggers.flatMap((trigger) => Object.keys(trigger)),
  );

  for (const eventType of eventTypes) {
    combined[eventType] = (event: never): boolean =>
      erasedTriggers.some((trigger) => {
        const predicate = trigger[eventType];
        return typeof predicate === "function"
          ? predicate(event)
          : predicate === true;
      });
  }

  return combined as unknown as InspectorPaneRenderTrigger<TEventMap>;
}

/** Emits `render` when a subscribed label source emits a matching event. */
export class InspectorRenderSignaller<
  TEventMap extends object,
> extends VanillaEventDispatcher<{ render: {} }> {
  readonly trigger: InspectorPaneRenderTrigger<TEventMap>;

  #labels: InspectorLabelSource | null = null;
  #listeners: Record<string, (event: unknown) => void>;

  constructor(
    trigger: InspectorPaneRenderTrigger<TEventMap>,
    labels: InspectorLabelSource | null = null,
  ) {
    super();
    this.trigger = trigger;
    this.#listeners = Object.fromEntries(
      Object.entries(trigger).map(([eventType, predicate]) => [
        eventType,
        (event: unknown): void => {
          if (typeof predicate === "function" ? predicate(event) : predicate) {
            this.dispatchEvent({ type: "render" });
          }
        },
      ]),
    );
    this.labels = labels;
  }

  get labels(): InspectorLabelSource | null {
    return this.#labels;
  }

  set labels(labels: InspectorLabelSource | null) {
    if (this.#labels === labels) return;

    this.#setSubscriptions(this.#labels, "removeEventListener");
    this.#labels = labels;
    this.#setSubscriptions(labels, "addEventListener");
    this.dispatchEvent({ type: "render" });
  }

  dispose(): void {
    this.#setSubscriptions(this.#labels, "removeEventListener");
    this.#labels = null;
  }

  #setSubscriptions(
    labels: InspectorLabelSource | null,
    operation: "addEventListener" | "removeEventListener",
  ): void {
    if (labels == null) return;
    for (const [eventType, listener] of Object.entries(this.#listeners)) {
      labels[operation](eventType, listener);
    }
  }
}
