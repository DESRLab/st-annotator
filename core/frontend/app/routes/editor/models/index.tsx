/**
 * Implements the runtime state models of the annotation editor.
 *
 * @module app/editor
 */

import * as THREE from "three";
import { z } from "zod";

import type { WorkType as WorkTypePublic } from "sta/client";
import {
  OptionalDecimalVector3Data,
  PartialSTBounds,
  Vector3Data,
  type Hashable,
  Timestamp,
} from "sta/common";

function hashById(id: number): string {
  return JSON.stringify({ id });
}

function makeOptionalDecimalVector3(
  x: number | string | null,
  y: number | string | null,
  z: number | string | null,
): OptionalDecimalVector3Data {
  const values = OptionalDecimalVector3Data.PLAIN_SCHEMA.parse({
    x: x == null ? null : String(x),
    y: y == null ? null : String(y),
    z: z == null ? null : String(z),
  });
  return OptionalDecimalVector3Data.create(values);
}

function makeBounds(data: Record<string, any>): PartialSTBounds {
  if (data.st_bounds != null) {
    return PartialSTBounds.fromJSON(data.st_bounds);
  }

  return PartialSTBounds.create({
    min_coords: makeOptionalDecimalVector3(data.min_x, data.min_y, data.min_z),
    max_coords: makeOptionalDecimalVector3(data.max_x, data.max_y, data.max_z),
    min_timestamp:
      data.min_timestamp == null ? null : new Timestamp(data.min_timestamp),
    max_timestamp:
      data.max_timestamp == null ? null : new Timestamp(data.max_timestamp),
  });
}

function makeName(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
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
  return "";
}

export const WorkType = Object.freeze({
  ANNOTATE: "annotate",
  REVIEW: "review",
});

/**
 * The fully resolved values a {@link ProjectConfig} is built from.
 */
export interface ProjectConfigValues {
  frame_cache_size: number;
  init_camera_position: Vector3Data;
  init_camera_target: Vector3Data;
  extensionOptions?: Record<string, unknown>;
}

/**
 * Runtime adapter for the generated `ProjectConfigPublic` payload.
 */
export class ProjectConfig {
  static readonly PLAIN_SCHEMA = z
    .object({
      frame_cache_size: z.number().int().min(1),
      init_camera_position: Vector3Data.SCHEMA.optional().default(
        Vector3Data.create({ x: 0, y: 0, z: 0 }),
      ),
      init_camera_target: Vector3Data.SCHEMA.optional().default(
        Vector3Data.create({ x: 0, y: 0, z: 0 }),
      ),
    })
    .passthrough();

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) => {
    const {
      frame_cache_size,
      init_camera_position,
      init_camera_target,
      ...extensionOptions
    } = data;
    return this.create({
      frame_cache_size,
      init_camera_position,
      init_camera_target,
      extensionOptions,
    });
  });

  readonly frame_cache_size: number;
  readonly init_camera_position: Vector3Data;
  readonly init_camera_target: Vector3Data;
  readonly extensionOptions: Record<string, unknown>;

  constructor(values: ProjectConfigValues) {
    this.frame_cache_size = values.frame_cache_size;
    this.init_camera_position = values.init_camera_position;
    this.init_camera_target = values.init_camera_target;
    this.extensionOptions = values.extensionOptions ?? {};
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: ProjectConfigValues): ProjectConfig {
    return Object.freeze(new ProjectConfig(values));
  }

  static fromJSON(obj: unknown): ProjectConfig {
    return this.SCHEMA.parse(obj);
  }
}

/**
 * The fully resolved values a {@link SourceGroupState} is built from.
 */
export interface SourceGroupStateValues {
  id: number;
  name: string;
  description: string;
}

/**
 * Runtime adapter for the generated `SourceGroupPublic` payload.
 */
export class SourceGroupState implements Hashable {
  static readonly PLAIN_SCHEMA = z.object({
    id: z.number().int(),
    name: z.unknown().transform(makeName),
    description: z.string().optional().default(""),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly id: number;
  readonly name: string;
  readonly description: string;

  constructor(values: SourceGroupStateValues) {
    this.id = values.id;
    this.name = values.name;
    this.description = values.description;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: SourceGroupStateValues): SourceGroupState {
    return Object.freeze(new SourceGroupState(values));
  }

  static fromJSON(obj: unknown): SourceGroupState {
    return this.SCHEMA.parse(obj);
  }

  hash(): string {
    return hashById(this.id);
  }

  /**
   * Tests whether two objects are equal to each other;
   * that is, whether they have the same unique identifier.
   */
  equals(other: object): boolean {
    return other instanceof SourceGroupState && this.id === other.id;
  }
}

/**
 * The fully resolved values a {@link LabelGroupState} is built from.
 */
export interface LabelGroupStateValues {
  id: number;
  name: string;
  description: string;
}

/**
 * Runtime adapter for the generated `LabelGroupPublic` payload.
 */
export class LabelGroupState {
  static readonly PLAIN_SCHEMA = z.object({
    id: z.number().int(),
    name: z.unknown().transform(makeName),
    description: z.string().optional().default(""),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly id: number;
  readonly name: string;
  readonly description: string;

  constructor(values: LabelGroupStateValues) {
    this.id = values.id;
    this.name = values.name;
    this.description = values.description;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: LabelGroupStateValues): LabelGroupState {
    return Object.freeze(new LabelGroupState(values));
  }

  static fromJSON(obj: unknown): LabelGroupState {
    return this.SCHEMA.parse(obj);
  }

  hash(): string {
    return hashById(this.id);
  }
}

/**
 * The fully resolved values a {@link TaskState} is built from.
 */
export interface TaskStateValues {
  id: number;
  project_id?: number;
  parent_id: number | null;
  name: string;
  description: string;
  deadline: Date | null;
  children: readonly unknown[];
  supervisor_ids: readonly number[];
  annotator_ids_by_quality_rank: Readonly<Record<string, number>>;
}

/**
 * Runtime adapter for the generated `TaskPublic` payload.
 */
export class TaskState {
  static readonly PLAIN_SCHEMA = z.object({
    id: z.number().int(),
    project_id: z.number().int().optional(),
    parent_id: z.number().int().nullable().optional().default(null),
    name: z.unknown().transform(makeName),
    description: z.string().optional().default(""),
    deadline: z
      .string()
      .nullable()
      .optional()
      .transform((value) => (value == null ? null : new Date(value))),
    children: z.array(z.unknown()).optional().default([]),
    supervisor_ids: z.array(z.number().int()).optional().default([]),
    annotator_ids_by_quality_rank: z
      .record(z.string(), z.number().int())
      .optional()
      .default({}),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly id: number;
  readonly project_id: number | undefined;
  readonly parent_id: number | null;
  readonly name: string;
  readonly description: string;
  readonly deadline: Date | null;
  readonly children: readonly unknown[];
  readonly supervisor_ids: readonly number[];
  readonly annotator_ids_by_quality_rank: Readonly<Record<string, number>>;

  constructor(values: TaskStateValues) {
    this.id = values.id;
    this.project_id = values.project_id;
    this.parent_id = values.parent_id;
    this.name = values.name;
    this.description = values.description;
    this.deadline = values.deadline;
    this.children = values.children;
    this.supervisor_ids = values.supervisor_ids;
    this.annotator_ids_by_quality_rank = values.annotator_ids_by_quality_rank;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: TaskStateValues): TaskState {
    return Object.freeze(new TaskState(values));
  }

  static fromJSON(obj: Record<string, any>): TaskState {
    const data = { ...obj };
    if (data.supervisor_ids == null && Array.isArray(data.supervisors)) {
      data.supervisor_ids = data.supervisors.map((account: any) => account.id);
    }
    if (
      data.annotator_ids_by_quality_rank == null &&
      Array.isArray(data.annotators)
    ) {
      data.annotator_ids_by_quality_rank = Object.fromEntries(
        data.annotators.map((account: any, index: number) => [
          index,
          account.id,
        ]),
      );
    }

    return this.SCHEMA.parse(data);
  }

  get annotatorIdsFromBestToWorst(): number[] {
    return Object.entries(this.annotator_ids_by_quality_rank)
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([, id]) => id);
  }

  hash(): string {
    return hashById(this.id);
  }
}

/**
 * The fully resolved values a {@link FrameState} is built from.
 */
export interface FrameStateValues {
  id: number;
  task: TaskState;
  account_id: number;
  source_group_id: number;
  label_branch_id: number;
  st_bounds: PartialSTBounds;
  work_type: WorkTypePublic;
  last_viewed_at: Timestamp | null;
  is_complete: boolean;
}

/**
 * Runtime adapter for the generated `FramePublicWithParents` payload.
 */
export class FrameState {
  static readonly PLAIN_SCHEMA = z.object({
    id: z.number().int(),
    task: TaskState.SCHEMA,
    account_id: z.number().int(),
    source_group_id: z.number().int(),
    label_branch_id: z.number().int(),
    st_bounds: z.instanceof(PartialSTBounds),
    work_type: z.nativeEnum(WorkType),
    last_viewed_at: z.instanceof(Timestamp).nullable(),
    is_complete: z.boolean(),
  });

  // The editor supplies an existing TaskState; frame-list responses omit task details.
  static readonly EDITOR_SCHEMA = this.PLAIN_SCHEMA.extend({
    task: z.instanceof(TaskState),
  });

  readonly id: number;
  readonly task: TaskState;
  readonly account_id: number;
  readonly source_group_id: number;
  readonly label_branch_id: number;
  readonly st_bounds: PartialSTBounds;
  readonly work_type: WorkTypePublic;
  readonly last_viewed_at: Timestamp | null;
  readonly is_complete: boolean;

  constructor(values: FrameStateValues) {
    this.id = values.id;
    this.task = values.task;
    this.account_id = values.account_id;
    this.source_group_id = values.source_group_id;
    this.label_branch_id = values.label_branch_id;
    this.st_bounds = values.st_bounds;
    this.work_type = values.work_type;
    this.last_viewed_at = values.last_viewed_at;
    this.is_complete = values.is_complete;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   *
   * Instances are shared between every navigator that loads the same frame
   * list, so they are never mutated after construction.
   */
  static create(values: FrameStateValues): FrameState {
    return Object.freeze(new FrameState(values));
  }

  static fromJSON(obj: Record<string, any>, task?: TaskState): FrameState {
    const data = { ...obj };
    data.task =
      task ??
      TaskState.fromJSON(
        data.task ?? { id: data.task_id, name: "", project_id: 0 },
      );
    data.st_bounds = makeBounds(data);
    data.last_viewed_at =
      data.last_viewed_at == null ? null : new Timestamp(data.last_viewed_at);
    data.source_group_id = data.source_group_id ?? data.source_group?.id ?? 0;
    data.label_branch_id = data.label_branch_id ?? data.label_branch?.id ?? 0;
    data.is_complete = data.is_complete ?? false;

    return this.create(this.EDITOR_SCHEMA.parse(data));
  }

  get minDate(): Date | null {
    return this.st_bounds.min_timestamp?.getDate() ?? null;
  }
  get maxDate(): Date | null {
    return this.st_bounds.max_timestamp?.getDate() ?? null;
  }
  get lastViewedAtDate(): Date | null {
    return this.last_viewed_at?.getDate() ?? null;
  }

  hash(): string {
    return hashById(this.id);
  }
}

/**
 * Runtime equivalent of the generated BranchPermissionLevel union.
 */
export const BranchPermissionLevel = Object.freeze({
  NONE: 0,
  READ: 1,
  WRITE: 2,
  WRITE_ELEVATED: 3,
  ADMIN: 4,
});

/**
 * The fully resolved values a {@link LabelsetCommitState} is built from.
 */
export interface LabelsetCommitStateValues {
  group: LabelGroupState;
  hash_: string;
  author_id: number;
  timestamp: Timestamp;
  op_config: { op_name: string; op_params?: unknown };
}

/**
 * Runtime adapter for the generated `LabelsetCommitPublic` payload.
 */
export class LabelsetCommitState {
  static readonly PLAIN_SCHEMA = z.object({
    group: LabelGroupState.SCHEMA,
    hash_: z.string(),
    author_id: z.number().int().optional().default(0),
    timestamp: z
      .instanceof(Timestamp)
      .optional()
      .default(() => new Timestamp()),
    op_config: z
      .object({
        op_name: z.string(),
        op_params: z.unknown().optional(),
      })
      .optional()
      .default({ op_name: "unknown", op_params: null }),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly group: LabelGroupState;
  readonly hash_: string;
  readonly author_id: number;
  readonly timestamp: Timestamp;
  readonly op_config: { op_name: string; op_params?: unknown };

  constructor(values: LabelsetCommitStateValues) {
    this.group = values.group;
    this.hash_ = values.hash_;
    this.author_id = values.author_id;
    this.timestamp = values.timestamp;
    this.op_config = values.op_config;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: LabelsetCommitStateValues): LabelsetCommitState {
    return Object.freeze(new LabelsetCommitState(values));
  }

  static fromJSON(obj: Record<string, any>): LabelsetCommitState {
    const operation = obj.operations?.at?.(-1) ?? obj.op_config;
    const opConfig = obj.op_config ?? {};
    const normalizedOpConfig: { op_name: string; op_params: unknown } = {
      op_name: String(opConfig.op_name ?? operation?.op_name ?? "unknown"),
      op_params: opConfig.op_params ?? operation?.op_params ?? null,
    };
    const data = {
      ...obj,
      hash_: obj.hash_ ?? obj.hash,
      group: LabelGroupState.fromJSON(obj.group),
      author_id: obj.author_id ?? operation?.author_id ?? 0,
      timestamp:
        obj.timestamp == null
          ? new Timestamp(operation?.timestamp)
          : new Timestamp(obj.timestamp),
      op_config: normalizedOpConfig,
    };

    return this.SCHEMA.parse(data);
  }

  hash(): string {
    return JSON.stringify({ hash: this.hash_ });
  }
}

/**
 * The fully resolved values a {@link LabelsetBranchState} is built from.
 */
export interface LabelsetBranchStateValues {
  id: number;
  group: LabelGroupState;
  name: string;
  head: LabelsetCommitState;
  checkpoint: LabelsetCommitState;
}

/**
 * Runtime adapter for the generated `LabelsetBranchPublic` payload.
 */
export class LabelsetBranchState {
  static readonly PLAIN_SCHEMA = z.object({
    id: z.number().int(),
    group: LabelGroupState.SCHEMA,
    name: z.string(),
    head: LabelsetCommitState.SCHEMA,
    checkpoint: LabelsetCommitState.SCHEMA,
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly id: number;
  readonly group: LabelGroupState;
  readonly name: string;
  readonly head: LabelsetCommitState;
  readonly checkpoint: LabelsetCommitState;

  constructor(values: LabelsetBranchStateValues) {
    this.id = values.id;
    this.group = values.group;
    this.name = values.name;
    this.head = values.head;
    this.checkpoint = values.checkpoint;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: LabelsetBranchStateValues): LabelsetBranchState {
    return Object.freeze(new LabelsetBranchState(values));
  }

  static fromJSON(obj: Record<string, any>): LabelsetBranchState {
    const head = LabelsetCommitState.fromJSON(obj.head);
    return this.SCHEMA.parse({
      ...obj,
      group: LabelGroupState.fromJSON(obj.group),
      head: head,
      checkpoint:
        obj.checkpoint == null
          ? head
          : LabelsetCommitState.fromJSON(obj.checkpoint),
    });
  }

  hash(): string {
    return hashById(this.id);
  }
}

/**
 * The fully resolved values a {@link CommitGraphState} is built from.
 */
export interface CommitGraphStateValues {
  node_hashes: readonly string[];
  edge_hashes: readonly (readonly [string, string])[];
  commits: readonly LabelsetCommitState[];
}

/**
 * Runtime adapter for the generated `CommitGraphPublic` payload.
 */
export class CommitGraphState {
  static readonly PLAIN_SCHEMA = z.object({
    node_hashes: z.array(z.string()),
    edge_hashes: z.array(z.tuple([z.string(), z.string()])),
    commits: z.array(LabelsetCommitState.SCHEMA).optional().default([]),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly node_hashes: readonly string[];
  readonly edge_hashes: readonly (readonly [string, string])[];
  readonly commits: readonly LabelsetCommitState[];

  constructor(values: CommitGraphStateValues) {
    this.node_hashes = values.node_hashes;
    this.edge_hashes = values.edge_hashes;
    this.commits = values.commits;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   */
  static create(values: CommitGraphStateValues): CommitGraphState {
    return Object.freeze(new CommitGraphState(values));
  }

  static fromJSON(obj: Record<string, any>): CommitGraphState {
    return this.SCHEMA.parse({
      ...obj,
      node_hashes:
        obj.node_hashes ??
        obj.nodes?.map((node: Record<string, any>) => node.hash) ??
        [],
      edge_hashes:
        obj.edge_hashes ??
        obj.edges?.map(
          (edge: Record<string, any>) =>
            [edge.parent_hash, edge.child_hash] as const,
        ) ??
        [],
      commits: (obj.commits ?? []).map((commit: Record<string, any>) =>
        LabelsetCommitState.fromJSON(commit),
      ),
    });
  }
}

/**
 * The fully resolved values an {@link ObjectClassState} is built from.
 */
export interface ObjectClassStateValues {
  id: number;
  name: string;
  description: string;
  color: THREE.Color;
  is_deleted: boolean;
}

/**
 * Runtime adapter for the generated `ObjectClassPublic` payload.
 *
 * Plugins extend this class to carry their own per-class options, so the
 * instance is frozen by {@link ObjectClassState.create} rather than by the
 * constructor: a frozen object would reject the subclass's own field
 * assignments.
 */
export class ObjectClassState {
  static readonly PLAIN_SCHEMA = z.object({
    id: z.number().int(),
    name: z.unknown().transform(makeName),
    description: z.string().optional().default(""),
    color: z
      .union([z.string(), z.instanceof(THREE.Color)])
      .optional()
      .transform((color) =>
        color instanceof THREE.Color
          ? color
          : new THREE.Color(color ?? "#ffffff"),
      ),
    is_deleted: z.boolean().optional().default(false),
  });

  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly color: THREE.Color;
  readonly is_deleted: boolean;

  constructor(values: ObjectClassStateValues) {
    this.id = values.id;
    this.name = values.name;
    this.description = values.description;
    this.color = values.color;
    this.is_deleted = values.is_deleted;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   *
   * The values and the resulting instance are those of the constructing class,
   * so a plugin subclass that adds fields declares them in its own constructor
   * and needs no `create` of its own.
   */
  static create<Values, Instance extends ObjectClassState>(
    this: new (values: Values) => Instance,
    values: Values,
  ): Instance {
    return Object.freeze(new this(values));
  }

  static fromJSON(obj: Record<string, any>): ObjectClassState {
    const color =
      obj.color ??
      (obj.color_rgb == null
        ? undefined
        : `#${Number(obj.color_rgb).toString(16).padStart(6, "0")}`);
    return this.SCHEMA.parse({ ...obj, color });
  }

  hash(): string {
    return hashById(this.id);
  }
}

/**
 * The fully resolved values an {@link ObjectClassSelectionState} is built from.
 */
export interface ObjectClassSelectionStateValues {
  id: number;
  name: string;
  description: string;
  groups: readonly LabelGroupState[];
  objclasses: readonly ObjectClassState[];
}

/**
 * Runtime adapter for the generated `ObjectClassSelectionPublic` payload.
 *
 * Extended by each plugin whose selection carries type-specific levels; see
 * {@link ObjectClassState} for why the freeze happens in `create`.
 */
export class ObjectClassSelectionState {
  static buildPlainSchema<Classes extends z.ZodTypeAny>(
    objclassesSchema: Classes,
  ) {
    return z.object({
      id: z.number().int(),
      name: z.unknown().transform(makeName),
      description: z.string().optional().default(""),
      groups: z.array(LabelGroupState.SCHEMA).optional().default([]),
      objclasses: z.array(objclassesSchema),
    });
  }

  static readonly PLAIN_SCHEMA = this.buildPlainSchema(ObjectClassState.SCHEMA);
  static readonly SCHEMA = this.PLAIN_SCHEMA.transform((data) =>
    this.create(data),
  );

  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly groups: readonly LabelGroupState[];
  readonly objclasses: readonly ObjectClassState[];

  constructor(values: ObjectClassSelectionStateValues) {
    this.id = values.id;
    this.name = values.name;
    this.description = values.description;
    this.groups = values.groups;
    this.objclasses = values.objclasses;
  }

  /**
   * Creates an immutable instance from fully resolved values.
   *
   * @see {@link ObjectClassState.create} for why this is generic.
   */
  static create<Values, Instance extends ObjectClassSelectionState>(
    this: new (values: Values) => Instance,
    values: Values,
  ): Instance {
    return Object.freeze(new this(values));
  }

  static fromJSON(obj: unknown): ObjectClassSelectionState {
    return this.SCHEMA.parse(obj);
  }

  hash(): string {
    return hashById(this.id);
  }
}
