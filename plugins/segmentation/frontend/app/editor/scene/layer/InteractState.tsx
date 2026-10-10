import type { ReactNode } from "react";

import { ComposableKeybindHandler } from "sta/app/editor";
import type { Keybind } from "sta/app/editor";

import type {
  InteractContext,
  InteractContextUsage,
  MainWindowMapper,
} from "./InteractContext";

export interface InteractStateParams<WM extends MainWindowMapper> {
  context: InteractContext<WM>;
  keydownBinds?: readonly Keybind[];
  keyupBinds?: readonly Keybind[];
}

/**
 * Represents a state that a {@link InteractContext} can take.
 */
export class InteractState<WM extends MainWindowMapper> {
  /**
   * The context containing this state.
   */
  readonly context: InteractContext<WM>;

  /**
   * Handles the event when a key is pressed in this menu.
   */
  readonly keydownHandler: ComposableKeybindHandler;

  /**
   * Handles the event when a key is released in this menu.
   */
  readonly keyupHandler: ComposableKeybindHandler;

  /**
   * Creates a new state instance.
   *
   * This is called right before the state of the context is transitioned to this one.
   */
  constructor({
    context,
    keydownBinds = [],
    keyupBinds = [],
  }: InteractStateParams<WM>) {
    this.context = context;
    this.keydownHandler = new ComposableKeybindHandler(keydownBinds);
    this.keyupHandler = new ComposableKeybindHandler(keyupBinds);
  }

  /**
   * Disposes of this object. Do not use it afterwards.
   *
   * This is called right before the state of the context is transitioned from this one.
   */
  dispose(): void {
    this.keydownHandler.dispose();
    this.keyupHandler.dispose();
  }

  /**
   * Specifies how this state uses the context.
   *
   * This is called during each animation frame, and when an event is emitted by a component.
   */
  getUsage(isReadonly: boolean): InteractContextUsage {
    throw new Error("Not implemented");
  }

  /**
   * Gets the content to display as a hint to the user when this layer is active.
   *
   * If `null`, no hint is displayed.
   */
  getHint(isReadonly: boolean): ReactNode {
    throw new Error("Not implemented");
  }
}
