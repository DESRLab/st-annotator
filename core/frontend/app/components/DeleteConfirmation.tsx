import { Modal } from "react-bootstrap";

/** Single-item dialogs retain their title; batch dialogs also show the count. */
export function DeleteConfirmationTitle({ count }: { count?: number }) {
  return (
    <Modal.Title>
      {count == null
        ? "Confirm Delete"
        : `Confirm Delete (${count} ${count === 1 ? "item" : "items"})`}
    </Modal.Title>
  );
}

/** The batch-delete prompt uses the same count as the submitted ID list. */
export function BatchDeleteMessage({
  count,
  itemName,
  pluralItemName,
}: {
  count: number;
  itemName: string;
  pluralItemName: string;
}) {
  return (
    <p>
      Are you sure you want to delete {count} selected{" "}
      {count === 1 ? itemName : pluralItemName}?
    </p>
  );
}
