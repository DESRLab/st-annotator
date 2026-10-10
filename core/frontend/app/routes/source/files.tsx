import moment from "moment";
import { type ComponentType, useEffect, useRef, useState } from "react";
import {
  Alert,
  Breadcrumb,
  Button,
  ButtonGroup,
  Spinner,
} from "react-bootstrap";
import {
  Link,
  type Location,
  type Navigation,
  useLocation,
  useNavigate,
  useNavigation,
} from "react-router";
import type {
  Column,
  GridOption,
  MenuCommandItem,
  SlickgridReactInstance,
} from "slickgrid-react";

import {
  downloadFileFilesDownloadGet,
  downloadZipFilesDownloadZipPost,
  listFilesFilesGet,
} from "../../../client";
import { GridSelectionButtons } from "../../components/GridSelectionButtons";
import { createSlickgridClientLoader } from "../../components/slickgrid/client";
import { selectableConfig } from "../../components/slickgrid/options";
import { initializePluginEntrypoints } from "../../config";
import { normalizeError } from "../../errors";
import {
  dataAndCommit,
  loadAuthorizedSession,
  redirectAndCommit,
} from "../../loaders";
import {
  FILE_HANDLERS,
  type FileContextDialogProps,
} from "../../plugins/source-files";
import { createPageContent } from "../../templates";

import type { Route } from "./+types/files";

interface FileEntry {
  id: string;
  name: string;
  parent: string;
  is_dir: boolean;
  registrationLabels: string[];
  size?: number | null;
  modified?: number | null;
}

function testPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

initializePluginEntrypoints();

async function getDataManagerContext(request: Request) {
  return loadAuthorizedSession(request, "data-manager");
}

async function getDataManagerToken(request: Request) {
  const context = await getDataManagerContext(request);
  if (context instanceof Response) {
    return context;
  }

  return context.token;
}

export async function handleFileDownload(
  request: Request,
  paths?: string[],
  archive = false,
): Promise<Response> {
  const token = await getDataManagerToken(request);
  if (token instanceof Response) {
    return token;
  }

  const resolvedPaths =
    paths ?? new URL(request.url).searchParams.getAll("path");

  if (resolvedPaths.length === 0) {
    return new Response("No path specified", { status: 400 });
  }

  const firstFilename = resolvedPaths[0].split("/").pop() ?? "download";

  if (resolvedPaths.length === 1 && !archive) {
    const res = await downloadFileFilesDownloadGet({
      auth: token.access_token,
      query: { path: resolvedPaths[0] },
      parseAs: "stream",
      responseStyle: "fields",
    });

    if (res.error !== undefined) {
      return new Response(normalizeError(res.error), {
        status: res.response.status,
      });
    }
    return new Response((res.data ?? null) as BodyInit | null, {
      headers: {
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(firstFilename)}`,
        "Content-Type":
          res.response.headers.get("Content-Type") ??
          "application/octet-stream",
      },
    });
  }

  const res = await downloadZipFilesDownloadZipPost({
    auth: token.access_token,
    body: { paths: resolvedPaths },
    parseAs: "stream",
    responseStyle: "fields",
  });

  if (res.error !== undefined) {
    return new Response(normalizeError(res.error), {
      status: res.response.status,
    });
  }
  const filename = resolvedPaths.length === 1 ? firstFilename : "files.zip";
  return new Response((res.data ?? null) as BodyInit | null, {
    headers: {
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Type":
        res.response.headers.get("Content-Type") ?? "application/octet-stream",
    },
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(request.url);
  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "download") {
    const paths = formData
      .getAll("path")
      .filter(
        (value: FormDataEntryValue): value is string =>
          typeof value === "string",
      );
    const archive = formData.get("archive") === "true";
    return handleFileDownload(request, paths, archive);
  }

  const fileHandler = Object.values(FILE_HANDLERS).find(
    (config) => config.actionType === actionType && config.action != null,
  );
  if (fileHandler?.action) {
    const context = await getDataManagerContext(request);
    if (context instanceof Response) {
      return context;
    }

    try {
      const result = await fileHandler.action({
        formData,
        accessToken: context.token.access_token,
      });

      if (result.error) {
        context.session.flash("error", result.error);
      }
      if (result.success) {
        context.session.flash("success", result.success);
      }
    } catch (error) {
      context.session.flash(
        "error",
        error instanceof Error ? error.message : String(error),
      );
    }

    return redirectAndCommit(`${url.pathname}${url.search}`, context.session);
  }

  return new Response("Invalid action", { status: 400 });
}

export async function loader({ request }: Route.LoaderArgs) {
  const context = await getDataManagerContext(request);
  if (context instanceof Response) {
    return context;
  }
  const { session, token } = context;

  const url = new URL(request.url);
  const currentPath = url.searchParams.get("path") ?? "";

  const res = await listFilesFilesGet({
    auth: token.access_token,
    query: { path: currentPath },
  });

  const baseDataset: FileEntry[] = (res.data?.entries ?? []).map((e) => ({
    ...e,
    id: `${e.parent}/${e.name}`, // i.e. the full path
    registrationLabels: [],
  }));

  const registrationErrors: string[] = [];
  const registrationMap = new Map<string, string[]>();
  const filePaths = baseDataset
    .filter((entry) => !entry.is_dir)
    .map((entry) => entry.id);

  await Promise.all(
    Object.values(FILE_HANDLERS)
      .filter((handler) => handler.registrationLookup != null)
      .map(async (handler) => {
        if (!handler.registrationLookup) {
          return;
        }

        const matchingPaths = filePaths.filter((path) =>
          testPattern(handler.pattern, path),
        );
        if (matchingPaths.length === 0) {
          return;
        }

        try {
          const registrations = await handler.registrationLookup({
            accessToken: token.access_token,
            paths: matchingPaths,
          });

          for (const [path, labels] of Object.entries(registrations)) {
            const existingLabels = registrationMap.get(path) ?? [];
            registrationMap.set(
              path,
              Array.from(new Set([...existingLabels, ...labels])),
            );
          }
        } catch (error) {
          registrationErrors.push(normalizeError(error));
        }
      }),
  );

  const dataset = baseDataset.map((entry) => {
    const registrationLabels = registrationMap.get(entry.id) ?? [];
    return {
      ...entry,
      registrationLabels,
    };
  });

  const combinedLoaderError = [res.error, ...registrationErrors]
    .filter((value): value is NonNullable<typeof value> => value != null)
    .map((value) => normalizeError(value))
    .join(" ");

  return dataAndCommit(
    {
      currentPath,
      dataset,
      error: session.get("error"),
      success: session.get("success"),
      loaderError: combinedLoaderError || undefined,
    },
    session,
  );
}

export const clientLoader =
  createSlickgridClientLoader<Route.ClientLoaderArgs>();

function formatSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export interface RegistrationFilterOption {
  label: string;
  value: string;
}

export function getRegistrationFilterOptions(
  dataset: readonly Pick<FileEntry, "registrationLabels">[],
): RegistrationFilterOption[] {
  return Array.from(
    new Set(dataset.flatMap((entry) => entry.registrationLabels)),
  ).map((label) => ({ label, value: label }));
}

export function formatRegistrationLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} (+${labels.length - 1})`;
}

function buildPathLocation(pathname: string, path: string) {
  return {
    pathname,
    search: `?path=${encodeURIComponent(path)}`,
  };
}

/**
 * Text shown while a directory is being loaded, or null when the explorer is
 * not waiting on another directory of the same page. The grid keeps showing the
 * previous directory until its loader resolves, so without this the navigation
 * looks like nothing happened.
 */
export interface DirectoryNavigation {
  state: Navigation["state"];
  location?: Pick<Location, "pathname" | "search"> | null;
}

export function directoryLoadingText(
  navigation: DirectoryNavigation,
  pathname: string,
): string | null {
  const { state, location } = navigation;
  if (state !== "loading" || location?.pathname !== pathname) {
    return null;
  }

  const path = new URLSearchParams(location.search).get("path");
  const parts = (path ?? "")
    .split("/")
    .filter((part) => part !== "" && part !== ".");
  const name = parts[parts.length - 1];

  return name ? `Opening ${name}` : "Loading files";
}

function PageBreadcrumb({ currentPath }: { currentPath: string }) {
  const location = useLocation();
  const parts = currentPath.split("/");
  if (parts[0] !== ".") {
    parts.splice(0, 0, ".");
  }

  return (
    <Breadcrumb className="fs-5">
      {parts.map((part, idx) => {
        const partText = idx === 0 ? "All Files" : part;
        const isLast = idx === parts.length - 1;
        const pathSoFar = parts.slice(0, idx + 1).join("/");
        return isLast ? (
          <Breadcrumb.Item active key={pathSoFar}>
            {partText}
          </Breadcrumb.Item>
        ) : (
          <Breadcrumb.Item
            key={pathSoFar}
            linkAs={Link}
            linkProps={{
              to: buildPathLocation(location.pathname, pathSoFar),
            }}
          >
            {partText}
          </Breadcrumb.Item>
        );
      })}
    </Breadcrumb>
  );
}

function FileTable({
  SG,
  currentPath,
  dataset,
  flashError,
  flashSuccess,
}: {
  SG: typeof import("slickgrid-react");
  currentPath: string;
  dataset: FileEntry[];
  flashError?: string;
  flashSuccess?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const loadingText = directoryLoadingText(navigation, location.pathname);

  const [columns, setColumns] = useState<Column[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(
    undefined,
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeFileHandlerDialog, setActiveFileHandlerDialog] = useState<{
    Dialog: ComponentType<FileContextDialogProps>;
    paths: string[];
  } | null>(null);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);

  // Sync grid when loader revalidation updates row metadata in-place.
  useEffect(() => {
    reactGridRef.current?.slickGrid.invalidate();
  }, [dataset]);

  // Clear stale selections when navigating to a different directory.
  useEffect(() => {
    reactGridRef.current?.gridService.setSelectedRows([]);
    setSelectedIds([]);
    setActiveFileHandlerDialog(null);
    reactGridRef.current?.slickGrid.invalidate();
  }, [currentPath]);

  useEffect(() => {
    if (!flashError && !flashSuccess) {
      return;
    }

    setActiveFileHandlerDialog(null);
  }, [flashError, flashSuccess]);

  const { Filters, SlickgridReact } = SG;

  function getAllSelectedItems(): FileEntry[] {
    const items = reactGridRef.current?.dataView.getAllSelectedItems() ?? [];
    return items.filter((item): item is FileEntry => item != null);
  }

  function openDirectory(item?: FileEntry) {
    if (!item?.is_dir) {
      return;
    }

    void navigate(buildPathLocation(location.pathname, item.id));
  }

  function handleGridDoubleClick(
    event: CustomEvent<{
      args?: { dataContext?: FileEntry; row?: number };
    }>,
  ) {
    const row = event.detail?.args?.row;
    const item =
      event.detail?.args?.dataContext ??
      (typeof row === "number"
        ? reactGridRef.current?.dataView.getItem(row)
        : undefined);

    openDirectory(item);
  }

  const selectedItems = dataset.filter((d) => selectedIds.includes(d.id));

  function handleDownload() {
    const items = getAllSelectedItems();
    if (items.length === 0) return;

    const params = new URLSearchParams({
      download: "true",
      archive: String(items.length > 1 || items.some((item) => item.is_dir)),
    });
    items.forEach((item) => {
      params.append("download_path", item.id);
    });
    setDownloadError(null);
    const link = document.createElement("a");
    link.href = `/source/files/download?${params.toString()}`;
    // Prevent React Router's delegated click handler from treating this as a
    // client-side navigation; the loader response is an attachment stream.
    link.download =
      items.length === 1 && !items[0].is_dir ? items[0].name : "files.zip";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function defineGrid() {
    const fileHandlerItems: MenuCommandItem[] = Object.entries(
      FILE_HANDLERS,
    ).map(([command, config]) => ({
      command,
      title: command,
      iconCssClass: config.iconCssClass,
      action: async () => {
        const items = getAllSelectedItems();
        if (items.length === 0 || items.some((item) => item.is_dir)) {
          return;
        }

        const paths = items.map((item) => item.id);

        const Modal =
          config.modal ??
          (config.loadModal ? await config.loadModal() : undefined);
        if (Modal) {
          setActiveFileHandlerDialog({ Dialog: Modal, paths });
          return;
        }

        if (!config.handler) {
          return;
        }

        try {
          await config.handler(paths);
        } catch (error) {
          setDownloadError(
            error instanceof Error ? error.message : String(error),
          );
        }
      },
      itemVisibilityOverride: () => {
        const items = getAllSelectedItems();
        return (
          items.length > 0 &&
          items.every((item) => !item.is_dir && config.pattern.test(item.id)) &&
          ((config.allowMultiple ?? false) || items.length === 1)
        );
      },
    }));

    const commandItems: MenuCommandItem[] = [
      {
        command: "open",
        title: "Open",
        iconCssClass: "fas fa-folder-open fa-fw",
        action: (_e, args) => {
          openDirectory(args.dataContext as FileEntry | undefined);
        },
        itemVisibilityOverride: () => {
          const items = getAllSelectedItems();
          return items.length === 1 && items[0].is_dir;
        },
      },
      {
        command: "download",
        title: "Download",
        iconCssClass: "fas fa-download fa-fw",
        action: () => handleDownload(),
        itemVisibilityOverride: () => getAllSelectedItems().length > 0,
      },
      ...fileHandlerItems,
    ];

    setGridOptions({
      ...(selectableConfig({
        commandItems: commandItems as never,
        multiSelect: true,
      }) as unknown as GridOption),
      autoResize: { container: "#grid-container" },
      enableAutoResize: true,
    });
  }

  function buildColumns(
    registrationOptions: RegistrationFilterOption[],
  ): Column<FileEntry>[] {
    // `registrationLabels` is an array, which Column's dot-path field typing
    // cannot express (main suppressed the same error), so this column stays
    // loosely typed.
    const registrationsColumn: Column = {
      id: "registrations",
      name: "Assigned Source Groups",
      field: "registrationLabels",
      filterable: true,
      filter: {
        collection: registrationOptions,
        model: Filters.multipleSelect,
        operator: "IN_COLLECTION",
      },
      formatter: (_row, _cell, _value, _col, dataContext) =>
        formatRegistrationLabels(dataContext.registrationLabels),
      sortable: true,
    };

    return [
      {
        id: "name",
        name: "Name",
        field: "name",
        type: "string",
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value, _col, dataContext) => {
          const icon = dataContext.is_dir
            ? '<i class="fas fa-folder fa-fw text-warning"></i>'
            : '<i class="fas fa-file fa-fw text-muted"></i>';
          const safe = String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          return `${icon} ${safe}`;
        },
      },
      {
        id: "size",
        name: "Size",
        field: "size",
        type: "number",
        filterable: false,
        sortable: true,
        formatter: (_row, _cell, value) => formatSize(value as number | null),
      },
      {
        id: "modified",
        name: "Modified",
        field: "modified",
        type: "number",
        filterable: false,
        sortable: true,
        formatter: (_row, _cell, value) =>
          value
            ? moment.unix(value as number).format("YYYY-MM-DD HH:mm:ss")
            : "",
      },
      registrationsColumn,
    ];
  }

  function onSelectCurrentPage() {
    const numFiltered =
      reactGridRef.current?.dataView.getFilteredItemCount() ?? 0;
    reactGridRef.current?.gridService.setSelectedRows(
      Array.from({ length: numFiltered }, (_, i) => i),
    );
    setSelectedIds(dataset.map((item) => item.id));
  }

  function onSelectAll() {
    onSelectCurrentPage();
  }

  function onDeselectAll() {
    reactGridRef.current?.gridService.setSelectedRows([]);
    setSelectedIds([]);
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function onGridStateChanged() {
    const selectedIds = getAllSelectedItems().map((item) => item.id);
    setSelectedIds(selectedIds);
  }

  useEffect(() => {
    defineGrid();
  }, []);

  useEffect(() => {
    setColumns(buildColumns(getRegistrationFilterOptions(dataset)));
  }, [dataset]);

  return (
    <>
      {downloadError && (
        <Alert className="mb-3" variant="danger">
          {downloadError}
        </Alert>
      )}

      <div className="mb-3 d-flex gap-2">
        <ButtonGroup className="justify-content-start me-auto">
          <Button
            variant="primary"
            disabled={selectedItems.length === 0}
            onClick={handleDownload}
          >
            {selectedItems.length > 1
              ? `Download (${selectedItems.length} items)`
              : "Download"}
          </Button>
        </ButtonGroup>
        <GridSelectionButtons
          selectedCount={selectedIds.length}
          allSelectableCount={dataset.length}
          onSelectAll={onSelectAll}
          onDeselectAll={onDeselectAll}
        />
      </div>

      <div
        className="slickgrid-container position-relative"
        id="grid-container"
      >
        {gridOptions && (
          <SlickgridReact
            gridId="file-explorer-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={(e) => reactGridReady(e.detail)}
            onGridStateChanged={() => onGridStateChanged()}
            onDblClick={handleGridDoubleClick}
          />
        )}
        {loadingText && (
          <div
            className="position-absolute top-0 start-0 w-100 h-100 bg-body opacity-75 d-flex align-items-center justify-content-center"
            style={{ zIndex: 10 }}
            role="status"
          >
            <span className="d-flex align-items-center text-muted fs-5">
              <Spinner animation="border" size="sm" className="me-2" />
              {loadingText}
            </span>
          </div>
        )}
      </div>

      {activeFileHandlerDialog && (
        <activeFileHandlerDialog.Dialog
          show={true}
          paths={activeFileHandlerDialog.paths}
          onHide={() => setActiveFileHandlerDialog(null)}
        />
      )}
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading files...</div>;
}

export default function FileExplorer({ loaderData }: Route.ComponentProps) {
  const { SG, currentPath, dataset, error, success, loaderError } = loaderData;
  const alerts = loaderError ? { error: loaderError } : { error, success };

  return createPageContent({
    title: "File Explorer",
    header: <PageBreadcrumb currentPath={currentPath} />,
    main: (
      <FileTable
        SG={SG}
        currentPath={currentPath}
        dataset={dataset}
        flashError={error}
        flashSuccess={success}
      />
    ),
    alerts,
  });
}
