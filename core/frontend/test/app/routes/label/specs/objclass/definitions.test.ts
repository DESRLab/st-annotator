import { describe, expect, it } from "vitest";

import { buildObjclassesQuery } from "../../../../../../app/routes/label/specs/objclass/definitions";

describe("buildObjclassesQuery", () => {
  it("defaults to sorting by name ascending when no sorter is present", () => {
    expect(buildObjclassesQuery({ filters: [], sorters: [] })).toEqual({
      sort_by: "name",
      sort_dir: "asc",
    });
  });

  it("maps id and name filters and ignores unmapped columns", () => {
    expect(
      buildObjclassesQuery({
        filters: [
          { columnId: "id", operator: "", searchTerms: [9] },
          {
            columnId: "name",
            operator: "Contains",
            searchTerms: ["car"],
          },
          {
            columnId: "description",
            operator: "Contains",
            searchTerms: ["x"],
          },
        ],
        sorters: [],
      }),
    ).toEqual({
      id: 9,
      name_contains: "car",
      sort_by: "name",
      sort_dir: "asc",
    });
  });

  it("keeps an explicit whitelisted sorter over the default", () => {
    expect(
      buildObjclassesQuery({
        filters: [],
        sorters: [{ columnId: "id", direction: "asc" }],
      }),
    ).toEqual({ sort_by: "id", sort_dir: "asc" });
  });
});
