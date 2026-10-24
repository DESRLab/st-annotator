import { expect, it } from "vitest";
import { RelationIndex } from "../../../app/editor/RelationIndex";
import { getRelationTooltipParts } from "../../../app/editor/RelationTooltip";

it("counts duplicates by category and direction and preserves each category color", () => {
  const source = { type: "box", id: "source" };
  const target = { type: "vector", id: "target" };
  const index = new RelationIndex(
    [
      { id: "a", source, target, relation_class_id: 1 },
      { id: "b", source, target, relation_class_id: 1 },
      { id: "c", source, target, relation_class_id: 2 },
      { id: "d", source: target, target: source, relation_class_id: 1 },
      { id: "e", source: target, target: source, relation_class_id: 3 },
      { id: "f", source: target, target: source, relation_class_id: 3 },
      { id: "g", source: target, target: source, relation_class_id: 3 },
    ],
    [
      { id: 1, name: "beside", color_rgb: 0xff0000 },
      { id: 2, name: "supports", color_rgb: 0x00ff00 },
      { id: 3, name: "behind", color_rgb: 0x0000ff },
    ],
    [1, 2, 3],
  );
  const parts = getRelationTooltipParts(index.groups()[0], index.classes);
  expect(parts.map((part) => part.text).join("")).toBe(
    "(beside [x2] / supports) / (beside / behind [x3])",
  );
  expect(parts.filter((part) => part.color !== 0xffffff)).toEqual([
    { text: "beside [x2]", color: 0xff0000 },
    { text: "supports", color: 0x00ff00 },
    { text: "beside", color: 0xff0000 },
    { text: "behind [x3]", color: 0x0000ff },
  ]);
});

it("preserves white category colors even when every category is white", () => {
  const source = { type: "box", id: "source" };
  const target = { type: "vector", id: "target" };
  const index = new RelationIndex(
    [
      { id: "first", source, target, relation_class_id: 1 },
      { id: "second", source, target, relation_class_id: 2 },
    ],
    [
      { id: 1, name: "beside", color_rgb: 0xffffff },
      { id: 2, name: "behind", color_rgb: 0xffffff },
    ],
    [1, 2],
  );
  const group = index.groups()[0];
  const parts = getRelationTooltipParts(group, index.classes);
  const colors = parts
    .filter((part) => part.text === "beside" || part.text === "behind")
    .map((part) => part.color);
  expect(colors).toEqual([0xffffff, 0xffffff]);
  expect(
    getRelationTooltipParts(group, new Map([...index.classes].reverse())),
  ).toEqual(parts);
  expect([...index.classes.values()].map((item) => item.color_rgb)).toEqual([
    0xffffff, 0xffffff,
  ]);
  const configured = new Map(index.classes);
  configured.set(1, { id: 1, name: "beside", color_rgb: 0xff0000 });
  expect(
    getRelationTooltipParts(group, configured).filter(
      (part) => part.text === "beside" || part.text === "behind",
    ),
  ).toEqual([
    { text: "beside", color: 0xff0000 },
    { text: "behind", color: 0xffffff },
  ]);
});
