import { default as React, useMemo } from "react";

import { useEditorIntents, VirtualList } from "sta/app/editor";

import type { UUID } from "../data";
import type {
  SegmentationInstanceEntity,
  SegmentationPluginIntents,
  SegmentationSelectionEntity,
} from "../layer/SegmentationSlice";
import { useSegmentationSelector } from "../layer/SegmentationSlice.react.ts";

interface SelectionItem {
  id: UUID;
  text: string;
  selected: boolean;
}

interface InstanceItem {
  id: UUID;
  text: string;
  selected: boolean;
  items: readonly SelectionItem[];
}

export type SegmentationLabelsTreeItems = readonly InstanceItem[];

interface SegmentationLabelsTreeViewProps {
  disabled?: boolean;
  items: SegmentationLabelsTreeItems;
  onSelectInstanceId: (id: UUID | null) => void;
  onSelectSelectionId: (id: UUID | null) => void;
}

function labelText(kind: string, id: UUID): string {
  return `${kind} ${String(id).slice(0, 8)}`;
}

/**
 * Groups the slice selections under their parent instance (selections
 * without an instance are not listed, as before). The tree shows the
 * truncated ids, not the relational entity texts.
 */
export function createSegmentationLabelsTreeItems(
  instances: readonly SegmentationInstanceEntity[],
  selections: readonly SegmentationSelectionEntity[],
  selectedInstanceId: UUID | null,
  selectedSelectionId: UUID | null,
): SegmentationLabelsTreeItems {
  const selectionsByInstance = new Map<UUID, UUID[]>();
  for (const selection of selections) {
    if (selection.entityId == null) continue;
    const ids = selectionsByInstance.get(selection.entityId) ?? [];
    ids.push(selection.id);
    selectionsByInstance.set(selection.entityId, ids);
  }

  const items = instances.map((instance) => ({
    id: instance.id,
    text: labelText("Instance", instance.id),
    selected: instance.id === selectedInstanceId,
    items: (selectionsByInstance.get(instance.id) ?? []).map((id) => ({
      id,
      text: labelText("Selection", id),
      selected: id === selectedSelectionId,
    })),
  }));
  return items;
}

export function SegmentationLabelsTreeView({
  disabled = false,
  items,
  onSelectInstanceId,
  onSelectSelectionId,
}: SegmentationLabelsTreeViewProps): React.JSX.Element {
  const rows = useMemo(
    () =>
      items.flatMap((instance) => [
        {
          id: instance.id,
          kind: "instance" as const,
          selected: instance.selected,
          text: instance.text,
        },
        ...instance.items.map((selection) => ({
          ...selection,
          kind: "selection" as const,
        })),
      ]),
    [items],
  );
  return (
    <div aria-disabled={disabled} className="segmentation-tree" role="tree">
      <div className="segmentation-tree-root">(All Labels)</div>
      <VirtualList
        ariaLabel="Segmentation labels"
        items={rows}
        renderItem={(row) => (
          <button
            aria-level={row.kind === "instance" ? 1 : 2}
            aria-selected={row.selected}
            data-label-id={row.id}
            data-label-kind={row.kind}
            disabled={disabled}
            onClick={() =>
              row.kind === "instance"
                ? onSelectInstanceId(row.selected ? null : row.id)
                : onSelectSelectionId(row.selected ? null : row.id)
            }
            role="treeitem"
            style={{
              boxSizing: "border-box",
              paddingLeft: row.kind === "instance" ? 4 : 20,
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

function SegmentationLabelsVirtualTreeView({
  disabled,
  instances,
  selections,
  selectedInstanceId,
  selectedSelectionId,
  onSelectInstanceId,
  onSelectSelectionId,
}: {
  disabled: boolean;
  instances: readonly SegmentationInstanceEntity[];
  selections: readonly SegmentationSelectionEntity[];
  selectedInstanceId: UUID | null;
  selectedSelectionId: UUID | null;
  onSelectInstanceId: (id: UUID | null) => void;
  onSelectSelectionId: (id: UUID | null) => void;
}): React.JSX.Element {
  const insertions = useMemo(() => {
    const groups = new Map<number, SegmentationSelectionEntity[]>();
    for (const selection of selections) {
      if (selection.entityId == null) continue;
      const instanceIndex = instances.findIndex(
        (instance) => instance.id === selection.entityId,
      );
      if (instanceIndex < 0) continue;
      const group = groups.get(instanceIndex) ?? [];
      group.push(selection);
      groups.set(instanceIndex, group);
    }
    const byRow = new Map<number, SegmentationSelectionEntity>();
    let inserted = 0;
    for (const [instanceIndex, group] of [...groups].sort(
      ([a], [b]) => a - b,
    )) {
      group.forEach((selection, offset) =>
        byRow.set(instanceIndex + inserted + offset + 1, selection),
      );
      inserted += group.length;
    }
    return byRow;
  }, [instances, selections]);
  const insertionRows = useMemo(
    () => [...insertions.keys()].sort((a, b) => a - b),
    [insertions],
  );
  interface Row {
    id: UUID;
    kind: "instance" | "selection";
    selected: boolean;
    text: string;
  }
  const getRow = (rowIndex: number): Row => {
    const selection = insertions.get(rowIndex);
    if (selection != null)
      return {
        id: selection.id,
        kind: "selection",
        selected: selection.id === selectedSelectionId,
        text: labelText("Selection", selection.id),
      };
    let precedingInsertions = 0;
    for (const insertionRow of insertionRows) {
      if (insertionRow >= rowIndex) break;
      precedingInsertions += 1;
    }
    const instance = instances[rowIndex - precedingInsertions];
    return {
      id: instance.id,
      kind: "instance",
      selected: instance.id === selectedInstanceId,
      text: labelText("Instance", instance.id),
    };
  };

  return (
    <div aria-disabled={disabled} className="segmentation-tree" role="tree">
      <div className="segmentation-tree-root">(All Labels)</div>
      <VirtualList
        ariaLabel="Segmentation labels"
        getItem={getRow}
        itemCount={instances.length + insertions.size}
        renderItem={(row) => (
          <button
            aria-level={row.kind === "instance" ? 1 : 2}
            aria-selected={row.selected}
            data-label-id={row.id}
            data-label-kind={row.kind}
            disabled={disabled}
            onClick={() =>
              row.kind === "instance"
                ? onSelectInstanceId(row.selected ? null : row.id)
                : onSelectSelectionId(row.selected ? null : row.id)
            }
            role="treeitem"
            style={{
              boxSizing: "border-box",
              paddingLeft: row.kind === "instance" ? 4 : 20,
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
 * inspector selection/disabled flags from the segmentation slice, writes
 * selection through the segmentation intents. Stale selections (labels
 * deleted by a load) are cleared by the inspector coordinators themselves,
 * as before.
 */
export function SegmentationLabelsTreeHost(): React.JSX.Element {
  const instances = useSegmentationSelector((slice) => slice.instances);
  const selections = useSegmentationSelector((slice) => slice.selections);
  const selectedInstanceId = useSegmentationSelector(
    (slice) => slice.ui.selectedInstanceId,
  );
  const selectedSelectionId = useSegmentationSelector(
    (slice) => slice.ui.selectedSelectionId,
  );
  const disabled = useSegmentationSelector(
    (slice) =>
      slice.ui.instanceInspectorDisabled || slice.ui.selectionInspectorDisabled,
  );
  const intents = useEditorIntents<SegmentationPluginIntents>();

  return (
    <SegmentationLabelsVirtualTreeView
      disabled={disabled}
      instances={instances}
      onSelectInstanceId={(id): void => intents.segmentation.selectInstance(id)}
      onSelectSelectionId={(id): void =>
        intents.segmentation.selectSelection(id)
      }
      selectedInstanceId={selectedInstanceId}
      selectedSelectionId={selectedSelectionId}
      selections={selections}
    />
  );
}
