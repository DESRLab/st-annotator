import {
  BatchDeleteMessage,
  DeleteConfirmationTitle,
} from "sta/app/components";
import { Alert, Button, Form, Modal } from "react-bootstrap";
import { Form as RouterForm, useNavigation } from "react-router";

/** Batch edits change common fields and leave class/group membership intact. */
export function BatchDialog({
  ids,
  deleting,
  definitions,
  error,
  onClose,
}: {
  ids: readonly number[] | null;
  deleting: boolean;
  definitions: boolean;
  error?: string;
  onClose: () => void;
}) {
  const navigation = useNavigation();
  return (
    <Modal show={ids != null} onHide={onClose}>
      <Modal.Header closeButton>
        {deleting ? (
          <DeleteConfirmationTitle count={ids?.length ?? 0} />
        ) : (
          <Modal.Title>Batch Edit Details</Modal.Title>
        )}
      </Modal.Header>
      <RouterForm method="post">
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <input
            type="hidden"
            name="_action"
            value={deleting ? "batch_delete" : "batch_update"}
          />
          <input type="hidden" name="ids" value={JSON.stringify(ids ?? [])} />
          {deleting ? (
            <>
              <BatchDeleteMessage
                count={ids?.length ?? 0}
                itemName={
                  definitions
                    ? "relation class definition"
                    : "relation class selection"
                }
                pluralItemName={
                  definitions
                    ? "relation class definitions"
                    : "relation class selections"
                }
              />
              <p className="text-muted small">This action cannot be undone.</p>
            </>
          ) : (
            <>
              <p>{ids?.length ?? 0} selected records</p>
              <Form.Label htmlFor="batch-relation-description">
                Description
              </Form.Label>
              <Form.Control
                as="textarea"
                id="batch-relation-description"
                name="description"
              />
              {definitions && (
                <>
                  <Form.Label htmlFor="batch-relation-color" className="mt-2">
                    Color (optional)
                  </Form.Label>
                  <Form.Control
                    id="batch-relation-color"
                    name="color"
                    placeholder="#ffffff"
                    pattern="#[0-9a-fA-F]{6}"
                  />
                </>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant={deleting ? "danger" : "primary"}
            disabled={navigation.state !== "idle"}
          >
            {deleting ? "Delete" : "Save"}
          </Button>
        </Modal.Footer>
      </RouterForm>
    </Modal>
  );
}
