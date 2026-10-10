import { expect, type Locator, type Page, test } from "@playwright/test";

import {
  checkboxControl,
  clickElement,
  editorPanel,
  exactButton,
  exactText,
  fillNumberInput,
  getEditorRenderState,
  inputControl,
  openEditor,
  scenePoint,
  selectActiveLayer,
  selectConfiguredLayer,
  selectControl,
  setCheckboxInput,
  setSelectByLabel,
  waitForEditorRenderSettled,
  waitForEditorRenderAfter,
} from "./editor-helpers";

async function renderSnapshot(page: Page) {
  await waitForEditorRenderSettled(page);
  return page
    .locator("#display-container canvas")
    .first()
    .screenshot({ animations: "disabled" });
}

function expectRenderChanged(before: Buffer, after: Buffer) {
  expect(
    after.equals(before),
    "the pixels rendered in the scene should change",
  ).toBe(false);
}

async function disableLabelLayers(page: Page) {
  const layers = editorPanel(page, "Layers");
  await layers.getByText("Label Data", { exact: true }).click();
  for (const name of ["bounding-box", "vector", "segmentation"]) {
    const checkbox = layers.locator(
      `[data-test="editor-layer-row-${name}"] input[type="checkbox"]`,
    );
    if (await checkbox.isChecked()) await setCheckboxInput(checkbox, false);
  }
}

async function selectRadio(scope: Locator, name: string) {
  const radio = scope.getByRole("radio", { name: exactText(name) });
  await expect(radio).toBeEnabled();
  await radio.evaluate((element: HTMLInputElement) => element.click());
  await expect(radio).toBeChecked();
}

async function waitForLabelEditState(page: Page) {
  await expect(exactButton(editorPanel(page, "Tools"), "Copy")).toBeEnabled({
    timeout: 30_000,
  });
}

async function saveChanges(page: Page, withHotkey = false) {
  const save = exactButton(editorPanel(page, "Project"), "Save Changes");
  await expect(save).toBeEnabled({ timeout: 30_000 });
  const isPush = (url: string) =>
    new URL(url).pathname.endsWith("/editor/labelset/push");
  const requestPromise = page.waitForRequest(
    (candidate) => candidate.method() === "POST" && isPush(candidate.url()),
    { timeout: 30_000 },
  );
  const responsePromise = page
    .waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" && isPush(candidate.url()),
      { timeout: 30_000 },
    )
    .then((response) => ({ kind: "response" as const, response }));
  const failurePromise = page
    .waitForEvent("requestfailed", {
      predicate: (request) =>
        request.method() === "POST" && isPush(request.url()),
      timeout: 30_000,
    })
    .then((request) => ({ kind: "failure" as const, request }));
  if (withHotkey) {
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Control+s");
  } else await clickElement(save);
  await requestPromise;
  return Promise.race([responsePromise, failurePromise]);
}

async function fillColorInput(input: Locator, value: string) {
  await input.fill(value);
  await input.press("Enter");
  await input.blur();
}

test.describe("editor rendering and label workflows", () => {
  test("demand rendering coalesces wake-ups and remains idle after painting", async ({
    page,
  }) => {
    await openEditor(page);
    await waitForEditorRenderSettled(page);

    const before = await getEditorRenderState(page);
    const queued = await page.evaluate(() => {
      document.dispatchEvent(new Event("input"));
      document.dispatchEvent(new Event("change"));
      document.dispatchEvent(new Event("change"));
      return window.__STA_E2E_PROBE__!.getRenderState();
    });
    expect(queued.pending).toBe(true);

    const painted = await waitForEditorRenderAfter(page, before.generation);
    expect(painted.generation).toBe(before.generation + 1);

    await page.waitForTimeout(250);
    expect(await getEditorRenderState(page)).toEqual(painted);
  });

  test("point-cloud preferences change the pixels actually rendered by WebGL", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await openEditor(page);
    await disableLabelLayers(page);
    await selectActiveLayer(page, "Source Data", "Point Cloud");

    const prefs = editorPanel(page, "Preferences");
    await selectRadio(prefs, "2D");
    const topDown = await renderSnapshot(page);
    await selectRadio(prefs, "3D");
    expectRenderChanged(topDown, await renderSnapshot(page));
    await selectRadio(prefs, "2D");

    await selectConfiguredLayer(page, "Preferences", "Point Cloud");
    const pointSize = inputControl(prefs, "Point Size");
    await fillNumberInput(pointSize, "1");
    const smallPoints = await renderSnapshot(page);
    await fillNumberInput(pointSize, "4");
    const largePoints = await renderSnapshot(page);
    expectRenderChanged(smallPoints, largePoints);

    const blender = selectControl(prefs, "Blender Type");
    await setSelectByLabel(blender, "ApplyColormap");
    const colormap = selectControl(prefs, "Colormap");
    const initialMap = await colormap.inputValue();
    const alternateMap = await colormap
      .locator("option")
      .evaluateAll(
        (options, current) =>
          (options as HTMLOptionElement[]).find(
            (option) => option.value !== current,
          )?.value,
        initialMap,
      );
    expect(
      alternateMap,
      "the colormap menu should offer an alternative",
    ).toBeTruthy();
    const firstColors = await renderSnapshot(page);
    await colormap.selectOption(alternateMap!, { force: true });
    await expect(colormap).toHaveValue(alternateMap!);
    const secondColors = await renderSnapshot(page);
    expectRenderChanged(firstColors, secondColors);

    const channel = selectControl(prefs, "Channel");
    const beforeChannelChange = await renderSnapshot(page);
    // The synthetic fixture's fourth channel is intensity. Unlike selecting
    // an arbitrary alternative, switching from elevation to this known
    // channel is guaranteed to produce a different point-color field.
    const intensityChannel = await channel
      .locator("option")
      .filter({ hasText: /^3\s*\(/ })
      .evaluate((option: HTMLOptionElement) => option.value);
    await channel.selectOption(intensityChannel, { force: true });
    expectRenderChanged(beforeChannelChange, await renderSnapshot(page));

    const useZScore = prefs
      .locator(".tp-lblv:visible")
      .filter({ hasText: "Use Z-Score" })
      .locator('input[type="checkbox"]')
      .first();
    if (await useZScore.isChecked()) await setCheckboxInput(useZScore, false);
    const beforeRangeChange = await renderSnapshot(page);
    const visibleValueInput = (label: string) =>
      prefs
        .locator(".tp-lblv:visible")
        .filter({ hasText: label })
        .locator("input")
        .first();
    await fillNumberInput(visibleValueInput("Min. Value"), "0");
    await fillNumberInput(visibleValueInput("Max. Value"), "1");
    expectRenderChanged(beforeRangeChange, await renderSnapshot(page));

    const beforeComposeRgb = await renderSnapshot(page);
    const beforeComposeRender = await getEditorRenderState(page);
    await setSelectByLabel(blender, "ComposeRGB");
    await waitForEditorRenderAfter(page, beforeComposeRender.generation);

    for (const tab of ["Red", "Green", "Blue"]) {
      await clickElement(exactButton(prefs, tab));
      const rgbChannel = prefs
        .locator(".tp-lblv:visible")
        .filter({ hasText: "Channel" })
        .locator("select")
        .first();
      const current = await rgbChannel.inputValue();
      const alternate = await rgbChannel
        .locator("option")
        .evaluateAll(
          (options, selected) =>
            (options as HTMLOptionElement[]).find(
              (option) => option.value !== selected,
            )?.value,
          current,
        );
      expect(
        alternate,
        `${tab} should offer another point-cloud channel`,
      ).toBeTruthy();
      await rgbChannel.selectOption(alternate!, { force: true });
    }
    expectRenderChanged(beforeComposeRgb, await renderSnapshot(page));

    const removeBackground = prefs
      .locator(".tp-lblv")
      .filter({ hasText: "RemoveBG" })
      .locator('input[type="checkbox"]')
      .first();
    const cropArea = prefs
      .locator(".tp-lblv")
      .filter({ hasText: "CropArea" })
      .locator('input[type="checkbox"]')
      .first();
    const initialRemoveBackground = await removeBackground.isChecked();
    const initialCropArea = await cropArea.isChecked();
    const dataResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      const body = response.request().postData() ?? "";
      return (
        url.pathname.endsWith("/editor/source/data/bulk") &&
        url.searchParams.get("key") === "pcd" &&
        body.includes(`"remove_bg":${!initialRemoveBackground}`) &&
        body.includes(`"crop_area":${!initialCropArea}`)
      );
    });
    await setCheckboxInput(removeBackground, !initialRemoveBackground);
    await setCheckboxInput(cropArea, !initialCropArea);
    expect((await dataResponse).ok()).toBe(true);
    const differentlyFiltered = await renderSnapshot(page);
    expectRenderChanged(secondColors, differentlyFiltered);
    expect(errors).toEqual([]);
  });

  test("ground-mesh preferences change rendered mesh state", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await disableLabelLayers(page);
    const pointCloudRow = await selectActiveLayer(
      page,
      "Source Data",
      "Point Cloud",
    );
    await setCheckboxInput(
      pointCloudRow.locator('input[type="checkbox"]').first(),
      false,
    );
    await selectActiveLayer(page, "Source Data", "Ground Mesh");

    const prefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Ground Mesh",
    );
    const opacity = inputControl(prefs, "Opacity");
    await fillNumberInput(opacity, "0.15");
    const translucent = await renderSnapshot(page);
    await fillNumberInput(opacity, "1");
    expectRenderChanged(translucent, await renderSnapshot(page));

    const wireframe = checkboxControl(prefs, "Show Wireframe");
    const beforeWireframe = await renderSnapshot(page);
    await setCheckboxInput(wireframe, !(await wireframe.isChecked()));
    expectRenderChanged(beforeWireframe, await renderSnapshot(page));

    const blender = selectControl(prefs, "Blender Type");
    await setSelectByLabel(blender, "ApplyColormap");
    const colormap = selectControl(prefs, "Colormap");
    const initialMap = await colormap.inputValue();
    const alternateMap = await colormap
      .locator("option")
      .evaluateAll(
        (options, current) =>
          (options as HTMLOptionElement[]).find(
            (option) => option.value !== current,
          )?.value,
        initialMap,
      );
    expect(alternateMap).toBeTruthy();
    const beforeColormap = await renderSnapshot(page);
    await colormap.selectOption(alternateMap!, { force: true });
    expectRenderChanged(beforeColormap, await renderSnapshot(page));

    const beforeApply = await renderSnapshot(page);
    const channel = selectControl(prefs, "Channel");
    const alternate = await channel
      .locator("option")
      .evaluateAll(
        (options, current) =>
          (options as HTMLOptionElement[]).find(
            (option) => option.value !== current,
          )?.value,
        await channel.inputValue(),
      );
    expect(alternate).toBeTruthy();
    await channel.selectOption(alternate!, { force: true });
    const visibleControl = (label: string) =>
      prefs
        .locator(".tp-lblv:visible")
        .filter({ hasText: label })
        .locator("input")
        .first();
    await fillNumberInput(visibleControl("Min. Z-Score"), "-0.5");
    await fillNumberInput(visibleControl("Max. Z-Score"), "0.5");
    expectRenderChanged(beforeApply, await renderSnapshot(page));

    const beforeCompose = await renderSnapshot(page);
    await setSelectByLabel(blender, "ComposeRGB");
    for (const tab of ["Red", "Green", "Blue"]) {
      await clickElement(exactButton(prefs, tab));
      const visibleChannel = prefs
        .locator(".tp-lblv:visible")
        .filter({ hasText: "Channel" })
        .locator("select")
        .first();
      await visibleChannel.selectOption(
        { index: tab === "Red" ? 0 : tab === "Green" ? 1 : 2 },
        { force: true },
      );
    }
    expectRenderChanged(beforeCompose, await renderSnapshot(page));
  });

  test("a user can draw, inspect, select, and geometrically edit a bounding box", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");

    const inspector = editorPanel(page, "Bounding Box");
    const selection = inspector.locator("select").first();
    const countBefore = await selection.locator("option").count();
    const sceneBefore = await renderSnapshot(page);

    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-bounding-box"]',
    );
    await clickElement(exactButton(row, "D"));
    await selectRadio(editorPanel(page, "Tools"), "Corner");
    const abortedStart = await scenePoint(page, 0.38, 0.38);
    await page.mouse.move(abortedStart.x, abortedStart.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(abortedStart.x + 40, abortedStart.y + 40, {
      steps: 4,
    });
    await page.keyboard.press("Escape");
    await page.mouse.up({ button: "left" });
    await expect(selection.locator("option")).toHaveCount(countBefore);
    const start = await scenePoint(page, 0.48, 0.44);
    const end = await scenePoint(page, 0.58, 0.54);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.mouse.up({ button: "left" });

    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(countBefore);
    const countAfterDraw = await selection.locator("option").count();
    const createdValue = await selection.inputValue();
    expect(createdValue).not.toBe("(New box)");
    expectRenderChanged(sceneBefore, await renderSnapshot(page));

    // The center-origin mode uses center-to-front geometry rather than the
    // corner-to-corner drag above.
    await clickElement(exactButton(row, "D"));
    await selectRadio(editorPanel(page, "Tools"), "Center");
    const centerStart = await scenePoint(page, 0.42, 0.6);
    const centerEnd = await scenePoint(page, 0.48, 0.66);
    await page.mouse.move(centerStart.x, centerStart.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(centerEnd.x, centerEnd.y, { steps: 8 });
    await page.mouse.up({ button: "left" });
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(countAfterDraw);
    // Selection through the inspector is a separate user path from the
    // automatic selection that follows drawing, and enters edit mode.
    await selection.selectOption({ index: 1 }, { force: true });
    await expect(selection).not.toHaveValue(createdValue);
    await expect(selection).not.toHaveValue("(New box)");

    const boxType = selectControl(inspector, "Type");
    await expect(boxType).toBeEnabled();
    const oldType = await boxType.inputValue();
    const newType = await boxType
      .locator("option")
      .evaluateAll(
        (options, current) =>
          (options as HTMLOptionElement[]).find(
            (option) => option.value !== current,
          )?.value,
        oldType,
      );
    expect(newType, "the box geometry should offer another type").toBeTruthy();
    const beforeGeometryEdit = await renderSnapshot(page);
    await boxType.selectOption(newType!, { force: true });
    await expect(boxType).toHaveValue(newType!);
    expectRenderChanged(beforeGeometryEdit, await renderSnapshot(page));
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Control+z");
    await expect(boxType).toHaveValue(oldType);
    await page.keyboard.press("Control+y");
    await expect(boxType).toHaveValue(newType!);

    const bboxPrefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Bounding Box",
    );
    const displayRange = inputControl(bboxPrefs, "Time-Path Range");
    await fillNumberInput(displayRange, "0");
    const currentFrameOnly = await renderSnapshot(page);
    await fillNumberInput(displayRange, "2");
    expectRenderChanged(currentFrameOnly, await renderSnapshot(page));

    const transparentFaces = checkboxControl(bboxPrefs, "Transparent Faces");
    await setCheckboxInput(transparentFaces, false);
    const opaqueFaces = await renderSnapshot(page);
    await setCheckboxInput(transparentFaces, true);
    expectRenderChanged(opaqueFaces, await renderSnapshot(page));
    await setCheckboxInput(transparentFaces, false);
    const faceOpacity = inputControl(bboxPrefs, "Face opacity");
    await fillNumberInput(faceOpacity, "0.1");
    const lowOpacity = await renderSnapshot(page);
    await fillNumberInput(faceOpacity, "1");
    expectRenderChanged(lowOpacity, await renderSnapshot(page));

    const selectColor = inputControl(bboxPrefs, "Select color");
    const beforeSelectColor = await renderSnapshot(page);
    await fillColorInput(selectColor, "{r: 0.00, g: 1.00, b: 0.00}");
    expectRenderChanged(beforeSelectColor, await renderSnapshot(page));

    // The Show-* preferences wiring and the tooltip content are covered by
    // the pane container and tooltip-formatting unit tests.

    expect(errors).toEqual([]);
  });

  test.describe("labelset persistence", () => {
    // Persists a real label edit to the shared fixture database (it never
    // restores it), so a retry could stack a second mutation on the first;
    // keep it retry-free even though the suite retries.
    test.describe.configure({ retries: 0 });

    test("Ctrl+S saves a label edit, clears dirty state, and survives reload", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await openEditor(page);
      await selectActiveLayer(page, "Label Data", "Bounding Box");
      const inspector = editorPanel(page, "Bounding Box");
      const selection = inspector.locator("select").first();
      await selection.selectOption({ index: 1 }, { force: true });
      const selectedBox = await selection.inputValue();
      const boxType = selectControl(inspector, "Type");
      const oldType = await boxType.inputValue();
      const newType = await boxType
        .locator("option")
        .evaluateAll(
          (options, current) =>
            (options as HTMLOptionElement[]).find(
              (option) => option.value !== current,
            )?.value,
          oldType,
        );
      expect(newType).toBeTruthy();
      await boxType.selectOption(newType!, { force: true });

      // The class assignment rides a separate wire field from Type, so changing
      // both makes each one prove its own round trip through the bulk endpoint.
      await clickElement(exactButton(inspector, "Relationships"));
      const objectClass = selectControl(inspector, "Object Class");
      const currentClass = await objectClass.inputValue();
      const newClass = await objectClass
        .locator("option")
        .evaluateAll(
          (options, current) =>
            (options as HTMLOptionElement[]).find(
              (option) => option.value !== current,
            )?.value,
          currentClass,
        );
      expect(newClass).toBeTruthy();
      await objectClass.selectOption(newClass!, { force: true });

      const saveOutcome = await saveChanges(page, true);
      const saveTransportSucceeded =
        saveOutcome.kind === "response" && saveOutcome.response.ok();
      const dirtyStateCleared = await exactButton(
        editorPanel(page, "Project"),
        "Save Changes",
      ).isDisabled();

      await page.waitForTimeout(1_000);
      await page.reload();
      await expect(page.locator("#main-window")).toBeVisible({
        timeout: 60_000,
      });
      await selectActiveLayer(page, "Label Data", "Bounding Box");
      const reloadedInspector = editorPanel(page, "Bounding Box");
      await reloadedInspector
        .locator("select")
        .first()
        .selectOption(selectedBox, { force: true });
      const persistedType =
        (await selectControl(reloadedInspector, "Type").inputValue()) ===
        newType;
      await clickElement(exactButton(reloadedInspector, "Relationships"));
      const persistedClass =
        (await selectControl(
          reloadedInspector,
          "Object Class",
        ).inputValue()) === newClass;
      expect(
        {
          classPersisted: persistedClass,
          dirtyStateCleared,
          saveTransportSucceeded,
          typePersisted: persistedType,
        },
        "save should succeed, clear dirty state, and persist both fields",
      ).toEqual({
        classPersisted: true,
        dirtyStateCleared: true,
        saveTransportSucceeded: true,
        typePersisted: true,
      });
    });
  });

  test("bbox center, size, and angle edits update inspector, history, and scene", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const inspector = editorPanel(page, "Bounding Box");
    await inspector
      .locator("select")
      .first()
      .selectOption({ index: 1 }, { force: true });
    await waitForLabelEditState(page);
    const before = await renderSnapshot(page);

    for (const label of ["Center", "Size"]) {
      const input = inspector
        .locator(".tp-lblv")
        .filter({ hasText: label })
        .locator("input")
        .first();
      const current = Number(await input.inputValue());
      await fillNumberInput(input, String(current + 0.5));
    }
    const angle = inputControl(inspector, "Angle");
    const oldAngle = Number(await angle.inputValue());
    const newAngle = (oldAngle + 0.1).toFixed(3);
    await fillNumberInput(angle, newAngle);

    expectRenderChanged(before, await renderSnapshot(page));
    await expect(
      exactButton(editorPanel(page, "Project"), "Save Changes"),
    ).toBeEnabled();
    await expect(
      editorPanel(page, "Project").locator(".labelset-history .selected"),
    ).toContainText("Transform Box");
  });

  test("bbox box-class relationship edits update history and scene", async ({
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
    const before = await renderSnapshot(page);
    await clickElement(exactButton(inspector, "Relationships"));
    const objectClass = selectControl(inspector, "Object Class");
    const currentClass = await objectClass.inputValue();
    const alternateClass = await objectClass
      .locator("option")
      .evaluateAll(
        (options, current) =>
          (options as HTMLOptionElement[]).find(
            (option) => option.value !== current,
          )?.value,
        currentClass,
      );
    expect(alternateClass).toBeTruthy();
    await objectClass.selectOption(alternateClass!, { force: true });

    expectRenderChanged(before, await renderSnapshot(page));
    await expect(
      exactButton(editorPanel(page, "Project"), "Save Changes"),
    ).toBeEnabled();
    await expect(
      editorPanel(page, "Project").locator(".labelset-history .selected"),
    ).toContainText("Assign Perceived Class");
  });

  test("a user can draw point, polyline, and polygon vectors and change their rendered preferences", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Vector");

    const inspector = editorPanel(page, "Vector Objects");
    const selection = inspector.locator("select").first();
    const initialCount = await selection.locator("option").count();
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-vector"]',
    );
    await clickElement(exactButton(row, "D"));
    const tools = editorPanel(page, "Tools");

    await selectRadio(tools, "line");
    const abortVertex = await scenePoint(page, 0.28, 0.16);
    await page.mouse.click(abortVertex.x, abortVertex.y);
    await page.keyboard.press("Escape");
    await expect(selection).toHaveValue("(New vector)");
    await expect(selection.locator("option")).toHaveCount(initialCount);

    await selectRadio(tools, "Point");
    const point = await scenePoint(page, 0.34, 0.22);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 2, point.y + 2);
    await page.mouse.up({ button: "left" });
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(initialCount);
    const countAfterPoint = await selection.locator("option").count();

    await clickElement(exactButton(row, "D"));
    await selectRadio(tools, "line");
    for (const [fx, fy] of [
      [0.28, 0.16],
      [0.46, 0.25],
      [0.66, 0.16],
    ] as const) {
      const vertex = await scenePoint(page, fx, fy);
      await page.mouse.click(vertex.x, vertex.y);
    }
    await page.keyboard.press("g");
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(countAfterPoint);
    const countAfterLine = await selection.locator("option").count();

    await clickElement(exactButton(row, "D"));
    await selectRadio(tools, "Polygon");
    for (const [fx, fy] of [
      [0.3, 0.18],
      [0.48, 0.32],
      [0.68, 0.18],
    ] as const) {
      const vertex = await scenePoint(page, fx, fy);
      await page.mouse.click(vertex.x, vertex.y);
    }
    await page.keyboard.press("g");
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(countAfterLine);

    const vectorPrefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Vector",
    );
    const strokeWidth = inputControl(vectorPrefs, "stroke width");
    await fillNumberInput(strokeWidth, "1");
    const thinVector = await renderSnapshot(page);
    await fillNumberInput(strokeWidth, "10");
    expectRenderChanged(thinVector, await renderSnapshot(page));
    const strokeColor = inputControl(vectorPrefs, "stroke color");
    const redVector = await renderSnapshot(page);
    await fillColorInput(strokeColor, "{r: 0.00, g: 1.00, b: 0.00}");
    expectRenderChanged(redVector, await renderSnapshot(page));
    const selectedColor = inputControl(vectorPrefs, "Select color");
    const beforeSelectedColor = await renderSnapshot(page);
    // Blue is the default selection color; use a contrasting value so this is
    // a real visual transition even when the fixture has no config override.
    await fillColorInput(selectedColor, "{r: 1.00, g: 1.00, b: 0.00}");
    expectRenderChanged(beforeSelectedColor, await renderSnapshot(page));
    // The Show-* preferences wiring and the tooltip content are covered by
    // the pane container and tooltip-formatting unit tests.

    expect(errors).toEqual([]);
  });

  test("a locally created vector can be reselected and inspected from the dropdown", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Vector");
    const inspector = editorPanel(page, "Vector Objects");
    const selection = inspector.locator("select").first();
    const initialCount = await selection.locator("option").count();
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-vector"]',
    );
    await clickElement(exactButton(row, "D"));
    await selectRadio(editorPanel(page, "Tools"), "Point");
    const point = await scenePoint(page, 0.34, 0.22);
    await page.mouse.click(point.x, point.y);
    await page.mouse.move(point.x + 3, point.y + 3);
    await expect
      .poll(() => selection.locator("option").count())
      .toBeGreaterThan(initialCount);
    await waitForLabelEditState(page);
    await page.keyboard.press("Escape");
    await selection.selectOption({ index: initialCount }, { force: true });
    // Entering the edit state proves the reselection reached the app; the
    // dropdown echo and relationships visibility are covered by the pane
    // container unit tests.
    await waitForLabelEditState(page);
  });

  test("vector class relationship edits update history and rendered class styling", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Vector");
    const inspector = editorPanel(page, "Vector Objects");
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-vector"]',
    );
    await clickElement(exactButton(row, "D"));
    await selectRadio(editorPanel(page, "Tools"), "Point");
    const point = await scenePoint(page, 0.42, 0.26);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 2, point.y + 2);
    await page.mouse.up({ button: "left" });
    await expect(inspector.locator("select").first()).not.toHaveValue(
      "(New vector)",
    );
    await waitForLabelEditState(page);
    const before = await renderSnapshot(page);

    await clickElement(exactButton(inspector, "Relationships"));
    const objectClass = selectControl(inspector, "Object Class");
    const current = await objectClass.inputValue();
    const alternate = await objectClass
      .locator("option")
      .evaluateAll(
        (options, selected) =>
          (options as HTMLOptionElement[]).find(
            (option) => option.value !== selected,
          )?.value,
        current,
      );
    expect(alternate).toBeTruthy();
    await objectClass.selectOption(alternate!, { force: true });
    expectRenderChanged(before, await renderSnapshot(page));
    await expect(
      editorPanel(page, "Project").locator(".labelset-history .selected"),
    ).toContainText("Assign Ground Truth Class");
  });

  test("vector Delete removes the vector currently being edited", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Vector");
    const inspector = editorPanel(page, "Vector Objects");
    const selection = inspector.locator("select").first();
    const initialCount = await selection.locator("option").count();
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-vector"]',
    );
    await clickElement(exactButton(row, "D"));
    await selectRadio(editorPanel(page, "Tools"), "Point");
    const point = await scenePoint(page, 0.43, 0.3);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 2, point.y + 2);
    await page.mouse.up({ button: "left" });
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(initialCount);
    await expect(exactButton(editorPanel(page, "Tools"), "Copy")).toBeEnabled();
    const beforeDelete = await renderSnapshot(page);

    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Delete");
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBe(initialCount);
    expectRenderChanged(beforeDelete, await renderSnapshot(page));
  });

  test("undo and redo remove and restore a newly created vector in the scene", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Vector");
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-vector"]',
    );
    await clickElement(exactButton(row, "D"));
    await selectRadio(editorPanel(page, "Tools"), "Point");
    const point = await scenePoint(page, 0.43, 0.3);
    const beforeCreate = await renderSnapshot(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 2, point.y + 2);
    await page.mouse.up({ button: "left" });
    const afterCreate = await renderSnapshot(page);
    expectRenderChanged(beforeCreate, afterCreate);

    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Control+z");
    const afterUndo = await renderSnapshot(page);
    expectRenderChanged(afterCreate, afterUndo);
    await page.keyboard.press("Control+y");
    expectRenderChanged(afterUndo, await renderSnapshot(page));
    await expect(
      editorPanel(page, "Project").locator(".labelset-history .selected"),
    ).toContainText("Create Vector Object");
  });

  test("clicking history rows rebases the labelset and rendered scene", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Vector");
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-vector"]',
    );
    await clickElement(exactButton(row, "D"));
    await selectRadio(editorPanel(page, "Tools"), "Point");
    const point = await scenePoint(page, 0.43, 0.3);
    const beforeCreate = await renderSnapshot(page);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 2, point.y + 2);
    await page.mouse.up();
    const afterCreate = await renderSnapshot(page);
    expectRenderChanged(beforeCreate, afterCreate);

    const history = editorPanel(page, "Project").locator(".labelset-history");
    const createdRow = history
      .locator(".scrolllist-item")
      .filter({ hasText: "Create Vector Object" })
      .first();
    await expect(createdRow).toContainText("Create Vector Object");
    const priorRow = createdRow.locator("xpath=following-sibling::div[1]");
    await priorRow.dispatchEvent("pointerdown");
    await expect(priorRow).toHaveAttribute("aria-selected", "true");
    const afterRebaseBack = await renderSnapshot(page);
    expectRenderChanged(afterCreate, afterRebaseBack);

    await createdRow.dispatchEvent("pointerdown");
    await expect(createdRow).toHaveAttribute("aria-selected", "true");
    expectRenderChanged(afterRebaseBack, await renderSnapshot(page));
  });

  test("vector copy, paste, delete, undo, and redo hotkeys update label state", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Vector");
    const inspector = editorPanel(page, "Vector Objects");
    const selection = inspector.locator("select").first();
    const initialCount = await selection.locator("option").count();
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-vector"]',
    );
    await clickElement(exactButton(row, "D"));
    await selectRadio(editorPanel(page, "Tools"), "Point");
    const point = await scenePoint(page, 0.34, 0.22);
    await page.mouse.click(point.x, point.y);
    await page.mouse.move(point.x + 3, point.y + 3);
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(initialCount);
    await expect(exactButton(editorPanel(page, "Tools"), "Copy")).toBeEnabled();

    const countBeforePaste = await selection.locator("option").count();
    await page.keyboard.press("Control+c");
    await expect(
      exactButton(editorPanel(page, "Tools"), "Paste"),
    ).toBeEnabled();
    await page.keyboard.press("Control+v");
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(countBeforePaste);
    const countAfterPaste = await selection.locator("option").count();
    await expect(exactButton(editorPanel(page, "Tools"), "Copy")).toBeEnabled();
    await page.keyboard.press("Delete");
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeLessThan(countAfterPaste);
    const countAfterDelete = await selection.locator("option").count();
    await page.keyboard.press("Control+z");
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBeGreaterThan(countAfterDelete);
    await page.keyboard.press("Control+y");
    await expect
      .poll(() => selection.locator("option").count(), {
        timeout: 30_000,
      })
      .toBe(countAfterDelete);
  });

  test("a user can create segmentation selections with brush, rectangle, lasso, and polygon queries", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Segmentation");

    const inspector = editorPanel(page, "Selection Points");
    const selection = inspector.locator("select").first();
    const initialSelectionCount = await selection.locator("option").count();
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-segmentation"]',
    );
    const tools = editorPanel(page, "Tools");
    let createdCount = 0;

    const segmentationPrefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Segmentation",
    );
    const displayRange = inputControl(segmentationPrefs, "Time-Path Range");
    const rangeReload = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith("/editor/label/data/bulk") &&
        url.searchParams.get("key") === "segmentation"
      );
    });
    await fillNumberInput(displayRange, "2");
    await expect((await rangeReload).ok()).toBe(true);
    await selectActiveLayer(page, "Source Data", "Point Cloud");
    await selectActiveLayer(page, "Label Data", "Segmentation");
    await expect(displayRange).toHaveValue(/2/);
    const brushDiameter = inputControl(segmentationPrefs, "Brush Diameter");
    await fillNumberInput(brushDiameter, "20");
    await fillNumberInput(brushDiameter, "80");
    // The brush cursor's diameter wiring is covered by the control-component
    // unit tests.
    const brushHue = inputControl(segmentationPrefs, "Brush Hue");
    await fillNumberInput(brushHue, "0");
    await clickElement(exactButton(row, "D"));
    await selectRadio(tools, "brush");
    const hueProbeStart = await scenePoint(page, 0.48, 0.48);
    await page.mouse.move(hueProbeStart.x, hueProbeStart.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(hueProbeStart.x + 20, hueProbeStart.y + 20, {
      steps: 4,
    });
    const transparentBrush = await renderSnapshot(page);
    await page.keyboard.press("Escape");
    await page.mouse.up({ button: "left" });

    await fillNumberInput(brushHue, "0.5");
    await clickElement(exactButton(row, "D"));
    await selectRadio(tools, "brush");
    await page.mouse.move(hueProbeStart.x, hueProbeStart.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(hueProbeStart.x + 20, hueProbeStart.y + 20, {
      steps: 4,
    });
    expectRenderChanged(transparentBrush, await renderSnapshot(page));
    await page.keyboard.press("Escape");
    await page.mouse.up({ button: "left" });

    const dragQuery = async (
      mode: string,
      startAt: [number, number],
      path: [number, number][],
    ) => {
      await selection.selectOption({ index: 0 }, { force: true });
      await expect(selection).toHaveValue("(New selection)");
      const countBeforeQuery = await selection.locator("option").count();
      const before = await renderSnapshot(page);
      if (createdCount === 0) await clickElement(exactButton(row, "D"));
      await selectRadio(tools, mode);
      const start = await scenePoint(page, ...startAt);
      await page.mouse.move(start.x, start.y);
      await page.mouse.down({ button: "left" });
      for (const [fx, fy] of path) {
        const point = await scenePoint(page, fx, fy);
        await page.mouse.move(point.x, point.y, { steps: 4 });
      }
      await page.mouse.up({ button: "left" });
      await expect
        .poll(() => selection.inputValue(), { timeout: 30_000 })
        .not.toBe("(New selection)");
      await expect(selection).not.toHaveValue("(New selection)");
      await expect
        .poll(() => selection.locator("option").count(), {
          timeout: 30_000,
        })
        .toBeGreaterThan(countBeforeQuery);
      createdCount += 1;
      expectRenderChanged(before, await renderSnapshot(page));
    };

    await dragQuery(
      "brush",
      [0.48, 0.48],
      [
        [0.5, 0.5],
        [0.52, 0.52],
      ],
    );
    await dragQuery("box", [0.3, 0.18], [[0.68, 0.32]]);
    await dragQuery(
      "lasso",
      [0.28, 0.16],
      [
        [0.68, 0.16],
        [0.7, 0.34],
        [0.3, 0.34],
        [0.28, 0.16],
      ],
    );

    await selection.selectOption({ index: 0 }, { force: true });
    await expect(selection).toHaveValue("(New selection)");
    await selectRadio(tools, "polygon");
    for (const [fx, fy] of [
      [0.28, 0.16],
      [0.5, 0.34],
      [0.7, 0.16],
    ] as const) {
      const vertex = await scenePoint(page, fx, fy);
      await page.mouse.click(vertex.x, vertex.y);
    }
    // The select/radio above leave a form control focused; hotkeys are
    // intentionally ignored while a form control has focus.
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("g");
    await expect(
      exactButton(editorPanel(page, "Project"), "Save Changes"),
    ).toBeEnabled({ timeout: 30_000 });
    await expect(selection).not.toHaveValue("(New selection)");
    await expect
      .poll(() => selection.locator("option").count())
      .toBeGreaterThanOrEqual(initialSelectionCount + 4);
    createdCount += 1;
    expect(createdCount).toBe(4);

    const transparentPoints = checkboxControl(
      segmentationPrefs,
      "Transparent Points",
    );
    const pointOpacity = inputControl(segmentationPrefs, "Point opacity");
    await fillNumberInput(pointOpacity, "0");
    const invisiblePoints = await renderSnapshot(page);
    await setCheckboxInput(transparentPoints, false);
    const opaqueByToggle = await renderSnapshot(page);
    expectRenderChanged(invisiblePoints, opaqueByToggle);
    await setCheckboxInput(transparentPoints, true);
    await fillNumberInput(pointOpacity, "0.5");

    // The Show-* preferences wiring, the tooltip content, and the
    // relationships folder visibility are covered by the pane container and
    // tooltip-formatting unit tests.

    const strokeColor = inputControl(segmentationPrefs, "stroke color");
    const beforeStrokeColor = await renderSnapshot(page);
    await fillColorInput(strokeColor, "{r: 1.00, g: 0.00, b: 1.00}");
    expectRenderChanged(beforeStrokeColor, await renderSnapshot(page));

    const selectedColor = inputControl(segmentationPrefs, "Select color");
    const beforeSelectedColor = await renderSnapshot(page);
    await fillColorInput(selectedColor, "{r: 0.00, g: 1.00, b: 0.00}");
    expectRenderChanged(beforeSelectedColor, await renderSnapshot(page));

    await expect(selection).not.toHaveValue("(New selection)");
    const selectedValue = await selection.inputValue();
    const countBeforeDelete = await selection.locator("option").count();
    const sceneBeforeDelete = await renderSnapshot(page);
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Delete");
    await expect
      .poll(() => selection.locator("option").count())
      .toBeLessThan(countBeforeDelete);
    const sceneAfterDelete = await renderSnapshot(page);
    expectRenderChanged(sceneBeforeDelete, sceneAfterDelete);
    const selectedHistoryItem = editorPanel(page, "Project").locator(
      ".labelset-history .selected",
    );
    await expect(selectedHistoryItem).toContainText("Delete Selection");
    await page.keyboard.press("Control+z");
    await expect(selectedHistoryItem).toContainText("Create a Selection");
    expectRenderChanged(sceneAfterDelete, await renderSnapshot(page));
    await page.keyboard.press("Control+y");
    await expect(selectedHistoryItem).toContainText("Delete Selection");
    await page.keyboard.press("Control+z");
    await expect(selectedHistoryItem).toContainText("Create a Selection");
    expect(selectedValue).not.toBe("(New selection)");
    expect(errors).toEqual([]);
  });

  test("segmentation Add and Erase edit modes change an existing selection", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    await selectActiveLayer(page, "Label Data", "Segmentation");
    const segmentationPrefs = await selectConfiguredLayer(
      page,
      "Preferences",
      "Segmentation",
    );
    await fillNumberInput(
      inputControl(segmentationPrefs, "Brush Diameter"),
      "10",
    );
    const row = editorPanel(page, "Layers").locator(
      '[data-test="editor-layer-row-segmentation"]',
    );
    const tools = editorPanel(page, "Tools");
    const selection = editorPanel(page, "Selection Points")
      .locator("select")
      .first();
    await clickElement(exactButton(row, "D"));
    await selectRadio(tools, "box");
    const selectionStart = await scenePoint(page, 0.25, 0.18);
    const selectionEnd = await scenePoint(page, 0.72, 0.52);
    await page.mouse.move(selectionStart.x, selectionStart.y);
    await page.mouse.down();
    await page.mouse.move(selectionEnd.x, selectionEnd.y, { steps: 8 });
    await page.mouse.up();
    await expect(selection).not.toHaveValue("(New selection)");

    await selectRadio(tools, "brush");
    const selectedHistoryItem = editorPanel(page, "Project").locator(
      ".labelset-history .selected",
    );

    await selectRadio(tools, "Add");
    const addStart = await scenePoint(page, 0.73, 0.53);
    const addEnd = await scenePoint(page, 0.76, 0.56);
    const beforeAdd = await renderSnapshot(page);
    await page.mouse.move(addStart.x, addStart.y);
    await page.mouse.down();
    await page.mouse.move(addEnd.x, addEnd.y, { steps: 8 });
    await page.mouse.up();
    expectRenderChanged(beforeAdd, await renderSnapshot(page));
    await expect(selectedHistoryItem).toContainText("Edit Selection");

    const eraseStart = await scenePoint(page, 0.46, 0.34);
    const eraseEnd = await scenePoint(page, 0.49, 0.37);

    const beforeErase = await renderSnapshot(page);
    await selectRadio(tools, "Erase");
    await page.mouse.move(eraseStart.x, eraseStart.y);
    await page.mouse.down();
    await page.mouse.move(eraseEnd.x, eraseEnd.y, { steps: 8 });
    await page.mouse.up();
    const erased = await renderSnapshot(page);
    expectRenderChanged(beforeErase, erased);
    await expect(selectedHistoryItem).toContainText("Edit Selection");

    await expect(selection).not.toHaveValue("(New selection)");
  });
});
