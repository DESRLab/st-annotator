import { reactRouter } from "@react-router/dev/vite";
import { type UserConfig, defineConfig } from "vite";

export default defineConfig({
  plugins: [reactRouter()],
}) as UserConfig;
