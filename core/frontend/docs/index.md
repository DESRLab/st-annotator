# Frontend API Reference

*This API reference is automatically generated and may contain errors. If you have any doubts, consider reading the documentation directly from the source code.*

Every publishable frontend package of the workspace is documented here. The
modules of each package correspond to the subpaths declared in its
`package.json` `exports` map, i.e. exactly what a consumer can import.

## Packages

- {@link sta | sta}: the core React Router application, the shared `common`
  libraries, the generated API client, and the annotation editor framework.
- {@link sta-bbox | sta-bbox}: bounding box and track labels.
- {@link sta-gmesh | sta-gmesh}: ground mesh labels.
- {@link sta-pcd | sta-pcd}: point cloud layers and their settings panes.
- {@link sta-segmentation | sta-segmentation}: instance and point segmentation
  labels.
- {@link sta-vector | sta-vector}: vector labels.

Each label plugin contributes through its `app` export, which provides the
`STAPlugin` registration consumed by the core editor; `sta-bbox`,
`sta-segmentation`, and `sta-vector` also expose their label data
models through a `models` export.
