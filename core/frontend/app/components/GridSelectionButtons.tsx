import { Button, ButtonGroup } from "react-bootstrap";

export interface GridSelectionButtonsProps {
  /** Rows the user has selected right now. */
  selectedCount: number;
  /** Rows the current page can offer, after filtering. Required with `onSelectCurrentPage`. */
  currentPageCount?: number;
  /** Every entry the list holds across all pages, from the `.../ids` endpoint. */
  allSelectableCount: number;
  /**
   * Omit it on a grid that loads its whole list in one request: there is no page to
   * select separately from the list, and two buttons doing the same thing invite a
   * guess about which one reaches further.
   */
  onSelectCurrentPage?: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  /** Holds the whole group still, for a grid whose list is being revalidated. */
  disabled?: boolean;
}

/**
 * The selection half of a multi-selectable grid's toolbar.
 *
 * Bulk work belongs to the row context menu, not here: this group only widens or clears
 * the selection, so a page cannot offer the same batch operation from two places that
 * then disagree about which rows it covers. `Select All` counts every entry of the list,
 * which is why a paginated grid must be able to reach an `.../ids` endpoint before it
 * offers multi-select at all.
 */
export function GridSelectionButtons({
  selectedCount,
  currentPageCount,
  allSelectableCount,
  onSelectCurrentPage,
  onSelectAll,
  onDeselectAll,
  disabled = false,
}: GridSelectionButtonsProps) {
  return (
    <ButtonGroup className="justify-content-end">
      {selectedCount === 0 ? (
        <>
          {onSelectCurrentPage && (
            <Button
              variant="outline-secondary"
              onClick={onSelectCurrentPage}
              disabled={disabled || !currentPageCount}
            >
              Select Current Page
            </Button>
          )}
          <Button
            variant="outline-secondary"
            onClick={onSelectAll}
            disabled={disabled || allSelectableCount === 0}
          >
            Select All ({allSelectableCount})
          </Button>
        </>
      ) : (
        <Button variant="secondary" onClick={onDeselectAll}>
          Deselect All ({selectedCount} selected)
        </Button>
      )}
    </ButtonGroup>
  );
}
