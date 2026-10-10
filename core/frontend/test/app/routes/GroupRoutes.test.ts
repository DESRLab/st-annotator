import { describe, expect, it } from "vitest";

import {
  action as labelAction,
  buildLabelGroupsQuery,
} from "../../../app/routes/label/groups";
import { buildReposQuery } from "../../../app/routes/label/repos";
import {
  action as sourceAction,
  buildSourceGroupsQuery,
} from "../../../app/routes/source/groups";
import { commitSession, getSession } from "../../../app/sessions";

async function request(fields: Record<string, string>) {
  const session = await getSession();
  session.set("token", { access_token: "access", token_type: "bearer" });
  return new Request("http://localhost/groups", {
    method: "POST",
    headers: {
      Cookie: await commitSession(session),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields),
  });
}

describe("source/label group route contracts", () => {
  it("maps supported filters and sorting while dropping unsupported columns", () => {
    const state = {
      filters: [
        { columnId: "id", operator: "GE", searchTerms: ["3"] },
        {
          columnId: "name",
          operator: "Contains",
          searchTerms: ["cars"],
        },
        {
          columnId: "description",
          operator: "Contains",
          searchTerms: ["urban"],
        },
        {
          columnId: "specs",
          operator: "Contains",
          searchTerms: ["ignored"],
        },
      ],
      sorters: [{ columnId: "name", direction: "desc" }],
    } as any;
    expect(buildSourceGroupsQuery(state)).toEqual({
      id_ge: 3,
      name_contains: "cars",
      description_contains: "urban",
      sort_by: "name",
      sort_dir: "desc",
    });
    expect(buildLabelGroupsQuery(state)).toEqual({
      id_ge: 3,
      name_contains: "cars",
      description_contains: "urban",
      sort_by: "name",
      sort_dir: "desc",
    });
    expect(buildReposQuery(state)).toEqual({
      id_ge: 3,
      name_contains: "cars",
      description_contains: "urban",
      sort_by: "name",
      sort_dir: "desc",
    });
  });

  it("rejects missing group names before any mutation", async () => {
    expect(
      await sourceAction({
        request: await request({
          _action: "create",
          name: "",
          description: "",
        }),
      } as any),
    ).toEqual({ error: "Group name is required" });
    expect(
      await labelAction({
        request: await request({
          _action: "create",
          name: "",
          description: "",
        }),
      } as any),
    ).toEqual({ error: "Group name is required" });
  });

  it("rejects unknown mutations", async () => {
    expect(
      await sourceAction({
        request: await request({ _action: "unexpected" }),
      } as any),
    ).toEqual({ error: "Unknown action" });
    expect(
      await labelAction({
        request: await request({ _action: "unexpected" }),
      } as any),
    ).toEqual({ error: "Unknown action" });
  });
});
