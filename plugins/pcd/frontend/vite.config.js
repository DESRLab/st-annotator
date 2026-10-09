import { defineConfig } from 'vite';

import { libConfig } from 'sta-config/vite';

export default defineConfig(({ mode }) => {
    if (mode === 'lib' || mode === 'test') {
        return libConfig({
            name: 'sta-pcd',
            entry: {
                editor: './lib/editor/lib/index.js',
            },
        });
    }

    throw new Error(`Invalid mode: ${mode}`);
});
