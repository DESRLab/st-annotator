import { default as React, useMemo } from "react";

import { useEditorIntents, VirtualList } from "sta/app/editor";

import type { UUID } from "../data";
import type {
  BBoxEntity,
  BBoxPluginIntents,
  BBoxTrackEntity,
} from "../layer/BBoxSlice";
import { useBBoxSelector } from "../layer/BBoxSlice.react.ts";

export interface BoxItem {
  id: UUID;
  text: string;
  selected: boolean;
}

export interface TrackItem {
  id: UUID | null;
  text: string;
  selected: boolean;
  items: readonly BoxItem[];
}

export type BBoxLabelsTreeItems = readonly TrackItem[];

export interface BBoxLabelsTreeViewProps {
  disabled?: boolean;
  items: BBoxLabelsTreeItems;
  onSelectBoxId: (id: UUID | null) => void;
  onSelectTrackId: (id: UUID | null) => void;
}

/**
 * Groups the slice entities into the tree's track items, with the orphan
 * boxes under the trailing `(No track)` entry (as the index iteration did).
 * Entity texts come from the slice DTOs, which reuse the same relational
 * projection the selection panes show.
 */
export function createBBoxLabelsTreeItems(
  tracks: readonly BBoxTrackEntity[],
  boxes: readonly BBoxEntity[],
  selectedTrackId: UUID | null,
  selectedBoxId: UUID | null,
): BBoxLabelsTreeItems {
  const orphanBoxes = boxes.filter((box) => box.entityId == null);
  return [...tracks, null].map((track) => ({
    id: track?.id ?? null,
    text: track?.text ?? "(No track)",
    selected: track?.id === selectedTrackId,
    items: (track == null
      ? orphanBoxes
      : boxes.filter((box) => box.entityId === track.id)
    ).map((box) => ({
      id: box.id,
      text: box.text,
      selected: box.id === selectedBoxId,
    })),
  }));
}

export function BBoxLabelsTreeView({
  disabled = false,
  items,
  onSelectBoxId,
  onSelectTrackId,
}: BBoxLabelsTreeViewProps): React.JSX.Element {
  const rows = useMemo(
    () =>
      items.flatMap((track, trackIndex) => [
        {
          id: track.id,
          kind: "track" as const,
          selected: track.selected,
          text: track.text,
          trackIndex,
        },
        ...track.items.map((box) => ({
          ...box,
          kind: "box" as const,
          trackIndex,
        })),
      ]),
    [items],
  );
  return (
    <div
      className="bbox-tree bbox-tree-list"
      role="tree"
      aria-disabled={disabled}
    >
      <div className="bbox-tree-root">(All Labels)</div>
      <VirtualList
        ariaLabel="Bounding box labels"
        className="bbox-tree-tracks"
        items={rows}
        renderItem={(row) => (
          <button
            aria-level={row.kind === "track" ? 1 : 2}
            aria-selected={row.selected}
            className={`bbox-tree-item bbox-tree-${row.kind}-button`}
            data-label-id={row.id ?? ""}
            data-label-kind={row.kind}
            data-track-index={row.trackIndex}
            disabled={disabled}
            onClick={() =>
              row.kind === "track"
                ? onSelectTrackId(row.selected ? null : row.id)
                : onSelectBoxId(row.selected ? null : row.id)
            }
            role="treeitem"
            style={{
              boxSizing: "border-box",
              paddingLeft: row.kind === "track" ? 4 : 20,
              width: "100%",
            }}
            type="button"
          >
            {row.text}
          </button>
        )}
        role="group"
      />
    </div>
  );
}

/**
 * Connects the React tree to the editor state: reads the entity lists and
 * inspector selection/disabled flags from the bbox slice, writes selection
 * through the bbox intents. Stale selections (labels deleted by a load) are
 * cleared by the inspector coordinators themselves, as before.
 */
export function BBoxLabelsTreeHost(): React.JSX.Element {
  const boxes = useBBoxSelector((slice) => slice.boxes);
  const tracks = useBBoxSelector((slice) => slice.tracks);
  const selectedBoxId = useBBoxSelector((slice) => slice.ui.selectedBoxId);
  const selectedTrackId = useBBoxSelector((slice) => slice.ui.selectedTrackId);
  const disabled = useBBoxSelector(
    (slice) => slice.ui.boxInspectorDisabled || slice.ui.trackInspectorDisabled,
  );
  const intents = useEditorIntents<BBoxPluginIntents>();

  const items = useMemo(
    () =>
      createBBoxLabelsTreeItems(tracks, boxes, selectedTrackId, selectedBoxId),
    [tracks, boxes, selectedBoxId, selectedTrackId],
  );

  return (
    <BBoxLabelsTreeView
      disabled={disabled}
      items={items}
      onSelectBoxId={(id): void => intents.bbox.selectBox(id)}
      onSelectTrackId={(id): void => intents.bbox.selectTrack(id)}
    />
  );
}
