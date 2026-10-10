import { describe, expect, it } from "vitest";

import {
  getFilterDateRange,
  getFilterSearchTerms,
  parseGridFilters,
  parseGridSorters,
  serializeGridFilters,
  serializeGridSorter,
} from "../../../../app/components/slickgrid/pagination";

describe("grid filter serialization", () => {
  it("round-trips filters through the URL representation", () => {
    const serialized = serializeGridFilters([
      { columnId: "name", operator: "Contains", searchTerms: ["group"] },
      { columnId: "id", searchTerms: [5] },
    ]);

    expect(serialized).toBeDefined();
    expect(parseGridFilters(serialized ?? null)).toEqual([
      { columnId: "name", operator: "Contains", searchTerms: ["group"] },
      { columnId: "id", searchTerms: [5] },
    ]);
  });

  it("accepts a ColumnFilters record", () => {
    const serialized = serializeGridFilters({
      name: { columnId: "name", searchTerms: ["a"] },
    });

    expect(parseGridFilters(serialized ?? null)).toEqual([
      { columnId: "name", searchTerms: ["a"] },
    ]);
  });

  it("serializes empty filter sets to undefined", () => {
    expect(serializeGridFilters([])).toBeUndefined();
    expect(serializeGridFilters({})).toBeUndefined();
    expect(serializeGridFilters(null)).toBeUndefined();
  });

  it("parses invalid values as no filters", () => {
    expect(parseGridFilters(null)).toEqual([]);
    expect(parseGridFilters("")).toEqual([]);
    expect(parseGridFilters("not json")).toEqual([]);
    expect(parseGridFilters('{"columnId": "name"}')).toEqual([]);
    expect(parseGridFilters('[{"searchTerms": []}]')).toEqual([]);
  });
});

describe("grid sorter serialization", () => {
  it("round-trips a sorter through the URL representation", () => {
    const serialized = serializeGridSorter({
      columnId: "name",
      direction: "desc",
    });

    expect(serialized).toBe("name:desc");
    expect(parseGridSorters(serialized)).toEqual([
      { columnId: "name", direction: "desc" },
    ]);
  });

  it("serializes missing sorters to undefined", () => {
    expect(serializeGridSorter(null)).toBeUndefined();
    expect(
      serializeGridSorter({ columnId: "", direction: "asc" }),
    ).toBeUndefined();
  });

  it("parses invalid values as no sorters", () => {
    expect(parseGridSorters(null)).toEqual([]);
    expect(parseGridSorters("")).toEqual([]);
    expect(parseGridSorters("name")).toEqual([]);
    expect(parseGridSorters("name:sideways")).toEqual([]);
    expect(parseGridSorters(":asc")).toEqual([]);
  });
});

describe("grid filter term helpers", () => {
  it("extracts non-empty search terms", () => {
    expect(
      getFilterSearchTerms({
        columnId: "id",
        searchTerms: [1, "", null],
      }),
    ).toEqual(["1"]);
    expect(getFilterSearchTerms({ columnId: "id" })).toEqual([]);
  });

  it("widens inclusive date ranges to the next day", () => {
    expect(
      getFilterDateRange({
        columnId: "created_at",
        operator: "RangeInclusive",
        searchTerms: ["2026-08-01", "2026-08-04"],
      }),
    ).toEqual({ ge: "2026-08-01", lt: "2026-08-05" });

    expect(
      getFilterDateRange({
        columnId: "created_at",
        operator: "RangeExclusive",
        searchTerms: ["2026-08-01", "2026-08-04"],
      }),
    ).toEqual({ ge: "2026-08-01", lt: "2026-08-04" });

    expect(
      getFilterDateRange({
        columnId: "created_at",
        operator: "RangeInclusive",
        searchTerms: ["2026-08-01"],
      }),
    ).toEqual({ ge: "2026-08-01" });
  });

  it("rolls inclusive range ends over month boundaries", () => {
    expect(
      getFilterDateRange({
        columnId: "created_at",
        operator: "RangeInclusive",
        searchTerms: [null, "2026-08-31"],
      }),
    ).toEqual({ lt: "2026-09-01" });
  });
});
