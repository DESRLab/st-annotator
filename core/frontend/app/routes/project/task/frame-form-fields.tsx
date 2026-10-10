import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { Form } from "react-bootstrap";

import type {
  AccountPublicSummary as Account,
  FramePublicWithParents as Frame,
  LabelsetBranchPublic as LabelBranch,
  SourceGroupPublic as SourceGroup,
  WorkType,
} from "../../../../client";
import { PartialSTBounds } from "sta/common";
import { SubmittedCheckbox } from "../../../components/SubmittedCheckbox";

import {
  FrameModalForm,
  type SourceLookupData,
  type SourceMetadataLoader,
} from "./components";
import { formatDateTime, toDisplayText } from "./frame-domain";

const BRANCH_HELPER_TEXTS = {
  annotate: "Annotators should have at least WRITE access.",
  review: "Reviewers should have at least WRITE_ELEVATED access.",
} as const;

export function formatLabelBranchOption(labelBranch: LabelBranch): string {
  return `${toDisplayText(labelBranch.group.name)} / ${toDisplayText(labelBranch.name)}`;
}

export interface FrameFormState {
  accountId: string;
  sourceGroupId: string;
  labelBranchId: string;
  minX: string;
  minY: string;
  minZ: string;
  maxX: string;
  maxY: string;
  maxZ: string;
  minTimestamp: string;
  maxTimestamp: string;
  isComplete: boolean;
}

export function FrameFields({
  formData,
  setFormData,
  accounts,
  sourceGroups,
  labelBranches,
  workType,
  editingFrame,
  viewOnly,
  completionOnly = false,
}: {
  formData: FrameFormState;
  setFormData: Dispatch<SetStateAction<FrameFormState>>;
  accounts: Account[];
  sourceGroups: SourceGroup[];
  labelBranches: LabelBranch[];
  workType?: WorkType;
  editingFrame: Frame | null;
  viewOnly: boolean;
  completionOnly?: boolean;
}) {
  const detailsDisabled = viewOnly || completionOnly;
  return (
    <>
      <fieldset disabled={detailsDisabled}>
        <Form.Group className="mb-3">
          <Form.Label>
            Account
            {!editingFrame && <span className="text-danger ms-1">*</span>}
          </Form.Label>
          <Form.Select
            name="account_id"
            value={formData.accountId}
            required={!editingFrame && !viewOnly}
            disabled={!!editingFrame}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                accountId: e.target.value,
              }))
            }
          >
            <option value="">(None)</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {toDisplayText(account.username)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            Source Group
            {!editingFrame && <span className="text-danger ms-1">*</span>}
          </Form.Label>
          <Form.Select
            name="source_group_id"
            value={formData.sourceGroupId}
            required={!editingFrame && !viewOnly}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                sourceGroupId: e.target.value,
              }))
            }
          >
            <option value="">(None)</option>
            {sourceGroups.map((sourceGroup) => (
              <option key={sourceGroup.id} value={sourceGroup.id}>
                {toDisplayText(sourceGroup.name)}
              </option>
            ))}
          </Form.Select>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>
            Label Branch
            {!editingFrame && <span className="text-danger ms-1">*</span>}
          </Form.Label>
          <Form.Select
            name="label_branch_id"
            value={formData.labelBranchId}
            required={!editingFrame && !viewOnly}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                labelBranchId: e.target.value,
              }))
            }
          >
            <option value="">(None)</option>
            {labelBranches.map((labelBranch) => (
              <option key={labelBranch.id} value={labelBranch.id}>
                {formatLabelBranchOption(labelBranch)}
              </option>
            ))}
          </Form.Select>
          {workType && (
            <Form.Text className="text-muted">
              {BRANCH_HELPER_TEXTS[workType]}
            </Form.Text>
          )}
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Min. Coords</Form.Label>
          <div className="row g-2">
            <div className="col-md-4">
              <Form.Control
                type="number"
                step="any"
                name="min_x"
                value={formData.minX}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    minX: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-4">
              <Form.Control
                type="number"
                step="any"
                name="min_y"
                value={formData.minY}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    minY: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-4">
              <Form.Control
                type="number"
                step="any"
                name="min_z"
                value={formData.minZ}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    minZ: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Max. Coords</Form.Label>
          <div className="row g-2">
            <div className="col-md-4">
              <Form.Control
                type="number"
                step="any"
                name="max_x"
                value={formData.maxX}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    maxX: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-4">
              <Form.Control
                type="number"
                step="any"
                name="max_y"
                value={formData.maxY}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    maxY: e.target.value,
                  }))
                }
              />
            </div>
            <div className="col-md-4">
              <Form.Control
                type="number"
                step="any"
                name="max_z"
                value={formData.maxZ}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    maxZ: e.target.value,
                  }))
                }
              />
            </div>
          </div>
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Min. Timestamp</Form.Label>
          <Form.Control
            type="datetime-local"
            name="min_timestamp"
            value={formData.minTimestamp}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                minTimestamp: e.target.value,
              }))
            }
          />
        </Form.Group>

        <Form.Group className="mb-3">
          <Form.Label>Max. Timestamp</Form.Label>
          <Form.Control
            type="datetime-local"
            name="max_timestamp"
            value={formData.maxTimestamp}
            onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                maxTimestamp: e.target.value,
              }))
            }
          />
        </Form.Group>

        {editingFrame && (
          <Form.Group>
            <Form.Label>Last Viewed</Form.Label>
            <Form.Control
              value={formatDateTime(editingFrame.last_viewed_at)}
              disabled
            />
          </Form.Group>
        )}
      </fieldset>

      <Form.Group className="mb-3">
        <SubmittedCheckbox
          name="is_complete"
          label="Complete"
          checked={formData.isComplete}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setFormData((prev) => ({
              ...prev,
              isComplete: e.target.checked,
            }))
          }
          disabled={viewOnly}
        />
      </Form.Group>
    </>
  );
}

export function FrameBatchCreateFields({
  formData,
  setFormData,
  createAccountId,
  accounts,
  sourceGroups,
  labelBranches,
  workType,
  isOpen,
  batchStBoundsMulti,
  setBatchStBoundsMulti,
  sourceLookups,
  loadSourceMetadata,
}: {
  formData: FrameFormState;
  setFormData: Dispatch<SetStateAction<FrameFormState>>;
  createAccountId: number | null;
  accounts: Account[];
  sourceGroups: SourceGroup[];
  labelBranches: LabelBranch[];
  workType?: WorkType;
  isOpen: boolean;
  batchStBoundsMulti: readonly PartialSTBounds[];
  setBatchStBoundsMulti: Dispatch<SetStateAction<readonly PartialSTBounds[]>>;
  sourceLookups: readonly SourceLookupData[];
  loadSourceMetadata?: SourceMetadataLoader;
}) {
  const selectedAccount = accounts.find(
    (account) => account.id === createAccountId,
  );

  return (
    <>
      {createAccountId != null && (
        <input
          type="hidden"
          name="account_id"
          value={String(createAccountId)}
        />
      )}

      <Form.Group className="mb-3">
        <Form.Label>
          Account
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <Form.Control
          aria-label="Account"
          value={
            selectedAccount == null
              ? ""
              : toDisplayText(selectedAccount.username)
          }
          disabled
          readOnly
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>
          Label Branch
          <span className="text-danger ms-1">*</span>
        </Form.Label>
        <Form.Select
          name="label_branch_id"
          required
          value={formData.labelBranchId}
          onChange={(e) =>
            setFormData((prev) => ({
              ...prev,
              labelBranchId: e.target.value,
            }))
          }
        >
          <option value="">(None)</option>
          {labelBranches.map((labelBranch) => (
            <option key={labelBranch.id} value={labelBranch.id}>
              {formatLabelBranchOption(labelBranch)}
            </option>
          ))}
        </Form.Select>
        {workType && (
          <Form.Text className="text-muted">
            {BRANCH_HELPER_TEXTS[workType]}
          </Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-3">
        <SubmittedCheckbox
          name="is_complete"
          label="Complete"
          checked={formData.isComplete}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            setFormData((prev) => ({
              ...prev,
              isComplete: e.target.checked,
            }))
          }
        />
      </Form.Group>

      <FrameModalForm
        defaultSTBoundsMulti={batchStBoundsMulti}
        isOpen={isOpen}
        onSTBoundsMultiChange={setBatchStBoundsMulti}
        sourceGroups={sourceGroups.map((sourceGroup) => ({
          id: sourceGroup.id,
          name: toDisplayText(sourceGroup.name),
          description:
            typeof sourceGroup.description === "string"
              ? sourceGroup.description
              : undefined,
        }))}
        sourceLookups={sourceLookups}
        loadSourceMetadata={loadSourceMetadata}
      />
    </>
  );
}
