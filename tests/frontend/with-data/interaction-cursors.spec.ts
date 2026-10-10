import { expect, test } from "@playwright/test";

import {
  clickElement,
  editorPanel,
  exactButton,
  openEditor,
  selectActiveLayer,
} from "./editor-helpers";

test("label layers apply their interaction cursors without fighting over them", async ({
  page,
}) => {
  test.setTimeout(180000);

  await openEditor(page);
  await selectActiveLayer(page, "Label Data", "Bounding Box");

  const row = editorPanel(page, "Layers").locator(
    '[data-test="editor-layer-row-bounding-box"]',
  );
  const mainWindow = page.locator("#main-window");

  // All label layers share the main window container; only the active
  // layer's interact context may set the cursor on it.
  const probeCursor = async () =>
    mainWindow.evaluate((element) => {
      const cursorClasses = [...element.classList].filter((name) =>
        name.startsWith("cursor-"),
      );
      return {
        cursorClasses,
        computedCursor: getComputedStyle(element).cursor,
      };
    });

  await clickElement(exactButton(row, "D"));
  await expect.poll(probeCursor).toEqual({
    cursorClasses: ["cursor-add-square"],
    computedCursor: expect.stringContaining("add_square.png"),
  });

  await clickElement(exactButton(row, "S"));
  await expect.poll(probeCursor).toEqual({
    cursorClasses: ["cursor-crosshair"],
    computedCursor: "crosshair",
  });
});
