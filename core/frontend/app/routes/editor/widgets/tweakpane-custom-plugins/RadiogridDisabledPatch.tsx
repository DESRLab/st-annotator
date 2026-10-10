/**
 * Applies the `disabled` state to an `@tweakpane/plugin-essentials` radiogrid.
 *
 * The plugin's `RadioGridController` wires its cells and grid container to
 * fresh, never-updated `ViewProps`, so the `disabled` option alone neither
 * disables the radio inputs, toggles the `tp-v-disabled` class, nor blocks
 * click→change. This reproduces what `ViewProps.bindDisabled` and
 * `bindClassModifiers` would apply; call it from `modifyHTML`, which the
 * pane elements run on every render.
 */
export function applyRadiogridDisabledState(
  bladeElement: HTMLElement,
  disabled: boolean,
): void {
  const gridElement = bladeElement.querySelector(".tp-radgridv");
  if (gridElement != null) {
    gridElement.classList.toggle("tp-v-disabled", disabled);
  }

  for (const inputElement of bladeElement.querySelectorAll<HTMLInputElement>(
    ".tp-radv_i",
  )) {
    inputElement.disabled = disabled;
    inputElement.tabIndex = disabled ? -1 : 0;
  }
}
