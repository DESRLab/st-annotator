import { pluginRouteModule, type STAPlugin } from "sta/app";
const routes = {
  label: {
    data: [
      {
        path: "relation",
        module: pluginRouteModule(import.meta.url, "./label/data/relations"),
        title: "Relations",
      },
    ],
    specs: [
      {
        path: "relation-class",
        module: pluginRouteModule(import.meta.url, "./label/specs/index"),
        title: "Relation Classes",
      },
      {
        path: "relation-class/definitions",
        module: pluginRouteModule(import.meta.url, "./label/specs/definitions"),
        title: "Relation Class Definitions",
      },
      {
        path: "relation-class/selections",
        module: pluginRouteModule(import.meta.url, "./label/specs/selections"),
        title: "Relation Class Selections",
      },
    ],
  },
} satisfies STAPlugin["routes"];
export default routes;
