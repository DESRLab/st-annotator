import { describe, expect, it, vi } from "vitest";

import { EventSubscriptions } from "../../../../../app/routes/editor/utils/EventSubscriptions.ts";
import type { EventSubscriptionListener } from "../../../../../app/routes/editor/utils/EventSubscriptions.ts";
import { VanillaEventDispatcher } from "../../../../../app/routes/editor/utils/VanillaEventDispatcher.ts";

interface TestEventMap {
  ping: { value: number };
  pong: { value: number };
}

describe("VanillaEventDispatcher", () => {
  it("dispatches mapped payloads to registered listeners", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    const pinged: number[] = [];

    dispatcher.addEventListener("ping", (event) => pinged.push(event.value));
    dispatcher.dispatchEvent({ type: "ping", value: 1 });
    dispatcher.dispatchEvent({ type: "ping", value: 2 });

    expect(pinged).toEqual([1, 2]);
  });

  it("ignores duplicate registrations of the same listener", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    const listener = vi.fn();

    dispatcher.addEventListener("ping", listener);
    dispatcher.addEventListener("ping", listener);
    dispatcher.dispatchEvent({ type: "ping", value: 1 });

    expect(listener).toHaveBeenCalledOnce();
  });

  it("reports listener registration through hasEventListener", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    const listener = vi.fn();

    expect(dispatcher.hasEventListener("ping", listener)).toBe(false);
    dispatcher.addEventListener("ping", listener);
    expect(dispatcher.hasEventListener("ping", listener)).toBe(true);

    dispatcher.removeEventListener("ping", listener);
    expect(dispatcher.hasEventListener("ping", listener)).toBe(false);
  });

  it("does not dispatch to listeners of other event types", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    const ponged = vi.fn();

    dispatcher.addEventListener("pong", ponged);
    dispatcher.dispatchEvent({ type: "ping", value: 1 });

    expect(ponged).not.toHaveBeenCalled();
  });

  it("dispatches nothing when no listeners were ever added", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    expect(() =>
      dispatcher.dispatchEvent({ type: "ping", value: 1 }),
    ).not.toThrow();
  });

  it("invokes listeners with the dispatcher as the receiver", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    let invoked = false;

    dispatcher.addEventListener("ping", function onPing(this: unknown) {
      invoked = true;
      expect(this).toBe(dispatcher);
    });
    dispatcher.dispatchEvent({ type: "ping", value: 1 });

    expect(invoked).toBe(true);
  });

  it("sets event.target for the duration of the dispatch and nulls it afterwards", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    let targetDuringDispatch: unknown = "unset";

    dispatcher.addEventListener("ping", (event) => {
      targetDuringDispatch = event.target;
    });

    const event = { type: "ping", value: 1 } as {
      type: "ping";
      value: number;
      target?: unknown;
    };
    dispatcher.dispatchEvent(event);

    expect(targetDuringDispatch).toBe(dispatcher);
    expect(event.target).toBeNull();
  });

  it("keeps the current dispatch round stable when a listener removes itself", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    const calls: string[] = [];
    const first: EventSubscriptionListener<TestEventMap, "ping"> = () => {
      calls.push("first");
      dispatcher.removeEventListener("ping", first);
    };

    dispatcher.addEventListener("ping", first);
    dispatcher.addEventListener("ping", () => calls.push("second"));
    dispatcher.dispatchEvent({ type: "ping", value: 1 });
    dispatcher.dispatchEvent({ type: "ping", value: 2 });

    expect(calls).toEqual(["first", "second", "second"]);
  });

  it("does not invoke listeners added mid-dispatch until the next round", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    const calls: string[] = [];

    dispatcher.addEventListener("ping", () => {
      calls.push("outer");
      dispatcher.addEventListener("ping", () => calls.push("inner"));
    });
    dispatcher.dispatchEvent({ type: "ping", value: 1 });
    dispatcher.dispatchEvent({ type: "ping", value: 2 });

    expect(calls).toEqual(["outer", "outer", "inner"]);
  });

  it("satisfies the structural TypedEventTarget contract used by EventSubscriptions", () => {
    const dispatcher = new VanillaEventDispatcher<TestEventMap>();
    const subscriptions = new EventSubscriptions();
    const pinged: number[] = [];

    subscriptions.add<TestEventMap, "ping">(dispatcher, "ping", (event) =>
      pinged.push(event.value),
    );
    dispatcher.dispatchEvent({ type: "ping", value: 1 });
    subscriptions.dispose();
    dispatcher.dispatchEvent({ type: "ping", value: 2 });

    expect(pinged).toEqual([1]);
  });
});
