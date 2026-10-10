import { describe, expect, it } from "vitest";

import {
  asSlickgridModule,
  createSlickgridClientLoader,
} from "../../../../app/components/slickgrid/client";

describe("createSlickgridClientLoader", () => {
  it("hydrates server data with the browser-only SlickGrid module", async () => {
    const clientLoader = createSlickgridClientLoader<{
      serverLoader: () => Promise<{ records: number[] }>;
    }>();

    expect(clientLoader.hydrate).toBe(true);

    const result = await clientLoader({
      serverLoader: async () => ({ records: [1, 2, 3] }),
    });

    expect(result.records).toEqual([1, 2, 3]);
    expect(result.SG.SlickgridReact).toBeTypeOf("function");
    expect(asSlickgridModule(result.SG)).toBe(result.SG);
  });
});
