/**
 * Compile-time drift guard between the editor's runtime `Data` adapters
 * (this directory) and the generated OpenAPI client types (`sta/client`).
 *
 * The checks compile as part of the frontend typecheck: from `core/frontend/`,
 * run `npm run typecheck` (also covered by `scripts/lint.sh`). To pick up
 * backend API changes, first regenerate the client with
 * `npm run openapi-ts` (requires the backend serving its `openapi.json`).
 *
 * Two kinds of checks:
 *
 * 1. `SchemaInputConformance`, for adapters whose `fromJSON` feeds the raw
 *    wire payload straight into `PLAIN_SCHEMA`, the generated payload type
 *    must satisfy the schema's *input* type. This fails typecheck when the
 *    backend renames, drops, or retypes a field the schema requires.
 *
 * 2. `WireFieldConformance`, for adapters whose `fromJSON` pre-transforms
 *    the payload before schema parsing (nested `Data` instances, legacy
 *    field fallbacks), the wire fields it reads are listed explicitly and
 *    checked against the generated payload's keys.
 *
 * If a check fails after regenerating the client (`npm run openapi-ts`),
 * follow the backend change: update the adapter's schema/`fromJSON` and,
 * for the second kind, the matching field list below.
 *
 * The plugin label-element states are guarded separately in
 * `tests/frontend/type-contracts/openapi-conformance-labels.ts` (a cross-plugin
 * check, compiled via `tests/frontend/tsconfig.type-contracts.json`).
 */

import type { z } from "zod";

import type {
  AccountPublicSummary,
  CommitGraphPublic,
  FramePublicWithParents,
  LabelGroupPublic,
  LabelsetBranchPublic,
  LabelsetCommitPublic,
  ObjectClassPublic,
  ObjectClassSelectionPublic,
  ProjectConfig as ProjectConfigPublic,
  SourceGroupPublic,
  TaskPublic,
} from "sta/client";

import type {
  LabelGroupState,
  ObjectClassSelectionState,
  ProjectConfig,
  SourceGroupState,
  TaskState,
} from "./index.tsx";

type AssertExtends<A, B> = [A] extends [B] ? true : false;
type AssertTrue<T extends true> = T;
type AssertKeysOf<T, K extends readonly (keyof T)[]> = K;

/**
 * Adapters parsing the raw wire payload: the generated payload must be
 * accepted by the adapter's plain schema input.
 */
export interface SchemaInputConformance {
  ProjectConfig: AssertTrue<
    AssertExtends<
      ProjectConfigPublic,
      z.input<typeof ProjectConfig.PLAIN_SCHEMA>
    >
  >;
  SourceGroupState: AssertTrue<
    AssertExtends<
      SourceGroupPublic,
      z.input<typeof SourceGroupState.PLAIN_SCHEMA>
    >
  >;
  LabelGroupState: AssertTrue<
    AssertExtends<
      LabelGroupPublic,
      z.input<typeof LabelGroupState.PLAIN_SCHEMA>
    >
  >;
  TaskState: AssertTrue<
    AssertExtends<TaskPublic, z.input<typeof TaskState.PLAIN_SCHEMA>>
  >;
  ObjectClassSelectionState: AssertTrue<
    AssertExtends<
      ObjectClassSelectionPublic,
      z.input<typeof ObjectClassSelectionState.PLAIN_SCHEMA>
    >
  >;
}

/**
 * Adapters pre-transforming the wire payload in `fromJSON`: the wire fields
 * they read must still exist on the generated payload.
 */
export interface WireFieldConformance {
  FrameState: AssertKeysOf<
    FramePublicWithParents,
    [
      "id",
      "task",
      "task_id",
      "account_id",
      "source_group_id",
      "source_group",
      "label_branch_id",
      "label_branch",
      "min_x",
      "min_y",
      "min_z",
      "max_x",
      "max_y",
      "max_z",
      "min_timestamp",
      "max_timestamp",
      "work_type",
      "last_viewed_at",
      "is_complete",
    ]
  >;
  LabelsetCommitState: AssertKeysOf<
    LabelsetCommitPublic,
    ["hash", "group", "operations"]
  >;
  LabelsetBranchState: AssertKeysOf<
    LabelsetBranchPublic,
    ["id", "name", "group", "head", "checkpoint"]
  >;
  CommitGraphState: AssertKeysOf<CommitGraphPublic, ["nodes", "edges"]>;
  ObjectClassState: AssertKeysOf<
    ObjectClassPublic,
    ["id", "name", "description", "color_rgb", "is_deleted"]
  >;
}

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;

/**
 * Accounts embedded in somebody else's payload, a frame's owner and a task's
 * supervisors and annotators, are `AccountPublicSummary`, which declares
 * `id` and `username` only.
 *
 * These are equality checks rather than `AssertExtends` ones: the full
 * `AccountPublic` is structurally wider and would satisfy the latter, so
 * widening an embedded account back to it has to fail here.
 */
export interface AccountProjectionConformance {
  FrameAccountIsTheSummary: AssertTrue<
    Equals<FramePublicWithParents["account"], AccountPublicSummary>
  >;
  TaskSupervisorsAreTheSummary: AssertTrue<
    Equals<TaskPublic["supervisors"][number], AccountPublicSummary>
  >;
  TaskAnnotatorsAreTheSummary: AssertTrue<
    Equals<TaskPublic["annotators"][number], AccountPublicSummary>
  >;
  SummaryCarriesIdentityOnly: AssertTrue<
    Equals<keyof AccountPublicSummary, "id" | "username">
  >;
}
