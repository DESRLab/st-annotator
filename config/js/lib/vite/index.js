/**
 * Contains configurations for Vite and Vitest.
 * 
 * @module sta-config/vite
 */

/// <reference types="vitest" />
import autoprefixer from 'autoprefixer';
import sourcemaps from 'rollup-plugin-sourcemaps';
import { defineConfig, mergeConfig } from 'vite';
import viteCompression from 'vite-plugin-compression';
import { externalizeDeps } from 'vite-plugin-externalize-deps';

/**
 * Generates the base configuration.
 * 
 * @returns {import('vite').UserConfig} The base configuration.
 */
export function baseConfig() {
    return defineConfig({
        base: '',
        build: {
            cssCodeSplit: false,
            rollupOptions: {
                output: {
                    assetFileNames: 'assets/[name].[ext]',
                },
            },
        },
        test: {
            coverage: {
                provider: 'istanbul',
                reporter: ['text', 'html'],
            },
            environment: 'jsdom',
        },
        css: {
            postcss: {
                plugins: [autoprefixer({})],
            },
        },
    });
}

/**
 * @typedef {object} LibConfigOptions
 * @property {string} name The name of the library.
 * @property {Record<string, string>} entry The entry points of the library.
 */

/**
 * Generates the configuration for a library. The files are outputted in `dist/lib`.
 * 
 * @param {LibConfigOptions} options The options of the configuration.
 * @returns {import('vite').UserConfig} The configuration for building the bundle
 * that is imported by other JavaScript libraries.
 */
export function libConfig({ name, entry }) {
    const config = defineConfig({
        build: {
            outDir: 'dist/lib',
            lib: { name, entry },
            rollupOptions: {
                // @ts-expect-error
                plugins: [sourcemaps()],
            },
            sourcemap: true,
        },
        plugins: [externalizeDeps()],
    });

    // @ts-expect-error
    return mergeConfig(baseConfig(), config);
}

/**
 * @typedef {object} StaticConfigOptions
 * @property {Record<string, string>} entry The entry point of each bundle.
 */

/**
 * Generates the configuration for static bundles. The files are outputted in `dist/static`.
 * 
 * @param {StaticConfigOptions} options The options of the configuration.
 * @returns {import('vite').UserConfig} The configuration for building the bundle
 * to load in HTML.
 */
export function staticConfig({ entry }) {
    const config = defineConfig({
        build: {
            outDir: 'dist/static',
            rollupOptions: {
                // @ts-expect-error
                plugins: [sourcemaps()],
                input: entry,
                output: {
                    format: 'es',
                    entryFileNames: '[name].bundle.js',
                },
            },
            sourcemap: true,
        },
        plugins: [viteCompression({ threshold: 0 })],
    });

    // @ts-expect-error
    return mergeConfig(baseConfig(), config);
}
