import type { ChangeEvent } from "react";
import { useState } from "react";
import { Col, Form, Row, Spinner } from "react-bootstrap";
import {
  Form as RouterForm,
  Link,
  useLocation,
  useNavigate,
  useNavigation,
  useSubmit,
} from "react-router";
import type { Column, GridOption } from "slickgrid-react";

import type {
  LabelGroupPublic as LabelGroup,
  LabelsetBranchPublic as LabelBranch,
} from "../../client";
import { basicConfig } from "../components/slickgrid/options";
import {
  asSlickgridModule,
  type SlickgridModule,
} from "../components/slickgrid/client";

import type { LabelDataPagination } from "../loaders";

export { asSlickgridModule, type SlickgridModule };

/** Navigation that does not promise an exact record or page total. */
export function LabelDataPaginationControls({
  pagination,
}: {
  pagination: LabelDataPagination;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  function pageHref(page: number, pageSize = pagination.pageSize) {
    const query = new URLSearchParams(location.search);
    query.set("page", String(page));
    query.set("pageSize", String(pageSize));
    return `${location.pathname}?${query.toString()}`;
  }
  return (
    <nav
      aria-label="Label data pagination"
      className="d-flex align-items-center gap-3 mt-3"
    >
      {pagination.pageNumber > 1 && (
        <Link to={pageHref(pagination.pageNumber - 1)}>Previous</Link>
      )}
      <span>Page {pagination.pageNumber}</span>
      {pagination.hasNextPage && (
        <Link to={pageHref(pagination.pageNumber + 1)}>Next</Link>
      )}
      <Form.Select
        aria-label="Rows per page"
        className="w-auto"
        value={pagination.pageSize}
        onChange={(event) => {
          void navigate(pageHref(1, Number(event.currentTarget.value)));
        }}
      >
        {pagination.pageSizes.map((size) => (
          <option key={size} value={size}>
            {size} rows
          </option>
        ))}
      </Form.Select>
    </nav>
  );
}

export interface CommitOption {
  hash: string;
  label: string;
}

export { normalizeError } from "../errors";

export function parseOptionalInteger(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
}

export function formatUnknown(value: unknown): string {
  if (value == null || value === "") return "-";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "-";
    }
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (typeof value === "symbol" || typeof value === "function") {
    return value.toString();
  }
  return "-";
}

/** Resolve a stored class reference for data grids and detail forms. */
export function formatClassName(
  id: number | null | undefined,
  classNames: Record<number, string>,
): string {
  return id == null ? "-" : (classNames[id] ?? String(id));
}

export function formatBoolean(value: boolean | null | undefined): string {
  if (value == null) return "-";
  return value ? "Yes" : "No";
}

export function formatJson(value: unknown): string {
  if (value == null || value === "") return "-";
  try {
    return JSON.stringify(value);
  } catch {
    return formatUnknown(value);
  }
}

export function getCommitOptions(branches: LabelBranch[]): CommitOption[] {
  const seen = new Set<string>();
  const options: CommitOption[] = [];

  for (const branch of branches) {
    if (!seen.has(branch.head_hash)) {
      seen.add(branch.head_hash);
      options.push({
        hash: branch.head_hash,
        label: String(branch.name) + " head (" + branch.head_hash + ")",
      });
    }

    if (branch.checkpoint_hash && !seen.has(branch.checkpoint_hash)) {
      seen.add(branch.checkpoint_hash);
      options.push({
        hash: branch.checkpoint_hash,
        label:
          String(branch.name) + " checkpoint (" + branch.checkpoint_hash + ")",
      });
    }
  }

  return options;
}

export function sortLabelGroups(groups: LabelGroup[]): LabelGroup[] {
  return groups
    .slice()
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

/** Class-name options keep filtering aligned with the names displayed in cells. */
export function createLabelClassFilter(
  SG: SlickgridModule,
  classNames: Record<number, string>,
): Column["filter"] {
  return {
    model: SG.Filters.singleSelect,
    options: { filter: true },
    collection: [
      { value: "", label: "" },
      ...Object.entries(classNames).map(([id, name]) => ({
        value: Number(id),
        label: name,
      })),
    ],
  };
}

export function createLabelDataGridOptions(containerId: string): GridOption {
  return {
    ...(basicConfig() as unknown as GridOption),
    autoResize: { container: "#" + containerId },
    createPreHeaderPanel: true,
    enableAutoResize: true,
    showPreHeaderPanel: true,
  };
}

export function LabelDataFilterForm({
  controlIdPrefix,
  groups,
  branches,
  selectedGroupId,
  selectedCommitHash,
  hiddenFields = {},
  onFilterValueChange,
}: {
  controlIdPrefix: string;
  groups: LabelGroup[];
  branches: LabelBranch[];
  selectedGroupId: number | null;
  selectedCommitHash: string;
  hiddenFields?: Record<string, string | number | null | undefined>;
  onFilterValueChange?: (value: {
    groupValue: string;
    commitValue: string;
  }) => void;
}) {
  const commitOptions = getCommitOptions(branches);
  const navigation = useNavigation();
  const submit = useSubmit();
  const [groupValue, setGroupValue] = useState(
    selectedGroupId == null ? "" : String(selectedGroupId),
  );
  const [commitValue, setCommitValue] = useState(selectedCommitHash);
  const pendingGroupEntry = navigation.formData?.get("group_id");
  const pendingGroupValue =
    (typeof pendingGroupEntry === "string" ? pendingGroupEntry : null) ??
    (navigation.location == null
      ? null
      : new URLSearchParams(navigation.location.search).get("group_id"));
  const isLoadingLabelData =
    navigation.state !== "idle" &&
    groupValue !== "" &&
    pendingGroupValue === groupValue;

  function handleGroupChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextGroupValue = event.currentTarget.value;
    setGroupValue(nextGroupValue);
    setCommitValue("");
    onFilterValueChange?.({ groupValue: nextGroupValue, commitValue: "" });
    const form = event.currentTarget.form;
    if (form == null) return;

    const formData = new FormData(form);
    formData.delete("commit_hash");
    void submit(formData, { method: "get" });
  }

  return (
    <RouterForm method="get" className="mb-4">
      {Object.entries(hiddenFields).map(([name, value]) =>
        value == null ? null : (
          <input key={name} type="hidden" name={name} value={String(value)} />
        ),
      )}
      <Row className="g-3 align-items-end">
        <Col md={6}>
          <Form.Group controlId={`${controlIdPrefix}-group-id`}>
            <Form.Label>Label Group</Form.Label>
            <Form.Select
              name="group_id"
              value={groupValue}
              onChange={handleGroupChange}
            >
              {groups.length === 0 && (
                <option value="">(No groups available)</option>
              )}
              {groups.length > 0 && (
                <option value="">(Select a group...)</option>
              )}
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {formatUnknown(group.name)}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
        <Col md={6}>
          <Form.Group controlId={`${controlIdPrefix}-commit-hash`}>
            <Form.Label>Commit</Form.Label>
            <Form.Select
              name="commit_hash"
              value={commitValue}
              disabled={commitOptions.length === 0}
              onChange={(event) => {
                const nextCommitValue = event.currentTarget.value;
                setCommitValue(nextCommitValue);
                onFilterValueChange?.({
                  groupValue,
                  commitValue: nextCommitValue,
                });
                const form = event.currentTarget.form;
                if (form == null) return;

                const formData = new FormData(form);
                if (nextCommitValue === "") {
                  formData.delete("commit_hash");
                }
                void submit(formData, { method: "get" });
              }}
            >
              {commitOptions.length === 0 && (
                <option value="">(No commits available)</option>
              )}
              {commitOptions.length > 0 && (
                <option value="">(Select a commit...)</option>
              )}
              {commitOptions.map((commit) => (
                <option key={commit.hash} value={commit.hash}>
                  {commit.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      </Row>
      {isLoadingLabelData && (
        <div
          className="mt-2 d-flex align-items-center text-muted small"
          role="status"
        >
          <Spinner animation="border" size="sm" className="me-2" />
          Loading data...
        </div>
      )}
    </RouterForm>
  );
}
