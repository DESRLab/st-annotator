/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";

import { applyRadiogridDisabledState } from "../../../../../../app/routes/editor/widgets/tweakpane-custom-plugins/RadiogridDisabledPatch";

function makeRadiogridElement(): HTMLElement {
  const bladeElement = document.createElement("div");
  const gridElement = document.createElement("div");
  gridElement.className = "tp-radgridv";

  for (let cell = 0; cell < 2; cell += 1) {
    const inputElement = document.createElement("input");
    inputElement.className = "tp-radv_i";
    inputElement.name = "status";
    inputElement.type = "radio";
    gridElement.appendChild(inputElement);
  }

  bladeElement.appendChild(gridElement);
  return bladeElement;
}

describe("applyRadiogridDisabledState", () => {
  it("disables the cells and dims the grid", () => {
    const bladeElement = makeRadiogridElement();

    applyRadiogridDisabledState(bladeElement, true);

    expect(
      bladeElement
        .querySelector(".tp-radgridv")
        ?.classList.contains("tp-v-disabled"),
    ).toBe(true);
    for (const inputElement of bladeElement.querySelectorAll<HTMLInputElement>(
      ".tp-radv_i",
    )) {
      expect(inputElement.disabled).toBe(true);
      expect(inputElement.tabIndex).toBe(-1);
    }
  });

  it("re-enables the cells and grid", () => {
    const bladeElement = makeRadiogridElement();
    applyRadiogridDisabledState(bladeElement, true);

    applyRadiogridDisabledState(bladeElement, false);

    expect(
      bladeElement
        .querySelector(".tp-radgridv")
        ?.classList.contains("tp-v-disabled"),
    ).toBe(false);
    for (const inputElement of bladeElement.querySelectorAll<HTMLInputElement>(
      ".tp-radv_i",
    )) {
      expect(inputElement.disabled).toBe(false);
      expect(inputElement.tabIndex).toBe(0);
    }
  });

  it("tolerates blade elements without a radiogrid", () => {
    expect(() =>
      applyRadiogridDisabledState(document.createElement("div"), true),
    ).not.toThrow();
  });
});
