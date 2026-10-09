import moment from 'moment';
import { type ComponentType, useEffect, useRef, useState } from 'react';
import { Alert, Breadcrumb, Button, ButtonGroup } from 'react-bootstrap';
import { Link, useFetcher, useLocation, useNavigate } from 'react-router';
import type { Column, GridOption, MenuCommandItem, SlickgridReactInstance } from 'slickgrid-react';

import { initializePluginEntrypoints } from '../../config';
import { FILE_HANDLERS, type FileContextDialogProps } from '../../plugins/source-files';
import { selectableConfig } from '../../components/slickgrid/options';
import {
  downloadFileFilesDownloadGet,
  downloadZipFilesDownloadZipPost,
  listFilesFilesGet,
} from '../../../client';
import { clearUser, dataAndCommit, getCurrentSession, getUser, redirectAndCommit } from '../../loaders';
import { createPageContent } from '../../templates';

import type { Route } from './+types/files';


type FileEntry = {
  id: string;
  name: string;
  path: string;
  is_dir: boolean;
  registrationLabels: string[];
  registrationSummary: string;
  size?: number | null;
  modified?: number | null;
};

type AuthToken = {
  access_token: string;
};

type DownloadActionData = {
  download?: {
    contentBase64: string;
    filename: string;
    mimeType: string;
  };
  error?: string;
};

function normalizeError(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function testPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

initializePluginEntrypoints();


async function getAdminContext(request: Request) {
  const session = await getCurrentSession(request);
  const token = session.get('token') as AuthToken | undefined;
  if (!token) {
    clearUser(session);
    session.flash('error', 'Your session has expired. Please log in again.');
    return redirectAndCommit('/login', session);
  }

  const user = getUser(session);
  if (!user) {
    session.flash('error', 'Your session has expired. Please log in again.');
    return redirectAndCommit('/login', session);
  }

  if (!user.roles.includes('admin')) {
    session.flash('error', "You lack the 'admin' role to view this page.");
    return redirectAndCommit('/', session);
  }

  return { session, token };
}


async function getAdminToken(request: Request): Promise<AuthToken | Response> {
  const context = await getAdminContext(request);
  if (context instanceof Response) {
    return context;
  }

  return context.token;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }

  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToUint8Array(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function handleFileDownload(
  request: Request,
  paths?: string[],
  archive = false,
): Promise<DownloadActionData | Response> {
  const token = await getAdminToken(request);
  if (token instanceof Response) {
    return token;
  }

  const resolvedPaths = paths ?? new URL(request.url).searchParams.getAll('path');

  if (resolvedPaths.length === 0) {
    return { error: 'No path specified' };
  }

  const firstFilename = resolvedPaths[0].split('/').pop() ?? 'download';

  if (resolvedPaths.length === 1 && !archive) {
    const res = await downloadFileFilesDownloadGet({
      auth: token.access_token,
      query: { path: resolvedPaths[0] },
      parseAs: 'stream',
      responseStyle: 'fields',
    });

    if (res.error !== undefined) {
      return { error: typeof res.error === 'string' ? res.error : JSON.stringify(res.error) };
    }

    const buffer = await new Response((res.data ?? null) as BodyInit | null).arrayBuffer();
    return {
      download: {
        contentBase64: arrayBufferToBase64(buffer),
        filename: firstFilename,
        mimeType: res.response.headers.get('Content-Type') ?? 'application/octet-stream',
      },
    };
  }

  const res = await downloadZipFilesDownloadZipPost({
    auth: token.access_token,
    body: { paths: resolvedPaths },
    parseAs: 'stream',
    responseStyle: 'fields',
  });

  if (res.error !== undefined) {
    return { error: typeof res.error === 'string' ? res.error : JSON.stringify(res.error) };
  }

  const buffer = await new Response((res.data ?? null) as BodyInit | null).arrayBuffer();
  return {
    download: {
      contentBase64: arrayBufferToBase64(buffer),
      filename: resolvedPaths.length === 1 ? firstFilename : 'files.zip',
      mimeType: res.response.headers.get('Content-Type') ?? 'application/octet-stream',
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const formData = await request.formData();
  const actionType = formData.get('_action');

  if (actionType === 'download') {
    const paths = formData.getAll('path').filter((value: FormDataEntryValue): value is string => typeof value === 'string');
    const archive = formData.get('archive') === 'true';
    return handleFileDownload(request, paths, archive);
  }

  const fileHandler = Object.values(FILE_HANDLERS).find((config) =>
    config.actionType === actionType && config.action != null
  );
  if (fileHandler?.action) {
    const context = await getAdminContext(request);
    if (context instanceof Response) {
      return context;
    }

    try {
      const result = await fileHandler.action({
        formData,
        accessToken: context.token.access_token,
      });

      if (result.error) {
        context.session.flash('error', result.error);
      }
      if (result.success) {
        context.session.flash('success', result.success);
      }
    } catch (error) {
      context.session.flash('error', error instanceof Error ? error.message : String(error));
    }

    return redirectAndCommit(`${url.pathname}${url.search}`, context.session);
  }

  return new Response('Invalid action', { status: 400 });
}


export async function loader({ request }: Route.LoaderArgs) {
  const context = await getAdminContext(request);
  if (context instanceof Response) {
    return context;
  }
  const { session, token } = context;

  const url = new URL(request.url);
  const currentPath = url.searchParams.get('path') ?? '';

  const res = await listFilesFilesGet({
    auth: token.access_token,
    query: { path: currentPath },
  });

  const baseDataset: FileEntry[] = (res.data?.entries ?? [])
    .map((e) => ({
      ...e,
      id: `${e.path}/${e.name}`,
      registrationLabels: [],
      registrationSummary: '',
    }));

  const registrationErrors: string[] = [];
  const registrationMap = new Map<string, string[]>();
  const filePaths = baseDataset.filter((entry) => !entry.is_dir).map((entry) => entry.id);

  await Promise.all(
    Object.values(FILE_HANDLERS)
      .filter((handler) => handler.registrationLookup != null)
      .map(async (handler) => {
        if (!handler.registrationLookup) {
          return;
        }

        const matchingPaths = filePaths.filter((path) => testPattern(handler.pattern, path));
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
            registrationMap.set(path, Array.from(new Set([...existingLabels, ...labels])));
          }
        } catch (error) {
          registrationErrors.push(normalizeError(error));
        }
      })
  );

  const dataset = baseDataset.map((entry) => {
    const registrationLabels = registrationMap.get(entry.id) ?? [];
    return {
      ...entry,
      registrationLabels,
      registrationSummary: registrationLabels.join(', '),
    };
  });

  const combinedLoaderError = [res.error, ...registrationErrors]
    .filter((value): value is NonNullable<typeof value> => value != null)
    .map((value) => normalizeError(value))
    .join(' ');

  return dataAndCommit({
    currentPath,
    dataset,
    error: session.get('error'),
    success: session.get('success'),
    loaderError: combinedLoaderError || undefined,
  }, session);
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const loaderData = await serverLoader();

  // SlickGrid needs to access the document at import time,
  // so it cannot be imported during SSR
  const SG = await import('slickgrid-react');

  return { ...loaderData, SG };
}

clientLoader.hydrate = true as const;

function formatSize(bytes: number | null): string {
  if (bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function buildPathLocation(pathname: string, path: string) {
  return {
    pathname,
    search: `?path=${encodeURIComponent(path)}`,
  };
}

function PageBreadcrumb({ currentPath }: { currentPath: string }) {
  const location = useLocation();
  const parts = currentPath.split('/');
  if (parts[0] !== ".") {
    parts.splice(0, 0, ".");
  }

  return (
    <Breadcrumb className="fs-5">
      {parts.map((part, idx) => {
        const partText = idx === 0 ? "All Files" : part;
        const isLast = idx === parts.length - 1;
        const pathSoFar = parts.slice(0, idx + 1).join('/');
        return isLast ? (
          <Breadcrumb.Item active key={pathSoFar}>{partText}</Breadcrumb.Item>
        ) : (
          <Breadcrumb.Item
            key={pathSoFar}
            linkAs={Link}
            linkProps={{ to: buildPathLocation(location.pathname, pathSoFar) }}
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
  SG: typeof import('slickgrid-react');
  currentPath: string;
  dataset: FileEntry[];
  flashError?: string;
  flashSuccess?: string;
}) {
  const downloadFetcher = useFetcher<DownloadActionData>();
  const location = useLocation();
  const navigate = useNavigate();

  const [columns, setColumns] = useState<Column[]>([]);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(undefined);
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

  const { SlickgridReact } = SG;

  function getAllSelectedItems(): FileEntry[] {
    const items = reactGridRef.current?.dataView.getAllSelectedItems() ?? [];
    return items.filter((item): item is FileEntry => item != null);
  }

  function openDirectory(item?: FileEntry) {
    if (!item?.is_dir) {
      return;
    }

    navigate(buildPathLocation(location.pathname, item.id));
  }

  function handleGridDoubleClick(event: CustomEvent<{ args?: { dataContext?: FileEntry; row?: number } }>) {
    const row = event.detail?.args?.row;
    const item = event.detail?.args?.dataContext
      ?? (typeof row === 'number'
        ? reactGridRef.current?.dataView.getItem(row) as FileEntry | undefined
        : undefined);

    openDirectory(item);
  }

  const selectedItems = dataset.filter(d => selectedIds.includes(d.id));

  useEffect(() => {
    const data = downloadFetcher.data;
    if (!data) {
      return;
    }

    if (data.error) {
      setDownloadError(data.error);
      return;
    }

    if (!data.download) {
      return;
    }

    setDownloadError(null);
    const bytes = base64ToUint8Array(data.download.contentBase64);
    const blob = new Blob([new Uint8Array(bytes)], { type: data.download.mimeType });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = data.download.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  }, [downloadFetcher.data]);

  function handleDownload() {
    const items = getAllSelectedItems();
    if (items.length === 0) return;

    const formData = new FormData();
    formData.set('_action', 'download');
    formData.set('archive', String(items.length > 1 || items.some((item) => item.is_dir)));
    items.forEach((item) => {
      formData.append('path', item.id);
    });

    downloadFetcher.submit(formData, {
      method: 'post',
      action: `${location.pathname}?path=${encodeURIComponent(currentPath)}`,
    });
  }

  function defineGrid() {
    const fileHandlerItems: MenuCommandItem[] = Object.entries(FILE_HANDLERS).map(([command, config]) => ({
      command,
      title: command,
      iconCssClass: config.iconCssClass,
      action: async () => {
        const items = getAllSelectedItems();
        if (items.length === 0 || items.some((item) => item.is_dir)) {
          return;
        }

        const paths = items.map((item) => item.id);

        if (config.modal) {
          setActiveFileHandlerDialog({ Dialog: config.modal, paths });
          return;
        }

        if (!config.handler) {
          return;
        }

        try {
          await config.handler(paths);
        } catch (error) {
          setDownloadError(error instanceof Error ? error.message : String(error));
        }
      },
      itemVisibilityOverride: () => {
        const items = getAllSelectedItems();
        return items.length > 0
          && items.every((item) => !item.is_dir && config.pattern.test(item.id))
          && (config.allowMultiple || items.length === 1);
      },
    }));

    const commandItems: MenuCommandItem[] = [
      {
        command: 'open',
        title: 'Open',
        iconCssClass: 'fas fa-folder-open fa-fw',
        action: (_e, args) => {
          openDirectory(args.dataContext as FileEntry | undefined);
        },
        itemVisibilityOverride: () => {
          const items = getAllSelectedItems();
          return items.length === 1 && items[0].is_dir;
        },
      },
      {
        command: 'download',
        title: 'Download',
        iconCssClass: 'fas fa-download fa-fw',
        action: () => handleDownload(),
        itemVisibilityOverride: () => getAllSelectedItems().length > 0,
      },
      ...fileHandlerItems,
    ];

    const cols: Column<FileEntry>[] = [
      {
        id: 'name',
        name: 'Name',
        field: 'name',
        type: 'string',
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value, _col, dataContext) => {
          const icon = dataContext.is_dir
            ? '<i class="fas fa-folder fa-fw text-warning"></i>'
            : '<i class="fas fa-file fa-fw text-muted"></i>';
          const safe = String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `${icon} ${safe}`;
        },
      },
      {
        id: 'size',
        name: 'Size',
        field: 'size',
        type: 'number',
        filterable: false,
        sortable: true,
        formatter: (_row, _cell, value) => formatSize(value as number | null),
      },
      {
        id: 'modified',
        name: 'Modified',
        field: 'modified',
        type: 'number',
        filterable: false,
        sortable: true,
        formatter: (_row, _cell, value) =>
          value ? moment.unix(value as number).format('YYYY-MM-DD HH:mm:ss') : '',
      },
      {
        id: 'registrations',
        name: 'Registered Metadata',
        field: 'registrationSummary',
        type: 'string',
        filterable: true,
        sortable: false,
      },
    ];

    setColumns(cols);
    setGridOptions({
      ...(selectableConfig({ commandItems: commandItems as never, multiSelect: true }) as unknown as GridOption),
      autoResize: { container: '#grid-container' },
      enableAutoResize: true,
    });
  }

  function onSelectAll() {
    const numFiltered = reactGridRef.current?.dataView.getFilteredItemCount() ?? 0;
    reactGridRef.current?.gridService.setSelectedRows(
      Array.from({ length: numFiltered }, (_, i) => i),
    );
  }

  function onDeselectAll() {
    reactGridRef.current?.gridService.setSelectedRows([]);
  }

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function onGridStateChanged() {
    const selectedIds = getAllSelectedItems().map(item => item.id);
    setSelectedIds(selectedIds);
  }

  useEffect(() => {
    defineGrid();
  }, []);

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
            disabled={selectedItems.length === 0 || downloadFetcher.state !== 'idle'}
            onClick={handleDownload}
          >
            {downloadFetcher.state !== 'idle'
              ? 'Preparing download...'
              : selectedItems.length > 1
              ? `Download (${selectedItems.length} items)`
              : 'Download'}
          </Button>
        </ButtonGroup>
        <ButtonGroup className="justify-content-end">
          {selectedIds.length === 0 && (
            <Button variant="outline-secondary" onClick={onSelectAll}>Select All</Button>
          )}
          {selectedIds.length > 0 && (
            <Button variant="secondary" onClick={onDeselectAll}>Deselect All</Button>
          )}
        </ButtonGroup>
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && (
          <SlickgridReact
            gridId="file-explorer-grid"
            columns={columns}
            options={gridOptions}
            dataset={dataset}
            onReactGridCreated={e => reactGridReady(e.detail)}
            onGridStateChanged={() => onGridStateChanged()}
            onDblClick={handleGridDoubleClick}
          />
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
    title: 'File Explorer',
    header: <PageBreadcrumb currentPath={currentPath} />,
    main: <FileTable SG={SG} currentPath={currentPath} dataset={dataset} flashError={error} flashSuccess={success} />,
    alerts,
  });
}
