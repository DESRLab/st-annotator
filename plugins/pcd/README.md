# ⭐ Point Cloud Plugin

This plugin enables the ST Annotator platform to use point cloud files as source data.

You can import point clouds with the following file formats: `.pcd`, `.laz`, `.las`.

In addition, `.bin` files can be provided to be interpreted as a NumPy array with dimensions `(N, D)`, where `N` is number of points and D is number of features. The first three features refer to the `x`, `y`, `z` coordinates, the fourth refers to `intensity`, while the rest act as additional feature channels.

You can refer to the 3D Velodyne point clouds in [KITTI's dataset](http://www.cvlibs.net/datasets/kitti/raw_data.php) for examples.

## Installation

Please refer to our [installation guide](../../docs/install.md) for more details.

## Contributing

Please refer to our [contributing guide](../../docs/contributing.md) for more details.

## Resources

- [Documentation](../../docs/index.md)
  - [Installation Guide](../../docs/install.md)
  - [Quickstart Guide](../../docs/quickstart.md)
  - [Contributing Guide](../../docs/contributing.md)
  - [CLI Reference](../../docs/cli/index.md)
- [License](../../LICENSE)
