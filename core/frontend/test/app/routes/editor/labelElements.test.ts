import { expect, it, vi } from "vitest";
import { LabelElementHighlights } from "../../../../app/routes/editor/labelElements";
import { Placeholder } from "../../../../app/routes/editor/labelset/Placeholder";

it("shares highlights by owner, resolves IDs, and notifies only on request changes", () => {
  const changed = vi.fn();
  const highlights = new LabelElementHighlights("box", changed);
  const first = {};
  const second = {};
  const id = new Placeholder<string>();
  const endpoint = { type: "box", id };
  highlights.set(first, [endpoint, { type: "vector", id: "other" }]);
  expect(highlights.has(id)).toBe(true);
  expect(highlights.has("other")).toBe(false);
  highlights.set(first, [endpoint]);
  expect(changed).toHaveBeenCalledTimes(1);
  id.put("saved");
  expect(highlights.has("saved")).toBe(true);
  highlights.set(second, [{ type: "box", id: "saved" }]);
  highlights.set(first, []);
  expect(highlights.has("saved")).toBe(true);
  highlights.set(second, []);
  expect(highlights.has("saved")).toBe(false);
  const count = changed.mock.calls.length;
  highlights.set(second, []);
  expect(changed).toHaveBeenCalledTimes(count);
});

it("tracks explicit preview colors and repaints when only the color changes", () => {
  const changed = vi.fn();
  const highlights = new LabelElementHighlights("box", changed);
  const owner = {};
  const elements = [{ type: "box", id: "source" }];
  const yellow = { r: 1, g: 1, b: 0 };
  highlights.set(owner, elements, yellow);
  expect(highlights.color("source")).toEqual(yellow);
  highlights.set(owner, elements, { ...yellow });
  expect(changed).toHaveBeenCalledTimes(1);
  highlights.set(owner, elements);
  expect(highlights.has("source")).toBe(true);
  expect(highlights.color("source")).toBeNull();
  expect(changed).toHaveBeenCalledTimes(2);
  highlights.set(owner, []);
  expect(highlights.has("source")).toBe(false);
});

it("isolates endpoints by owner and restores visibility without changing local preferences", async () => {
  const { LabelElementIsolation } =
    await import("../../../../app/routes/editor/labelElements");
  const changed = vi.fn();
  const filter = new LabelElementIsolation("box", changed);
  const owner = {};
  const other = {};
  const id = new Placeholder<string>();
  expect(filter.visibility("unrelated")).toBeNull();
  filter.set(owner, [
    { type: "box", id },
    { type: "vector", id: "vector" },
  ]);
  expect(filter.visibility(id)).toBe(true);
  expect(filter.visibility("unrelated")).toBe(false);
  filter.set(owner, [{ type: "box", id }]);
  expect(changed).toHaveBeenCalledTimes(1);
  id.put("saved");
  expect(filter.visibility("saved")).toBe(true);
  filter.set(other, []);
  expect(filter.visibility(id)).toBe(false);
  filter.set(other, null);
  expect(filter.visibility(id)).toBe(true);
  filter.set(owner, null);
  expect(filter.visibility("unrelated")).toBeNull();
  expect(filter.active).toBe(false);
  const count = changed.mock.calls.length;
  filter.set(owner, null);
  expect(changed).toHaveBeenCalledTimes(count);
});

it("retains skipped-operation status through dependency effects without applying them", async () => {
  const { withLocalOperationEffects } =
    await import("../../../../app/routes/editor/labelElements");
  let skipped = false;
  const apply = vi.fn();
  const undo = vi.fn();
  const operation = withLocalOperationEffects(
    {
      displayName: "Delete label",
      opName: "label-delete",
      opParams: {},
      opResult: null,
      get isNoop() {
        return skipped;
      },
      applyLocal() {
        skipped = true;
      },
      undoLocal() {},
    },
    [{ apply, undo }],
  );
  expect(operation.isNoop).toBe(false);
  operation.applyLocal();
  expect(operation.isNoop).toBe(true);
  operation.undoLocal();
  expect(apply).not.toHaveBeenCalled();
  expect(undo).not.toHaveBeenCalled();
});
