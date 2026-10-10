import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { EventSubscriptions } from "../../../../../app/routes/editor/utils/EventSubscriptions.ts";
import type {
  EventSubscriptionListener,
  TypedEventTarget,
} from "../../../../../app/routes/editor/utils/EventSubscriptions.ts";

interface TestEventMap {
  ping: { value: number };
  pong: { value: number };
}

describe("EventSubscriptions", () => {
  it("removes registered listeners upon dispose", () => {
    const dispatcher = new THREE.EventDispatcher<TestEventMap>();
    const subscriptions = new EventSubscriptions();
    const pinged: number[] = [];
    const ponged: number[] = [];

    subscriptions.add<TestEventMap, "ping">(dispatcher, "ping", (event) =>
      pinged.push(event.value),
    );
    subscriptions.add<TestEventMap, "pong">(dispatcher, "pong", (event) =>
      ponged.push(event.value),
    );

    expect(subscriptions.size).toBe(2);
    expect(subscriptions.isEmpty).toBe(false);

    dispatcher.dispatchEvent({ type: "ping", value: 1 });
    subscriptions.dispose();
    dispatcher.dispatchEvent({ type: "ping", value: 2 });
    dispatcher.dispatchEvent({ type: "pong", value: 3 });

    expect(pinged).toEqual([1]);
    expect(ponged).toEqual([]);
    expect(subscriptions.size).toBe(0);
    expect(subscriptions.isEmpty).toBe(true);
  });

  it("disposes idempotently", () => {
    const dispatcher = new THREE.EventDispatcher<TestEventMap>();
    const subscriptions = new EventSubscriptions();
    const pinged: number[] = [];
    let disposerRuns = 0;

    subscriptions.add<TestEventMap, "ping">(dispatcher, "ping", (event) =>
      pinged.push(event.value),
    );
    subscriptions.addDisposer(() => {
      disposerRuns += 1;
    });

    subscriptions.dispose();
    expect(() => subscriptions.dispose()).not.toThrow();

    dispatcher.dispatchEvent({ type: "ping", value: 1 });

    expect(pinged).toEqual([]);
    expect(disposerRuns).toBe(1);
  });

  it("runs recorded disposers in LIFO order", () => {
    const subscriptions = new EventSubscriptions();
    const order: string[] = [];

    subscriptions.addDisposer(() => order.push("first"));
    subscriptions.addDisposer(() => order.push("second"));

    subscriptions.dispose();

    expect(order).toEqual(["second", "first"]);
  });

  it("interleaves listener removals and disposers in LIFO order", () => {
    const order: string[] = [];
    const target: TypedEventTarget<TestEventMap> = {
      addEventListener: () => {},
      removeEventListener: () => {
        order.push("listener-removal");
      },
    };
    const subscriptions = new EventSubscriptions();

    subscriptions.add<TestEventMap, "ping">(target, "ping", () => {});
    subscriptions.addDisposer(() => order.push("disposer"));

    subscriptions.dispose();

    expect(order).toEqual(["disposer", "listener-removal"]);
  });

  it("tracks listeners on structural non-THREE event targets", () => {
    const removed: [string, unknown][] = [];
    const target: TypedEventTarget<TestEventMap> = {
      addEventListener: () => {},
      removeEventListener: (type, listener) => {
        removed.push([type, listener]);
      },
    };

    const subscriptions = new EventSubscriptions();
    const onPing: EventSubscriptionListener<TestEventMap, "ping"> = () => {};

    subscriptions.add<TestEventMap, "ping">(target, "ping", onPing);
    subscriptions.dispose();

    expect(removed).toEqual([["ping", onPing]]);
  });
});
