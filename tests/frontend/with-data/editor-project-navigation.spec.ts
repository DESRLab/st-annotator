import { expect, test } from "@playwright/test";

import {
  checkboxControl,
  clickElement,
  editorPanel,
  exactButton,
  fillNumberInput,
  inputControl,
  isEditorDataResponse,
  openEditor,
  openProjectPanelSection,
  readCurrentFrameId,
  framePathRow,
  scenePoint,
  selectActiveLayer,
  selectControl,
  setCheckboxInput,
} from "./editor-helpers";

test("leaving the editor route disposes the runtime and browser history restores it", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const fixture = await openEditor(page);
  await expect(page.locator("#display-container canvas")).toBeVisible();

  // Leaving the route unmounts the editor display, disposing the runtime.
  await page.goBack();
  await expect(page.locator("#display-container canvas")).toHaveCount(0);
  expect(page.url()).not.toContain(`/projects/${fixture.project.id}/annotate`);

  // Browser history restores the editor route: a fresh runtime must load the
  // frame again, and no stale error from the disposed runtime may surface.
  const pointCloudReload = page.waitForResponse((response) =>
    isEditorDataResponse(response, "/editor/source/data/bulk", "pcd"),
  );
  await page.goForward();
  await expect(page.locator("#display-container canvas")).toBeVisible({
    timeout: 60_000,
  });
  expect((await pointCloudReload).ok()).toBe(true);
  await expect(
    inputControl(editorPanel(page, "Project"), "Current Frame ID"),
  ).toHaveValue(String(fixture.frame.id), { timeout: 30_000 });
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test.describe("project scene navigation controls", () => {
  test("frame ID and path-index inputs navigate the real editor", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const fixture = await openEditor(page);
    expect(fixture.frames.length).toBeGreaterThan(1);
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));

    const readUrlParams = () => new URL(page.url()).searchParams;
    // A page-scoped marker that only survives if the page is neither reloaded
    // nor navigated; URL updates must happen purely through history changes.
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).navMarker = "no-reload";
    });
    const expectNoReload = async () =>
      expect(
        await page.evaluate(
          () => (window as unknown as Record<string, unknown>).navMarker,
        ),
      ).toBe("no-reload");

    const stride = inputControl(project, "Stride");
    await fillNumberInput(stride, "1");
    const currentFrameId = inputControl(project, "Current Frame ID");
    await openProjectPanelSection(project, "Frames", currentFrameId);
    const initialId = await readCurrentFrameId(page);
    expect(
      readUrlParams().get("frame_id"),
      "the initial URL should deep-link the loaded frame",
    ).toBe(String(initialId));
    const target = fixture.frames.find((frame) => frame.id !== initialId)!;
    await fillNumberInput(currentFrameId, String(target.id));
    await expect
      .poll(() => readCurrentFrameId(page), { timeout: 30_000 })
      .toBe(target.id);
    expect(
      readUrlParams().get("frame_id"),
      "frame-ID navigation should deep-link the new frame",
    ).toBe(String(target.id));
    expect(readUrlParams().get("task_id")).toBe(String(fixture.task.id));
    await expectNoReload();

    const currentIndex = inputControl(project, "Current index along path:");
    await openProjectPanelSection(project, "Playback", currentIndex);
    const targetIndex = (await currentIndex.inputValue()) === "0" ? "1" : "0";
    await fillNumberInput(currentIndex, targetIndex);
    await expect
      .poll(() => currentIndex.inputValue(), { timeout: 30_000 })
      .toBe(targetIndex);
    await expect
      .poll(() => readCurrentFrameId(page), { timeout: 30_000 })
      .not.toBe(target.id);
    expect(
      readUrlParams().get("frame_id"),
      "path-index navigation should deep-link the new frame",
    ).toBe(String(await readCurrentFrameId(page)));
    await expectNoReload();
  });

  test("sort, stride, and show-all controls rebuild the visible frame path", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await openEditor(page);
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));
    const path = project.getByRole("listbox", { name: "Frame path" });
    await expect(path).toBeVisible();

    const stride = inputControl(project, "Stride");
    await fillNumberInput(stride, "1");
    const densePath = await path.screenshot({ animations: "disabled" });
    await fillNumberInput(stride, "3");
    const sparsePath = await path.screenshot({ animations: "disabled" });
    expect(
      sparsePath.equals(densePath),
      "stride should rebuild the rendered path",
    ).toBe(false);

    const sort = selectControl(project, "Sort by axes:");
    const initialSort = await sort.inputValue();
    const alternateSort = await sort
      .locator("option")
      .evaluateAll(
        (options, current) =>
          (options as HTMLOptionElement[]).find(
            (option) => option.value !== current,
          )?.value,
        initialSort,
      );
    expect(alternateSort).toBeTruthy();
    await sort.selectOption(alternateSort!, { force: true });
    await expect(sort).toHaveValue(alternateSort!);

    const showAll = checkboxControl(project, "Show all frames");
    const initialShowAll = await showAll.isChecked();
    const filteredPath = await path.screenshot({ animations: "disabled" });
    await setCheckboxInput(showAll, !initialShowAll);
    const allPath = await path.screenshot({ animations: "disabled" });
    expect(
      allPath.equals(filteredPath),
      "show-all should change the rendered frame path",
    ).toBe(false);
  });

  test("playback controls start and stop frame traversal", async ({ page }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));
    await fillNumberInput(inputControl(project, "Stride"), "1");
    const fps = inputControl(project, "FPS");
    await openProjectPanelSection(project, "Playback", fps);
    await fillNumberInput(fps, "1");
    const currentIndex = inputControl(project, "Current index along path:");
    await fillNumberInput(currentIndex, "0");
    await expect(currentIndex).toHaveValue("0");
    const initialFrame = await readCurrentFrameId(page);
    await clickElement(exactButton(project, "Play Video"));
    await expect(exactButton(project, "Pause Video")).toBeVisible();
    await expect
      .poll(() => readCurrentFrameId(page), { timeout: 30_000 })
      .not.toBe(initialFrame);
    await clickElement(exactButton(project, "Pause Video"));
    await expect(exactButton(project, "Play Video")).toBeVisible();
  });

  test("step buttons navigate in both directions and playback status reports the transition", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await openEditor(page);
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));
    await fillNumberInput(inputControl(project, "Stride"), "1");
    await openProjectPanelSection(
      project,
      "Playback",
      inputControl(project, "FPS"),
    );
    await fillNumberInput(inputControl(project, "FPS"), "1");
    const currentIndex = inputControl(project, "Current index along path:");
    await fillNumberInput(currentIndex, "0");
    const firstFrame = await readCurrentFrameId(page);

    await clickElement(exactButton(project, "Step >"));
    await expect
      .poll(() => readCurrentFrameId(page), { timeout: 30_000 })
      .not.toBe(firstFrame);
    const secondFrame = await readCurrentFrameId(page);
    await clickElement(exactButton(project, "< Step"));
    await expect
      .poll(() => readCurrentFrameId(page), { timeout: 30_000 })
      .toBe(firstFrame);
    expect(secondFrame).not.toBe(firstFrame);

    await clickElement(exactButton(project, "Play Video"));
    await expect(exactButton(project, "Pause Video")).toBeVisible();
    await expect(project).toContainText(/Status:\s*Playing/i);
    await expect(project).toContainText(/Buffer:\s*\[/i);
    await clickElement(exactButton(project, "Pause Video"));
    await expect(project).toContainText(/Status:\s*Paused/i);
  });

  test("Frame-bound content follows navigation and remains read-only", async ({
    page,
  }) => {
    const fixture = await openEditor(page);
    expect(fixture.frames.length).toBeGreaterThan(1);
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Frame"));
    const readBounds = async () =>
      Promise.all(
        ["X Bounds", "Y Bounds", "Z Bounds", "T Bounds"].map((label) =>
          inputControl(project, label).inputValue(),
        ),
      );
    const firstBounds = await readBounds();
    for (const label of ["X Bounds", "Y Bounds", "Z Bounds", "T Bounds"]) {
      const bounds = inputControl(project, label);
      await expect(bounds).toBeDisabled();
      await expect(bounds).not.toHaveValue("");
    }

    await clickElement(exactButton(project, "Scene"));
    await fillNumberInput(inputControl(project, "Stride"), "1");
    const currentFrameId = inputControl(project, "Current Frame ID");
    await openProjectPanelSection(project, "Frames", currentFrameId);
    const currentId = await readCurrentFrameId(page);
    const target = fixture.frames.find((frame) => frame.id !== currentId)!;
    await fillNumberInput(currentFrameId, String(target.id));
    await expect
      .poll(() => readCurrentFrameId(page), { timeout: 30_000 })
      .toBe(target.id);
    await clickElement(exactButton(project, "Frame"));
    const secondBounds = await readBounds();
    expect(
      secondBounds,
      "the bound text should describe the newly navigated frame",
    ).not.toEqual(firstBounds);
  });

  test("clicking a frame-path row navigates the real editor", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const fixture = await openEditor(page);
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));
    await fillNumberInput(inputControl(project, "Stride"), "1");
    const initialId = await readCurrentFrameId(page);
    const target = fixture.frames.find((frame) => frame.id !== initialId)!;
    const pointCloudReload = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname.endsWith("/editor/source/data/bulk") &&
        url.searchParams.get("key") === "pcd"
      );
    });
    await framePathRow(page, target.id).click();
    await expect
      .poll(() => readCurrentFrameId(page), { timeout: 30_000 })
      .toBe(target.id);
    await expect(framePathRow(page, target.id)).toHaveClass(/selected/);
    await expect((await pointCloudReload).ok()).toBe(true);
    expect(
      new URL(page.url()).searchParams.get("frame_id"),
      "row navigation should deep-link the new frame",
    ).toBe(String(target.id));
  });

  test.describe("persisted frame status mutation", () => {
    // Mutates the shared fixture database (restoring it afterward), so a
    // retry could start from a mid-mutation state; keep it retry-free.
    test.describe.configure({ retries: 0 });

    test("right-clicking a frame-path row cycles its persisted completion status", async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const fixture = await openEditor(page);
      const project = editorPanel(page, "Project");
      await clickElement(exactButton(project, "Scene"));
      await fillNumberInput(inputControl(project, "Stride"), "1");
      const target =
        fixture.frames.find((frame) => frame.id !== fixture.frame.id) ??
        fixture.frame;
      const row = framePathRow(page, target.id);
      const original = await row.getAttribute("data-frame-status");
      const expected = original === "complete" ? "incomplete" : "complete";
      const statusRequest = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "POST" &&
          url.pathname.endsWith("/editor/frame/is_complete") &&
          url.searchParams.get("frame_id") === String(target.id)
        );
      });
      await row.click({ button: "right" });
      await expect((await statusRequest).ok()).toBe(true);
      await expect(row).toHaveAttribute("data-frame-status", expected);

      const restoreRequest = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "POST" &&
          url.pathname.endsWith("/editor/frame/is_complete") &&
          url.searchParams.get("frame_id") === String(target.id)
        );
      });
      await row.click({ button: "right" });
      await expect((await restoreRequest).ok()).toBe(true);
      await expect(row).toHaveAttribute("data-frame-status", original!);
    });
  });
});

test.describe("browser history with dirty and in-flight work", () => {
  // These tests draw real labels into the shared fixture database (restoring
  // them afterwards) and reload the page, so a retry could start from a
  // mid-mutation state; keep them retry-free.
  test.describe.configure({ retries: 0 });

  /** Draws one bbox and returns the selection locator plus the pre-draw count. */
  async function drawBox(page: Parameters<typeof openEditor>[0]) {
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    const selection = editorPanel(page, "Bounding Box")
      .locator("select")
      .first();
    const countBefore = await selection.locator("option").count();

    await page.keyboard.press("d");
    await expect(page.locator(".hint")).toContainText(/Click and drag to draw/);
    const point = await scenePoint(page, 0.55, 0.55);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(point.x + 120, point.y + 80, { steps: 12 });
    await page.mouse.up({ button: "left" });
    await expect
      .poll(() => selection.locator("option").count())
      .toBe(countBefore + 1);

    return { selection, countBefore };
  }

  test("browser back with unsaved changes disposes the runtime; forward restores server state", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openEditor(page);
    const { countBefore } = await drawBox(page);

    // Leaving the route disposes the runtime; SPA navigation does not fire
    // beforeunload, so the dirty state is simply abandoned.
    await page.goBack();
    await expect(page.locator("#display-container canvas")).toHaveCount(0);

    // Browser history restores the editor: a fresh runtime loads the server
    // state, in which the unsaved box never existed.
    await page.goForward();
    await expect(page.locator("#display-container canvas")).toBeVisible({
      timeout: 60_000,
    });
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    await expect
      .poll(
        () =>
          editorPanel(page, "Bounding Box")
            .locator("select")
            .first()
            .locator("option")
            .count(),
        { timeout: 60_000 },
      )
      .toBe(countBefore);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test("a dirty editor warns before unloading; a clean editor does not", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const fixture = await openEditor(page);
    await drawBox(page);

    let dialogType: string | null = null;
    page.on("dialog", async (dialog) => {
      dialogType = dialog.type();
      await dialog.accept();
    });

    // Reloading a dirty editor fires the beforeunload guard. Chromium does
    // not expose the custom message text, so the dialog TYPE is the pin.
    await page.reload();
    await expect(page.locator("#display-container canvas")).toBeVisible({
      timeout: 60_000,
    });
    expect(dialogType, "beforeunload should warn about unsaved changes").toBe(
      "beforeunload",
    );
    // The deep link restores the same frame; the unsaved work is gone.
    await expect(
      inputControl(editorPanel(page, "Project"), "Current Frame ID"),
    ).toHaveValue(String(fixture.frame.id), { timeout: 30_000 });

    // A subsequent reload of the clean editor shows no dialog.
    dialogType = null;
    await page.reload();
    await expect(page.locator("#display-container canvas")).toBeVisible({
      timeout: 60_000,
    });
    await expect(
      inputControl(editorPanel(page, "Project"), "Current Frame ID"),
    ).toHaveValue(String(fixture.frame.id), { timeout: 30_000 });
    await page.waitForTimeout(2000);
    expect(dialogType).toBeNull();
  });

  test("leaving mid-save aborts the in-flight push; the restored editor stays clean", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await openEditor(page);
    const { countBefore } = await drawBox(page);

    // A failed push surfaces an alert while the runtime is abandoned, and
    // leaving the dirty page fires beforeunload; accept any dialog.
    page.on("dialog", (dialog) => dialog.accept());

    // Hold the save at the network boundary, then leave the route mid-save.
    let saveHeld = false;
    await page.route("**/editor/labelset/push*", () => {
      saveHeld = true;
      // Deliberately never continued: leaving the route aborts the request.
    });
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Control+s");
    await expect.poll(() => saveHeld).toBe(true);

    // Going back is a full navigation: it aborts the in-flight push, so the
    // server never applies it and no stale operation survives the disposal.
    await page.goBack();
    await expect(page.locator("#display-container canvas")).toHaveCount(0);

    // Browser history restores the editor; the never-saved box is absent and
    // no stale error surfaces.
    await page.goForward();
    await expect(page.locator("#display-container canvas")).toBeVisible({
      timeout: 60_000,
    });
    await selectActiveLayer(page, "Label Data", "Bounding Box");
    await expect
      .poll(
        () =>
          editorPanel(page, "Bounding Box")
            .locator("select")
            .first()
            .locator("option")
            .count(),
        { timeout: 60_000 },
      )
      .toBe(countBefore);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });
});
