import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import type { MenuCommandItem } from '@slickgrid-universal/common';
import type { Column, GridOption, SlickgridReactInstance } from 'slickgrid-react';

import { selectableConfig } from '../../components/slickgrid/options';
import {
  type LabelGroupPublic as LabelGroup,
  listGroupsLabelGroupsGet,
} from '../../../client';
import { clearUser, getCurrentSession, getUser, redirectAndCommit } from '../../loaders';
import { createPageContent } from '../../templates';

import type { Route } from './+types/repos';

type RepositoryRow = {
  id: number;
  name: string;
  description: string;
  last_edit_at?: string | null;
};


export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);
  const token = session.get('token');
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

  const groupsRes = await listGroupsLabelGroupsGet({ auth: token.access_token });
  const dataset: RepositoryRow[] = (groupsRes.data ?? []).map((group) => ({
    id: group.id,
    name: String(group.name),
    description: group.description ?? '',
    last_edit_at: group.last_edit_at ?? null,
  }));
  const loaderError = groupsRes.error;

  return { user, dataset, loaderError };
}

export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  const loaderData = await serverLoader();

  const SG = await import('slickgrid-react');

  return { ...loaderData, SG };
}

clientLoader.hydrate = true as const;

function RepositoryTable({ SG, dataset }: {
  SG: typeof import('slickgrid-react');
  dataset: RepositoryRow[];
}) {
  const navigate = useNavigate();
  const [columns, setColumns] = useState<Column[]>([]);
  const [gridOptions, setGridOptions] = useState<GridOption | undefined>(undefined);
  const reactGridRef = useRef<SlickgridReactInstance | null>(null);

  useEffect(() => {
    reactGridRef.current?.slickGrid.invalidate();
  }, [dataset]);

  useEffect(() => {
    const cols: Column<RepositoryRow>[] = [
      {
        id: 'id',
        name: 'Group ID',
        field: 'id',
        type: 'integer',
        filterable: true,
        sortable: true,
      },
      {
        id: 'name',
        name: 'Repository',
        field: 'name',
        type: 'string',
        filterable: true,
        sortable: true,
        formatter: (_row, _cell, value) => String(value),
      },
      {
        id: 'description',
        name: 'Description',
        field: 'description',
        type: 'string',
        filterable: true,
        sortable: true,
      },
    ];

    const commandItems: MenuCommandItem[] = [
      {
        command: 'open',
        title: 'Open Repository',
        iconCssClass: 'fas fa-paperclip fa-fw',
        action: (_e, args) => navigate(`/label/repos/${args.dataContext.id}`),
      },
    ];

    setColumns(cols);
    setGridOptions({
      ...(selectableConfig({ commandItems, multiSelect: false }) as unknown as GridOption),
      autoResize: { container: '#grid-container' },
      enableAutoResize: true,
    });
  }, [navigate]);

  function reactGridReady(reactGrid: SlickgridReactInstance) {
    reactGridRef.current = reactGrid;
  }

  function openRepository(repository?: RepositoryRow) {
    if (!repository) {
      return;
    }

    navigate(`/label/repos/${repository.id}`);
  }

  function handleGridDoubleClick(event: CustomEvent<{ args?: { dataContext?: RepositoryRow; row?: number } }>) {
    const row = event.detail?.args?.row;
    const repository = event.detail?.args?.dataContext
      ?? (typeof row === 'number'
        ? reactGridRef.current?.dataView.getItem(row) as RepositoryRow | undefined
        : undefined);

    openRepository(repository);
  }

  const { SlickgridReact } = SG;

  return (
    <>
      <div className="mb-3 text-muted">
        Each label group owns one repository. Open a repository to manage its branches.
      </div>

      <div className="slickgrid-container" id="grid-container">
        {gridOptions && <SlickgridReact
          gridId="labelRepositories-grid"
          columns={columns}
          options={gridOptions}
          dataset={dataset}
          onReactGridCreated={(e) => reactGridReady(e.detail)}
          onDblClick={handleGridDoubleClick}
        />}
      </div>
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading repositories...</div>;
}

export default function LabelRepositories({ loaderData }: Route.ComponentProps) {
  const { SG, dataset, loaderError } = loaderData;

  return createPageContent({
    title: 'Repositories',
    main: <RepositoryTable SG={SG} dataset={dataset} />,
    alerts: loaderError ? { error: loaderError } : undefined,
  });
}