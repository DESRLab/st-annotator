import { defineConfig, mergeConfig } from 'vite';
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js';

import { libConfig } from 'sta-config/vite';

const injectCSSConfig = defineConfig({
    plugins: [cssInjectedByJsPlugin()],
});

export default defineConfig(({ mode }) => {
    if (mode === 'lib' || mode === 'test') {
        return mergeConfig(libConfig({
            name: 'sta-segmentation',
            entry: {
                editor: './lib/editor/lib/index.js',
            },
        }), injectCSSConfig);
    }

    throw new Error(`Invalid mode: ${mode}`);
});
