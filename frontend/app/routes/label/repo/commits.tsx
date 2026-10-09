import { Fragment, useMemo, useState } from 'react';
import { Breadcrumb } from 'react-bootstrap';
import { redirect } from 'react-router';

import {
  type CommitGraphEdgePublic,
  type CommitGraphNodePublic,
  type CommitGraphPublic,
  type LabelGroupPublic as LabelGroup,
  type LabelsetBranchPublic as LabelBranch,
  type LabelsetCommitPublic as LabelCommit,
  type LabelsetOperationMetadata,
  listBranchesLabelRepoBranchesGet,
  readGroupLabelGroupsIdGet,
  readLabelsetGraphEditorLabelsetGraphGet,
} from '../../../../client';
import { readCommitLabelRepoCommitsGroupIdCommitHashGet } from '../../../../client/sdk.gen';
import { clearUser, getCurrentSession, getUser, redirectAndCommit } from '../../../loaders';
import { createPageContent } from '../../../templates';

import type { Route } from './+types/commits';

type PositionedNode = CommitGraphNodePublic & {
  x: number;
  y: number;
  tags: string[];
};

type PositionedEdge = CommitGraphEdgePublic & {
  parentX: number;
  parentY: number;
  childX: number;
  childY: number;
};

type GraphLayout = {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  width: number;
  height: number;
  rootCount: number;
};

type CommitRelations = {
  parentHashesByChild: Map<string, string[]>;
  childHashesByParent: Map<string, string[]>;
};

type HoveredGraphItem = {
  kind: 'commit';
  node: PositionedNode;
  commit: LabelCommit | null;
  parentHashes: string[];
  childHashes: string[];
} | {
  kind: 'branch';
  branch: LabelBranch;
} | null;

type TooltipPosition = {
  x: number;
  y: number;
};

function parseGroupId(groupIdParam: string | undefined): number | null {
  const groupId = Number.parseInt(groupIdParam ?? '', 10);
  return Number.isInteger(groupId) ? groupId : null;
}

function isCommitGraphPublic(value: unknown): value is CommitGraphPublic {
  return typeof value === 'object'
    && value !== null
    && Array.isArray((value as { nodes?: unknown }).nodes)
    && Array.isArray((value as { edges?: unknown }).edges);
}

function normalizeCommitGraphs(data: unknown): CommitGraphPublic[] {
  if (Array.isArray(data)) {
    return data.filter(isCommitGraphPublic);
  }
  if (isCommitGraphPublic(data)) {
    return [data];
  }
  return [];
}

function mergeRepositoryGraphs(branches: LabelBranch[], graphs: CommitGraphPublic[]) {
  const nodesByHash = new Map<string, CommitGraphNodePublic>();
  const edgesByKey = new Map<string, CommitGraphEdgePublic>();
  const tagsByHash = new Map<string, string[]>();

  for (const branch of branches) {
    const tags = tagsByHash.get(branch.head_hash) ?? [];
    tags.push(branch.name);
    tags.sort((left, right) => left.localeCompare(right));
    tagsByHash.set(branch.head_hash, tags);
  }

  for (const graph of graphs) {
    for (const node of graph.nodes) {
      nodesByHash.set(node.hash, node);
    }
    for (const edge of graph.edges) {
      edgesByKey.set(`${edge.parent_hash}->${edge.child_hash}`, edge);
    }
  }

  return {
    nodes: Array.from(nodesByHash.values()),
    edges: Array.from(edgesByKey.values()),
    tagsByHash,
  };
}

function buildGraphLayout(
  nodes: CommitGraphNodePublic[],
  edges: CommitGraphEdgePublic[],
  tagsByHash: Map<string, string[]>,
): GraphLayout {
  const nodeWidth = 128;
  const nodeHeight = 36;
  const columnGap = 220;
  const rowGap = 92;
  const paddingX = 48;
  const paddingY = 48;

  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      width: paddingX * 2 + nodeWidth,
      height: paddingY * 2 + nodeHeight,
      rootCount: 0,
    };
  }

  const parentsByChild = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const nodeIds = new Set(nodes.map((node) => node.hash));

  for (const node of nodes) {
    parentsByChild.set(node.hash, []);
    childrenByParent.set(node.hash, []);
    indegree.set(node.hash, 0);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.parent_hash) || !nodeIds.has(edge.child_hash)) continue;

    childrenByParent.get(edge.parent_hash)?.push(edge.child_hash);
    parentsByChild.get(edge.child_hash)?.push(edge.parent_hash);
    indegree.set(edge.child_hash, (indegree.get(edge.child_hash) ?? 0) + 1);
  }

  const queue = Array.from(nodeIds)
    .filter((hash) => (indegree.get(hash) ?? 0) === 0)
    .sort((left, right) => left.localeCompare(right));
  const topologicalOrder: string[] = [];

  while (queue.length > 0) {
    const hash = queue.shift();
    if (!hash) break;

    topologicalOrder.push(hash);

    const children = [...(childrenByParent.get(hash) ?? [])].sort((left, right) => left.localeCompare(right));
    for (const childHash of children) {
      const nextIndegree = (indegree.get(childHash) ?? 0) - 1;
      indegree.set(childHash, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(childHash);
        queue.sort((left, right) => left.localeCompare(right));
      }
    }
  }

  for (const hash of Array.from(nodeIds).sort((left, right) => left.localeCompare(right))) {
    if (!topologicalOrder.includes(hash)) {
      topologicalOrder.push(hash);
    }
  }

  const depthByHash = new Map<string, number>();
  for (const hash of topologicalOrder) {
    const parents = parentsByChild.get(hash) ?? [];
    const depth = parents.length === 0
      ? 0
      : Math.max(...parents.map((parentHash) => (depthByHash.get(parentHash) ?? 0) + 1));
    depthByHash.set(hash, depth);
  }

  const layers = new Map<number, string[]>();
  const orderIndexByHash = new Map<string, number>();
  for (const hash of topologicalOrder) {
    const depth = depthByHash.get(hash) ?? 0;
    const layer = layers.get(depth) ?? [];
    layer.push(hash);
    layers.set(depth, layer);
  }

  const sortedDepths = Array.from(layers.keys()).sort((left, right) => left - right);
  for (const depth of sortedDepths) {
    const layer = layers.get(depth) ?? [];
    layer.sort((leftHash, rightHash) => {
      const leftParents = parentsByChild.get(leftHash) ?? [];
      const rightParents = parentsByChild.get(rightHash) ?? [];
      const leftAverageParent = leftParents.length === 0
        ? Number.NEGATIVE_INFINITY
        : leftParents.reduce((sum, parentHash) => sum + (orderIndexByHash.get(parentHash) ?? 0), 0) / leftParents.length;
      const rightAverageParent = rightParents.length === 0
        ? Number.NEGATIVE_INFINITY
        : rightParents.reduce((sum, parentHash) => sum + (orderIndexByHash.get(parentHash) ?? 0), 0) / rightParents.length;

      if (leftAverageParent !== rightAverageParent) {
        return leftAverageParent - rightAverageParent;
      }

      const leftTagCount = tagsByHash.get(leftHash)?.length ?? 0;
      const rightTagCount = tagsByHash.get(rightHash)?.length ?? 0;
      if (leftTagCount !== rightTagCount) {
        return rightTagCount - leftTagCount;
      }

      return leftHash.localeCompare(rightHash);
    });

    for (const [index, hash] of layer.entries()) {
      orderIndexByHash.set(hash, index);
    }
  }

  const positionedNodes = nodes.map((node) => ({
    ...node,
    x: paddingX + (depthByHash.get(node.hash) ?? 0) * columnGap,
    y: paddingY + (orderIndexByHash.get(node.hash) ?? 0) * rowGap,
    tags: tagsByHash.get(node.hash) ?? [],
  }));
  const nodePositionByHash = new Map(positionedNodes.map((node) => [node.hash, node] as const));

  const positionedEdges = edges
    .map((edge) => {
      const parentNode = nodePositionByHash.get(edge.parent_hash);
      const childNode = nodePositionByHash.get(edge.child_hash);
      if (!parentNode || !childNode) return null;

      return {
        ...edge,
        parentX: parentNode.x + nodeWidth,
        parentY: parentNode.y + (nodeHeight / 2),
        childX: childNode.x,
        childY: childNode.y + (nodeHeight / 2),
      };
    })
    .filter((edge): edge is PositionedEdge => edge !== null);

  const maxDepth = Math.max(...sortedDepths);
  const maxLayerSize = Math.max(...Array.from(layers.values()).map((layer) => layer.length));

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    width: paddingX * 2 + nodeWidth + maxDepth * columnGap + 280,
    height: paddingY * 2 + nodeHeight + Math.max(maxLayerSize - 1, 0) * rowGap,
    rootCount: Array.from(nodeIds).filter((hash) => (parentsByChild.get(hash) ?? []).length === 0).length,
  };
}

function shortHash(hash: string): string {
  return hash.slice(0, 10);
}

function colorFromText(text: string): string {
  let hash = 0;
  for (const character of text) {
    hash = ((hash << 5) - hash) + character.charCodeAt(0);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue} 65% 92%)`;
}

function commitNodeFill(node: PositionedNode, isHovered: boolean): string {
  if (isHovered) return '#bfdbfe';
  return node.tags.length > 0 ? '#dbeafe' : '#ffffff';
}

function commitNodeStroke(node: PositionedNode, isHovered: boolean): string {
  if (isHovered) return '#1d4ed8';
  return node.tags.length > 0 ? '#3b82f6' : '#ced4da';
}

function branchTagStroke(isHovered: boolean): string {
  return isHovered ? '#1d4ed8' : '#adb5bd';
}

function buildCommitRelations(edges: CommitGraphEdgePublic[]): CommitRelations {
  const parentHashesByChild = new Map<string, string[]>();
  const childHashesByParent = new Map<string, string[]>();

  for (const edge of edges) {
    const parentHashes = parentHashesByChild.get(edge.child_hash) ?? [];
    parentHashes.push(edge.parent_hash);
    parentHashes.sort((left, right) => left.localeCompare(right));
    parentHashesByChild.set(edge.child_hash, parentHashes);

    const childHashes = childHashesByParent.get(edge.parent_hash) ?? [];
    childHashes.push(edge.child_hash);
    childHashes.sort((left, right) => left.localeCompare(right));
    childHashesByParent.set(edge.parent_hash, childHashes);
  }

  return {
    parentHashesByChild,
    childHashesByParent,
  };
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'N/A';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatPermissions(permLvByUserId: LabelBranch['perm_lv_by_user_id']): string {
  const entries = Object.entries(permLvByUserId).sort(([leftId], [rightId]) => leftId.localeCompare(rightId));
  if (entries.length === 0) return 'None';
  return entries.map(([userId, permissionLevel]) => `${userId}: ${permissionLevel}`).join(', ');
}

function formatOperationName(operation: LabelsetOperationMetadata): string {
  return String(operation.op_name);
}

function formatOperationParams(operation: LabelsetOperationMetadata): string {
  const { op_params: operationParams } = operation;

  if (operationParams === null || operationParams === undefined) {
    return 'None';
  }

  if (typeof operationParams === 'string') {
    return operationParams;
  }

  try {
    return JSON.stringify(operationParams, null, 2);
  } catch {
    return String(operationParams);
  }
}

function OperationList({ operations }: { operations: LabelsetOperationMetadata[] }) {
  if (operations.length === 0) {
    return <span className="text-muted">Unavailable</span>;
  }

  return (
    <ul className="list-unstyled d-flex flex-column gap-2 mb-0">
      {operations.map((operation, index) => (
        <li className="border rounded bg-light px-2 py-1" key={`${formatOperationName(operation)}:${index}`}>
          <div className="fw-semibold">{formatOperationName(operation)}</div>
          <pre
            className="mb-0 mt-1 font-monospace small"
            style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          >
            {formatOperationParams(operation)}
          </pre>
        </li>
      ))}
    </ul>
  );
}

function mergeCommitMetadata(branches: LabelBranch[], commits: LabelCommit[]): LabelCommit[] {
  const commitsByHash = new Map<string, LabelCommit>();

  for (const commit of commits) {
    commitsByHash.set(commit.hash, commit);
  }

  for (const branch of branches) {
    commitsByHash.set(branch.head.hash, branch.head);
    if (branch.checkpoint) {
      commitsByHash.set(branch.checkpoint.hash, branch.checkpoint);
    }
  }

  return Array.from(commitsByHash.values());
}

function tooltipRowsForItem(hoveredItem: HoveredGraphItem): Array<{ label: string; value: React.ReactNode }> {
  if (!hoveredItem) return [];

  if (hoveredItem.kind === 'branch') {
    const { branch } = hoveredItem;

    return [
      { label: 'Branch ID', value: branch.id },
      { label: 'Head', value: <span className="font-monospace">{branch.head_hash}</span> },
      {
        label: 'Checkpoint',
        value: branch.checkpoint_hash
          ? <span className="font-monospace">{branch.checkpoint_hash}</span>
          : <span className="text-muted">None</span>,
      },
      { label: 'Last Edit', value: formatTimestamp(branch.last_edit_at) },
    ];
  }

  const { node, commit, parentHashes, childHashes } = hoveredItem;

  return [
    { label: 'Group ID', value: node.group_id },
    {
      label: 'Branches',
      value: node.tags.length > 0 ? node.tags.join(', ') : <span className="text-muted">None</span>,
    },
    { label: commit?.operations.length === 1 ? 'Operation' : 'Operations', value: <OperationList operations={commit?.operations ?? []} /> },
    { label: 'Parents', value: <HashList hashes={parentHashes} /> },
    { label: 'Children', value: <HashList hashes={childHashes} /> },
  ];
}

function DetailList({ rows }: { rows: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="row g-2 mb-0 small">
      {rows.map((row) => (
        <Fragment key={row.label}>
          <dt className="col-sm-3 text-muted">{row.label}</dt>
          <dd className="col-sm-9 mb-0">{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function HashList({ hashes }: { hashes: string[] }) {
  if (hashes.length === 0) {
    return <span className="text-muted">None</span>;
  }

  return (
    <div className="d-flex flex-wrap gap-2">
      {hashes.map((hash) => (
        <span className="badge text-bg-light border font-monospace" key={hash} title={hash}>
          {shortHash(hash)}
        </span>
      ))}
    </div>
  );
}

function HoverDetailsPanel() {
  return (
    <div className="border rounded p-3 bg-light small text-muted">
      Hover over a commit node or branch tag to inspect its details.
    </div>
  );
}

function HoverTooltip({ hoveredItem, position }: { hoveredItem: HoveredGraphItem; position: TooltipPosition | null }) {
  if (!hoveredItem || !position) return null;

  const title = hoveredItem.kind === 'branch' ? hoveredItem.branch.name : shortHash(hoveredItem.node.hash);
  const badge = hoveredItem.kind === 'branch' ? 'Branch' : 'Commit';
  const accentFill = hoveredItem.kind === 'branch'
    ? colorFromText(hoveredItem.branch.name)
    : commitNodeFill(hoveredItem.node, true);
  const accentStroke = hoveredItem.kind === 'branch'
    ? branchTagStroke(true)
    : commitNodeStroke(hoveredItem.node, true);

  return (
    <div
      className="position-fixed border rounded shadow-sm bg-white p-3"
      style={{
        left: position.x + 16,
        top: position.y + 16,
        maxWidth: 450,
        pointerEvents: 'none',
        zIndex: 1080,
      }}
    >
      <div className="d-flex align-items-center justify-content-between gap-3 mb-2">
        <div
          className="fw-semibold text-break rounded-pill px-3 py-1"
          style={{
            background: accentFill,
            border: `1px solid ${accentStroke}`,
          }}
        >
          {title}
        </div>
        <span
          className="badge rounded-pill"
          style={{
            border: `1px solid ${accentStroke}`,
            background: accentStroke,
            color: '#ffffff',
          }}
        >
          {badge}
        </span>
      </div>
      <DetailList rows={tooltipRowsForItem(hoveredItem)} />
    </div>
  );
}

function GraphCanvas({
  nodes,
  edges,
  width,
  height,
  branchByName,
  commitByHash,
  commitRelations,
}: GraphLayout & {
  branchByName: Map<string, LabelBranch>;
  commitByHash: Map<string, LabelCommit>;
  commitRelations: CommitRelations;
}) {
  const nodeWidth = 128;
  const nodeHeight = 36;
  const tagHeight = 20;
  const tagGap = 8;
  const [hoveredItem, setHoveredItem] = useState<HoveredGraphItem>(null);
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null);
  const hoveredCommitHash = hoveredItem?.kind === 'branch'
    ? hoveredItem.branch.head_hash
    : hoveredItem?.kind === 'commit'
      ? hoveredItem.node.hash
      : null;
  const hoveredBranchName = hoveredItem?.kind === 'branch' ? hoveredItem.branch.name : null;

  function handleHoverItem(item: HoveredGraphItem, event: React.PointerEvent<SVGGElement>) {
    setHoveredItem(item);
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  }

  function handleHoverMove(event: React.PointerEvent<SVGGElement>) {
    setTooltipPosition({ x: event.clientX, y: event.clientY });
  }

  function clearHover() {
    setHoveredItem(null);
    setTooltipPosition(null);
  }

  function clearTooltip() {
    setTooltipPosition(null);
  }

  return (
    <div className="d-flex flex-column gap-3" onPointerLeave={clearHover}>
      <HoverDetailsPanel />

      <div className="border rounded overflow-auto" onPointerLeave={clearTooltip} style={{ background: '#fafafa' }}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Repository commit graph"
        >
          <defs>
            <marker
              id="commit-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="#adb5bd" />
            </marker>
          </defs>

          {edges.map((edge) => {
            const controlOffset = Math.max((edge.childX - edge.parentX) / 2, 36);
            const path = [
              `M ${edge.parentX} ${edge.parentY}`,
              `C ${edge.parentX + controlOffset} ${edge.parentY},`,
              `${edge.childX - controlOffset} ${edge.childY},`,
              `${edge.childX} ${edge.childY}`,
            ].join(' ');

            return (
              <path
                key={`${edge.parent_hash}->${edge.child_hash}`}
                d={path}
                fill="none"
                stroke="#adb5bd"
                strokeWidth="2"
                markerEnd="url(#commit-arrow)"
              />
            );
          })}

          {nodes.map((node) => (
            <g key={node.hash}>
              <g
                onPointerEnter={(event) => handleHoverItem({
                  kind: 'commit',
                  node,
                  commit: commitByHash.get(node.hash) ?? null,
                  parentHashes: commitRelations.parentHashesByChild.get(node.hash) ?? [],
                  childHashes: commitRelations.childHashesByParent.get(node.hash) ?? [],
                }, event)}
                onPointerMove={handleHoverMove}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={node.x}
                  y={node.y}
                  width={nodeWidth}
                  height={nodeHeight}
                  rx="10"
                  fill={commitNodeFill(node, hoveredCommitHash === node.hash)}
                  stroke={commitNodeStroke(node, hoveredCommitHash === node.hash)}
                  strokeWidth={hoveredCommitHash === node.hash ? '2.5' : node.tags.length > 0 ? '2' : '1.5'}
                />
                <text
                  x={node.x + 12}
                  y={node.y + 22}
                  fontSize="13"
                  fontFamily="monospace"
                  fill="#212529"
                  pointerEvents="none"
                >
                  {shortHash(node.hash)}
                </text>
              </g>

              {node.tags.map((tag, index) => {
                const tagX = node.x + nodeWidth + 12;
                const tagY = node.y + index * (tagHeight + tagGap);
                const tagWidth = Math.max(56, (tag.length * 8) + 18);
                const branch = branchByName.get(tag);
                const isHoveredBranch = hoveredBranchName === tag;

                return (
                  <g
                    key={`${node.hash}:${tag}`}
                    onPointerEnter={(event) => handleHoverItem(branch ? { kind: 'branch', branch } : null, event)}
                    onPointerMove={handleHoverMove}
                    style={{ cursor: branch ? 'pointer' : 'default' }}
                  >
                    <rect
                      x={tagX}
                      y={tagY}
                      width={tagWidth}
                      height={tagHeight}
                      rx="10"
                      fill={colorFromText(tag)}
                      stroke={branchTagStroke(isHoveredBranch)}
                      strokeWidth={isHoveredBranch ? '2' : '1'}
                    />
                    <text
                      x={tagX + 10}
                      y={tagY + 14}
                      fontSize="12"
                      fill="#212529"
                      pointerEvents="none"
                    >
                      {tag}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
        </svg>

        <HoverTooltip hoveredItem={hoveredItem} position={tooltipPosition} />
      </div>
    </div>
  );
}

export async function loader({ request, params }: Route.LoaderArgs) {
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

  const groupId = parseGroupId(params.groupId);
  if (groupId == null) {
    return redirect('/label/repos');
  }

  const [groupRes, branchesRes] = await Promise.all([
    readGroupLabelGroupsIdGet({ auth: token.access_token, path: { id: groupId } }),
    listBranchesLabelRepoBranchesGet({ auth: token.access_token, query: { group_id: groupId } }),
  ]);
  if (!groupRes.data || groupRes.error) {
    session.flash('error', `Failed to open repository (group id=${params.groupId}).`);
    return redirectAndCommit('/label/repos', session);
  }

  const branches = branchesRes.data ?? [];
  const graphResults = await Promise.all(branches.map(async (branch) => {
    const res = await readLabelsetGraphEditorLabelsetGraphGet({
      auth: token.access_token,
      query: { label_branch_id: branch.id },
    });

    return {
      branch,
      graphs: normalizeCommitGraphs(res.data),
      error: res.error,
    };
  }));

  const merged = mergeRepositoryGraphs(
    branches,
    graphResults.flatMap((result) => result.graphs),
  );
  const commitResults = await Promise.all(merged.nodes.map(async (node) => {
    const res = await readCommitLabelRepoCommitsGroupIdCommitHashGet({
      auth: token.access_token,
      path: {
        group_id: groupId,
        commit_hash: node.hash,
      },
    });

    return {
      hash: node.hash,
      ...res,
    };
  }));
  const commitErrorMessages = commitResults
    .filter((result) => result.error)
    .map((result) => `Failed to load commit ${shortHash(result.hash)}`);
  const commitsRes = {
    data: commitResults.flatMap((result) => result.data ? [result.data] : []),
    error: commitErrorMessages.length > 0 ? commitErrorMessages.join('\n') : undefined,
  };
  const graphErrorMessages = graphResults
    .filter((result) => result.error)
    .map((result) => `Failed to load graph for branch ${result.branch.name}`);
  const loaderErrors = [
    branchesRes.error,
    commitsRes.error,
    ...(graphErrorMessages.length > 0 ? [graphErrorMessages.join('\n')] : []),
  ].filter((value): value is string => value != null && value !== '');
  const loaderError = loaderErrors.length > 0 ? loaderErrors.join('\n') : undefined;

  return {
    group: groupRes.data,
    branches,
    commits: mergeCommitMetadata(branches, commitsRes.data),
    mergedGraph: merged,
    loaderError,
  };
}

function CommitsView({ group, branches, commits, mergedGraph }: {
  group: LabelGroup;
  branches: LabelBranch[];
  commits: LabelCommit[];
  mergedGraph: ReturnType<typeof mergeRepositoryGraphs>;
}) {
  const layout = buildGraphLayout(mergedGraph.nodes, mergedGraph.edges, mergedGraph.tagsByHash);
  const branchByName = useMemo(() => new Map(branches.map((branch) => [branch.name, branch] as const)), [branches]);
  const commitByHash = useMemo(() => new Map(commits.map((commit) => [commit.hash, commit] as const)), [commits]);
  const commitRelations = useMemo(() => buildCommitRelations(mergedGraph.edges), [mergedGraph.edges]);

  if (branches.length === 0) {
    return <div className="text-muted">No branches exist in this repository yet.</div>;
  }

  return (
    <>
      <div className="d-flex flex-wrap gap-3 mb-3 small text-muted">
        <div><strong>{branches.length}</strong> branches</div>
        <div><strong>{mergedGraph.nodes.length}</strong> commits</div>
        <div><strong>{mergedGraph.edges.length}</strong> edges</div>
        <div><strong>{layout.rootCount}</strong> roots</div>
      </div>

      <GraphCanvas
        {...layout}
        branchByName={branchByName}
        commitByHash={commitByHash}
        commitRelations={commitRelations}
      />
    </>
  );
}

export function HydrateFallback() {
  return <div>Loading repository commits...</div>;
}

export default function RepositoryCommits({ loaderData }: Route.ComponentProps) {
  const { group, branches, commits, mergedGraph, loaderError } = loaderData;

  return createPageContent({
    title: `Commits - ${String(group.name)}`,
    header: <Breadcrumb className="fs-5">
      <Breadcrumb.Item href="/label/repos">Repositories</Breadcrumb.Item>
      <Breadcrumb.Item active>{String(group.name)}</Breadcrumb.Item>
    </Breadcrumb>,
    main: <CommitsView group={group} branches={branches} commits={commits} mergedGraph={mergedGraph} />,
    alerts: loaderError ? { error: loaderError } : undefined,
  });
}