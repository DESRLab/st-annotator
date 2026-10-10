import { expect, test, type Page } from "@playwright/test";

import {
  clickElement,
  editorPanel,
  exactButton,
  fillNumberInput,
  inputControl,
  openEditor,
  selectActiveLayer,
  setCheckbox,
} from "./editor-helpers";

interface RecordedRequest {
  method: string;
  headers: Record<string, string>;
  body: Buffer | null;
}

/**
 * Stubs the annotator's assistant-proxy routes and records their requests.
 */
async function stubAssistant(
  page: Page,
  options: { predictStatus?: number; logit?: number } = {},
) {
  const recorded = {
    health: 0,
    encode: [] as RecordedRequest[],
    predict: [] as RecordedRequest[],
  };
  let encodedPoints = 0;

  await page.route("**/editor/segmentation/assistant/health", async (route) => {
    recorded.health += 1;
    await route.fulfill({ json: { is_assistant_available: true } });
  });

  await page.route("**/editor/segmentation/encode_pcd", async (route) => {
    const request = route.request();
    recorded.encode.push({
      method: request.method(),
      headers: request.headers(),
      body: request.postDataBuffer(),
    });
    encodedPoints = Number(request.headers()["x-num-points"] ?? "0");
    await route.fulfill({ status: 200 });
  });

  await page.route("**/editor/segmentation/predict_mask", async (route) => {
    const request = route.request();
    recorded.predict.push({
      method: request.method(),
      headers: request.headers(),
      body: request.postDataBuffer(),
    });

    const status = options.predictStatus ?? 200;
    if (status !== 200) {
      await route.fulfill({ status });
      return;
    }

    // Accept every point so that the prediction yields a non-empty selection
    const logits = new Float32Array(encodedPoints).fill(options.logit ?? 1);
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: Buffer.from(logits.buffer),
    });
  });

  return recorded;
}

/**
 * Activates the segmentation layer, switches it to drawing with the labeling
 * assistant, and prompts one foreground point at the center of the display.
 */
async function promptOnePoint(
  page: Page,
  options: {
    mode?: "Foreground" | "Background";
    numPrompts?: number;
    maskThreshold?: number;
    clicks?: number;
    button?: "left" | "right";
  } = {},
) {
  await selectActiveLayer(page, "Label Data", "Segmentation");

  // The first settings change may reload the segmentation labels (e.g. when
  // the time-path range is first applied), which navigates the layer back to
  // its passive state; toggle the assistant first and let the reload settle
  // before entering draw mode.
  const reloadResponse = page
    .waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          url.pathname.endsWith("/editor/label/data/bulk") &&
          url.searchParams.get("key") === "segmentation"
        );
      },
      { timeout: 10000 },
    )
    .catch(() => null);

  await setCheckbox(editorPanel(page, "Preferences"), "Use Assistant", true);
  await reloadResponse;
  // Give the reload's after-load a moment to re-enable the layer
  await page.waitForTimeout(500);

  const row = editorPanel(page, "Layers").locator(
    '[data-test="editor-layer-row-segmentation"]',
  );
  await clickElement(exactButton(row, "D"));
  const tools = editorPanel(page, "Tools");
  if (options.mode != null) {
    const mode = tools.getByRole("radio", {
      name: options.mode,
      exact: true,
    });
    await mode.evaluate((element: HTMLInputElement) => element.click());
    await expect(mode).toBeChecked();
  }
  if (options.numPrompts != null) {
    await fillNumberInput(
      inputControl(tools, "Number of Prompts"),
      String(options.numPrompts),
    );
  }
  if (options.maskThreshold != null) {
    await fillNumberInput(
      inputControl(tools, "Mask Threshold"),
      String(options.maskThreshold),
    );
  }

  const mainWindow = page.locator("#main-window");
  await expect(mainWindow).toBeVisible();
  const bounds = await mainWindow.boundingBox();
  expect(bounds, "the main window should have bounds").not.toBeNull();

  // Draggable panels dock over the display, so probe for a point that is
  // actually on the scene window rather than occluded by a panel.
  const candidates: [number, number][] = [
    [0.4, 0.35],
    [0.35, 0.3],
    [0.45, 0.45],
    [0.3, 0.45],
    [0.4, 0.6],
    [0.35, 0.7],
  ];
  const clickPoint = await page.evaluate(
    ([rect, candidates]) => {
      const isOnSceneWindow = (x: number, y: number): boolean => {
        let current: Element | null = document.elementFromPoint(x, y);
        while (current != null) {
          if (current.id === "main-window") return true;
          current = current.parentElement;
        }
        return false;
      };

      for (const [fx, fy] of candidates) {
        const x = rect.x + rect.width * fx;
        const y = rect.y + rect.height * fy;
        if (isOnSceneWindow(x, y)) return { x, y };
      }

      return null;
    },
    [bounds!, candidates],
  );
  expect(
    clickPoint,
    "a point on the scene window should not be occluded",
  ).not.toBeNull();

  for (let i = 0; i < (options.clicks ?? 1); i += 1) {
    await page.mouse.click(clickPoint!.x + i * 8, clickPoint!.y + i * 8, {
      button: options.button ?? "left",
    });
  }
  return clickPoint!;
}

test("the editor encodes the displayed point cloud for the labeling assistant", async ({
  page,
}) => {
  test.setTimeout(180000);

  const recorded = await stubAssistant(page);

  await openEditor(page);

  await expect.poll(() => recorded.encode.length, { timeout: 60000 }).toBe(1);
  expect(recorded.health).toBe(1);

  const encode = recorded.encode[0];
  expect(encode.method).toBe("POST");

  const numPoints = Number(encode.headers["x-num-points"]);
  expect(numPoints).toBeGreaterThan(0);

  // The body carries 3 float32 channels (in database coordinates) per point
  expect(encode.body?.byteLength).toBe(numPoints * 3 * 4);
});

test("point prompts predict a mask and create a segmentation selection", async ({
  page,
}) => {
  test.setTimeout(240000);

  const recorded = await stubAssistant(page);

  await openEditor(page);
  await expect.poll(() => recorded.encode.length, { timeout: 60000 }).toBe(1);
  await promptOnePoint(page);

  await expect
    .poll(() => recorded.predict.length, { timeout: 30000 })
    .toBeGreaterThan(0);
  expect(recorded.health).toBe(1);
  expect(recorded.encode).toHaveLength(1);

  const predict = recorded.predict[0];
  expect(predict.method).toBe("POST");
  expect(predict.headers["x-num-points"]).toBe("1");
  expect(predict.headers["x-labels"]).toBe("1");
  expect(predict.body?.byteLength).toBe(1 * 3 * 4);

  // The predicted mask becomes a selection, which is applied as a local
  // labelset change; the Save control becoming enabled proves the selection
  // was created. (Pushing it to the backend is covered by the labelset
  // persistence tests, not this assistant-flow test.)
  const saveButton = exactButton(editorPanel(page, "Project"), "Save Changes");
  await expect(saveButton).toBeEnabled({ timeout: 30000 });

  // The full editor workflow must expose the created selection to the
  // inspector rather than only changing an internal assistant state.
  const inspector = editorPanel(page, "Selection Points");
  const selection = inspector.locator("select").first();
  await expect(selection.locator("option").nth(1)).toBeAttached();
  await expect(selection).not.toHaveValue("(New selection)");
  await page.keyboard.press("Escape");
  await expect(selection).not.toHaveValue("(New selection)");

  await expect(saveButton).toBeEnabled();
});

test("a failed mask prediction keeps the editor state intact", async ({
  page,
}) => {
  test.setTimeout(240000);

  const warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning") warnings.push(message.text());
  });

  const recorded = await stubAssistant(page, { predictStatus: 500 });

  await openEditor(page);
  await expect.poll(() => recorded.encode.length, { timeout: 60000 }).toBe(1);
  await promptOnePoint(page);

  await expect
    .poll(() => recorded.predict.length, { timeout: 30000 })
    .toBeGreaterThan(0);

  // The failure is reported, and no selection is created from it
  await expect
    .poll(
      () => warnings.some((text) => text.includes("Failed to predict mask")),
      { timeout: 30000 },
    )
    .toBe(true);
  await expect(
    exactButton(editorPanel(page, "Project"), "Save Changes"),
  ).toBeDisabled();
});

test("assistant Background mode sends background labels", async ({ page }) => {
  test.setTimeout(240000);
  const recorded = await stubAssistant(page);
  await openEditor(page);
  await expect.poll(() => recorded.encode.length, { timeout: 60000 }).toBe(1);
  await promptOnePoint(page, { mode: "Background" });
  await expect.poll(() => recorded.predict.length, { timeout: 30000 }).toBe(1);
  expect(recorded.predict[0].headers["x-labels"]).toBe("0");
});

test("a right-click assistant prompt sends a background label", async ({
  page,
}) => {
  test.setTimeout(240000);
  const recorded = await stubAssistant(page);
  await openEditor(page);
  await expect.poll(() => recorded.encode.length, { timeout: 60000 }).toBe(1);
  await promptOnePoint(page, { button: "right" });
  await expect.poll(() => recorded.predict.length, { timeout: 30000 }).toBe(1);
  expect(recorded.predict[0].headers["x-num-points"]).toBe("1");
  expect(recorded.predict[0].headers["x-labels"]).toBe("0");
});

test("assistant predictions retain all foreground and background prompts", async ({
  page,
}) => {
  test.setTimeout(240000);
  const recorded = await stubAssistant(page);
  await openEditor(page);
  await expect.poll(() => recorded.encode.length, { timeout: 60000 }).toBe(1);

  const clickPoint = await promptOnePoint(page);
  await expect.poll(() => recorded.predict.length, { timeout: 30000 }).toBe(1);
  await expect(
    editorPanel(page, "Selection Points")
      .locator("select")
      .first()
      .locator("option")
      .nth(1),
  ).toBeAttached({ timeout: 30000 });

  await page.mouse.click(clickPoint.x + 8, clickPoint.y + 8, {
    button: "right",
  });
  await expect.poll(() => recorded.predict.length, { timeout: 30000 }).toBe(2);

  expect(recorded.predict[1].headers["x-num-points"]).toBe("2");
  expect(recorded.predict[1].headers["x-labels"]).toBe("1,0");
  expect(recorded.predict[1].body?.byteLength).toBe(2 * 3 * 4);
});

test("assistant Number of Prompts delays prediction until the configured count", async ({
  page,
}) => {
  test.setTimeout(240000);
  const recorded = await stubAssistant(page);
  await openEditor(page);
  await expect.poll(() => recorded.encode.length, { timeout: 60000 }).toBe(1);
  const clickPoint = await promptOnePoint(page, { numPrompts: 2, clicks: 1 });
  await page.waitForTimeout(500);
  expect(recorded.predict).toHaveLength(0);
  await page.mouse.click(clickPoint.x + 8, clickPoint.y + 8);
  await expect.poll(() => recorded.predict.length, { timeout: 30000 }).toBe(1);
  expect(recorded.predict[0].headers["x-num-points"]).toBe("2");
});

test("assistant Mask Threshold rejects logits below the configured threshold", async ({
  page,
}) => {
  test.setTimeout(240000);
  const recorded = await stubAssistant(page, { logit: 0.6 });
  await openEditor(page);
  await expect.poll(() => recorded.encode.length, { timeout: 60000 }).toBe(1);
  await promptOnePoint(page, { maskThreshold: 0.9 });
  await expect.poll(() => recorded.predict.length, { timeout: 30000 }).toBe(1);
  await expect(
    exactButton(editorPanel(page, "Project"), "Save Changes"),
  ).toBeDisabled();
  await expect(
    editorPanel(page, "Selection Points").locator("select").first(),
  ).toHaveValue("(New selection)");
});
