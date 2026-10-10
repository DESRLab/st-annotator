import { Nav } from "react-bootstrap";
import { useRouteLoaderData } from "react-router";

import type { PluginRoutes } from "sta/app/config";

import { dataAndCommit, getCurrentSession } from "../../../loaders";
import type { loader as rootLoader } from "../../../root";
import { createPageContent } from "../../../templates";

import type { Route } from "./+types/dashboard";

export async function loader({ request }: Route.LoaderArgs) {
  const session = await getCurrentSession(request);

  return dataAndCommit(
    {
      error: session.get("error"),
      success: session.get("success"),
    },
    session,
  );
}

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const { error, success } = loaderData;
  const { plugins } = useRouteLoaderData<typeof rootLoader>("root")!;
  const pluginsArr: PluginRoutes[] = Array.from(Object.values(plugins));
  const builtInRoutes = [
    {
      path: "objclass",
      title: "Object Classes",
    },
  ];

  return createPageContent({
    title: "Label Specifications",
    header: (
      <>
        <h2 className="py-2">Label Specifications</h2>
      </>
    ),
    main: (
      <>
        <p>Please select the item type to configure:</p>
        <Nav variant="tabs">
          {[
            ...builtInRoutes,
            ...pluginsArr.flatMap((p) => p.routes.label?.specs ?? []),
          ].map((r) => (
            <Nav.Item>
              <Nav.Link href={`/label/specs/${r.path}`}>{r.title}</Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
      </>
    ),
    alerts: { error, success },
  });
}
