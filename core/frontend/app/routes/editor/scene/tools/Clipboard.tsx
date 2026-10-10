import type { MouseEventHandler } from "react";

import { VanillaEventDispatcher } from "../../utils";

export interface ClipboardEventMap<D> {
  change: {};
  copy: { clipboard: D };
  paste: { clipboard: D };
}

export interface ClipboardImpl<S, D> {
  objToData: (selectedObj: S) => D;
}

export interface ClipboardViewState {
  disabled: boolean;
  disableCopy: boolean;
  disablePaste: boolean;
}

/**
 * Contains a user interface for copy and pasting objects in the scene.
 */
export class Clipboard<S, D> extends VanillaEventDispatcher<
  ClipboardEventMap<D>
> {
  #selectedObj: S | null = null;
  #clipboard: D | null = null;
  #disabled = false;
  #impl: ClipboardImpl<S, D>;
  #viewState: ClipboardViewState = {
    disabled: false,
    disableCopy: true,
    disablePaste: true,
  };

  /** Whether an object is selected. */
  get hasSelection(): boolean {
    return this.#selectedObj != null;
  }

  /** The data in the clipboard, which is based on the selected object. */
  get clipboard(): D | null {
    return this.#clipboard;
  }

  set clipboard(value: D | null) {
    if (this.clipboard !== value) {
      this.#clipboard = value;
      this.render();
    }
  }

  /** Indicates whether input is disabled. */
  get disabled(): boolean {
    return this.#disabled;
  }

  set disabled(value: boolean) {
    if (this.#disabled !== value) {
      this.#disabled = value;
      this.render();
    }
  }

  getViewState = (): Readonly<ClipboardViewState> => this.#viewState;

  constructor(impl: ClipboardImpl<S, D>) {
    super();

    this.#impl = { objToData: impl.objToData };
    this.render();
  }

  /** Disposes of this object. Do not use it afterwards. */
  dispose(): void {}

  /**
   * Selects an object to copy.
   *
   */
  select(obj: S): void {
    this.#selectedObj = obj;
    this.render();
  }

  /** Deselects the object so it can no longer be copied. */
  deselect(): void {
    this.#selectedObj = null;
    this.render();
  }

  /** Copies the selected object. */
  copy(): void {
    const obj = this.#selectedObj;
    if (this.#disabled || obj == null) return;

    const clipboard = this.#impl.objToData(obj);
    this.clipboard = clipboard;
    this.dispatchEvent({ type: "copy", clipboard });
  }

  /** Pastes the clipboard data. */
  paste(): void {
    const clipboard = this.clipboard;
    if (this.#disabled || clipboard == null) return;

    this.dispatchEvent({ type: "paste", clipboard });
  }

  /** Updates the React view to match this object's state. */
  render(): void {
    this.#viewState = {
      disabled: this.#disabled,
      disableCopy: this.#selectedObj == null,
      disablePaste: this.#clipboard == null,
    };
    this.dispatchEvent({ type: "change" });
  }

  onCopyClick: MouseEventHandler<HTMLButtonElement> = () => {
    this.copy();
  };

  onPasteClick: MouseEventHandler<HTMLButtonElement> = () => {
    this.paste();
  };
}
