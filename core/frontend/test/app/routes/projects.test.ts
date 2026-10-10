import { describe, expect, it } from "vitest";

import {
  buildProjectBulkUpdate,
  buildProjectsQuery,
  describeProjectBatchMembers,
  formatProjectConfigText,
  parseProjectConfigText,
} from "../../../app/routes/projects";

const BULK_BASE = {
  description: "",
  configJson: "",
  memberIds: [] as number[],
  updateDescription: false,
  updateConfig: false,
  updateMembers: false,
};

describe("buildProjectBulkUpdate", () => {
  it("refuses a batch that opted into no attribute", () => {
    expect(buildProjectBulkUpdate({ ...BULK_BASE }).error).toContain(
      "at least one attribute",
    );
  });

  it("omits every attribute the batch did not opt into", () => {
    const { data } = buildProjectBulkUpdate({
      ...BULK_BASE,
      updateDescription: true,
      description: "shared description",
    });

    expect(data).toEqual({ description: "shared description" });
  });

  it("treats an opted-in empty member list as an explicit clear", () => {
    const { data, error } = buildProjectBulkUpdate({
      ...BULK_BASE,
      updateMembers: true,
      memberIds: [],
    });

    expect(error).toBeUndefined();
    expect(data).toEqual({ member_ids: [] });
  });

  it("sends only the projects' new roster, not a merge", () => {
    const { data } = buildProjectBulkUpdate({
      ...BULK_BASE,
      updateMembers: true,
      memberIds: [3, 7],
    });

    expect(data).toEqual({ member_ids: [3, 7] });
  });

  it("rejects invalid configuration JSON", () => {
    const { data, error } = buildProjectBulkUpdate({
      ...BULK_BASE,
      updateConfig: true,
      configJson: "{ a: unclosed",
    });

    expect(data).toBeUndefined();
    expect(error).toContain("Invalid config");
  });

  it("does not parse the configuration field unless it was opted into", () => {
    const { data, error } = buildProjectBulkUpdate({
      ...BULK_BASE,
      updateMembers: true,
      memberIds: [3],
      configJson: "{ a: unclosed",
    });

    expect(error).toBeUndefined();
    expect(data).toEqual({ member_ids: [3] });
  });
});

const member = (id: number, username: string) => ({ id, username });
const row = (members: ReturnType<typeof member>[]) => ({ members });
const accounts = new Map<number, { username: string }>([
  [1, { username: "alice" }],
  [2, { username: "bruna" }],
  [3, { username: "carol" }],
]);

describe("describeProjectBatchMembers", () => {
  it("compares the shared roster against the union of the selection", () => {
    const preview = describeProjectBatchMembers({
      projects: [
        row([member(1, "alice"), member(2, "bruna")]),
        row([member(2, "bruna"), member(3, "carol")]),
      ],
      accounts,
      memberIds: [3],
      updateMembers: true,
      currentUserId: 1,
    });

    expect(preview.currentMemberIds).toEqual([1, 2, 3]);
    expect(preview.droppedMemberIds).toEqual([1, 2]);
    expect(preview.addedMemberIds).toEqual([]);
  });

  it("reports nothing while the members attribute is left opted out", () => {
    const preview = describeProjectBatchMembers({
      projects: [row([member(1, "alice")])],
      accounts,
      memberIds: [3],
      updateMembers: false,
      currentUserId: 1,
    });

    // The picker starts empty, so a preview computed unconditionally would tell the
    // actor they are about to lose members they never opted to change.
    expect(preview.droppedMemberIds).toEqual([]);
    expect(preview.addedMemberIds).toEqual([]);
    expect(preview.wouldRemoveSelf).toBe(false);
    expect(preview.currentMemberIds).toEqual([1]);
  });

  it("reads an empty roster as taking membership away from everyone", () => {
    const preview = describeProjectBatchMembers({
      projects: [row([member(1, "alice")]), row([member(2, "bruna")])],
      accounts,
      memberIds: [],
      updateMembers: true,
      currentUserId: 1,
    });

    expect(preview.droppedMemberIds).toEqual([1, 2]);
    expect(preview.formatMembers(preview.droppedMemberIds)).toBe(
      "alice, bruna",
    );
  });

  it("counts a member of another selected project as an addition", () => {
    const preview = describeProjectBatchMembers({
      projects: [row([member(1, "alice")])],
      accounts,
      memberIds: [1, 2],
      updateMembers: true,
      currentUserId: 1,
    });

    expect(preview.addedMemberIds).toEqual([2]);
    expect(preview.droppedMemberIds).toEqual([]);
  });

  it("warns only when the roster leaves the actor out", () => {
    const omitted = describeProjectBatchMembers({
      projects: [row([member(1, "alice"), member(2, "bruna")])],
      accounts,
      memberIds: [2],
      updateMembers: true,
      currentUserId: 1,
    });
    const kept = describeProjectBatchMembers({
      projects: [row([member(1, "alice"), member(2, "bruna")])],
      accounts,
      memberIds: [1, 2],
      updateMembers: true,
      currentUserId: 1,
    });

    expect(omitted.wouldRemoveSelf).toBe(true);
    expect(kept.wouldRemoveSelf).toBe(false);
  });

  it("names an account the page did not list from the row that carries it", () => {
    const preview = describeProjectBatchMembers({
      projects: [row([member(1, "alice"), member(9, "dave")])],
      accounts,
      memberIds: [],
      updateMembers: true,
      currentUserId: 1,
    });

    expect(preview.formatMembers(preview.currentMemberIds)).toBe("alice, dave");
    // An id no selected row carries cannot be named, and stays addressable by id.
    expect(preview.formatMembers([42])).toBe("user #42");
  });
});

describe("buildProjectsQuery", () => {
  it("maps the members column to the repeated member_id param", () => {
    expect(
      buildProjectsQuery({
        filters: [
          {
            columnId: "members",
            operator: "IN",
            searchTerms: ["1", "2"],
          },
        ],
        sorters: [],
      }),
    ).toEqual({ member_id: ["1", "2"] });
  });

  it("maps name and description to text filters and id to a numeric filter", () => {
    expect(
      buildProjectsQuery({
        filters: [
          {
            columnId: "name",
            operator: "Contains",
            searchTerms: ["SemanticKITTI"],
          },
          {
            columnId: "description",
            operator: "Equals",
            searchTerms: ["fixture"],
          },
          { columnId: "id", operator: "GE", searchTerms: [5] },
        ],
        sorters: [],
      }),
    ).toEqual({
      name_contains: "SemanticKITTI",
      description: "fixture",
      id_ge: 5,
    });
  });

  it("applies whitelisted sorters and drops the rest", () => {
    expect(
      buildProjectsQuery({
        filters: [],
        sorters: [{ columnId: "name", direction: "desc" }],
      }),
    ).toEqual({ sort_by: "name", sort_dir: "desc" });

    expect(
      buildProjectsQuery({
        filters: [],
        sorters: [{ columnId: "members", direction: "asc" }],
      }),
    ).toEqual({});
  });
});

describe("project configuration text", () => {
  it("reads empty text as the shipped defaults", () => {
    expect(parseProjectConfigText("")).toEqual({ frame_cache_size: 256 });
    expect(parseProjectConfigText("   ")).toEqual({ frame_cache_size: 256 });
  });

  it("keeps keys the editor does not own", () => {
    expect(
      parseProjectConfigText(
        JSON.stringify({
          frame_cache_size: 8,
          a_plugin_option: { nested: true },
        }),
      ),
    ).toEqual({ frame_cache_size: 8, a_plugin_option: { nested: true } });
  });

  it("refuses a document that is not an object", () => {
    expect(() => parseProjectConfigText("[1, 2]")).toThrow(
      "Configuration must be a JSON object.",
    );
    expect(() => parseProjectConfigText("nonsense")).toThrow();
  });

  it("seeds an editable empty object when a project has no stored config", () => {
    expect(formatProjectConfigText(undefined)).toBe("{}");
  });

  it("round-trips a stored config through the raw pane unchanged", () => {
    const config = {
      frame_cache_size: 12,
      auto_tracks: true,
      init_camera_position: { x: 0, y: 0, z: 100 },
    };

    expect(parseProjectConfigText(formatProjectConfigText(config))).toEqual(
      config,
    );
  });
});
