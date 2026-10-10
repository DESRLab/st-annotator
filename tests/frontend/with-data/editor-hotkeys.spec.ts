import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  checkboxControl,
  clickElement,
  editorPanel,
  exactButton,
  expectButtonSelected,
  fillNumberInput,
  inputControl,
  isButtonSelected,
  isEditorDataResponse,
  openEditor,
  openProjectPanelSection,
  readCurrentFrameId,
  scenePoint,
  selectActiveLayer,
  selectConfiguredLayer,
  selectControl,
  setCheckboxInput,
  waitForPointCloudReload,
} from "./editor-helpers";

/** Waits for any point-cloud bulk reload regardless of the request body. */
async function anyPcdReload(page: Page) {
  const response = await page.waitForResponse((candidate) =>
    isEditorDataResponse(candidate, "/editor/source/data/bulk", "pcd"),
  );
  expect(response.ok()).toBe(true);
}

async function pressEditorKey(page: Page, key: string) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.press(key);
}

async function checkedRadio(scope: Locator, name: string) {
  return scope.getByRole("radio", { name, exact: true }).isChecked();
}

test.describe("annotation editor hotkeys", () => {
  test("general navigation and camera hotkeys change real editor state", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openEditor(page);
    await selectActiveLayer(page, "Source Data", "Point Cloud");

    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));
    await fillNumberInput(inputControl(project, "Stride"), "1");
    await clickElement(exactButton(project, "Frames"));
    await expect
      .poll(
        async () =>
          (await exactButton(project, "Step >").isEnabled()) ||
          (await exactButton(project, "< Step").isEnabled()),
        { timeout: 30_000 },
      )
      .toBe(true);
    const firstFrame = await readCurrentFrameId(page);
    const canStepNext = await exactButton(project, "Step >").isEnabled();
    await pressEditorKey(page, canStepNext ? "c" : "z");
    await expect.poll(() => readCurrentFrameId(page)).not.toBe(firstFrame);
    await expect(
      exactButton(project, canStepNext ? "< Step" : "Step >"),
    ).toBeEnabled({ timeout: 30_000 });
    await pressEditorKey(page, canStepNext ? "z" : "c");
    await expect.poll(() => readCurrentFrameId(page)).toBe(firstFrame);

    const prefs = editorPanel(page, "Preferences");
    await pressEditorKey(page, "x");
    await expect(
      prefs.getByRole("radio", { name: "3D", exact: true }),
    ).toBeChecked();
    await pressEditorKey(page, "x");
    await expect(
      prefs.getByRole("radio", { name: "2D", exact: true }),
    ).toBeChecked();

    const orbit = checkboxControl(prefs, "Orbit Point");
    const initialOrbit = await orbit.isChecked();
    await pressEditorKey(page, "o");
    await expect.poll(() => orbit.isChecked()).toBe(!initialOrbit);
  });

  test("point-cloud hotkeys reload filtered data and deactivate cleanly", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Source Data", "Point Cloud");
    const prefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Point Cloud",
    );
    const removeBackground = checkboxControl(prefs, "RemoveBG");
    const cropArea = checkboxControl(prefs, "CropArea");
    const initialRemoveBackground = await removeBackground.isChecked();
    const initialCropArea = await cropArea.isChecked();
    await Promise.all([
      waitForPointCloudReload(page, !initialRemoveBackground, initialCropArea),
      pressEditorKey(page, "j"),
    ]);
    await expect
      .poll(() => removeBackground.isChecked())
      .toBe(!initialRemoveBackground);
    await selectActiveLayer(page, "Source Data", "Point Cloud");
    await Promise.all([
      waitForPointCloudReload(page, !initialRemoveBackground, !initialCropArea),
      pressEditorKey(page, "k"),
    ]);
    await expect.poll(() => cropArea.isChecked()).toBe(!initialCropArea);
    // Point-cloud shortcuts must be disconnected when another layer owns the
    // active-layer keybind branch.
    const removeWhileInactive = await removeBackground.isChecked();
    const cropWhileInactive = await cropArea.isChecked();
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    await pressEditorKey(page, "j");
    await pressEditorKey(page, "k");
    await selectActiveLayer(page, "Source Data", "Point Cloud");
    const reselectedPrefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Point Cloud",
    );
    await expect(checkboxControl(reselectedPrefs, "RemoveBG")).toBeChecked({
      checked: removeWhileInactive,
    });
    await expect(checkboxControl(reselectedPrefs, "CropArea")).toBeChecked({
      checked: cropWhileInactive,
    });
  });

  test("Space starts and pauses real frame playback", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));
    await fillNumberInput(inputControl(project, "Stride"), "1");
    // The Playback folder is expanded by default; `openProjectPanelSection` only
    // clicks the header if it is collapsed, so it cannot toggle an open folder
    // closed and hide the Play/Pause button. A low FPS keeps playback running
    // long enough to toggle it back off.
    const fps = inputControl(project, "FPS");
    await openProjectPanelSection(project, "Playback", fps);
    await fillNumberInput(fps, "1");
    const currentIndex = inputControl(project, "Current index along path:");
    await fillNumberInput(currentIndex, "0");
    await expect(exactButton(project, "Play Video")).toBeEnabled({
      timeout: 30_000,
    });

    await pressEditorKey(page, "Space");
    await expect(exactButton(project, "Pause Video")).toBeVisible();
    await pressEditorKey(page, "Space");
    await expect(exactButton(project, "Play Video")).toBeVisible();
  });

  test("bbox hotkeys drive actions, drawing origin, transforms, preferences, and deactivate cleanly", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const layers = editorPanel(page, "Layers");
    const row = layers.locator('[data-test="editor-layer-row-bounding-box"]');
    const tools = editorPanel(page, "Tools");
    const prefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Bounding Box",
    );

    await pressEditorKey(page, "d");
    await expectButtonSelected(row, "D");
    await expect(page.locator("#main-window")).toHaveClass(
      /cursor-add-(square|circle)/,
    );
    await pressEditorKey(page, "s");
    await expectButtonSelected(row, "S");
    await expect(page.locator("#main-window")).toHaveClass(/cursor-crosshair/);

    const initialCorner = await checkedRadio(tools, "Corner");
    await pressEditorKey(page, "f");
    await expect.poll(() => checkedRadio(tools, "Corner")).toBe(!initialCorner);

    const transparent = checkboxControl(prefs, "Transparent Faces");
    const initialTransparent = await transparent.isChecked();
    await pressEditorKey(page, "q");
    await expect.poll(() => transparent.isChecked()).toBe(!initialTransparent);

    const inspector = editorPanel(page, "Bounding Box");
    const boxPicker = inspector.locator('input[placeholder="(New box)"]');
    await boxPicker.click();
    await page.locator('[role="option"][data-label-id]').first().click();
    for (const [key, mode] of [
      ["w", "Translate"],
      ["e", "Rotate"],
      ["r", "Scale"],
    ] as const) {
      const initiallySelected = await isButtonSelected(
        exactButton(tools, mode),
      );
      await pressEditorKey(page, key);
      await expect
        .poll(() => isButtonSelected(exactButton(tools, mode)))
        .toBe(!initiallySelected);
    }

    const angle = inputControl(inspector, "Angle");
    const initialAngle = await angle.inputValue();
    await pressEditorKey(page, "Alt");
    await expect(angle).not.toHaveValue(initialAngle);

    const cornerBeforeDeactivation = await checkedRadio(tools, "Corner");
    const transparentBeforeDeactivation = await transparent.isChecked();
    await selectActiveLayer(page, "Source Data", "Point Cloud");
    await pressEditorKey(page, "f");
    await pressEditorKey(page, "q");
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    await selectConfiguredLayer(page, "Preferences", "Bounding Box");
    await expect
      .poll(() => checkedRadio(tools, "Corner"))
      .toBe(cornerBeforeDeactivation);
    await expect
      .poll(() => transparent.isChecked())
      .toBe(transparentBeforeDeactivation);
  });

  test("bbox T toggles tooltips while the bbox layer is active", async ({
    page,
  }) => {
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const prefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Bounding Box",
    );
    const tooltips = checkboxControl(prefs, "Show tooltips");
    const initialTooltips = await tooltips.isChecked();
    await pressEditorKey(page, "t");
    await expect.poll(() => tooltips.isChecked()).toBe(!initialTooltips);
  });

  test("bbox Shift constrains drawing while held", async ({ page }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-bounding-box"]',
    );
    const inspector = editorPanel(page, "Bounding Box");
    const selection = inspector.locator("select").first();
    const initialCount = await selection.locator("option").count();
    const sizeInputs = inspector
      .locator(".tp-lblv_l")
      .filter({ hasText: /^\s*Size\s*$/ })
      .locator("..")
      .locator("input");
    // The inspector shows database coordinates. The ZXY format maps the
    // Three.js ground plane (x, z) to the database (y, x) axes, so the
    // footprint dimensions are the first two Size inputs.
    const readFootprintSize = async () =>
      (await sizeInputs.evaluateAll((inputs) =>
        [inputs[0], inputs[1]].map((input) =>
          Number((input as HTMLInputElement).value),
        ),
      )) as [number, number];
    const drawStart = await scenePoint(page, 0.36, 0.38);
    const drawEnd = await scenePoint(page, 0.58, 0.43);

    await clickElement(exactButton(row, "D"));
    await page.mouse.move(drawStart.x, drawStart.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(drawEnd.x, drawEnd.y, { steps: 8 });
    await page.mouse.up({ button: "left" });
    await expect
      .poll(() => selection.locator("option").count())
      .toBeGreaterThan(initialCount);
    const unconstrained = await readFootprintSize();

    const countBeforeConstrained = await selection.locator("option").count();
    await clickElement(exactButton(row, "D"));
    await page.keyboard.down("Shift");
    await page.mouse.move(drawStart.x, drawStart.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(drawEnd.x, drawEnd.y, { steps: 8 });
    await page.mouse.up({ button: "left" });
    await page.keyboard.up("Shift");
    await expect
      .poll(() => selection.locator("option").count())
      .toBeGreaterThan(countBeforeConstrained);
    const constrained = await readFootprintSize();

    const aspectError = ([x, y]: [number, number]) => Math.abs(Math.log(x / y));
    expect(
      aspectError(constrained),
      "Shift should make the drawn footprint closer to square",
    ).toBeLessThan(aspectError(unconstrained));
  });

  test("bbox G creates a box when its class has no default size", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-bounding-box"]',
    );
    const inspector = editorPanel(page, "Bounding Box");
    const selection = inspector.locator("select").first();
    await selectControl(
      editorPanel(page, "Object Track"),
      "Object Class",
    ).selectOption({ label: "car" }, { force: true });
    const countBeforeDefault = await selection.locator("option").count();
    await clickElement(exactButton(row, "D"));
    const defaultCenter = await scenePoint(page, 0.52, 0.58);
    await page.mouse.move(defaultCenter.x, defaultCenter.y);
    await page.mouse.down({ button: "left" });
    await pressEditorKey(page, "g");
    await page.mouse.up({ button: "left" });
    await expect
      .poll(() => selection.locator("option").count())
      .toBeGreaterThan(countBeforeDefault);
    const sizeInputs = inspector
      .locator(".tp-lblv_l")
      .filter({ hasText: /^\s*Size\s*$/ })
      .locator("..")
      .locator("input");
    const defaultSize = await sizeInputs.evaluateAll((inputs) =>
      inputs.map((input) => Number((input as HTMLInputElement).value)),
    );
    expect(
      defaultSize.every((size) => Number.isFinite(size) && size > 0),
      "G should commit the box even when its class provides no default dimensions",
    ).toBe(true);
  });

  test("bbox G applies the selected class default size", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-bounding-box"]',
    );
    const inspector = editorPanel(page, "Bounding Box");
    const selection = inspector.locator("select").first();
    await selectControl(
      editorPanel(page, "Object Track"),
      "Object Class",
    ).selectOption({ label: "E2E Box with Default Size" }, { force: true });
    const countBeforeDefault = await selection.locator("option").count();
    await clickElement(exactButton(row, "D"));
    const defaultCenter = await scenePoint(page, 0.54, 0.56);
    await page.mouse.move(defaultCenter.x, defaultCenter.y);
    await page.mouse.down({ button: "left" });
    await pressEditorKey(page, "g");
    await page.mouse.up({ button: "left" });
    await expect
      .poll(() => selection.locator("option").count())
      .toBeGreaterThan(countBeforeDefault);

    const sizeInputs = inspector
      .locator(".tp-lblv_l")
      .filter({ hasText: /^\s*Size\s*$/ })
      .locator("..")
      .locator("input");
    const displayedSize = await sizeInputs.evaluateAll((inputs) =>
      inputs.map((input) => Number((input as HTMLInputElement).value)),
    );
    // The inspector displays sizes in database coordinates, so the seeded
    // default size (x=2, y=3, z=4) appears unchanged.
    expect(displayedSize).toEqual([2, 3, 4]);
  });

  test("bbox copy, paste, and delete hotkeys update the inspected labels", async ({
    page,
  }) => {
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const selection = editorPanel(page, "Bounding Box")
      .locator("select")
      .first();
    await selection.selectOption({ index: 1 }, { force: true });
    await expect(selection).not.toHaveValue("(New box)");
    await expect(exactButton(editorPanel(page, "Tools"), "Copy")).toBeEnabled();
    const countBeforePaste = await selection.locator("option").count();
    await pressEditorKey(page, "Control+c");
    await pressEditorKey(page, "Control+v");
    await expect
      .poll(() => selection.locator("option").count())
      .toBeGreaterThan(countBeforePaste);
    const countAfterPaste = await selection.locator("option").count();
    await selection.selectOption(
      { index: countAfterPaste - 1 },
      { force: true },
    );
    await expect(selection).not.toHaveValue("(New box)");
    await expect(exactButton(editorPanel(page, "Tools"), "Copy")).toBeEnabled();
    await pressEditorKey(page, "Delete");
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeLessThan(countAfterPaste);
  });

  test("vector and segmentation mode hotkeys are routed only to the active layer", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openEditor(page);
    const tools = editorPanel(page, "Tools");
    const layers = editorPanel(page, "Layers");

    await selectActiveLayer(page, "Label Data", "Vector");
    const vectorRow = layers.locator('[data-test="editor-layer-row-vector"]');
    for (const [key, mode] of [
      ["k", "Polygon"],
      ["l", "line"],
      ["p", "Point"],
    ] as const) {
      await pressEditorKey(page, key);
      await expect(
        tools.getByRole("radio", { name: mode, exact: true }),
      ).toBeChecked();
    }
    await pressEditorKey(page, "d");
    await expectButtonSelected(vectorRow, "D");
    await pressEditorKey(page, "s");
    await expectButtonSelected(vectorRow, "S");
    for (const [key, mode] of [
      ["w", "Vertex"],
      ["e", "Vertices"],
    ] as const) {
      const initiallySelected = await isButtonSelected(
        exactButton(tools, mode),
      );
      await pressEditorKey(page, key);
      await expect
        .poll(() => isButtonSelected(exactButton(tools, mode)))
        .toBe(!initiallySelected);
    }

    await selectActiveLayer(page, "Label Data", "Segmentation");
    const segmentationRow = layers.locator(
      '[data-test="editor-layer-row-segmentation"]',
    );
    for (const [key, mode] of [
      ["p", "polygon"],
      ["r", "box"],
      ["l", "lasso"],
      ["b", "brush"],
    ] as const) {
      await pressEditorKey(page, key);
      await expect(
        tools.getByRole("radio", { name: mode, exact: true }),
      ).toBeChecked();
    }
    await pressEditorKey(page, "d");
    await expectButtonSelected(segmentationRow, "D");
    await pressEditorKey(page, "s");
    await expectButtonSelected(segmentationRow, "S");

    const segmentationPrefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Segmentation",
    );
    const transparentPoints = checkboxControl(
      segmentationPrefs,
      "Transparent Points",
    );
    const initialTransparentPoints = await transparentPoints.isChecked();
    await pressEditorKey(page, "q");
    await expect
      .poll(() => transparentPoints.isChecked())
      .toBe(!initialTransparentPoints);

    // P is intentionally shared: it means polygon for segmentation and Point
    // for vector. Only the active layer may react.
    await pressEditorKey(page, "b");
    await expect(
      tools.getByRole("radio", { name: "brush", exact: true }),
    ).toBeChecked();
    await selectActiveLayer(page, "Label Data", "Vector");
    await pressEditorKey(page, "p");
    await expect(
      tools.getByRole("radio", { name: "Point", exact: true }),
    ).toBeChecked();
    await selectActiveLayer(page, "Label Data", "Segmentation");
    await expect(
      tools.getByRole("radio", { name: "brush", exact: true }),
    ).toBeChecked();
  });

  test("segmentation R selects rectangle and leaves the global O orbit shortcut intact", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Segmentation");
    const tools = editorPanel(page, "Tools");
    const prefs = editorPanel(page, "Preferences");
    const orbit = checkboxControl(prefs, "Orbit Point");
    const initialOrbit = await orbit.isChecked();
    await pressEditorKey(page, "r");
    await expect(
      tools.getByRole("radio", { name: "box", exact: true }),
    ).toBeChecked();
    await expect(orbit).toBeChecked({ checked: initialOrbit });
    await pressEditorKey(page, "o");
    await expect.poll(() => orbit.isChecked()).toBe(!initialOrbit);
  });

  // The undo/redo SEMANTICS (history walk, op rollback, SAVED guards) are
  // covered by the LabelsetEditor/EditableBranch unit tests; this test only
  // checks that the keystrokes reach the labelset editor.
  test("Ctrl+Z and Ctrl+Y route to the labelset undo and redo actions", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const inspector = editorPanel(page, "Bounding Box");
    await inspector
      .locator("select")
      .first()
      .selectOption({ index: 1 }, { force: true });

    const trackInspector = editorPanel(page, "Object Track");
    const lowReflectivity = checkboxControl(trackInspector, "Low Reflectivity");
    if (!(await lowReflectivity.isVisible()))
      await clickElement(exactButton(trackInspector, "Descriptors"));
    const original = await lowReflectivity.isChecked();
    await setCheckboxInput(lowReflectivity, !original);

    await pressEditorKey(page, "Control+z");
    await expect(lowReflectivity).toBeChecked({ checked: original });
    await pressEditorKey(page, "Control+y");
    await expect(lowReflectivity).toBeChecked({ checked: !original });
  });

  test("editor hotkeys stay inert while an input has focus and fire once blurred", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Source Data", "Point Cloud");
    const prefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Point Cloud",
    );
    const removeBackground = checkboxControl(prefs, "RemoveBG");
    const initial = await removeBackground.isChecked();

    // Focus a pane input: while it owns the keystrokes, the same key must
    // not reach the editor's hotkey routing (no toggle, no data reload).
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));
    const stride = inputControl(project, "Stride");
    await stride.click();
    await expect(stride).toBeFocused();
    await page.keyboard.press("j");
    await page.waitForTimeout(1500);
    expect(
      await removeBackground.isChecked(),
      "a hotkey must not fire while an input has focus",
    ).toBe(initial);

    // Once blurred, the same key fires exactly once (a double fire would
    // toggle twice and the poll below would never see the single-toggle value).
    await Promise.all([
      waitForPointCloudReload(
        page,
        !initial,
        await checkboxControl(prefs, "CropArea").isChecked(),
      ),
      pressEditorKey(page, "j"),
    ]);
    await expect.poll(() => removeBackground.isChecked()).toBe(!initial);

    // Restore the fixture setting through the pane control rather than a
    // second hotkey: while the toggled reload is still settling, the settings
    // pane is disabled and `#toggleSetting` legitimately rejects hotkeys until
    // it re-enables; setCheckboxInput waits for the enabled state.
    await Promise.all([
      anyPcdReload(page),
      setCheckboxInput(removeBackground, initial),
    ]);
  });
});
