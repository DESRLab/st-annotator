import { default as React, useMemo } from "react";

import { useEditorIntents, VirtualList } from "sta/app/editor";

import type { UUID } from "../data";
import type { VectorEntity, VectorPluginIntents } from "../layer/VectorSlice";
import { useVectorSelector } from "../layer/VectorSlice.react.ts";

export interface VectorItem {
  id: UUID;
  text: string;
  selected: boolean;
}

export type VectorLabelsTreeItems = readonly VectorItem[];

export interface VectorLabelsTreeViewProps {
  disabled?: boolean;
  items: VectorLabelsTreeItems;
  onSelectVectorId: (id: UUID | null) => void;
}

/**
 * Maps the slice entities into the tree's items; entity texts come from
 * the slice DTOs, which reuse the same relational projection the selection
 * panes show.
 */
export function createVectorLabelsTreeItems(
  vectors: readonly VectorEntity[],
  selectedVectorId: UUID | null,
): VectorLabelsTreeItems {
  return vectors.map((vector) => ({
    id: vector.id,
    text: vector.text,
    selected: vector.id === selectedVectorId,
  }));
}

export function VectorLabelsTreeView({
  disabled = false,
  items,
  onSelectVectorId,
}: VectorLabelsTreeViewProps): React.JSX.Element {
  return (
    <div
      className="vector-tree vector-tree-list"
      role="tree"
      aria-disabled={disabled}
    >
      <div className="vector-tree-root">(All Labels)</div>
      <VirtualList
        ariaLabel="Vector labels"
        className="vector-tree-vectors"
        items={items}
        renderItem={(vectorItem) => (
          <button
            aria-level={1}
            aria-selected={vectorItem.selected}
            className="vector-tree-item vector-tree-vector-button"
            data-label-id={vectorItem.id}
            data-label-kind="vector"
            disabled={disabled}
            onClick={() =>
              onSelectVectorId(vectorItem.selected ? null : vectorItem.id)
            }
            role="treeitem"
            style={{ boxSizing: "border-box", width: "100%" }}
            type="button"
          >
            {vectorItem.text}
          </button>
        )}
        role="group"
      />
    </div>
  );
}

/**
 * Connects the React tree to the editor state: reads the entity list and
 * inspector selection/disabled flag from the vector slice, writes selection
 * through the vector intents. Stale selections (labels deleted by a load)
 * are cleared by the inspector coordinator itself, as before.
 */
export function VectorLabelsTreeHost(): React.JSX.Element {
  const vectors = useVectorSelector((slice) => slice.vectors);
  const selectedVectorId = useVectorSelector(
    (slice) => slice.ui.selectedVectorId,
  );
  const disabled = useVectorSelector(
    (slice) => slice.ui.vectorInspectorDisabled,
  );
  const intents = useEditorIntents<VectorPluginIntents>();

  const items = useMemo(
    () => createVectorLabelsTreeItems(vectors, selectedVectorId),
    [vectors, selectedVectorId],
  );

  return (
    <VectorLabelsTreeView
      disabled={disabled}
      items={items}
      onSelectVectorId={(id): void => intents.vector.selectVector(id)}
    />
  );
}
