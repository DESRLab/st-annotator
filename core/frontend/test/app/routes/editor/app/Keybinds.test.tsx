/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import {
  BaseKeybindHandler,
  ComposableKeybindHandler,
  KeybindHandlerGlobalContext,
  normalizeKeyCombo,
} from "../../../../../app/routes/editor/app/Keybinds";
import type { Keybind } from "../../../../../app/routes/editor/app/Keybinds";

function keybind(keyCombo: string, handler = vi.fn()): Keybind {
  return { keyCombo, name: `Test ${keyCombo}`, handler };
}

describe("normalizeKeyCombo", () => {
  it("normalizes spacing but keeps the library key order", () => {
    // Registration and lookup both go through this normalization, so any
    // spacing of the same ordered combo matches. The key ORDER is the
    // library's canonical one (`KeybindHandlerGlobalContext` pins that
    // delivered events match combos registered in that order).
    expect(normalizeKeyCombo("ctrl + s")).toBe(normalizeKeyCombo("ctrl+s"));
    expect(normalizeKeyCombo("ctrl + shift + z")).toBe(
      normalizeKeyCombo("ctrl+shift+z"),
    );
    expect(normalizeKeyCombo("ctrl + s")).not.toBe(
      normalizeKeyCombo("ctrl + d"),
    );
    expect(normalizeKeyCombo("ctrl + s")).not.toBe(
      normalizeKeyCombo("s + ctrl"),
    );
  });
});

describe("BaseKeybindHandler", () => {
  it("dispatches the matching keybind and reports whether it handled the event", () => {
    const bound = keybind("ctrl + s");
    const handler = new BaseKeybindHandler([bound]);

    expect(handler.handle({ keyCombo: "ctrl + s" } as never)).toBe(true);
    expect(bound.handler).toHaveBeenCalledTimes(1);

    expect(handler.handle({ keyCombo: "ctrl + x" } as never)).toBe(false);
    expect(bound.handler).toHaveBeenCalledTimes(1);
  });

  it("looks up combos by their normalized ordered spelling", () => {
    const bound = keybind("ctrl + shift + z");
    const handler = new BaseKeybindHandler([bound]);

    // The library delivers event combos in canonical order (pinned by the
    // global-context tests below); registrations must use that order.
    expect(handler.handle({ keyCombo: "ctrl+shift+z" } as never)).toBe(true);
    expect(bound.handler).toHaveBeenCalledTimes(1);

    expect(handler.handle({ keyCombo: "shift+ctrl+z" } as never)).toBe(false);
    expect(bound.handler).toHaveBeenCalledTimes(1);
  });

  it("rejects a duplicate registration under any equivalent spacing", () => {
    const handler = new BaseKeybindHandler([keybind("ctrl + s")]);

    expect(() => handler.register(keybind("ctrl + s"))).toThrow(
      /already registered/,
    );
    expect(() => handler.register(keybind("ctrl+s"))).toThrow(
      /already registered/,
    );
  });

  it("deregisters a registered keybind and rejects unknown ones", () => {
    const bound = keybind("ctrl + s");
    const handler = new BaseKeybindHandler([bound]);
    const changes = vi.fn();
    handler.addEventListener("change", changes);

    handler.deregister(bound);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(handler.handle({ keyCombo: "ctrl + s" } as never)).toBe(false);

    expect(() => handler.deregister(bound)).toThrow(/not registered/);
  });

  it("forwards every event, including repeats in the same tick", () => {
    // The keybind layer performs no deduplication: two events in one tick
    // reach the owning controller twice, so command-level deduplication
    // (e.g. label creation) belongs to that owner, not to this layer.
    const bound = keybind("x");
    const handler = new BaseKeybindHandler([bound]);

    handler.handle({ keyCombo: "x" } as never);
    handler.handle({ keyCombo: "x" } as never);

    expect(bound.handler).toHaveBeenCalledTimes(2);
  });
});

describe("ComposableKeybindHandler", () => {
  it("handles its own keybinds before any child and walks children in order", () => {
    const parentBind = keybind("a");
    const firstChildBind = keybind("b");
    const secondChildBind = keybind("b");
    const parent = new ComposableKeybindHandler(
      [parentBind],
      [
        new ComposableKeybindHandler([firstChildBind]),
        new ComposableKeybindHandler([secondChildBind]),
      ],
    );

    expect(parent.handle({ keyCombo: "a" } as never)).toBe(true);
    expect(parentBind.handler).toHaveBeenCalledTimes(1);

    // Both children bind the same combo; only the first child wins.
    expect(parent.handle({ keyCombo: "b" } as never)).toBe(true);
    expect(firstChildBind.handler).toHaveBeenCalledTimes(1);
    expect(secondChildBind.handler).not.toHaveBeenCalled();

    expect(parent.handle({ keyCombo: "c" } as never)).toBe(false);
  });

  it("iterates the subtree keybinds in composition order", () => {
    const parent = new ComposableKeybindHandler(
      [keybind("a")],
      [
        new ComposableKeybindHandler(
          [keybind("b")],
          [new ComposableKeybindHandler([keybind("d")])],
        ),
        new ComposableKeybindHandler([keybind("c")]),
      ],
    );

    const combos = [...parent.iterSubtreeKeybinds()].map(
      ({ keyCombo }) => keyCombo,
    );
    expect(combos).toEqual(["a", "b", "d", "c"]);
  });

  it("propagates child changes and guards the child list", () => {
    const parent = new ComposableKeybindHandler();
    const child = new ComposableKeybindHandler();
    const changes = vi.fn();
    parent.addEventListener("change", changes);

    parent.appendChild(child);
    expect(changes).toHaveBeenCalledTimes(1);

    // A registration deep in the subtree bubbles up to the root.
    child.register(keybind("x"));
    expect(changes).toHaveBeenCalledTimes(2);

    expect(() => parent.appendChild(child)).toThrow(/already a child/);
    expect(() => parent.removeChild(new ComposableKeybindHandler())).toThrow(
      /not a child/,
    );

    parent.removeChild(child);
    expect(changes).toHaveBeenCalledTimes(3);

    // Detached children no longer receive events through the parent.
    child.register(keybind("y"));
    expect(parent.handle({ keyCombo: "y" } as never)).toBe(false);
  });

  it("stops relaying change events from removed children", () => {
    const parent = new ComposableKeybindHandler();
    const child = new ComposableKeybindHandler();
    parent.appendChild(child);
    parent.removeChild(child);

    const changes = vi.fn();
    parent.addEventListener("change", changes);
    child.register(keybind("x"));
    expect(changes).not.toHaveBeenCalled();
  });
});

describe("KeybindHandlerGlobalContext", () => {
  function pressKey(key: string): void {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function releaseKey(key: string): void {
    document.dispatchEvent(
      new KeyboardEvent("keyup", {
        key,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  it("binds subtree combos globally, follows later registrations, and unbinds on dispose", () => {
    const boundA = keybind("a");
    const handler = new ComposableKeybindHandler([boundA]);
    const context = new KeybindHandlerGlobalContext(handler, "keydown");

    pressKey("a");
    releaseKey("a");
    expect(boundA.handler).toHaveBeenCalledTimes(1);

    // A combo registered after the context was created is bound through
    // the change event (e.g. a plugin layer attaching its keybinds).
    const boundB = keybind("b");
    handler.register(boundB);
    pressKey("b");
    releaseKey("b");
    expect(boundB.handler).toHaveBeenCalledTimes(1);

    context.dispose();
    pressKey("a");
    releaseKey("a");
    pressKey("b");
    releaseKey("b");
    expect(boundA.handler).toHaveBeenCalledTimes(1);
    expect(boundB.handler).toHaveBeenCalledTimes(1);
  });

  it("binds child handler combos added after creation", () => {
    const root = new ComposableKeybindHandler();
    const context = new KeybindHandlerGlobalContext(root, "keydown");

    const childBind = keybind("q");
    const child = new ComposableKeybindHandler([childBind]);
    root.appendChild(child);

    pressKey("q");
    releaseKey("q");
    expect(childBind.handler).toHaveBeenCalledTimes(1);

    context.dispose();
  });

  it("ignores key events targeting editable form controls", () => {
    // The hotkey routing matrix: keybinds must never fire while the user
    // types in a text/number field, a dropdown, or a content-editable
    // widget. (Loading/layer-switch routing is pinned in
    // LayerCollection.test.tsx; the editor owns no modal system, and
    // playback does not change tool ownership, so neither gates keys.)
    const bound = keybind("a");
    const context = new KeybindHandlerGlobalContext(
      new ComposableKeybindHandler([bound]),
      "keydown",
    );

    const input = document.createElement("input");
    const textarea = document.createElement("textarea");
    const select = document.createElement("select");
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    const plain = document.createElement("div");
    document.body.append(input, textarea, select, editable, plain);

    for (const element of [input, textarea, select, editable]) {
      element.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "a",
          bubbles: true,
          cancelable: true,
        }),
      );
      element.dispatchEvent(
        new KeyboardEvent("keyup", {
          key: "a",
          bubbles: true,
          cancelable: true,
        }),
      );
    }
    expect(bound.handler).not.toHaveBeenCalled();

    // Non-editable targets still route.
    plain.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "a",
        bubbles: true,
        cancelable: true,
      }),
    );
    releaseKey("a");
    expect(bound.handler).toHaveBeenCalledTimes(1);

    context.dispose();
    document.body.replaceChildren();
  });

  it("delivers modifier combos in canonical order regardless of press order", () => {
    // The registration spelling used across the editor ('ctrl + shift + z')
    // must match however the user physically presses the keys.
    const bound = keybind("ctrl + shift + z");
    const context = new KeybindHandlerGlobalContext(
      new ComposableKeybindHandler([bound]),
      "keydown",
    );

    pressKey("Control");
    pressKey("Shift");
    pressKey("z");
    releaseKey("z");
    releaseKey("Shift");
    releaseKey("Control");
    expect(bound.handler).toHaveBeenCalledTimes(1);

    pressKey("z");
    pressKey("Shift");
    pressKey("Control");
    releaseKey("Control");
    releaseKey("Shift");
    releaseKey("z");
    expect(bound.handler).toHaveBeenCalledTimes(2);

    context.dispose();
  });
});
