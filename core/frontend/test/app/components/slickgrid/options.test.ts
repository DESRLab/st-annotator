/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";

import { treeSelectableConfig } from "../../../../app/components/slickgrid/options";

function makeConfig(canMoveRows?: () => boolean) {
  return treeSelectableConfig<{ id: number; parent_id: number | null }>({
    commandItems: [],
    multiSelect: true,
    treeColumnId: "name",
    treeParentPropName: "parent_id",
    canHaveChildren: () => true,
    canMoveRows,
  });
}

function makeBeforeMoveArgs() {
  const event = { stopPropagation: vi.fn() } as unknown as MouseEvent;
  const args = { grid: {}, rows: [0], insertBefore: 1 } as any;
  return { event, args };
}

describe("treeSelectableConfig", () => {
  it("blocks row moves when canMoveRows returns false", () => {
    const options = makeConfig(() => false);
    const onBeforeMoveRows = options.rowMoveManager!.onBeforeMoveRows!;
    const { event, args } = makeBeforeMoveArgs();

    expect(onBeforeMoveRows(event, args)).toBe(false);
    expect(
      (event as unknown as { stopPropagation: ReturnType<typeof vi.fn> })
        .stopPropagation,
    ).toHaveBeenCalled();
  });

  it("allows row moves when canMoveRows returns true", () => {
    const options = makeConfig(() => true);
    const onBeforeMoveRows = options.rowMoveManager!.onBeforeMoveRows!;
    const { event, args } = makeBeforeMoveArgs();

    expect(onBeforeMoveRows(event, args)).toBe(true);
    expect(
      (event as unknown as { stopPropagation: ReturnType<typeof vi.fn> })
        .stopPropagation,
    ).not.toHaveBeenCalled();
  });

  it("allows row moves when canMoveRows is omitted", () => {
    const options = makeConfig();
    const onBeforeMoveRows = options.rowMoveManager!.onBeforeMoveRows!;
    const { event, args } = makeBeforeMoveArgs();

    expect(onBeforeMoveRows(event, args)).toBe(true);
    expect(
      (event as unknown as { stopPropagation: ReturnType<typeof vi.fn> })
        .stopPropagation,
    ).not.toHaveBeenCalled();
  });

  it("evaluates canMoveRows on every drag attempt", () => {
    let isReadonly = true;
    const options = makeConfig(() => !isReadonly);
    const onBeforeMoveRows = options.rowMoveManager!.onBeforeMoveRows!;

    const readonlyAttempt = makeBeforeMoveArgs();
    expect(onBeforeMoveRows(readonlyAttempt.event, readonlyAttempt.args)).toBe(
      false,
    );

    isReadonly = false;
    const writableAttempt = makeBeforeMoveArgs();
    expect(onBeforeMoveRows(writableAttempt.event, writableAttempt.args)).toBe(
      true,
    );
  });
});
