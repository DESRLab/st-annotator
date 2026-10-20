import { expect, test } from "@playwright/test";

import {
  isEditorDataResponse,
  loadEditorFixture,
  openEditor,
  SEED_IDS,
} from "./editor-helpers";

test("loads ordered, populated frames in a time-path bulk response", async ({
  page,
}) => {
  test.setTimeout(180_000);

  const fixture = await loadEditorFixture(page);
  const target = fixture.frames[2];
  const responsePromise = page.waitForResponse((response) => {
    if (!isEditorDataResponse(response, "/editor/label/data/bulk", "bbox"))
      return false;
    const requested = new URL(response.url()).searchParams.getAll("frame_ids");
    return requested.length > 1;
  });

  await openEditor(page, target);
  const response = await responsePromise;
  const requested = new URL(response.url()).searchParams.getAll("frame_ids");
  const payload = (await response.json()) as {
    frame_id: number;
    branch_id: number;
    boxes: { id: string; entity_id: string | null }[];
    tracks: { id: string }[];
  }[];

  expect(response.ok()).toBe(true);
  expect(payload.map((frame) => String(frame.frame_id))).toEqual(requested);
  for (const frame of payload) {
    expect(frame.branch_id).toBe(target.label_branch_id);
    for (const box of frame.boxes) {
      if (box.entity_id !== null) {
        expect(frame.tracks.map((track) => track.id)).toContain(box.entity_id);
      }
    }
  }
  // The current frame loads separately; the batch prefetches its neighbours.
  // Verify populated envelopes and the known labels of any seeded frames in it.
  expect(payload.flatMap((frame) => frame.boxes)).not.toHaveLength(0);
  for (const [frameId, boxId] of [
    [fixture.frames[1].id, SEED_IDS.earlierBox],
    [target.id, SEED_IDS.transformBox],
    [fixture.frames[3].id, SEED_IDS.laterBox],
  ] as const) {
    if (requested.includes(String(frameId))) {
      const frame = payload.find((item) => item.frame_id === frameId)!;
      expect(frame.boxes.map((box) => box.id)).toContain(boxId);
    }
  }
});
