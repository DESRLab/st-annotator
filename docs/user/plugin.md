# Registering a Plugin

Here is the procedure of registering a [plugin](../dev/plugin.md#plugin-api) on the ST Annotator platform.

## Procedure

1. Install the plugin package.
    1. Go into the `js` directory of the plugin package and [install it locally](https://docs.npmjs.com/downloading-and-installing-packages-locally).
    2. Go into the `python` directory and install it locally, e.g. via `poetry install`.
2. Create a JavaScript script to be run in the annotation editor page.
    1. Call `loadEditor` to initialize the annotation editor with the `DataLayer`s associated with your source/label data.
        - You can refer to `packages/app/js/src/static/editor.js` which is the one used for the example application.
    2. Generate a ESM bundle from the script, e.g. by using `vite`.
3. Update the [JSON configuration file](../config.md) with the new plugin and ESM bundle.
4. [Restart the web server](./host.md) to enable the new plugin.
