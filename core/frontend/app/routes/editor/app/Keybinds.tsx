import { Keystrokes, parseKeyCombo, stringifyKeyCombo } from "@rwh/keystrokes";
import type { HandlerFn, HandlerObj } from "@rwh/keystrokes";

import type { Expand } from "sta/common";

import { VanillaEventDispatcher } from "../utils";

const keystrokes = new Keystrokes({
  keyRemap: {
    " ": "space",
    control: "ctrl",
    os: "meta", // For Firefox
  },
});

/**
 * Normalizes the string representation of a key combo.
 *
 * This is to circumvent the error where `normalizeKeyCombo` provided by the `.cjs`
 * module fails to resolve `this`.
 */
export function normalizeKeyCombo(keyComboStr: string): string {
  return stringifyKeyCombo(parseKeyCombo(keyComboStr));
}

type KeyComboEventHandler = Parameters<Keystrokes["bindKeyCombo"]>[1];
type KeyComboEventHandlerFn = Extract<KeyComboEventHandler, HandlerFn<any>>;
type KeyComboEventHandlerObj = Extract<KeyComboEventHandler, HandlerObj<any>>;
type KeyComboEvent =
  KeyComboEventHandlerFn extends HandlerFn<infer E> ? E : never;

/**
 * Represents a keyboard shortcut binding.
 */
export interface Keybind {
  /** The combination of keys that triggers the keybind. */
  keyCombo: string;
  /** The name of the keybind. */
  name: string;
  /** Handles the event when the keybind is activated. */
  handler: KeyComboEventHandlerFn;
}

export interface KeybindHandlerEventMap {
  change: {};
}

/**
 * Represents an object that can handle keyboard events.
 */
export type KeybindHandler = Expand<
  _KeybindHandler & VanillaEventDispatcher<KeybindHandlerEventMap>
>;

/**
 * Abstract interface for keybind handlers.
 */
export interface _KeybindHandler {
  /**
   * The keybinds that have been registered to this handler.
   */
  readonly keybinds: IterableIterator<Keybind>;

  /**
   * Handles the given key event by matching it against the keybinds in this handler.
   */
  handle(event: KeyComboEvent): boolean;
}

/**
 * Helper class to handle keyboard events.
 */
export class BaseKeybindHandler
  extends VanillaEventDispatcher<KeybindHandlerEventMap>
  implements KeybindHandler
{
  readonly #keybindsByNormalizedCombo: Map<string, Keybind>;

  get keybinds(): IterableIterator<Keybind> {
    return this.#keybindsByNormalizedCombo.values();
  }

  constructor(keybinds: Iterable<Keybind> = []) {
    super();

    this.#keybindsByNormalizedCombo = new Map();

    for (const keybind of keybinds) {
      this.register(keybind);
    }
  }

  register(keybind: Keybind): void {
    const normalizedCombo = normalizeKeyCombo(keybind.keyCombo);
    if (this.#keybindsByNormalizedCombo.has(normalizedCombo)) {
      throw new Error(
        `Keybind already registered for keyCombo: ${normalizedCombo}`,
      );
    }

    this.#keybindsByNormalizedCombo.set(normalizedCombo, keybind);

    this.dispatchEvent({ type: "change" });
  }

  deregister(keybind: Keybind): void {
    const normalizedCombo = normalizeKeyCombo(keybind.keyCombo);
    if (!this.#keybindsByNormalizedCombo.has(normalizedCombo)) {
      throw new Error(
        `Keybind not registered for keyCombo: ${normalizedCombo}`,
      );
    }

    this.#keybindsByNormalizedCombo.delete(normalizedCombo);

    this.dispatchEvent({ type: "change" });
  }

  handle(event: KeyComboEvent): boolean {
    const normalizedCombo = normalizeKeyCombo(event.keyCombo);
    const keybind = this.#keybindsByNormalizedCombo.get(normalizedCombo);
    if (keybind == null) return false;

    keybind.handler(event);
    return true;
  }
}

/**
 * Helper class to handle keyboard events.
 *
 * Can be composed via children.
 */
export class ComposableKeybindHandler extends BaseKeybindHandler {
  #children: ComposableKeybindHandler[];

  get children(): readonly ComposableKeybindHandler[] {
    return this.#children;
  }

  setChildren(children: readonly ComposableKeybindHandler[]): void {
    for (const child of this.#children) {
      child.removeEventListener("change", this.#onChildChange);
    }

    this.#children = [...children];

    for (const child of this.#children) {
      child.addEventListener("change", this.#onChildChange);
    }

    this.dispatchEvent({ type: "change" });
  }

  appendChild(child: ComposableKeybindHandler): void {
    if (this.children.includes(child)) {
      throw new Error("The given handler is already a child");
    }

    this.setChildren([...this.children, child]);
  }

  removeChild(child: ComposableKeybindHandler): void {
    if (!this.children.includes(child)) {
      throw new Error("The given handler is not a child");
    }

    this.setChildren(this.children.filter((c) => c !== child));
  }

  *iterSubtreeKeybinds(): IterableIterator<Keybind> {
    for (const keybind of this.keybinds) yield keybind;

    for (const child of this.children) {
      for (const keybind of child.iterSubtreeKeybinds()) {
        yield keybind;
      }
    }
  }

  #onChildChange = (): void => {
    this.dispatchEvent({ type: "change" });
  };

  constructor(
    keybinds: Iterable<Keybind> = [],
    children: readonly ComposableKeybindHandler[] = [],
  ) {
    super(keybinds);

    this.#children = [...children];

    for (const child of this.#children) {
      child.addEventListener("change", this.#onChildChange);
    }
  }

  dispose(): void {
    for (const child of this.#children) {
      child.removeEventListener("change", this.#onChildChange);
    }
  }

  handle(event: KeyComboEvent): boolean {
    if (super.handle(event)) return true;

    for (const child of this.children) {
      if (child.handle(event)) return true;
    }

    return false;
  }
}

/**
 * Whether the event target is an editable form control.
 *
 * Keybinds apply to the scene, not to form input: while the user types in a
 * text/number field, a dropdown, or a content-editable widget, editor
 * keybinds must not fire (and must not preventDefault the keystroke).
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  // `isContentEditable` is the computed flag (inherited included); the
  // attribute check covers environments that do not compute it (jsdom).
  if (target.isContentEditable || target.contentEditable === "true")
    return true;

  const tagName = target.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

/**
 * Helper class to attach a handler to the global event listener.
 */
export class KeybindHandlerGlobalContext {
  readonly handler: ComposableKeybindHandler;
  readonly mode: "keydown" | "keyup";
  readonly #handlerObj: KeyComboEventHandlerObj;

  #handle = (event: KeyComboEvent): void => {
    if (isEditableTarget(event.finalKeyEvent.originalEvent?.target ?? null))
      return;

    event.finalKeyEvent.preventDefault();

    this.handler.handle(event);
  };

  #seenKeyCombos = new Set<string>();

  #bindHandlerComboStrs(): void {
    for (const { keyCombo } of this.handler.iterSubtreeKeybinds()) {
      if (!this.#seenKeyCombos.has(keyCombo)) {
        keystrokes.bindKeyCombo(keyCombo, this.#handlerObj);

        this.#seenKeyCombos.add(keyCombo);
      }
    }
  }

  #onHandlerChange = (): void => {
    this.#bindHandlerComboStrs();
  };

  constructor(handler: ComposableKeybindHandler, mode: "keydown" | "keyup") {
    this.handler = handler;
    this.mode = mode;

    switch (mode) {
      case "keydown": {
        this.#handlerObj = { onPressed: this.#handle };
        break;
      }
      case "keyup": {
        this.#handlerObj = { onReleased: this.#handle };
        break;
      }
      default:
        throw new Error(`Invalid mode: ${mode}`);
    }

    this.#bindHandlerComboStrs();

    this.handler.addEventListener("change", this.#onHandlerChange);
  }

  dispose(): void {
    this.handler.removeEventListener("change", this.#onHandlerChange);

    for (const keyCombo of this.#seenKeyCombos) {
      keystrokes.unbindKeyCombo(keyCombo, this.#handlerObj);
    }
  }
}
