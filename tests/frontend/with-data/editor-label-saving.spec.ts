import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  centerCameraOnPoint,
  clickElement,
  dragFromProjectedTarget,
  editorPanel,
  exactButton,
  expectCurrentFrame,
  isEditorDataResponseForFrame,
  isButtonSelected,
  fillNumberInput,
  framePathRow,
  inputControl,
  projectTransformHandle,
  loadEditorFixture,
  openEditor,
  projectLabelPoint,
  projectWorldPoint,
  selectActiveLayer,
  selectControl,
  setCameraMode,
  SEED_IDS,
  uncoverScenePoint,
  uncoverTarget,
  waitForEditorRenderSettled,
} from "./editor-helpers";

const CLASS_NAME = "E2E Box with Default Size";
type LabelRecord = { id: string } & Record<string, unknown>;
interface Instruction {
  op_name: string;
  op_params: Record<string, unknown>;
}
interface SavedBatch {
  instructions: Instruction[];
  results: (string | null)[];
}

async function save(page: Page): Promise<SavedBatch> {
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname.endsWith("/editor/labelset/push"),
  );
  await clickElement(exactButton(editorPanel(page, "Project"), "Save Changes"));
  const response = await responsePromise;
  expect(response.ok(), await response.text()).toBe(true);
  const body = response.request().postDataJSON() as {
    commit_instrs: Instruction[];
  };
  const result = (await response.json()) as { op_results: (string | null)[] };
  await expect(
    exactButton(editorPanel(page, "Project"), "Save Changes"),
  ).toBeDisabled();
  return { instructions: body.commit_instrs, results: result.op_results };
}

function created(batch: SavedBatch, op: string) {
  const index = batch.instructions.findIndex(
    (instruction) => instruction.op_name === op,
  );
  expect(index).toBeGreaterThanOrEqual(0);
  const id = batch.results[index];
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  return { id: id!, params: batch.instructions[index].op_params };
}

async function reloadRecords(
  page: Page,
  key: string,
  frameId: number,
  collection: string,
) {
  const responsePromise = page.waitForResponse((response) =>
    isEditorDataResponseForFrame(
      response,
      "/editor/label/data/bulk",
      key,
      frameId,
    ),
  );
  await page.reload();
  await expectCurrentFrame(page, frameId);
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const payloads = (await response.json()) as ({ frame_id: number } & Record<
    string,
    unknown
  >)[];
  const payload = payloads.find((item) => item.frame_id === frameId);
  expect(payload).toBeDefined();
  return payload![collection] as LabelRecord[];
}

async function selectLabel(page: Page, inspector: Locator, id: string) {
  const picker = inspector.locator('input[role="combobox"]').first();
  await uncoverTarget(page, picker);
  await picker.fill(id);
  await page.locator(`[role="option"][data-label-id="${id}"]`).click();
}

async function selectRelation(page: Page, inspector: Locator, id: string) {
  const picker = inspector.locator('input[role="combobox"]').first();
  await uncoverTarget(page, picker);
  await picker.fill(id);
  await page.getByRole("option").filter({ hasText: id }).click();
}

async function classControl(inspector: Locator) {
  const control = selectControl(inspector, "Object Class");
  if (!(await control.isVisible()))
    await clickElement(exactButton(inspector, "Relationships"));
  await expect(control).toBeVisible();
  return control;
}

async function chooseClass(inspector: Locator, name = CLASS_NAME) {
  const control = await classControl(inspector);
  await control.selectOption({ label: name }, { force: true });
  await expect(control).toHaveValue(name);
}

function assertCoordinates(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  // Spatial models truncate coordinates to six decimal places.
  for (const [index, coordinate] of actual.entries()) {
    const tolerance = 1e-6 + Number.EPSILON * Math.abs(expected[index]);
    expect(Math.abs(coordinate - expected[index])).toBeLessThanOrEqual(
      tolerance,
    );
  }
}

function assertGeometry(
  key: string,
  record: LabelRecord,
  params: Record<string, unknown>,
) {
  const coords = (value: unknown) => {
    const point = value as { x: string; y: string; z: string };
    return [Number(point.x), Number(point.y), Number(point.z)];
  };
  if (key === "bbox") {
    expect(record.type).toBe(params.type);
    expect(coords(record.center)).toEqual(coords(params.center));
    expect(coords(record.size)).toEqual(coords(params.size));
    expect(Number(record.angle)).toBeCloseTo(Number(params.angle), 6);
    expect(record.entity_id).toBe(params.entity_id);
  } else if (key === "vector") {
    const vertices = params.vertices as { type: string; coords: unknown[] };
    expect(record.type).toBe(vertices.type);
    assertCoordinates(
      (record.vertices as unknown[]).flatMap(coords),
      vertices.coords.flatMap(coords),
    );
  } else {
    const points = (params.points as unknown[]).flatMap(coords);
    expect(points.length).toBeGreaterThan(0);
    assertCoordinates(record.points as number[], points);
  }
  expect(new Date(record.timestamp as string).getTime()).toBe(
    new Date(params.timestamp as string).getTime(),
  );
}

async function editGeometry(
  page: Page,
  inspector: Locator,
  key: string,
  id: string,
) {
  if (key === "bbox") {
    const input = inputControl(inspector, "Center");
    if (!(await input.isVisible()))
      await clickElement(exactButton(inspector, "Geometry"));
    await fillNumberInput(
      input,
      String(Number(await input.inputValue()) + 0.5),
    );
  } else {
    await setCameraMode(page, "2D");
    await centerCameraOnPoint(page, () =>
      projectLabelPoint(page, { layer: "vector", id, index: 1 }),
    );
    const tools = editorPanel(page, "Tools");
    for (const [name, enabled] of [
      ["Vertex", true],
      ["Vertices", false],
    ] as const) {
      const button = exactButton(tools, name);
      if ((await isButtonSelected(button)) !== enabled)
        await clickElement(button);
      await expect.poll(() => isButtonSelected(button)).toBe(enabled);
    }
    const target = { layer: "vector", mode: "vertex", index: 1 };
    await expect
      .poll(() =>
        page.evaluate(
          (target) =>
            window.__STA_E2E_PROBE__?.projectTransformHandle(target) ?? null,
          target,
        ),
      )
      .not.toBeNull();
    await uncoverScenePoint(page, await projectTransformHandle(page, target));
    const point = await projectTransformHandle(page, target);
    await dragFromProjectedTarget(page, point, {
      x: point.x + 30,
      y: point.y + 20,
    });
  }
}

async function deleteAndCheck(
  page: Page,
  id: string,
  key: string,
  frameId: number,
  collection: string,
) {
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  await page.keyboard.press("Delete");
  if (key === "vector") {
    const fixture = await loadEditorFixture(page);
    const nextFrame =
      fixture.frames[
        fixture.frames.findIndex((frame) => frame.id === frameId) + 1
      ];
    const project = editorPanel(page, "Project");
    await clickElement(exactButton(project, "Scene"));
    await fillNumberInput(inputControl(project, "Stride"), "1");
    await framePathRow(page, nextFrame.id).click();
    await expectCurrentFrame(page, nextFrame.id);
    await framePathRow(page, frameId).click();
    await expectCurrentFrame(page, frameId);
    await selectActiveLayer(page, "Label Data", "Vector");
    const picker = editorPanel(page, "Vector Objects")
      .locator('input[role="combobox"]')
      .first();
    await uncoverTarget(page, picker);
    await picker.fill(id);
    await expect(
      page.locator(`[role="option"][data-label-id="${id}"]`),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await clickElement(exactButton(project, "Task"));
  }
  await save(page);
  const records = await reloadRecords(page, key, frameId, collection);
  expect(records.map((record) => record.id)).not.toContain(id);
}

test.describe("label save persistence", () => {
  test.describe.configure({ retries: 0 });

  for (const kind of [
    {
      name: "bounding box",
      layer: "Bounding Box",
      inspector: "Bounding Box",
      key: "bbox",
      collection: "boxes",
      seed: SEED_IDS.transformBox,
      op: "box-create",
      classField: "perceived_class_id",
    },
    {
      name: "vector",
      layer: "Vector",
      inspector: "Vector Objects",
      key: "vector",
      collection: "vectors",
      seed: SEED_IDS.polyline,
      op: "vector-create",
      classField: "gt_class_id",
    },
  ]) {
    test(`a pasted ${kind.name} retains its geometry and class through save, edit, and deletion`, async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const fixture = await loadEditorFixture(page);
      const frame = fixture.frames[2];
      await openEditor(page, frame);
      await expectCurrentFrame(page, frame.id);
      await selectActiveLayer(page, "Label Data", kind.layer);
      const inspector = editorPanel(page, kind.inspector);
      await selectLabel(page, inspector, kind.seed);
      const originalClass = await (await classControl(inspector)).inputValue();
      await chooseClass(inspector);
      const tools = editorPanel(page, "Tools");
      await clickElement(exactButton(tools, "Copy"));
      await clickElement(exactButton(tools, "Paste"));
      await waitForEditorRenderSettled(page);
      await expect(await classControl(inspector)).toHaveValue(CLASS_NAME);
      const item = created(await save(page), kind.op);
      let records = await reloadRecords(
        page,
        kind.key,
        frame.id,
        kind.collection,
      );
      const record = records.find((record) => record.id === item.id);
      expect(record).toBeDefined();
      expect(record![kind.classField]).not.toBeNull();
      assertGeometry(kind.key, record!, item.params);
      await selectActiveLayer(page, "Label Data", kind.layer);
      await selectLabel(page, inspector, item.id);
      await expect(await classControl(inspector)).toHaveValue(CLASS_NAME);
      if (kind.key === "bbox") {
        const centerInput = inputControl(inspector, "Center");
        if (!(await centerInput.isVisible()))
          await clickElement(exactButton(inspector, "Geometry"));
        const originalCenter = (record!.center as { x: string }).x;
        await centerInput.fill("1000000");
        await centerInput.press("Enter");
        await expect(
          editorPanel(page, "Project").locator(".labelset-history .selected"),
        ).toContainText("Transform Box");
        await page.evaluate(() =>
          (document.activeElement as HTMLElement | null)?.blur(),
        );
        await page.keyboard.press("Control+z");
        await expect(
          editorPanel(page, "Project").locator(".labelset-history .selected"),
        ).toContainText("Open Editor");
        await selectLabel(page, inspector, item.id);
        await expect
          .poll(async () => Number(await centerInput.inputValue()))
          .toBe(Number(originalCenter));
      }
      await selectLabel(page, inspector, kind.seed);
      await (
        await classControl(inspector)
      ).selectOption(originalClass, { force: true });
      await selectLabel(page, inspector, item.id);
      const control = await classControl(inspector);
      const alternate = await control
        .locator("option")
        .evaluateAll(
          (options, current) =>
            (options as HTMLOptionElement[]).find(
              (option) =>
                option.value !== current && !option.text.startsWith("("),
            )?.value,
          CLASS_NAME,
        );
      expect(alternate).toBeTruthy();
      await control.selectOption(alternate!, { force: true });
      await editGeometry(page, inspector, kind.key, item.id);
      const updateBatch = await save(page);
      const geometryUpdate = updateBatch.instructions
        .filter(
          (instruction) =>
            instruction.op_name ===
            (kind.key === "bbox" ? "box-transform" : "vector-edit"),
        )
        .at(-1);
      expect(geometryUpdate).toBeDefined();
      records = await reloadRecords(page, kind.key, frame.id, kind.collection);
      const edited = records.find((record) => record.id === item.id)!;
      expect(edited[kind.classField]).not.toBe(record![kind.classField]);
      assertGeometry(kind.key, edited, {
        ...item.params,
        ...geometryUpdate!.op_params,
      });
      expect(kind.key === "bbox" ? edited.center : edited.vertices).not.toEqual(
        kind.key === "bbox" ? record!.center : record!.vertices,
      );
      await selectActiveLayer(page, "Label Data", kind.layer);
      await selectLabel(page, inspector, item.id);
      await expect(await classControl(inspector)).toHaveValue(alternate!);
      await deleteAndCheck(page, item.id, kind.key, frame.id, kind.collection);
    });
  }

  test("a new segmentation selection retains its points, class, and instance through creation and class edits", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const fixture = await loadEditorFixture(page);
    const frame = fixture.frames[2];
    const loaded = page.waitForResponse((response) =>
      isEditorDataResponseForFrame(
        response,
        "/editor/label/data/bulk",
        "segmentation",
        frame.id,
      ),
    );
    await openEditor(page, frame);
    await expectCurrentFrame(page, frame.id);
    const payloads = (await (await loaded).json()) as {
      selections: LabelRecord[];
    }[];
    const seed = payloads
      .flatMap((payload) => payload.selections)
      .find((record) => record.id === SEED_IDS.selection)!;
    const points = seed.points as number[];
    const center = { x: points[0], y: points[1], z: points[2] };
    await setCameraMode(page, "2D");
    await centerCameraOnPoint(page, () => projectWorldPoint(page, center));
    const row = await selectActiveLayer(page, "Label Data", "Segmentation");
    const inspector = editorPanel(page, "Selection Points");
    await chooseClass(inspector);
    await clickElement(exactButton(row, "D"));
    const rectangle = editorPanel(page, "Tools").getByRole("radio", {
      name: /^box$/i,
    });
    await expect(rectangle).toBeEnabled();
    await rectangle.evaluate((element: HTMLInputElement) => element.click());
    const startPoint = { x: center.x - 3, y: center.y - 3, z: center.z };
    const endPoint = { x: center.x + 3, y: center.y + 3, z: center.z };
    await uncoverScenePoint(page, await projectWorldPoint(page, startPoint));
    await uncoverScenePoint(page, await projectWorldPoint(page, endPoint));
    await dragFromProjectedTarget(
      page,
      await projectWorldPoint(page, startPoint),
      await projectWorldPoint(page, endPoint),
    );
    await expect(
      editorPanel(page, "Project").locator(".labelset-history .selected"),
    ).toContainText("Create a Selection");
    const batch = await save(page);
    const item = created(batch, "selection-create");
    const instance = created(batch, "instance-create");
    let records = await reloadRecords(
      page,
      "segmentation",
      frame.id,
      "selections",
    );
    const record = records.find((record) => record.id === item.id)!;
    expect(record.perceived_class_id).not.toBeNull();
    expect(record.entity_id).toBe(instance.id);
    assertGeometry("segmentation", record, item.params);
    await selectActiveLayer(page, "Label Data", "Segmentation");
    await selectLabel(page, inspector, item.id);
    const control = await classControl(inspector);
    await expect(control).toHaveValue(CLASS_NAME);
    const alternate = await control
      .locator("option")
      .evaluateAll(
        (options) =>
          (options as HTMLOptionElement[]).find(
            (option) =>
              option.value !== "E2E Box with Default Size" &&
              !option.text.startsWith("("),
          )?.value,
      );
    expect(alternate).toBeTruthy();
    await control.selectOption(alternate!, { force: true });
    const updateBatch = await save(page);
    const replacementInstance = created(updateBatch, "instance-create");
    records = await reloadRecords(page, "segmentation", frame.id, "selections");
    const edited = records.find((record) => record.id === item.id)!;
    expect(edited.perceived_class_id).not.toBe(record.perceived_class_id);
    expect(edited.entity_id).toBe(replacementInstance.id);
    expect(edited.perceived_class_id).toBe(
      replacementInstance.params.gt_class_id,
    );
    assertGeometry("segmentation", edited, item.params);
    await selectActiveLayer(page, "Label Data", "Segmentation");
    await selectLabel(page, inspector, item.id);
    await expect(await classControl(inspector)).toHaveValue(alternate!);
  });

  for (const kind of [
    {
      name: "track",
      layer: "Bounding Box",
      inspector: "Object Track",
      key: "bbox",
      collection: "tracks",
    },
    {
      name: "instance",
      layer: "Segmentation",
      inspector: "Object Instance",
      key: "segmentation",
      collection: "instances",
    },
  ]) {
    test(`a new ${kind.name} retains its class after saving and reloading`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const fixture = await loadEditorFixture(page);
      const frame = fixture.frames[2];
      await openEditor(page, frame);
      await expectCurrentFrame(page, frame.id);
      await selectActiveLayer(page, "Label Data", kind.layer);
      const inspector = editorPanel(page, kind.inspector);
      await chooseClass(inspector);
      await clickElement(
        inspector.locator(
          `button[title="Add ${kind.name === "track" ? "Track" : "Instance"}"]`,
        ),
      );
      const item = created(await save(page), `${kind.name}-create`);
      const records = await reloadRecords(
        page,
        kind.key,
        frame.id,
        kind.collection,
      );
      const record = records.find((record) => record.id === item.id);
      expect(record).toMatchObject({
        gt_class_id: item.params.gt_class_id,
        is_black: item.params.is_black,
      });
      await selectActiveLayer(page, "Label Data", kind.layer);
      await selectLabel(page, inspector, item.id);
      await expect(await classControl(inspector)).toHaveValue(CLASS_NAME);
    });
  }

  test("a relation retains class and endpoint edits through save, reload, and deletion", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const fixture = await loadEditorFixture(page);
    const frame = fixture.frames[2];
    await openEditor(page, frame);
    await expectCurrentFrame(page, frame.id);
    await setCameraMode(page, "2D");
    await selectActiveLayer(page, "Label Data", "Relations");
    const inspector = page.getByTestId("relation-inspector");
    const relationClass = inspector
      .locator(".tp-lblv")
      .filter({ has: page.getByText("Relation class", { exact: true }) })
      .locator("select");
    await relationClass.selectOption({ label: "supports" });
    await clickElement(
      inspector.getByRole("button", { name: "D", exact: true }),
    );
    for (const endpoint of [
      { layer: "bbox", id: SEED_IDS.transformBox },
      { layer: "vector", id: SEED_IDS.polyline, index: 1 },
    ]) {
      await uncoverScenePoint(page, await projectLabelPoint(page, endpoint));
      const point = await projectLabelPoint(page, endpoint);
      await page.mouse.click(point.x, point.y);
    }
    const record = inspector.locator("[data-relation-id]").first();
    await record.locator("select").selectOption({ label: "behind" });
    const targetFolder = inspector
      .locator(".tp-fldv")
      .filter({
        has: page.getByRole("button", { name: /^Replace (source|target)$/ }),
      })
      .nth(1);
    const typePicker = targetFolder.locator('input[role="combobox"]').first();
    await uncoverTarget(page, typePicker);
    await typePicker.fill("selection");
    await page.getByRole("option", { name: "selection", exact: true }).click();
    const targetPicker = targetFolder.locator('input[role="combobox"]').last();
    await uncoverTarget(page, targetPicker);
    await targetPicker.fill(SEED_IDS.selection);
    await page
      .getByRole("option")
      .filter({ hasText: SEED_IDS.selection })
      .click();
    const batch = await save(page);
    const item = created(batch, "relation-create");
    const lastUpdate = batch.instructions
      .filter((instruction) => instruction.op_name === "relation-update")
      .at(-1)!;
    let records = await reloadRecords(page, "relation", frame.id, "relations");
    expect(records.find((record) => record.id === item.id)).toMatchObject({
      source: { type: "box", id: SEED_IDS.transformBox },
      target: { type: "selection", id: SEED_IDS.selection },
      relation_class_id: lastUpdate.op_params.relation_class_id,
    });
    await selectActiveLayer(page, "Label Data", "Relations");
    await selectRelation(page, inspector, item.id);
    const classPicker = inspector.locator(
      `[data-relation-id="${item.id}"] select`,
    );
    await expect(classPicker.locator("option:checked")).toHaveText("behind");
    await classPicker.selectOption({ label: "supports" });
    const updateBatch = await save(page);
    const update = updateBatch.instructions.find(
      (instruction) => instruction.op_name === "relation-update",
    )!;
    records = await reloadRecords(page, "relation", frame.id, "relations");
    expect(records.find((record) => record.id === item.id)).toMatchObject({
      source: { type: "box", id: SEED_IDS.transformBox },
      target: { type: "selection", id: SEED_IDS.selection },
      relation_class_id: update.op_params.relation_class_id,
    });
    await selectActiveLayer(page, "Label Data", "Relations");
    await selectRelation(page, inspector, item.id);
    await expect(
      inspector.locator(
        `[data-relation-id="${item.id}"] select option:checked`,
      ),
    ).toHaveText("supports");
    await deleteAndCheck(page, item.id, "relation", frame.id, "relations");
  });
});
