# ⭐ ST Annotator

[Paper]

ST Annotator is a platform that faciliates the annotation workflow for arbitrary 3D spatiotemporal data.

## Installation

Please refer to our [installation guide](./docs/install.md) for more details.

## Usage

Please refer to our [user guide](./docs/user/index.md) for more details.

## Features

The following data types are supported by this application:

- Point cloud file (source data; defined in [`sta-pcd`](./plugins/pcd/README.md))
- Ground mesh file (source data; defined in [`sta-gmesh`](./plugins/gmesh/README.md))
- Bounding box labels (label data; defined in [`sta-bbox`](./plugins/bbox/README.md))
- Vector labels (label data; defined in [`sta-vector`](./plugins/vector/README.md))
- Segmentation labels (label data; defined in [`sta-segmentation`](./plugins/segmentation/README.md))

Supported features for each data type:

| Data Type | Import (CLI) | Export (CLI) | Create (UI) | Read (UI) | Update (UI) | Delete (UI) | Annotate (UI) |
| --------- | ------ | ------ | ------ | ---- | ------ | ------ | -------- |
| Source Data | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Source Spec. | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | N/A |
| Label Data | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| Label Spec. | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | N/A |

## Contributing

Please refer to our [contributing guide](./docs/contributing.md) for more details.

## About this repository

This is a monorepo containing multiple packages.

### Library Code

This contains the core components of ST Annotator.

#### Frontend (`frontend`)

Written in JavaScript, the frontend is server-side rendered using [React Router](https://reactrouter.com/home).

#### Backend (`backend`)

Written in Python, the backend is implemented using [FastAPI](https://fastapi.tiangolo.com/).

### Plugin Packages (`plugins`)

Each plugin package contains both frontend and backend components similar to the library code.

- You need to install the plugin frontend packages inside the library frontend package in order to load the plugins correctly, as no global npm environment is being managed (yet).
- After installing the plugin backend packages inside your project's Python environment, the backend plugins will be automatically loaded when you run `sta serve`.

### Benchmark Code

To reproduce the benchmarks in the paper related to the version control system of ST Annotator, first run the bash script and then visualize the results in the notebook file.

| Benchmark | Script | Visualization |
| --------- | ------ | ------------- |
| Latency (Single-user) | `scripts/perf_label_latency.sh` | `visualizations/plot_label_latency.ipynb` |
| Latency (Multi-user) | `scripts/perf_label_latency_multi_user.sh` | `visualizations/plot_label_latency_multi_user.ipynb` |
| Storage | `scripts/perf_label_storage.sh` | `visualizations/plot_label_storage.ipynb` |

**Notes:**
- Each script automatically skips over parameter combinations that have already been completed. If a failure occurs in some of the runs, you can fill them in by running the script again.
- You can customize `$OUTPUT_DIR` defined in the bash script; remember to update `OUTPUT_DIR` in the visualization notebook accordingly!

### Documentation

The source files for the main documentation website are located [here](./docs).

After [installing this repository](./docs/install.md), you can generate the documentation website by running `bash ./scripts/doc.sh`, which outputs HTML under the `site` directory of the repository root.

## Resources

- [Documentation](./docs/index.md)
  - [Installation Guide](./docs/install.md)
  - [Quickstart Guide](./docs/quickstart.md)
  - [User Guide](./docs/user/index.md)
  - [Contributing Guide](./docs/contributing.md)
  - [API Reference](./docs/api/index.md)
  - [CLI Reference](./docs/cli/index.md)
- [License](LICENSE)
