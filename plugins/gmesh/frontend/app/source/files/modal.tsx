import { useEffect, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Col, Form, Modal, Row } from "react-bootstrap";
import { useFetcher, useLocation, useRevalidator } from "react-router";

import { VectorInputFields, type VectorField } from "sta/app/components";
import {
  DecimalCoord,
  DecimalCoord3,
  DecimalSize,
  DecimalSize3,
} from "sta/app/models";
import { formatFixedDecimal } from "sta/app/plugins";
import type { FileContextDialogProps } from "sta/app/plugins";
import type { SourceGroupPublic as SourceGroup } from "sta/client";

import { IMPORT_GROUND_MESH_ACTION } from "./action";

export {
  IMPORT_GROUND_MESH_ACTION,
  importGroundMeshFiles,
  listGroundMeshRegistrations,
} from "./action";

interface GroundMeshRegistration {
  group_id: number;
  uri: unknown;
}

interface GroundMeshRegistrationFormState {
  group_id: string;
  min_timestamp: string;
  max_timestamp: string;
  translate_x: string;
  translate_y: string;
  translate_z: string;
  rotate_x: string;
  rotate_y: string;
  rotate_z: string;
  scale_x: string;
  scale_y: string;
  scale_z: string;
}

interface GroundMeshRegistrationLoaderData {
  dataset?: GroundMeshRegistration[];
  sourceGroups?: SourceGroup[];
  loaderError?: string;
}

interface GroundMeshRegistrationActionData {
  success?: string;
  error?: string;
}

const GROUND_MESH_METADATA_ROUTE = "/source/data/gmesh";

const EMPTY_FORM: GroundMeshRegistrationFormState = {
  group_id: "",
  min_timestamp: "",
  max_timestamp: "",
  translate_x: formatFixedDecimal("0", DecimalCoord.places),
  translate_y: formatFixedDecimal("0", DecimalCoord.places),
  translate_z: formatFixedDecimal("0", DecimalCoord.places),
  rotate_x: formatFixedDecimal("0", DecimalCoord.places),
  rotate_y: formatFixedDecimal("0", DecimalCoord.places),
  rotate_z: formatFixedDecimal("0", DecimalCoord.places),
  scale_x: formatFixedDecimal("1", DecimalSize.places),
  scale_y: formatFixedDecimal("1", DecimalSize.places),
  scale_z: formatFixedDecimal("1", DecimalSize.places),
};

const TRANSLATE_FIELDS: VectorField<keyof GroundMeshRegistrationFormState>[] = [
  { key: "translate_x", label: "Translate X", axis: "X" },
  { key: "translate_y", label: "Translate Y", axis: "Y" },
  { key: "translate_z", label: "Translate Z", axis: "Z" },
];

const ROTATE_FIELDS: VectorField<keyof GroundMeshRegistrationFormState>[] = [
  { key: "rotate_x", label: "Rotate X", axis: "X" },
  { key: "rotate_y", label: "Rotate Y", axis: "Y" },
  { key: "rotate_z", label: "Rotate Z", axis: "Z" },
];

const SCALE_FIELDS: VectorField<keyof GroundMeshRegistrationFormState>[] = [
  { key: "scale_x", label: "Scale X", axis: "X" },
  { key: "scale_y", label: "Scale Y", axis: "Y" },
  { key: "scale_z", label: "Scale Z", axis: "Z" },
];

export function GroundMeshMetadataModal({
  paths,
  show,
  onHide,
}: FileContextDialogProps) {
  const loaderFetcher = useFetcher<GroundMeshRegistrationLoaderData>();
  const submitFetcher = useFetcher<GroundMeshRegistrationActionData>();
  const location = useLocation();
  const revalidator = useRevalidator();

  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] =
    useState<GroundMeshRegistrationFormState>(EMPTY_FORM);
  const [closeOnSubmitComplete, setCloseOnSubmitComplete] = useState(false);
  const hasLoadedForCurrentOpen = useRef(false);

  useEffect(() => {
    if (!show) {
      hasLoadedForCurrentOpen.current = false;
      return;
    }

    if (hasLoadedForCurrentOpen.current) {
      return;
    }

    hasLoadedForCurrentOpen.current = true;
    void loaderFetcher.load(GROUND_MESH_METADATA_ROUTE);
  }, [loaderFetcher, show]);

  useEffect(() => {
    if (!show) {
      setError(null);
      setFormData(EMPTY_FORM);
      setCloseOnSubmitComplete(false);
      return;
    }

    if (loaderFetcher.data?.loaderError) {
      setError(loaderFetcher.data.loaderError);
    }
  }, [loaderFetcher.data, show]);

  useEffect(() => {
    const data = submitFetcher.data;
    if (submitFetcher.state !== "idle") {
      return;
    }

    if (closeOnSubmitComplete && !data) {
      setCloseOnSubmitComplete(false);
      setError(null);
      setFormData(EMPTY_FORM);
      void revalidator.revalidate();
      onHide();
      return;
    }

    if (!data) {
      return;
    }

    if (data.error) {
      setCloseOnSubmitComplete(false);
      setError(data.error);
      return;
    }

    if (data.success) {
      setCloseOnSubmitComplete(false);
      setError(null);
      setFormData(EMPTY_FORM);
      void revalidator.revalidate();
      onHide();
    }
  }, [
    closeOnSubmitComplete,
    onHide,
    revalidator,
    submitFetcher.data,
    submitFetcher.state,
  ]);

  function updateFormField<K extends keyof GroundMeshRegistrationFormState>(
    field: K,
    value: string,
  ) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const selectedGroupId = Number.parseInt(formData.group_id, 10);
    const selectedPathSet = new Set(
      paths.map((path) => path.trim()).filter((path) => path !== ""),
    );
    const duplicateSourceGroupIds = new Set(
      (loaderFetcher.data?.dataset ?? [])
        .filter(
          (metadata) =>
            typeof metadata.uri === "string" &&
            selectedPathSet.has(metadata.uri.trim()),
        )
        .map((metadata) => metadata.group_id),
    );

    if (formData.group_id.trim() === "") {
      event.preventDefault();
      setCloseOnSubmitComplete(false);
      setError("Source group is required.");
      return;
    }

    if (Number.isNaN(selectedGroupId)) {
      event.preventDefault();
      setCloseOnSubmitComplete(false);
      setError("Selected source group is invalid.");
      return;
    }

    if (duplicateSourceGroupIds.has(selectedGroupId)) {
      event.preventDefault();
      setCloseOnSubmitComplete(false);
      setError(
        paths.length === 1
          ? "This ground mesh is already assigned to the selected source group."
          : "At least one selected ground mesh is already assigned to the selected source group.",
      );
      return;
    }

    setError(null);
    setCloseOnSubmitComplete(true);
  }

  const sourceGroups = loaderFetcher.data?.sourceGroups ?? [];
  const selectedPathSet = new Set(
    paths.map((path) => path.trim()).filter((path) => path !== ""),
  );
  const duplicateSourceGroupIds = new Set(
    (loaderFetcher.data?.dataset ?? [])
      .filter(
        (metadata) =>
          typeof metadata.uri === "string" &&
          selectedPathSet.has(metadata.uri.trim()),
      )
      .map((metadata) => metadata.group_id),
  );
  const hasSourceGroups = sourceGroups.length > 0;
  const hasAvailableSourceGroups = sourceGroups.some(
    (group) => !duplicateSourceGroupIds.has(group.id),
  );
  const isBusy =
    loaderFetcher.state !== "idle" || submitFetcher.state !== "idle";

  return (
    <Modal show={show} onHide={onHide} size="xl">
      <Modal.Header closeButton>
        <Modal.Title>
          {paths.length === 1
            ? "Create Ground Mesh Metadata"
            : `Create Ground Mesh Metadata (${paths.length} files)`}
        </Modal.Title>
      </Modal.Header>
      <submitFetcher.Form
        method="post"
        action={`${location.pathname}${location.search}`}
        onSubmit={handleSubmit}
      >
        <Modal.Body>
          {error && (
            <Alert variant="danger" onClose={() => setError(null)} dismissible>
              {error}
            </Alert>
          )}

          <input
            type="hidden"
            name="_action"
            value={IMPORT_GROUND_MESH_ACTION}
          />
          {paths.map((path) => (
            <input key={path} type="hidden" name="path" value={path} />
          ))}

          <Form.Group className="mb-3">
            <Form.Label>Selected Files</Form.Label>
            <Form.Control
              as="textarea"
              rows={Math.min(8, Math.max(2, paths.length))}
              disabled={true}
              value={paths.join("\n")}
            />
            <Form.Text className="text-muted">
              The fields below will be applied to each selected file when
              creating ground mesh metadata.
            </Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>
              Source Group
              <span className="text-danger ms-1">*</span>
            </Form.Label>
            <Form.Select
              name="group_id"
              value={formData.group_id}
              required={true}
              disabled={isBusy || !hasSourceGroups}
              onChange={(event) =>
                updateFormField("group_id", event.target.value)
              }
            >
              <option value="">
                {hasAvailableSourceGroups
                  ? "Select a source group"
                  : hasSourceGroups
                    ? "All source groups are already assigned to the selected files"
                    : "No source groups are available"}
              </option>
              {sourceGroups.map((group) => (
                <option
                  key={group.id}
                  value={String(group.id)}
                  disabled={duplicateSourceGroupIds.has(group.id)}
                >
                  {duplicateSourceGroupIds.has(group.id)
                    ? `${String(group.name)} (already assigned to selected ${paths.length === 1 ? "file" : "files"})`
                    : String(group.name)}
                </option>
              ))}
            </Form.Select>
            {!hasAvailableSourceGroups && (
              <Form.Text className="text-muted">
                {hasSourceGroups
                  ? "Choose a different source group, or edit the existing ground mesh metadata assignment first."
                  : "Create a source group before registering ground mesh metadata."}
              </Form.Text>
            )}
          </Form.Group>

          <fieldset className="border rounded p-3 mb-3">
            <legend className="float-none w-auto px-2 fs-6 mb-2">
              Timestamp Range
            </legend>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Min. Timestamp</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    step={1}
                    name="min_timestamp"
                    value={formData.min_timestamp}
                    readOnly={isBusy}
                    onChange={(event) =>
                      updateFormField("min_timestamp", event.target.value)
                    }
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>Max. Timestamp</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    step={1}
                    name="max_timestamp"
                    value={formData.max_timestamp}
                    readOnly={isBusy}
                    onChange={(event) =>
                      updateFormField("max_timestamp", event.target.value)
                    }
                  />
                </Form.Group>
              </Col>
            </Row>
          </fieldset>

          <fieldset className="border rounded p-3 mb-3">
            <legend className="float-none w-auto px-2 fs-6 mb-2">
              Transform
            </legend>
            <VectorInputFields
              label="Translation"
              fields={TRANSLATE_FIELDS}
              formData={formData}
              disabled={isBusy}
              helperText={DecimalCoord3.helperText}
              onChange={(field, value) => updateFormField(field, value)}
            />

            <VectorInputFields
              label="Rotation"
              fields={ROTATE_FIELDS}
              formData={formData}
              disabled={isBusy}
              helperText={DecimalCoord3.helperText}
              onChange={(field, value) => updateFormField(field, value)}
            />

            <VectorInputFields
              label="Scale"
              fields={SCALE_FIELDS}
              formData={formData}
              disabled={isBusy}
              helperText={DecimalSize3.helperText}
              className="mb-0"
              onChange={(field, value) => updateFormField(field, value)}
            />
          </fieldset>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={isBusy || !hasAvailableSourceGroups}
          >
            {submitFetcher.state !== "idle"
              ? "Creating..."
              : paths.length === 1
                ? "Create Ground Mesh Metadata"
                : `Create ${paths.length} Ground Mesh Metadata Entries`}
          </Button>
        </Modal.Footer>
      </submitFetcher.Form>
    </Modal>
  );
}
