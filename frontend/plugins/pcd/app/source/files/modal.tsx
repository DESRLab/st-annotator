import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Col, Form, Modal, Row } from 'react-bootstrap';
import { useFetcher, useLocation, useRevalidator } from 'react-router';

import { VectorInputFields, type VectorField } from '../../../../../app/components/VectorInputFields';
import { DecimalCoord, DecimalCoord3, DecimalSize, DecimalSize3 } from '../../../../../app/models/types';
import type { FileContextDialogProps } from '../../../../../app/plugins/source-files';
import type {
  SourceGroupPublic as SourceGroup,
  StaServicesModelsSourceDataBaseSourceDataSqlModelGetPublicClsLocalsSourceDataPublic2 as PointCloudMetadata,
} from '../../../../../client';

import { IMPORT_POINT_CLOUD_ACTION } from './action';

export {
  IMPORT_POINT_CLOUD_ACTION,
  importPointCloudFiles,
  listPointCloudRegistrations,
} from './action';


type PointCloudRegistrationFormState = {
  group_id: string;
  weather: string;
  min_x: string;
  min_y: string;
  min_z: string;
  max_x: string;
  max_y: string;
  max_z: string;
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
};

type PointCloudRegistrationLoaderData = {
  dataset?: PointCloudMetadata[];
  eligibleSourceGroupIds?: number[];
  sourceGroups?: SourceGroup[];
  loaderError?: string;
};

type PointCloudRegistrationActionData = {
  success?: string;
  error?: string;
};

const POINT_CLOUD_METADATA_ROUTE = '/source/data/pcd';

const EMPTY_FORM: PointCloudRegistrationFormState = {
  group_id: '',
  weather: '',
  min_x: formatFixedDecimal('0', DecimalCoord.places),
  min_y: formatFixedDecimal('0', DecimalCoord.places),
  min_z: formatFixedDecimal('0', DecimalCoord.places),
  max_x: formatFixedDecimal('0', DecimalCoord.places),
  max_y: formatFixedDecimal('0', DecimalCoord.places),
  max_z: formatFixedDecimal('0', DecimalCoord.places),
  min_timestamp: '',
  max_timestamp: '',
  translate_x: formatFixedDecimal('0', DecimalCoord.places),
  translate_y: formatFixedDecimal('0', DecimalCoord.places),
  translate_z: formatFixedDecimal('0', DecimalCoord.places),
  rotate_x: formatFixedDecimal('0', DecimalCoord.places),
  rotate_y: formatFixedDecimal('0', DecimalCoord.places),
  rotate_z: formatFixedDecimal('0', DecimalCoord.places),
  scale_x: formatFixedDecimal('1', DecimalSize.places),
  scale_y: formatFixedDecimal('1', DecimalSize.places),
  scale_z: formatFixedDecimal('1', DecimalSize.places),
};

const MIN_BOUND_FIELDS: VectorField<keyof PointCloudRegistrationFormState>[] = [
  { key: 'min_x', label: 'Min X', axis: 'X' },
  { key: 'min_y', label: 'Min Y', axis: 'Y' },
  { key: 'min_z', label: 'Min Z', axis: 'Z' },
];

const MAX_BOUND_FIELDS: VectorField<keyof PointCloudRegistrationFormState>[] = [
  { key: 'max_x', label: 'Max X', axis: 'X' },
  { key: 'max_y', label: 'Max Y', axis: 'Y' },
  { key: 'max_z', label: 'Max Z', axis: 'Z' },
];

const TRANSLATE_FIELDS: VectorField<keyof PointCloudRegistrationFormState>[] = [
  { key: 'translate_x', label: 'Translate X', axis: 'X' },
  { key: 'translate_y', label: 'Translate Y', axis: 'Y' },
  { key: 'translate_z', label: 'Translate Z', axis: 'Z' },
];

const ROTATE_FIELDS: VectorField<keyof PointCloudRegistrationFormState>[] = [
  { key: 'rotate_x', label: 'Rotate X', axis: 'X' },
  { key: 'rotate_y', label: 'Rotate Y', axis: 'Y' },
  { key: 'rotate_z', label: 'Rotate Z', axis: 'Z' },
];

const SCALE_FIELDS: VectorField<keyof PointCloudRegistrationFormState>[] = [
  { key: 'scale_x', label: 'Scale X', axis: 'X' },
  { key: 'scale_y', label: 'Scale Y', axis: 'Y' },
  { key: 'scale_z', label: 'Scale Z', axis: 'Z' },
];

function formatFixedDecimal(value: string | null | undefined, places: number): string {
  if (value == null || value === '') {
    return '';
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? numericValue.toFixed(places)
    : String(value);
}

export function PointCloudMetadataModal({ paths, show, onHide }: FileContextDialogProps) {
  const loaderFetcher = useFetcher<PointCloudRegistrationLoaderData>();
  const submitFetcher = useFetcher<PointCloudRegistrationActionData>();
  const location = useLocation();
  const revalidator = useRevalidator();

  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<PointCloudRegistrationFormState>(EMPTY_FORM);
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
    loaderFetcher.load(POINT_CLOUD_METADATA_ROUTE);
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
    if (submitFetcher.state !== 'idle') {
      return;
    }

    if (closeOnSubmitComplete && !data) {
      setCloseOnSubmitComplete(false);
      setError(null);
      setFormData(EMPTY_FORM);
      revalidator.revalidate();
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
      revalidator.revalidate();
      onHide();
    }
  }, [closeOnSubmitComplete, onHide, revalidator, submitFetcher.data, submitFetcher.state]);

  function updateFormField<K extends keyof PointCloudRegistrationFormState>(field: K, value: string) {
    setFormData((previous) => ({ ...previous, [field]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const selectedGroupId = Number.parseInt(formData.group_id, 10);
    const eligibleSourceGroupIds = new Set(loaderFetcher.data?.eligibleSourceGroupIds ?? []);
    const selectedPathSet = new Set(paths.map((path) => path.trim()).filter((path) => path !== ''));
    const duplicateSourceGroupIds = new Set(
      (loaderFetcher.data?.dataset ?? [])
        .filter((metadata) => selectedPathSet.has(String(metadata.uri ?? '').trim()))
        .map((metadata) => metadata.group_id)
    );
    if (formData.group_id.trim() === '') {
      event.preventDefault();
      setCloseOnSubmitComplete(false);
      setError('Source group is required.');
      return;
    }

    if (Number.isNaN(selectedGroupId) || !eligibleSourceGroupIds.has(selectedGroupId)) {
      event.preventDefault();
      setCloseOnSubmitComplete(false);
      setError('Selected source group is missing a point cloud source.');
      return;
    }

    if (duplicateSourceGroupIds.has(selectedGroupId)) {
      event.preventDefault();
      setCloseOnSubmitComplete(false);
      setError(
        paths.length === 1
          ? 'This point cloud is already assigned to the selected source group.'
          : 'At least one selected point cloud is already assigned to the selected source group.'
      );
      return;
    }

    if (formData.group_id.trim() !== '') {
      setError(null);
      setCloseOnSubmitComplete(true);
      return;
    }
  }

  const sourceGroups = loaderFetcher.data?.sourceGroups ?? [];
  const eligibleSourceGroupIds = new Set(loaderFetcher.data?.eligibleSourceGroupIds ?? []);
  const selectedPathSet = new Set(paths.map((path) => path.trim()).filter((path) => path !== ''));
  const duplicateSourceGroupIds = new Set(
    (loaderFetcher.data?.dataset ?? [])
      .filter((metadata) => selectedPathSet.has(String(metadata.uri ?? '').trim()))
      .map((metadata) => metadata.group_id)
  );
  const hasEligibleSourceGroups = sourceGroups.some((group) => eligibleSourceGroupIds.has(group.id));
  const hasAvailableSourceGroups = sourceGroups.some(
    (group) => eligibleSourceGroupIds.has(group.id) && !duplicateSourceGroupIds.has(group.id)
  );
  const isBusy = loaderFetcher.state !== 'idle' || submitFetcher.state !== 'idle';

  return (
    <Modal show={show} onHide={onHide} size="xl">
      <Modal.Header closeButton>
        <Modal.Title>
          {paths.length === 1
            ? 'Create Point Cloud Metadata'
            : `Create Point Cloud Metadata (${paths.length} files)`}
        </Modal.Title>
      </Modal.Header>
      <submitFetcher.Form method="post" action={`${location.pathname}${location.search}`} onSubmit={handleSubmit}>
        <Modal.Body>
          {error && (
            <Alert variant="danger" onClose={() => setError(null)} dismissible>
              {error}
            </Alert>
          )}

          <input type="hidden" name="_action" value={IMPORT_POINT_CLOUD_ACTION} />
          {paths.map((path) => (
            <input key={path} type="hidden" name="path" value={path} />
          ))}

          <Form.Group className="mb-3">
            <Form.Label>Selected Files</Form.Label>
            <Form.Control
              as="textarea"
              rows={Math.min(8, Math.max(2, paths.length))}
              disabled={true}
              value={paths.join('\n')}
            />
            <Form.Text className="text-muted">
              The fields below will be applied to each selected file when creating point cloud metadata.
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
              disabled={isBusy || !hasEligibleSourceGroups}
              onChange={(event) => updateFormField('group_id', event.target.value)}
            >
              <option value="">
                {hasAvailableSourceGroups
                  ? 'Select a source group'
                  : hasEligibleSourceGroups
                  ? 'All eligible source groups are already assigned to the selected files'
                  : 'No source group has an assigned point cloud source'}
              </option>
              {sourceGroups.map((group) => (
                <option
                  key={group.id}
                  value={String(group.id)}
                  disabled={!eligibleSourceGroupIds.has(group.id) || duplicateSourceGroupIds.has(group.id)}
                >
                  {!eligibleSourceGroupIds.has(group.id)
                    ? `${String(group.name)} (missing point cloud source)`
                    : duplicateSourceGroupIds.has(group.id)
                    ? `${String(group.name)} (already assigned to selected ${paths.length === 1 ? 'file' : 'files'})`
                    : String(group.name)}
                </option>
              ))}
            </Form.Select>
            {!hasAvailableSourceGroups && (
              <Form.Text className="text-muted">
                {hasEligibleSourceGroups
                  ? 'Choose a different source group, or edit the existing point cloud metadata assignment first.'
                  : 'Assign a point cloud source to a source group before creating point cloud metadata.'}
              </Form.Text>
            )}
          </Form.Group>

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
                  onChange={(event) => updateFormField('min_timestamp', event.target.value)}
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
                  onChange={(event) => updateFormField('max_timestamp', event.target.value)}
                />
              </Form.Group>
            </Col>
          </Row>

          <VectorInputFields
            label="Min. Bounds"
            fields={MIN_BOUND_FIELDS}
            formData={formData}
            readOnly={isBusy}
            helperText={DecimalCoord3.helperText}
            onChange={updateFormField}
          />

          <VectorInputFields
            label="Max. Bounds"
            fields={MAX_BOUND_FIELDS}
            formData={formData}
            readOnly={isBusy}
            helperText={DecimalCoord3.helperText}
            onChange={updateFormField}
          />

          <VectorInputFields
            label="Translation"
            fields={TRANSLATE_FIELDS}
            formData={formData}
            readOnly={isBusy}
            helperText={DecimalCoord3.helperText}
            onChange={updateFormField}
          />

          <VectorInputFields
            label="Rotation"
            fields={ROTATE_FIELDS}
            formData={formData}
            readOnly={isBusy}
            helperText={DecimalCoord3.helperText}
            onChange={updateFormField}
          />

          <VectorInputFields
            label="Scale"
            fields={SCALE_FIELDS}
            formData={formData}
            readOnly={isBusy}
            helperText={DecimalSize3.helperText}
            className="mb-0"
            onChange={updateFormField}
          />

          <Form.Group className="mt-3 mb-0">
            <Form.Label>Weather</Form.Label>
            <Form.Control
              type="text"
              name="weather"
              value={formData.weather}
              readOnly={isBusy}
              onChange={(event) => updateFormField('weather', event.target.value)}
              placeholder="sunny"
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide} disabled={isBusy}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isBusy || !hasAvailableSourceGroups}>
            {submitFetcher.state !== 'idle'
              ? 'Creating...'
              : paths.length === 1
              ? 'Create Point Cloud Metadata'
              : `Create ${paths.length} Point Cloud Metadata Entries`}
          </Button>
        </Modal.Footer>
      </submitFetcher.Form>
    </Modal>
  );
}