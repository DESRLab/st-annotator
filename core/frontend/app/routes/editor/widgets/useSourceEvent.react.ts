import { useCallback, useRef } from "react";

import { useExternalStoreVersion } from "../app/EditorState.react.ts";

/** Event registration surface required to observe a source from React. */
export interface SourceEventTarget {
  addEventListener(eventType: string, listener: () => void): void;
  removeEventListener(eventType: string, listener: () => void): void;
}

/** A single event source or a list of sources sharing the same event type(s). */
export type SourceEventInput = SourceEventTarget | readonly SourceEventTarget[];

/** The element type of a source input (unwraps arrays). */
export type SourceEventElement<TSource> =
  TSource extends readonly (infer TElement)[] ? TElement : TSource;

/** Event types that {@link SourceEventTarget.addEventListener} of a source accepts. */
export type SourceEventType<TSource> = TSource extends {
  addEventListener(eventType: infer TEventType, listener: never): void;
}
  ? Extract<TEventType, string>
  : never;

/** One event type, or a list of event types, of a single source. */
export type SourceEventTypeInput<TSource> =
  SourceEventType<TSource> | readonly SourceEventType<TSource>[];

function toSourceArray(source: SourceEventInput): readonly SourceEventTarget[] {
  return "addEventListener" in source ? [source] : source;
}

function toEventTypeArray(
  eventType: string | readonly string[],
): readonly string[] {
  return typeof eventType === "string" ? [eventType] : eventType;
}

/**
 * Subscribes React to one or more events of a `THREE.EventDispatcher`-shaped
 * source.
 *
 * The source is notify-only, so a version counter advanced by each
 * notification is the snapshot; reads of the source happen during
 * render after each version change. A `null` or `undefined` source is not
 * subscribed.
 *
 * @param source - The event source, or sources, to subscribe to.
 * @param eventType - The event type, or event types, to subscribe to.
 * @param listener - An optional callback invoked for each event, before the re-render.
 * @returns The number of events observed since mount.
 */
export function useSourceEventVersion<TSource extends SourceEventInput>(
  source: TSource | null | undefined,
  eventType: SourceEventTypeInput<SourceEventElement<TSource>>,
  listener?: () => void,
): number {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;

  const eventTypeRef = useRef(eventType);
  eventTypeRef.current = eventType;
  // Arrays passed inline would otherwise resubscribe on every render.
  const eventTypeKey =
    typeof eventType === "string" ? eventType : eventType.join("\u0000");

  const subscribe = useCallback(
    (onStoreChange: () => void): (() => void) => {
      if (source == null) return (): void => {};
      const targets = toSourceArray(source);
      const eventTypes = toEventTypeArray(eventTypeRef.current);
      const handleEvent = (): void => {
        listenerRef.current?.();
        onStoreChange();
      };
      for (const target of targets) {
        for (const type of eventTypes)
          target.addEventListener(type, handleEvent);
      }
      return (): void => {
        for (const target of targets) {
          for (const type of eventTypes)
            target.removeEventListener(type, handleEvent);
        }
      };
    },
    [eventTypeKey, source],
  );

  return useExternalStoreVersion(subscribe);
}
