import { ArrowHelper, Vector3 } from "three";
import { expect, it, vi } from "vitest";
import { RelationVisual } from "../../../app/editor/RelationVisual";

it("draws one line with opposite arrowheads for a bidirectional label", () => {
  const visual = new RelationVisual(
    new Vector3(),
    new Vector3(10, 0, 0),
    0xff0000,
    "",
    2,
    2,
    true,
  );
  try {
    const arrows = visual.objects.children.filter(
      (item) => item instanceof ArrowHelper,
    );
    expect(arrows).toHaveLength(2);
    expect(arrows[0].position).toEqual(new Vector3(10, 0, 0));
    expect(arrows[1].position).toEqual(new Vector3());
    expect(arrows[0].cone.scale).toEqual(arrows[1].cone.scale);
    expect(
      new Vector3(0, 1, 0).applyQuaternion(arrows[0].quaternion).x,
    ).toBeCloseTo(-1);
    expect(
      new Vector3(0, 1, 0).applyQuaternion(arrows[1].quaternion).x,
    ).toBeCloseTo(1);
  } finally {
    visual.dispose();
  }
});

it("scales the arrowhead with line thickness and defaults to 2 pixels", () => {
  const source = new Vector3();
  const target = new Vector3(10, 0, 0);
  const thin = new RelationVisual(source, target, 0xff0000, "");
  const thick = new RelationVisual(source, target, 0xff0000, "", 6);
  try {
    expect(thin.line.material.linewidth).toBe(2);
    expect(thick.line.material.linewidth).toBe(6);
    const thinArrow = thin.objects.children.find(
      (item) => item instanceof ArrowHelper,
    )!;
    const thickArrow = thick.objects.children.find(
      (item) => item instanceof ArrowHelper,
    )!;
    expect(thickArrow.cone.scale.y).toBeCloseTo(thinArrow.cone.scale.y * 3);
    expect(thickArrow.cone.scale.x).toBeCloseTo(thinArrow.cone.scale.x * 3);
    expect(thickArrow.cone.scale.z).toBeCloseTo(thinArrow.cone.scale.z * 3);
    expect(thickArrow.cone.position.y).toBe(thinArrow.cone.position.y);
  } finally {
    thin.dispose();
    thick.dispose();
  }
});

it("keeps the arrowhead unchanged when highlighting widens the line", () => {
  const source = new Vector3();
  const target = new Vector3(10, 0, 0);
  const normal = new RelationVisual(source, target, 0xff0000, "", 2, 2);
  const highlighted = new RelationVisual(source, target, 0xff0000, "", 3.2, 2);
  try {
    const normalArrow = normal.objects.children.find(
      (item) => item instanceof ArrowHelper,
    )!;
    const highlightedArrow = highlighted.objects.children.find(
      (item) => item instanceof ArrowHelper,
    )!;
    expect(highlighted.line.material.linewidth).toBe(3.2);
    expect(highlightedArrow.cone.scale).toEqual(normalArrow.cone.scale);
    expect(highlightedArrow.cone.position).toEqual(normalArrow.cone.position);
  } finally {
    normal.dispose();
    highlighted.dispose();
  }
});

it("draws tooltip names in their class colors with neutral direction punctuation", () => {
  const draws: { text: string; color: string; x: number; width: number }[] = [];
  const context = {
    fillStyle: "",
    fillRect: vi.fn(),
    measureText: (text: string) => ({ width: text.length * 20 }),
    fillText(text: string, x: number, _y: number, width: number) {
      draws.push({ text, color: this.fillStyle, x, width });
    },
  };
  const canvas = vi
    .spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const tooltip = [
    { text: "(", color: 0xffffff },
    { text: "in front of", color: 0xff0000 },
    { text: " / ", color: 0xffffff },
    { text: "beside", color: 0x00ff00 },
    { text: ") / (", color: 0xffffff },
    { text: "behind", color: 0x0000ff },
    { text: ")", color: 0xffffff },
  ];
  const visual = new RelationVisual(
    new Vector3(),
    new Vector3(10, 0, 0),
    0xffff00,
    tooltip.map((part) => part.text).join(""),
    2,
    2,
    true,
    tooltip,
  );
  try {
    expect(draws.map((part) => part.text).join("")).toBe(
      "(in front of / beside) / (behind)",
    );
    expect(draws.map(({ text, color }) => ({ text, color }))).toEqual([
      { text: "(", color: "#ffffff" },
      { text: "in front of", color: "#ff0000" },
      { text: " / ", color: "#ffffff" },
      { text: "beside", color: "#00ff00" },
      { text: ") / (", color: "#ffffff" },
      { text: "behind", color: "#0000ff" },
      { text: ")", color: "#ffffff" },
    ]);
    expect(draws[0].x).toBe(6);
    expect(draws.at(-1)!.x + draws.at(-1)!.width).toBeCloseTo(506);
    for (let i = 1; i < draws.length; i++) {
      expect(draws[i].x).toBeCloseTo(draws[i - 1].x + draws[i - 1].width);
    }
    const hidden = new RelationVisual(
      new Vector3(),
      new Vector3(10, 0, 0),
      0xffff00,
      "",
      2,
      2,
      true,
      tooltip,
    );
    hidden.dispose();
    expect(draws).toHaveLength(tooltip.length);
  } finally {
    visual.dispose();
    canvas.mockRestore();
  }
});
