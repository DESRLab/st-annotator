import { ComposableKeybindHandler } from "../Keybinds";

/** Owns the keyboard handlers associated with an editor menu. */
export class MenuKeybinds {
  readonly keydownHandler = new ComposableKeybindHandler();
  readonly keyupHandler = new ComposableKeybindHandler();

  dispose(): void {
    this.keydownHandler.dispose();
    this.keyupHandler.dispose();
  }
}

export interface MenuKeybindOwner {
  keydownHandler: ComposableKeybindHandler;
  keyupHandler: ComposableKeybindHandler;
  dispose(): void;
}
