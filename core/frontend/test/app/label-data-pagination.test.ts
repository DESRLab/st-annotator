import { describe, expect, it, vi } from "vitest";
import { listLabelDataPage } from "../../app/loaders";

describe("count-free label pages", () => {
  it.each([0, 24, 25, 26])(
    "detects the next page with %i returned rows",
    async (length) => {
      const rows = Array.from({ length }, (_, id) => ({ id }));
      const load = vi.fn().mockResolvedValue({ data: rows });
      const page = await listLabelDataPage(
        new Request(
          "http://localhost/label/data/vector?group_id=7&commit_hash=head&page=2&pageSize=25",
        ),
        load,
      );
      expect(load).toHaveBeenCalledWith({
        offset: 25,
        limit: 26,
        include_total: false,
      });
      expect(page.data).toEqual(rows.slice(0, 25));
      expect(page.pagination).toMatchObject({
        pageNumber: 2,
        pageSize: 25,
        hasNextPage: length > 25,
      });
      expect(page.pagination).not.toHaveProperty("totalItems");
    },
  );
});

it("passes column filters to the backend with the page lookahead", async () => {
  const filters = JSON.stringify([
    { columnId: "quality_rank", operator: ">=", searchTerms: [3] },
    { columnId: "id", operator: "", searchTerms: ["abc"] },
  ]);
  const url = new URL("http://localhost/label/data/bbox?page=2&pageSize=25");
  url.searchParams.set("filters", filters);
  const load = vi.fn().mockResolvedValue({ data: [] });
  await listLabelDataPage(new Request(url), load);
  expect(load).toHaveBeenCalledWith({
    offset: 25,
    limit: 26,
    include_total: false,
    filters,
  });
});
