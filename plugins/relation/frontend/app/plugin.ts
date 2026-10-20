import routes from "./routes";
import { type STAPlugin } from "sta/app";

export default {
  routes,
  editor: { loader: () => import("./editor/index.js") },
} satisfies STAPlugin;
