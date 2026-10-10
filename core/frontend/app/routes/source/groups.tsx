import type { MenuCommandItem } from "@slickgrid-universal/common";
import _ from "lodash";
import { useState, useEffect, useRef } from "react";
import { Button, Modal, Form, Alert } from "react-bootstrap";
import { Form as RouterForm } from "react-router";
import type {
  Column,
  GridOption,
  SlickgridReactInstance,
} from "slickgrid-react";

import {
  type UserRoles as User,
  type SourceGroupPublic as SourceGroup,
  createGroupSourceGroupsPost,
  deleteGroupSourceGroupsIdDelete,
  listGroupsSourceGroupsGet,
  updateGroupSourceGroupsIdPatch,
} from "../../../client";
import { createSlickgridClientLoader } from "../../components/slickgrid/client";
import { selectableConfig } from "../../components/slickgrid/options";
import {
  syncRoutePaginationGrid,
  useRoutePaginationGridOptions,
} from "../../components/slickgrid/pagination";
import {
  applyNumericFilterToQuery,
  applySortersToQuery,
  applyTextFilterToQuery,
  getGridStateRequest,
  loadAccessTokenSession,
  loadAuthenticatedSession,
  listGridPage,
  type GridPagination,
  type GridQuery,
  type GridStateRequest,
} from "../../loaders";
import { normalizeError } from "../../errors";
import { Name } from "../../models/types";
import { createPageContent } from "../../templates";

import type { Route } from "./+types/groups";

interface SourceSpecLike {
  id: number;
  name: string;
  group: SourceGroup;
  last_edit_at?: string | null;
}

interface SourceSpecUpdateLike {
  group_id?: number | null;
  issued_at?: string | null;
}

interface SourceSpecAPI {
  list: (token: string) => Promise<{ data: SourceSpecLike[]; error: unknown }>;
  update: (
    token: string,
    id: number,
    data: SourceSpecUpdateLike,
  ) => Promise<{ data: undefined; error: unknown }>;
}

// Populated by plugins at runtime
export const SPEC_APIS: Record<string, SourceSpecAPI> = {};

export const DEFAULT_SPEC_IDS: Record<string, number | null> =
  Object.fromEntries(
    Object.keys(SPEC_APIS).map((k) => [`${k}_id`, null] as const),
  );

type SourceGroupFormData = {
  name: string;
  description: string;
} & Record<string, string | number | null>;

const SOURCE_GROUP_SORTABLE_COLUMNS = new Set(["id", "name", "description"]);

export function buildSourceGroupsQuery({
  filters,
  sorters,
}: GridStateRequest): GridQuery {
  const query: GridQuery = {};

  for (const filter of filters) {
    switch (filter.columnId) {
      case "id":
        applyNumericFilterToQuery(query, filter, "id");
        break;
      case "name":
        applyTextFilterToQuery(query, filter, "name");
        break;
      case "description":
        applyTextFilterToQuery(query, filter, "description");
        break;
    }
  }

  applySortersToQuery(query, sorters, SOURCE_GROUP_SORTABLE_COLUMNS);

  return query;
}

export async function loader({ request }: Route.LoaderArgs) {
  const authenticated = await loadAuthenticatedSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token, user } = authenticated;

  const sourceGroupsRes = await listGridPage(request, (pagination) =>
    listGroupsSourceGroupsGet({
      auth: token.access_token,
      query: {
        ...buildSourceGroupsQuery(getGridStateRequest(request)),
        ...pagination,
      },
    }),
  );
  const dataset = sourceGroupsRes.data ?? [];

  const specsRes = Object.fromEntries(
    await Promise.all(
      Object.entries(SPEC_APIS).map(async ([k, specApi]) => {
        const res = await specApi.list(token.access_token);
        return [k, res] as const;
      }),
    ),
  );
  const specsById = Object.fromEntries(
    Object.entries(specsRes).map(
      ([k, res]) => [k, new Map(res.data?.map((s) => [s.id, s]))] as const,
    ),
  );

  const loaderError =
    sourceGroupsRes.error ?? Object.values(specsRes).find((res) => res.error);

  return {
    user,
    dataset,
    pagination: sourceGroupsRes.pagination,
    specsById,
    loaderError,
  };
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

export async function action({ request }: Route.ActionArgs) {
  const authenticated = await loadAccessTokenSession(request);
  if (authenticated instanceof Response) return authenticated;
  const { token } = authenticated;

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "create" || actionType === "update") {
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const specsIdStr = Object.fromEntries(
      Object.keys(SPEC_APIS).map(
        (k) => [k, formData.get(`${k}_id`) as string] as const,
      ),
    );
    const specsId = Object.fromEntries(
      Object.entries(specsIdStr).map(
        ([k, idStr]) => [k, idStr ? Number.parseInt(idStr) : null] as const,
      ),
    );

    // Validation
    if (!name) {
      return { error: "Group name is required" };
    }
    if (!Name.regex.test(name)) {
      return { error: `Group name: ${Name.helperText}` };
    }

    // Submit
    if (actionType === "update") {
      const sourceGroupId = Number.parseInt(formData.get("id") as string);

      const res = await updateGroupSourceGroupsIdPatch({
        auth: token.access_token,
        path: { id: sourceGroupId },
        body: {
          issued_at: formData.get("issued_at") as string,
          name,
          description,
        },
      });
      if (res.error) {
        return { error: res.error };
      }

      await Promise.all(
        Object.entries(specsId).map(async ([k, newSpecId]) => {
          const specApi = SPEC_APIS[k];
          const specRes = await specApi.list(token.access_token);
          if (specRes.error)
            throw specRes.error instanceof Error
              ? specRes.error
              : new Error(normalizeError(specRes.error));

          const prevSpec = specRes.data?.find(
            (s) => s.group.id == sourceGroupId,
          );
          const prevSpecId = prevSpec?.id;
          if (prevSpecId === newSpecId) return;

          if (prevSpecId != null) {
            const prevRes = await specApi.update(
              token.access_token,
              prevSpecId,
              { group_id: null, issued_at: prevSpec?.last_edit_at },
            );
            if (prevRes.error)
              throw prevRes.error instanceof Error
                ? prevRes.error
                : new Error(normalizeError(prevRes.error));
          }

          if (newSpecId != null) {
            const newSpec = specRes.data?.find((s) => s.id === newSpecId);
            const newRes = await specApi.update(token.access_token, newSpecId, {
              group_id: sourceGroupId,
              issued_at: newSpec?.last_edit_at,
            });
            if (newRes.error)
              throw newRes.error instanceof Error
                ? newRes.error
                : new Error(normalizeError(newRes.error));
          }
        }),
      );

      return { success: "Group updated successfully." };
    } else {
      // actionType == 'create'
      const res = await createGroupSourceGroupsPost({
        auth: token.access_token,
        body: { name, description },
      });
      if (!res.data || res.error) {
        return { error: res.error };
      }

      await Promise.all(
        Object.entries(specsId).map(async ([k, newSpecId]) => {
          if (newSpecId != null) {
            const specApi = SPEC_APIS[k];
            const specRes = await specApi.list(token.access_token);
            if (specRes.error)
              throw specRes.error instanceof Error
                ? specRes.error
                : new Error(normalizeError(specRes.error));
            const newSpec = specRes.data?.find((s) => s.id === newSpecId);
            const newRes = await specApi.update(token.access_token, newSpecId, {
              group_id: res.data.id,
              issued_at: newSpec?.last_edit_at,
            });
            if (newRes.error)
              throw newRes.error instanceof Error
                ? newRes.error
                : new Error(normalizeError(newRes.error));
          }
        }),
      );

      return { success: "Group created successfully." };
    }
  } else if (actionType === "delete") {
    const sourceGroupId = Number.parseInt(formData.get("id") as string, 10);

    // Submit
    const res = await deleteGroupSourceGroupsIdDelete({
      auth: token.access_token,
      path: { id: sourceGroupId },
    });
    if (res.error) {
      return { error: res.error };
    }

    return { success: "Group deleted successfully." };
  }

  return { error: "Unknown action" };
}

function SourceGroupTable({
  SG,
  user,
  dataset,
  pagination,
  specsById,
  actionData,
}: {
  SG: typeof import("slickgrid-react");
  user: User;
  dataset: SourceGroup[];
  pagination: GridPagination;
  specsById: Record<string, Map<number, SourceSpecLike>>;
  actionData?: Route.ComponentProps["actionData"];
}) {
  const [showModal, setShowModal] = useState(false);
  const [editingSourceGroup, setEditingSourceGroup] =
    useState<SourceGroup | null>(null);
  const [formData, setFormData] = useState<SourceGroupFormData>({
    name: "",
    description: "",
    ...DEFAULT_SPEC_IDS,
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sourceGroupToDelete, setSourceGroupToDelete] =
    useState<SourceGroup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);
  const paginationGridOptions = useRoutePaginationGridOptions(
    pagination,
    dataset,
  );

  // Sync grid when dataset prop changes (after revalidation returns fresh data).
  useEffect(() => {
    syncRoutePaginationGrid(reactGridRef.current, pagination);
  }, [dataset, pagination]);

  // Handle action results
  useEffect(() => {
    if (actionData) {
      if (actionData.error) {
        setError(normalizeError(actionData.error));
      } else if (actionData.success) {
        setShowModal(false);
        setShowDeleteModal(false);
      }
    }
  }, [actionData]);

  const handleCreate = () => {
    setEditingSourceGroup(null);
    setFormData({
      name: "",
      description: "",
      ...DEFAULT_SPEC_IDS,
    });
    setError(null);
    setShowModal(true);
  };

  const handleEdit = (sourceGroup: SourceGroup) => {
    setEditingSourceGroup(sourceGroup);
    setFormData({
      name: String(sourceGroup.name),
      description: sourceGroup.description ?? "",
      ...Object.fromEntries(
        Object.entries(specsById).map(
          ([k, specById]) =>
            [
              k,
              Array.from(specById.values()).find(
                (s) => s.group.id === sourceGroup.id,
              )?.id ?? null,
            ] as const,
        ),
      ),
    });
    setError(null);
    setShowModal(true);
  };

  const handleDelete = (sourceGroup: SourceGroup) => {
    setSourceGroupToDelete(sourceGroup);
    setError(null);
    setShowDeleteModal(true);
  };

  const { SlickgridReact } = SG;
  const isReadonly = !user.roles.includes("data-manager");

  function defineGrid() {
    const cols: Column[] = [
      {
        id: "id",
        name: "ID",
        field: "id",
        type: "integer",
        filterable: true,
        sortable: true,
      },
      {
        id: "name",
        name: "Name",
        field: "name",
        type: "string",
        filterable: true,
        sortable: true,
      },
      {
        id: "description",
        name: "Description",
        field: "description",
        type: "string",
        filterable: true,
        sortable: true,
      },
    ];

    const commandItems: (MenuCommandItem | "divider")[] = [
      {
        command: "edit",
        title: isReadonly ? "View Details" : "Edit Details",
        iconCssClass: isReadonly
          ? "fas fa-info-circle fa-fw"
          : "fas fa-edit fa-fw",
        action: (_e, args) => handleEdit(args.dataContext),
      },
    ];

    if (!isReadonly) {
      commandItems.push({
        command: "delete",
        title: "Delete",
        iconCssClass: "fas fa-trash fa-fw",
        action: (_e, args) => handleDelete(args.dataContext),
      });
    }

    setColumns(cols);
    setGridOptions({
      ...(selectableConfig({
        commandItems,
        multiSelect: false,
      }) as unknown as GridOption),
      ...paginationGridOptions,
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  useEffect(() => {
    defineGrid();
  }, [paginationGridOptions]);

  return (
    <>
      {!isReadonly && (
        <div className="mb-3">
          <Button variant="primary" onClick={handleCreate}>
            Create Group
          </Button>
        </div>
      )}

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && (
          <SlickgridReact
            gridId="sourceGroups-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(e) => reactGridReady(e.detail)}
          />
        )}
      </div>

      <Modal show={showModal} onHide={() => setShowModal(false)} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>
            {editingSourceGroup
              ? isReadonly
                ? "View Group"
                : "Edit Group"
              : "Create Group"}
          </Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && (
              <Alert
                variant="danger"
                onClose={() => setError(null)}
                dismissible
              >
                {error}
              </Alert>
            )}

            <input
              type="hidden"
              name="_action"
              value={editingSourceGroup ? "update" : "create"}
            />
            {editingSourceGroup && (
              <>
                <input type="hidden" name="id" value={editingSourceGroup.id} />
                <input
                  type="hidden"
                  name="issued_at"
                  value={editingSourceGroup.last_edit_at ?? ""}
                />
              </>
            )}
            {Object.keys(DEFAULT_SPEC_IDS).map((k) => (
              <input
                type="hidden"
                name={k}
                value={JSON.stringify(formData[k])}
              />
            ))}

            <fieldset disabled={isReadonly}>
              <Form.Group className="mb-3">
                <Form.Label>
                  Name
                  <span className="text-danger ms-1">*</span>
                </Form.Label>
                <Form.Control
                  type="text"
                  name="name"
                  value={formData.name}
                  required={true}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      name: e.target.value,
                    })
                  }
                  title={Name.helperText}
                />
                {!isReadonly && (
                  <Form.Text className="text-muted">
                    {Name.helperText}
                  </Form.Text>
                )}
              </Form.Group>

              <Form.Group className="mb-3">
                <Form.Label>Description</Form.Label>
                <Form.Control
                  as="textarea"
                  name="description"
                  rows={5}
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      description: e.target.value,
                    })
                  }
                />
              </Form.Group>
            </fieldset>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              {isReadonly ? "Close" : "Cancel"}
            </Button>
            {!isReadonly && (
              <Button variant="primary" type="submit">
                Save
              </Button>
            )}
          </Modal.Footer>
        </RouterForm>
      </Modal>

      <Modal show={showDeleteModal} onHide={() => setShowDeleteModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Confirm Delete</Modal.Title>
        </Modal.Header>
        <RouterForm method="post">
          <Modal.Body>
            {error && (
              <Alert
                variant="danger"
                onClose={() => setError(null)}
                dismissible
              >
                {error}
              </Alert>
            )}

            <input type="hidden" name="_action" value="delete" />
            <input
              type="hidden"
              name="id"
              value={sourceGroupToDelete?.id ?? ""}
            />

            <p>
              Are you sure you want to delete the group{" "}
              <strong>{String(sourceGroupToDelete?.name ?? "")}</strong>?
            </p>
            <p className="text-muted small">This action cannot be undone.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowDeleteModal(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" type="submit">
              Delete Group
            </Button>
          </Modal.Footer>
        </RouterForm>
      </Modal>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading groups...</div>;
}

export default function SourceGroups({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { SG, user, dataset, pagination, specsById, loaderError } = loaderData;

  return createPageContent({
    title: "Source Groups",
    header: (
      <>
        <h2 className="py-2">Source Groups</h2>
      </>
    ),
    main: (
      <SourceGroupTable
        SG={SG}
        user={user}
        dataset={dataset}
        pagination={pagination}
        specsById={specsById}
        actionData={actionData}
      />
    ),
    alerts: loaderError
      ? { error: loaderError }
      : { success: actionData?.success },
  });
}
