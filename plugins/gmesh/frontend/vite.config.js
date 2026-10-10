import path from "node:path";

import { pluginViteConfig } from "sta-config/vite";

const pluginDir = path.dirname(new URL(import.meta.url).pathname);
const frontendDir = path.resolve(pluginDir, "../../../core/frontend");

export default pluginViteConfig({ frontendDir });
