import { describe, expect, it } from "vitest";

import type { ObjectClassSelectionPublic as ObjectClassSelection } from "../../../../../../client";
import {
  buildSelectionsQuery,
  describeGroupOwnerConflicts,
} from "../../../../../../app/routes/label/specs/objclass/selections";

function selection(
  id: number,
  name: string,
  groupIds: number[],
): ObjectClassSelection {
  return {
    id,
    name,
    groups: groupIds.map((groupId) => ({ id: groupId, name: `g${groupId}` })),
  };
}

describe("describeGroupOwnerConflicts", () => {
  const selections = [selection(1, "S1", [10]), selection(2, "S2", [20, 21])];

  it("treats an unassigned selection as never conflicting", () => {
    expect(describeGroupOwnerConflicts([], selections, null)).toBeNull();
  });

  it("accepts a group no other selection claims", () => {
    expect(describeGroupOwnerConflicts([10, 30], selections, 1)).toBeNull();
  });

  it("ignores the groups the selection already owns", () => {
    expect(describeGroupOwnerConflicts([20], selections, 2)).toBeNull();
  });

  it("names both the group and the selection that holds it", () => {
    expect(describeGroupOwnerConflicts([10, 21], selections, 2)).toContain(
      "g10 from S1",
    );
  });
});

describe("buildSelectionsQuery", () => {
  it("defaults to sorting by name ascending when no sorter is present", () => {
    expect(buildSelectionsQuery({ filters: [], sorters: [] })).toEqual({
      sort_by: "name",
      sort_dir: "asc",
    });
  });

  it("keeps an explicit whitelisted sorter over the default", () => {
    expect(
      buildSelectionsQuery({
        filters: [],
        sorters: [{ columnId: "id", direction: "desc" }],
      }),
    ).toEqual({ sort_by: "id", sort_dir: "desc" });
  });

  it("maps name and description to text filters", () => {
    expect(
      buildSelectionsQuery({
        filters: [
          {
            columnId: "name",
            operator: "Contains",
            searchTerms: ["vehicle"],
          },
          {
            columnId: "description",
            operator: "Contains",
            searchTerms: ["car"],
          },
        ],
        sorters: [],
      }),
    ).toEqual({
      name_contains: "vehicle",
      description_contains: "car",
      sort_by: "name",
      sort_dir: "asc",
    });
  });
});
