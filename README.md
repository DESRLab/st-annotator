# ⭐ ST Annotator

ST Annotator is a platform that faciliates the annotation workflow for a wide variety of 3D spatiotemporal data. It adopts a plugin-based architecture where each plugin corresponds to one data type. Currently, this repo includes the following plugins:

- [Point cloud source files](./plugins/pcd/README.md)
- [Ground mesh source files](./plugins/gmesh/README.md)
- [Bounding box labels](./plugins/bbox/README.md)
- [Vector labels](./plugins/vector/README.md)
- [Segmentation labels](./plugins/segmentation/README.md)

It also integrates our [DynamicSAM](https://github.com/DESRLab/dynamic-sam) model, which improves interactive segmentation through adaptive masking and does not depend on RGB features.

## Resources

- [Documentation](./docs/index.md)
  - [Installation Guide](./docs/install.md)
  - [Quickstart Guide](./docs/quickstart.md)
  - [User Guide](./docs/user/index.md)
  - [Contributing Guide](./docs/contributing.md)
  - [API Reference](./docs/api/index.md)
  - [CLI Reference](./docs/cli/index.md)
- [License](LICENSE)

## Repository structure

This is a monorepo containing multiple packages.

### Core Library (`core`)

This contains the main components of ST Annotator.

- The frontend (`core/frontend`) is written in TypeScript and server-side rendered using [React Router](https://reactrouter.com/home).
- The backend (`core/backend`) is written in Python and served using [FastAPI](https://fastapi.tiangolo.com/).

### Plugin Packages (`plugins`)

Each plugin package contains both frontend and backend components similar to the library code.

- Frontend packages are managed by the repository's root npm workspace. A
  distribution installs the plugin packages it needs and explicitly registers
  their `./app` exports in its `sta.config.ts`; installing a plugin does not
  activate it automatically.
- After installing the plugin backend packages inside your project's Python environment, the backend plugins will be automatically loaded when you run `sta serve`.

See [this guide](./docs/dev/plugin.md) on how to create your own plugin!

### Documentation

The source files for the main documentation website are located [here](./docs).

After [installing this repository](./docs/install.md), you can generate the documentation website by running `bash ./scripts/doc.sh`, which outputs HTML under the `site` directory of the repository root.

## Publication

ST Annotator is rebranded as DynamicSAM Annotator for the purposes for our paper, [*A Framework for Interactive 3D Segmentation with Adaptive Masking and Fine-Grained Version Control*](https://doi.org/10.1145/3845998). Please cite our work if you find it useful!

```bibtex
@article{10.1145/3845998,
author = {Leung, Tin Long and Bahari, Maral and Tan, Tun Jian and Tan, Pin Siang and WANG, Yu-Hsing},
title = {A Framework for Interactive 3D Segmentation with Adaptive Masking and Fine-Grained Version Control},
year = {2026},
publisher = {Association for Computing Machinery},
address = {New York, NY, USA},
issn = {2157-6904},
url = {https://doi.org/10.1145/3845998},
doi = {10.1145/3845998},
abstract = {Fine-tuning remains an important step in adapting 3D foundation models to downstream applications, but it is laborious and time-consuming to annotate training datasets in 3D. Existing semi-automatic annotation methods for segmentation masks fail to generalize beyond RGB point cloud data and are difficult to control. While a number of 3D annotation interfaces provide undo/redo functionality to help correct mistakes, they lack a comprehensive data versioning strategy, limiting the potential for user analysis and quality control. To tackle these issues, we present DynamicSAM Annotator, an AI-assisted point segmentation framework with the following contributions: 1) a novel interactive 3D point cloud segmentation model that exclusively uses XYZ coordinates with an adaptive thresholding mechanism in segmentation masks; 2) a 3D annotation platform to enable efficient 3D point cloud annotation for semantic and instance segmentation tasks; and 3) a fine-grained version control system that efficiently persists each annotation operation to disk using Git-like operations. Rigorous evaluations across seven benchmark datasets demonstrate DynamicSAM's effectiveness in both indoor and outdoor environments, achieving an average Intersection over Union (IoU) of 59.6\% for a single click, highlighting the model's outstanding generalization capabilities. Meanwhile, our simulated benchmark shows that our version control system maintains sub-second latency even with tens of thousands of snapshots stored.},
note = {Just Accepted},
journal = {ACM Trans. Intell. Syst. Technol.},
month = sep,
keywords = {3D Annotation, Interactive Segmentation, Data Versioning, Mask Generation, Assisted Annotation}
}
```

### Benchmarks

To reproduce the benchmarks in the paper related to the version control system, first run the bash script and then visualize the results in the notebook file.

| Benchmark | Script | Visualization |
| --------- | ------ | ------------- |
| Latency (Single-user) | `scripts/perf_label_latency.sh` | `visualizations/plot_label_latency.ipynb` |
| Latency (Multi-user) | `scripts/perf_label_latency_multi_user.sh` | `visualizations/plot_label_latency_multi_user.ipynb` |
| Storage | `scripts/perf_label_storage.sh` | `visualizations/plot_label_storage.ipynb` |

**Notes:**
- The original results in the paper were collected on the older `benchmark-paper` branch. Some more optimizations have been made since then, particularly for the select operations.
- Each script automatically skips over parameter combinations that have already been completed. If a failure occurs in some of the runs, you can fill them in by running the script again.
- You can customize `$OUTPUT_DIR` defined in the bash script; remember to update `OUTPUT_DIR` in the visualization notebook accordingly!
