import type { STAConfig } from "./app";
import { default as gmeshPlugin } from "./plugins/gmesh/app";
import { default as pcdPlugin } from "./plugins/pcd/app";

export default {
    plugins: {
        gmesh: gmeshPlugin,
        pcd: pcdPlugin,
    },
} satisfies STAConfig;
