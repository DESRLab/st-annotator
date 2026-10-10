import { useId, useState } from "react";

export interface SelectMultiplePickerItem {
  id: number;
  label: string;
}

export interface SelectMultiplePickerProps {
  /** All items to pick from. */
  items: SelectMultiplePickerItem[];
  /** The currently assigned item IDs (parent-controlled). */
  value: number[];
  /** Called when the assigned items change. */
  onChange: (assignedIds: number[]) => void;
  disabled?: boolean;
}

/**
 * A dual-list picker component. Shows "Available" and "Assigned" lists with
 * buttons to transfer items between them and reorder within each list.
 *
 * The assigned list is fully controlled via `value`. The available list ordering
 * is internal UI state that automatically resets whenever the set of available
 * items changes (e.g. when the parent opens the form for a different record).
 *
 * `value` is authoritative and may legitimately hold ids that `items` omits: a
 * form seeded from a record carries that record's whole relationship, while
 * `items` lists only what the acting user may read. Such an id is invisible in
 * both panels, so it must still flow through every change, each handler below
 * therefore derives from `value` rather than rebuilding from the rendered
 * `assignedItems`. A parent's payload replaces the relationship outright, so an
 * id dropped here is silently un-assigned in the database.
 */
export function SelectMultiplePicker({
  items,
  value,
  onChange,
  disabled = false,
}: SelectMultiplePickerProps) {
  const availableId = useId();
  const assignedId = useId();
  const itemMap = new Map(items.map((i) => [i.id, i]));

  // Derive the current set of available IDs from value
  const valueSet = new Set(value);
  const currentAvailableIds = items
    .filter((i) => !valueSet.has(i.id))
    .map((i) => i.id);
  const currentAvailableKey = [...currentAvailableIds].sort().join(",");

  // Track available list ordering internally.
  // Reset when the set of available items changes (compare-during-render pattern):
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [availableOrder, setAvailableOrder] =
    useState<number[]>(currentAvailableIds);
  const [availableOrderKey, setAvailableOrderKey] =
    useState(currentAvailableKey);
  if (availableOrderKey !== currentAvailableKey) {
    setAvailableOrderKey(currentAvailableKey);
    setAvailableOrder(currentAvailableIds);
  }

  const [availableSelection, setAvailableSelection] = useState<number[]>([]);
  const [assignedSelection, setAssignedSelection] = useState<number[]>([]);

  const hasAvailableSelection = availableSelection.length > 0;
  const hasSelection =
    availableSelection.length > 0 || assignedSelection.length > 0;

  /**
   * Shifts selected items in `list` by `offset` steps, grouping them together.
   *
   */
  function shiftItems(
    list: number[],
    selectedIds: number[],
    offset: number,
  ): number[] {
    const selectedSet = new Set(selectedIds);
    const selectedItems = list.filter((id) => selectedSet.has(id));
    const unselectedItems = list.filter((id) => !selectedSet.has(id));
    const firstSelectedIdx = list.findIndex((id) => selectedSet.has(id));
    const unselectedBefore = list
      .slice(0, firstSelectedIdx)
      .filter((id) => !selectedSet.has(id)).length;
    const insertIdx = Math.max(
      0,
      Math.min(unselectedItems.length, unselectedBefore + offset),
    );
    const result = [...unselectedItems];
    result.splice(insertIdx, 0, ...selectedItems);
    return result;
  }

  function handleShiftUp() {
    if (hasAvailableSelection) {
      setAvailableOrder((prev) => shiftItems(prev, availableSelection, -1));
    } else {
      onChange(shiftItems(value, assignedSelection, -1));
    }
  }

  function handleShiftDown() {
    if (hasAvailableSelection) {
      setAvailableOrder((prev) => shiftItems(prev, availableSelection, 1));
    } else {
      onChange(shiftItems(value, assignedSelection, 1));
    }
  }

  function handleTransfer() {
    if (hasAvailableSelection) {
      const selSet = new Set(availableSelection);
      setAvailableOrder((prev) => prev.filter((id) => !selSet.has(id)));
      setAvailableSelection([]);
      onChange([...value, ...availableSelection]);
    } else {
      const selSet = new Set(assignedSelection);
      setAvailableOrder((prev) => [...prev, ...assignedSelection]);
      setAssignedSelection([]);
      onChange(value.filter((id) => !selSet.has(id)));
    }
  }

  function handleAvailableChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setAvailableSelection(
      Array.from(e.target.selectedOptions, (opt) => Number(opt.value)),
    );
    setAssignedSelection([]);
  }

  function handleAssignedChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setAssignedSelection(
      Array.from(e.target.selectedOptions, (opt) => Number(opt.value)),
    );
    setAvailableSelection([]);
  }

  const availableItems = availableOrder
    .map((id) => itemMap.get(id))
    .filter((i): i is SelectMultiplePickerItem => i != null);

  const assignedItems = value
    .map((id) => itemMap.get(id))
    .filter((i): i is SelectMultiplePickerItem => i != null);

  return (
    <fieldset
      disabled={disabled}
      style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}
    >
      <div className="multiple-select-container">
        <label
          htmlFor={availableId}
          className="form-label px-1"
          style={{
            gridArea: "header-left",
            justifySelf: "start",
            textDecoration: "underline",
          }}
        >
          Available
        </label>
        <label
          htmlFor={assignedId}
          className="form-label px-1"
          style={{
            gridArea: "header-right",
            justifySelf: "end",
            textDecoration: "underline",
          }}
        >
          Assigned
        </label>
        <select
          id={availableId}
          multiple
          className="form-select"
          style={{ gridArea: "select-left" }}
          value={availableSelection.map(String)}
          onChange={handleAvailableChange}
        >
          {availableItems.map((item) => (
            <option key={item.id} value={String(item.id)}>
              {item.label}
            </option>
          ))}
        </select>
        <div className="btn-group-vertical" style={{ gridArea: "buttons" }}>
          <button
            type="button"
            title="Shift items up"
            className="btn btn-outline-secondary"
            onClick={handleShiftUp}
            disabled={!hasSelection}
          >
            ↑
          </button>
          <button
            type="button"
            title={hasAvailableSelection ? "Assign items" : "Unassign items"}
            className="btn btn-outline-secondary"
            onClick={handleTransfer}
            disabled={!hasSelection}
          >
            {hasAvailableSelection ? "→" : "←"}
          </button>
          <button
            type="button"
            title="Shift items down"
            className="btn btn-outline-secondary"
            onClick={handleShiftDown}
            disabled={!hasSelection}
          >
            ↓
          </button>
        </div>
        <select
          id={assignedId}
          multiple
          className="form-select"
          style={{ gridArea: "select-right" }}
          value={assignedSelection.map(String)}
          onChange={handleAssignedChange}
        >
          {assignedItems.map((item) => (
            <option key={item.id} value={String(item.id)}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
