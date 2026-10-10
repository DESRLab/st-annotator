import { expect, type Locator, test } from "@playwright/test";

import {
  checkboxControl,
  clickElement,
  editorPanel,
  exactButton,
  exactText,
  expectButtonSelected,
  fillNumberInput,
  inputControl,
  isButtonSelected,
  openEditor,
  paneRow,
  selectActiveLayer,
  selectConfiguredLayer,
  selectControl,
  setCheckbox,
  setCheckboxInput,
  setSelectByLabel,
  waitForPointCloudReload,
} from "./editor-helpers";

async function ensureButtonSelected(scope: Locator, label: string) {
  const button = exactButton(scope, label);
  await expect(button).toBeEnabled();
  if (!(await isButtonSelected(button))) {
    await button.click({ force: true });
  }
  await expectButtonSelected(scope, label);
}

test("handbook editor page: point cloud layer and preferences controls", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await openEditor(page);

  const layerRow = await selectActiveLayer(page, "Source Data", "Point Cloud");
  const enabled = layerRow.locator('input[type="checkbox"]').first();
  await expect(enabled).toBeChecked();
  await setCheckboxInput(enabled, false);
  await expect(layerRow.locator(".layer-name")).not.toHaveClass(/active/);
  await expect(editorPanel(page, "Tools")).toContainText("No layer selected");
  await setCheckboxInput(enabled, true);
  await selectActiveLayer(page, "Source Data", "Point Cloud");

  const prefs = await selectConfiguredLayer(page, "Preferences", "Point Cloud");
  await expect(prefs).toContainText("RemoveBG");
  await expect(prefs).toContainText("CropArea");
  await expect(prefs).toContainText("Point Size");
  await expect(prefs).toContainText("ApplyColormap");
  await expect(prefs).toContainText("ComposeRGB");

  const pointSize = inputControl(prefs, "Point Size");
  await fillNumberInput(pointSize, "3");
  await selectActiveLayer(page, "Source Data", "Ground Mesh");
  await selectActiveLayer(page, "Source Data", "Point Cloud");
  await expect(inputControl(prefs, "Point Size")).toHaveValue(/3/);

  const blenderType = selectControl(prefs, "Blender Type");
  await setSelectByLabel(blenderType, "ComposeRGB");
  await expect(exactButton(prefs, "Red")).toBeVisible();
  await expect(exactButton(prefs, "Green")).toBeVisible();
  await expect(exactButton(prefs, "Blue")).toBeVisible();
  await setSelectByLabel(blenderType, "ApplyColormap");
  await expect(paneRow(prefs, "Colormap")).toBeVisible();

  await Promise.all([
    waitForPointCloudReload(page, false, true),
    setCheckbox(prefs, "RemoveBG", false),
  ]);
  await Promise.all([
    waitForPointCloudReload(page, false, false),
    setCheckbox(prefs, "CropArea", false),
  ]);
});

test("handbook editor page: bounding box actions, tools, preferences, and clipboard controls", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await openEditor(page);
  await selectActiveLayer(page, "Label Data", "Bounding Box");

  const bboxLayerRow = editorPanel(page, "Layers").locator(
    '[data-test="editor-layer-row-bounding-box"]',
  );
  const selectModeButton = exactButton(bboxLayerRow, "S");
  const drawModeButton = exactButton(bboxLayerRow, "D");
  await expect(bboxLayerRow.locator(".tp-selectgridv")).not.toHaveClass(
    /tp-v-disabled/,
  );

  for (const [selectedButton, otherButton] of [
    [selectModeButton, drawModeButton],
    [drawModeButton, selectModeButton],
  ] as const) {
    if (!(await isButtonSelected(selectedButton))) {
      await clickElement(selectedButton);
    }
    await expect(selectedButton).toHaveClass(/tp-selectbtnv_b-selected/);
    await expect(otherButton).not.toHaveClass(/tp-selectbtnv_b-selected/);
    await expect
      .poll(() =>
        selectedButton.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            square: Math.abs(rect.width - rect.height) < 0.5,
            backgroundColor: getComputedStyle(element).backgroundColor,
          };
        }),
      )
      .toEqual({ square: true, backgroundColor: "rgb(65, 105, 225)" });
  }
  await clickElement(drawModeButton);

  const tools = editorPanel(page, "Tools");
  await expect(tools).toContainText("Draw");
  await expect(tools).toContainText("Transform");
  await expect(tools).toContainText("Clipboard");
  await expect(tools).toContainText("Draw Origin");
  await expect(exactButton(tools, "Draw")).toBeVisible();
  const cornerOrigin = tools.getByRole("radio", {
    name: exactText("Corner"),
  });
  const centerOrigin = tools.getByRole("radio", {
    name: exactText("Center"),
  });
  await expect(cornerOrigin).toBeChecked();
  await expect(centerOrigin).toBeEnabled();
  await centerOrigin.evaluate((element: HTMLInputElement) => element.click());
  await expect(centerOrigin).toBeChecked();
  await cornerOrigin.evaluate((element: HTMLInputElement) => element.click());
  await expect(cornerOrigin).toBeChecked();

  await ensureButtonSelected(tools, "Translate");
  await ensureButtonSelected(tools, "Rotate");
  await ensureButtonSelected(tools, "Scale");

  const copyButton = exactButton(tools, "Copy");
  const pasteButton = exactButton(tools, "Paste");
  await expect(copyButton).toBeDisabled();
  await expect(pasteButton).toBeDisabled();

  const bboxInspector = editorPanel(page, "Bounding Box");
  await expect(bboxInspector).toBeVisible();
  const boxSelect = bboxInspector.locator("select").first();
  await expect(boxSelect.locator("option").nth(1)).toBeAttached();
  const boxOptionsBeforePaste = await boxSelect.locator("option").count();

  const objectTrackSelect = editorPanel(page, "Object Track")
    .locator("select")
    .first();
  await expect(objectTrackSelect).toHaveValue("(New track)");
  await boxSelect.selectOption({ index: 1 }, { force: true });
  const selectedBoxValue = await boxSelect.inputValue();
  await expect(objectTrackSelect).not.toHaveValue("(New track)");
  await expect(copyButton).toBeEnabled();
  await page.waitForTimeout(250);
  await expect(boxSelect).toHaveValue(selectedBoxValue);
  await clickElement(copyButton);
  await expect(pasteButton).toBeEnabled();
  await clickElement(pasteButton);
  await expect
    .poll(async () => boxSelect.locator("option").count())
    .toBeGreaterThan(boxOptionsBeforePaste);

  const prefs = await selectConfiguredLayer(
    page,
    "Preferences",
    "Bounding Box",
  );
  await expect(prefs).toContainText("Time-Path Range");
  const displayRange = inputControl(prefs, "Time-Path Range");
  await fillNumberInput(displayRange, "1");
  await selectActiveLayer(page, "Source Data", "Point Cloud");
  await selectActiveLayer(page, "Label Data", "Bounding Box");
  await expect(inputControl(prefs, "Time-Path Range")).toHaveValue(/1/);
  await expect(prefs).toContainText(
    /Maintain elevation\s*relative to ground mesh/,
  );
  await expect(prefs).toContainText("Show perceived class");
  await expect(prefs).toContainText("Show tooltips");
  await expect(prefs).toContainText("Show Occlusion");
  await expect(prefs).toContainText("Show Distinctiveness");
  await expect(prefs).toContainText("Show Timestamp Diff.");
  await expect(prefs).toContainText("Show Track & Box IDs");
  await expect(prefs).toContainText("Transparent Faces");
  await expect(prefs).toContainText("Face opacity");

  await setCheckbox(prefs, "Show tooltips", true);
  await expect(checkboxControl(prefs, "Show Occlusion")).toBeEnabled();
  await expect(checkboxControl(prefs, "Show Distinctiveness")).toBeEnabled();
  await expect(checkboxControl(prefs, "Show Timestamp Diff.")).toBeEnabled();
  await expect(checkboxControl(prefs, "Show Track & Box IDs")).toBeEnabled();

  const faceOpacity = inputControl(prefs, "Face opacity");
  await expect(faceOpacity).toBeEnabled();
  await setCheckbox(prefs, "Transparent Faces", true);
  await expect(faceOpacity).toBeDisabled();
  await setCheckbox(prefs, "Transparent Faces", false);
  await expect(faceOpacity).toBeEnabled();
});

test("handbook editor page: segmentation transparency preferences", async ({
  page,
}) => {
  await openEditor(page);
  await selectActiveLayer(page, "Label Data", "Segmentation");
  const prefs = await selectConfiguredLayer(
    page,
    "Preferences",
    "Segmentation",
  );
  const transparency = checkboxControl(prefs, "Transparent Points");
  const opacity = inputControl(prefs, "Point opacity");

  await expect(transparency).toBeChecked();
  await expect(opacity).toBeEnabled();
  await setCheckbox(prefs, "Transparent Points", false);
  await expect(opacity).toBeDisabled();
  await setCheckbox(prefs, "Transparent Points", true);
  await expect(opacity).toBeEnabled();
});
