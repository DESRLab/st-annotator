import { libConfig } from './lib/vite';

export default libConfig({
    name: 'sta-config',
    entry: {
        vite: './lib/vite/index.js',
    },
});
