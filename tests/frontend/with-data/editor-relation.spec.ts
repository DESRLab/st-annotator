import { expect, test } from "@playwright/test";
import {
  loadEditorFixture,
  openEditor,
  expectCurrentFrame,
  selectActiveLayer,
  setCameraMode,
  zoomOutCamera,
  projectLabelPoint,
  uncoverScenePoint,
  uncoverTarget,
  editorPanel,
  exactButton,
  SEED_IDS,
  waitForEditorRenderSettled,
  probeHoveredLabel,
  probeSelectorRaycast,
} from "./editor-helpers";

test.describe("relation cross-plugin workflow", () => {
  test.describe.configure({ retries: 0 });
  test.use({ actionTimeout: 30_000 });
  test("creates a bbox-to-vector relation, reloads it, and restores endpoint deletion with undo", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const fixture = await loadEditorFixture(page);
    const frame = fixture.frames[2];
    await openEditor(page, frame);
    await expectCurrentFrame(page, frame.id);
    await setCameraMode(page, "2D");
    await zoomOutCamera(page);
    await selectActiveLayer(page, "Label Data", "Relations");
    const tools = page.getByTestId("relation-inspector");
    await expect(
      tools
        .locator(".tp-lblv")
        .filter({ has: page.getByText("Relation class", { exact: true }) })
        .locator("select"),
    ).toBeEnabled();
    await tools
      .locator(".tp-lblv")
      .filter({ has: page.getByText("Relation class", { exact: true }) })
      .locator("select")
      .selectOption({ label: "supports" });
    const drawRelation = tools.getByRole("button", { name: "D", exact: true });
    await uncoverTarget(page, drawRelation);
    await drawRelation.click();
    await expect(drawRelation).toHaveAttribute("aria-pressed", "true");
    let source = await projectLabelPoint(page, {
      layer: "bbox",
      id: SEED_IDS.transformBox,
    });
    await uncoverScenePoint(page, source);
    source = await projectLabelPoint(page, {
      layer: "bbox",
      id: SEED_IDS.transformBox,
    });
    expect(
      (await probeSelectorRaycast(page, { layer: "relation" }, source)).hitId,
    ).toBe(SEED_IDS.transformBox);
    await page.mouse.click(source.x, source.y);
    await expect(page.locator(".hint")).toContainText(
      "Click the target label element.",
    );
    expect(
      (await probeSelectorRaycast(page, { layer: "relation" }, source)).hitId,
    ).not.toBe(SEED_IDS.transformBox);
    let target = await projectLabelPoint(page, {
      layer: "vector",
      id: SEED_IDS.polyline,
      index: 1,
    });
    await uncoverScenePoint(page, target);
    target = await projectLabelPoint(page, {
      layer: "vector",
      id: SEED_IDS.polyline,
      index: 1,
    });
    await page.mouse.click(target.x, target.y);
    await expect(drawRelation).toHaveAttribute("aria-pressed", "false");
    await expect(
      tools
        .locator(".tp-fldv")
        .filter({
          has: page.getByRole("button", { name: /^Replace (source|target)$/ }),
        })
        .first()
        .locator('input[role="combobox"]')
        .last(),
    ).toHaveValue(new RegExp(`^${SEED_IDS.transformBox} — `));
    await expect(
      tools
        .locator(".tp-lblv")
        .filter({ has: page.getByText("Direction", { exact: true }) })
        .locator("select"),
    ).toBeVisible();
    const tree = page
      .getByTestId("relation-inspector")
      .locator("select")
      .first();
    await expect(tree).toContainText(
      `(supports): box ${SEED_IDS.transformBox} → vector ${SEED_IDS.polyline}`,
    );
    // Replacing discarded local creation must not declare its placeholder as
    // executable work in the save batch.
    await page.keyboard.press("Control+z");
    await expect(tree).not.toContainText(
      `(supports): box ${SEED_IDS.transformBox} → vector ${SEED_IDS.polyline}`,
    );
    await uncoverTarget(page, drawRelation);
    await drawRelation.click();
    for (const endpoint of [
      { layer: "bbox", id: SEED_IDS.transformBox },
      { layer: "vector", id: SEED_IDS.polyline, index: 1 },
    ]) {
      let point = await projectLabelPoint(page, endpoint);
      await uncoverScenePoint(page, point);
      point = await projectLabelPoint(page, endpoint);
      await page.mouse.click(point.x, point.y);
    }
    await expect(drawRelation).toHaveAttribute("aria-pressed", "false");
    await expect(tree).toContainText(
      `(supports): box ${SEED_IDS.transformBox} → vector ${SEED_IDS.polyline}`,
    );
    const saveButton = exactButton(
      editorPanel(page, "Project"),
      "Save Changes",
    );
    await uncoverTarget(page, saveButton);
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname.endsWith("/editor/labelset/push") &&
        response.request().method() === "POST",
    );
    await saveButton.click();
    const response = await saved;
    expect(response.ok()).toBe(true);
    const result = (await response.json()) as { op_results: string[] };
    const relationId = result.op_results.at(-1)!;
    await waitForEditorRenderSettled(page);
    const search = tools.locator('input[role="combobox"]').first();
    await uncoverTarget(page, search);
    await search.fill(relationId);
    await page.getByRole("option").filter({ hasText: relationId }).click();
    await expect(drawRelation).toHaveAttribute("aria-pressed", "false");

    // The reverse direction has its own saved ID, but shares one editor label.
    await drawRelation.click();
    for (const endpoint of [
      { layer: "vector", id: SEED_IDS.polyline, index: 1 },
      { layer: "bbox", id: SEED_IDS.transformBox },
    ]) {
      let point = await projectLabelPoint(page, endpoint);
      await uncoverScenePoint(page, point);
      point = await projectLabelPoint(page, endpoint);
      await page.mouse.click(point.x, point.y);
    }
    await expect(drawRelation).toHaveAttribute("aria-pressed", "false");
    await expect(tree.locator("option")).toHaveCount(2);
    await uncoverTarget(page, saveButton);
    const reverseSaved = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.endsWith("/editor/labelset/push") &&
        res.request().method() === "POST",
    );
    await saveButton.click();
    const reverseResponse = await reverseSaved;
    expect(reverseResponse.ok()).toBe(true);
    const reverseResult = (await reverseResponse.json()) as {
      op_results: string[];
    };
    const reverseId = reverseResult.op_results.at(-1)!;
    expect(reverseId).not.toBe(relationId);
    await page.reload();
    await expectCurrentFrame(page, frame.id);
    await selectActiveLayer(page, "Label Data", "Relations");
    await uncoverTarget(page, search);
    await search.fill(reverseId);
    await page.getByRole("option").filter({ hasText: reverseId }).click();
    await expect(tree.locator("option")).toHaveCount(2);
    await expect(tree).toContainText("↔");
    const direction = tools
      .locator(".tp-lblv")
      .filter({ has: page.getByText("Direction", { exact: true }) })
      .locator("select");
    await uncoverTarget(page, direction);
    const sourceInput = tools
      .locator(".tp-fldv")
      .filter({
        has: page.getByRole("button", { name: /^Replace (source|target)$/ }),
      })
      .first()
      .locator('input[role="combobox"]')
      .last();
    if ((await sourceInput.inputValue()).startsWith(`${SEED_IDS.transformBox}`))
      await direction.selectOption({ index: 2 });
    await expect(
      tools
        .locator(".tp-fldv")
        .filter({
          has: page.getByRole("button", { name: /^Replace (source|target)$/ }),
        })
        .first()
        .locator('input[role="combobox"]')
        .last(),
    ).toHaveValue(new RegExp(`^${SEED_IDS.polyline} — `));
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Delete");
    await expect(tree.locator("option")).toHaveCount(2);
    await expect(tree).not.toContainText(reverseId);
    await expect(tree).toContainText(relationId);
    await uncoverTarget(page, saveButton);
    const reverseRemoved = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.endsWith("/editor/labelset/push") &&
        res.request().method() === "POST",
    );
    await saveButton.click();
    expect((await reverseRemoved).ok()).toBe(true);
    await uncoverTarget(page, search);
    await search.fill(relationId);
    await page.getByRole("option").filter({ hasText: relationId }).click();
    const records = tools.locator("[data-relation-id]");
    const directionCounts = tools
      .locator(".tp-lblv")
      .filter({ has: page.getByText("Direction", { exact: true }) })
      .locator("select");
    await uncoverTarget(
      page,
      tools.getByRole("button", { name: "Add relation", exact: true }),
    );
    await tools
      .getByRole("button", { name: "Add relation", exact: true })
      .click();
    await expect(directionCounts.locator("option")).toHaveCount(2);
    await expect(directionCounts).toContainText("(2)");
    await expect(records).toHaveCount(2);
    await uncoverTarget(page, saveButton);
    const added = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.endsWith("/editor/labelset/push") &&
        res.request().method() === "POST",
    );
    await saveButton.click();
    const addedResponse = await added;
    expect(addedResponse.ok()).toBe(true);
    const addedResult = (await addedResponse.json()) as {
      op_results: string[];
    };
    const duplicateId = addedResult.op_results.at(-1)!;
    expect(duplicateId).not.toBe(relationId);
    await page.reload();
    await expectCurrentFrame(page, frame.id);
    await selectActiveLayer(page, "Label Data", "Relations");
    await uncoverTarget(page, search);
    await search.fill(duplicateId);
    await page.getByRole("option").filter({ hasText: duplicateId }).click();
    await expect(directionCounts.locator("option")).toHaveCount(2);
    await expect(directionCounts).toContainText("(2)");
    const duplicateClass = tools.locator(
      `[data-relation-id="${duplicateId}"] select`,
    );
    await uncoverTarget(page, duplicateClass);
    await duplicateClass.focus();
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Delete");
    await expect(records).toHaveCount(1);
    await expect(directionCounts).toContainText("(1)");
    await expect(tree).toContainText(relationId);
    await expect(tree).not.toContainText(duplicateId);
    await uncoverTarget(page, saveButton);
    const removedDuplicate = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.endsWith("/editor/labelset/push") &&
        res.request().method() === "POST",
    );
    await saveButton.click();
    expect((await removedDuplicate).ok()).toBe(true);
    for (const folderIndex of [0, 1]) {
      const folder = tools
        .locator(".tp-fldv")
        .filter({
          has: page.getByRole("button", { name: /^Replace (source|target)$/ }),
        })
        .nth(folderIndex);
      const typeSearch = folder.locator('input[role="combobox"]').first();
      const endpointSearch = folder.locator('input[role="combobox"]').last();
      const original = await folder
        .locator('input[role="combobox"]')
        .last()
        .inputValue();
      await uncoverTarget(page, typeSearch);
      await typeSearch.fill("selection");
      await page
        .getByRole("option", { name: "selection", exact: true })
        .click();
      await uncoverTarget(page, endpointSearch);
      await endpointSearch.fill(SEED_IDS.selection);
      await page
        .getByRole("option")
        .filter({ hasText: SEED_IDS.selection })
        .click();
      await expect(folder.locator('input[role="combobox"]').last()).toHaveValue(
        new RegExp(`^${SEED_IDS.selection} — `),
      );
      await page.evaluate(() =>
        (document.activeElement as HTMLElement | null)?.blur(),
      );
      await page.keyboard.press("Control+z");
      await expect(folder.locator('input[role="combobox"]').last()).toHaveValue(
        original,
      );
    }
    await page.reload();
    await expectCurrentFrame(page, frame.id);
    await selectActiveLayer(page, "Label Data", "Relations");
    await expect(tree).toContainText(
      `(supports): box ${SEED_IDS.transformBox} → vector ${SEED_IDS.polyline}`,
    );

    await setCameraMode(page, "2D");
    await zoomOutCamera(page);
    const selectRelation = page
      .locator('[data-test="editor-layer-row-relations"]')
      .getByRole("button", { name: "S", exact: true });
    await uncoverTarget(page, selectRelation);
    await selectRelation.click();
    let relationPoint = await projectLabelPoint(page, {
      layer: "relation",
      id: relationId,
    });
    await uncoverScenePoint(page, relationPoint);
    relationPoint = await projectLabelPoint(page, {
      layer: "relation",
      id: relationId,
    });
    await page.mouse.move(relationPoint.x, relationPoint.y);
    await expect
      .poll(() => probeHoveredLabel(page, { layer: "relation" }))
      .toBe(relationId);
    // Cross-layer highlights do not take over the endpoint layers' selectors.
    expect(await probeHoveredLabel(page, { layer: "bbox" })).toBeNull();
    expect(await probeHoveredLabel(page, { layer: "vector" })).toBeNull();
    await page.mouse.click(relationPoint.x, relationPoint.y);
    await expect(
      tools
        .locator(".tp-fldv")
        .filter({
          has: page.getByRole("button", { name: /^Replace (source|target)$/ }),
        })
        .first()
        .locator('input[role="combobox"]')
        .last(),
    ).toHaveValue(new RegExp(`^${SEED_IDS.transformBox} — `));
    await expect
      .poll(() => probeHoveredLabel(page, { layer: "relation" }))
      .toBeNull();

    // Deleting a seeded endpoint stays local; undo restores the fixture and relation together.
    const bboxRow = await selectActiveLayer(page, "Label Data", "Bounding Box");
    const selectBox = exactButton(bboxRow, "S");
    await uncoverTarget(page, selectBox);
    await selectBox.click();
    await setCameraMode(page, "2D");
    source = await projectLabelPoint(page, {
      layer: "bbox",
      id: SEED_IDS.transformBox,
    });
    await uncoverScenePoint(page, source);
    source = await projectLabelPoint(page, {
      layer: "bbox",
      id: SEED_IDS.transformBox,
    });
    await page.mouse.click(source.x, source.y);
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Delete");
    await selectActiveLayer(page, "Label Data", "Relations");
    await expect(tree.locator("option")).toHaveCount(1);
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Control+z");
    await expect(tree).toContainText("(supports):");

    // Clean up the saved relation, leaving all seeded labels intact for other specs.
    await uncoverTarget(page, search);
    await search.fill(relationId);
    await page.getByRole("option").filter({ hasText: relationId }).click();
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Delete");
    await expect(tree.locator("option")).toHaveCount(1);
    await uncoverTarget(page, saveButton);
    const cleanup = page.waitForResponse(
      (res) =>
        new URL(res.url()).pathname.endsWith("/editor/labelset/push") &&
        res.request().method() === "POST",
    );
    await saveButton.click();
    expect((await cleanup).ok()).toBe(true);
  });

  test("accepts a segmentation endpoint and cancels a partial relation", async ({
    page,
  }) => {
    const fixture = await loadEditorFixture(page);
    await openEditor(page, fixture.frames[2]);
    await expectCurrentFrame(page, fixture.frames[2].id);
    await setCameraMode(page, "2D");
    await zoomOutCamera(page);
    await selectActiveLayer(page, "Label Data", "Relations");
    const tools = page.getByTestId("relation-inspector");
    await expect(
      tools
        .locator(".tp-lblv")
        .filter({ has: page.getByText("Relation class", { exact: true }) })
        .locator("select"),
    ).toBeEnabled();
    const previousRelations = await page
      .getByTestId("relation-inspector")
      .locator("select")
      .first()
      .textContent();
    await uncoverTarget(
      page,
      page
        .locator('[data-test="editor-layer-row-relations"]')
        .getByRole("button", { name: "D", exact: true }),
    );
    await page
      .locator('[data-test="editor-layer-row-relations"]')
      .getByRole("button", { name: "D", exact: true })
      .click();
    let selection = await projectLabelPoint(page, {
      layer: "segmentation",
      id: SEED_IDS.selection,
    });
    await uncoverScenePoint(page, selection);
    selection = await projectLabelPoint(page, {
      layer: "segmentation",
      id: SEED_IDS.selection,
    });
    await page.mouse.click(selection.x, selection.y);
    await expect(page.locator(".hint")).toContainText(
      "Click the target label element.",
    );
    await page.evaluate(() =>
      (document.activeElement as HTMLElement | null)?.blur(),
    );
    await page.keyboard.press("Escape");
    await expect(page.locator(".hint")).toContainText(
      "Press S to select a relation or D to draw one.",
    );
    await expect(
      page.getByTestId("relation-inspector").locator("select").first(),
    ).toHaveText(previousRelations ?? "");
  });
});
