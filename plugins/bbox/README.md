# ⭐ Bounding Box Labels Plugin

This plugin enables the ST Annotator platform to use bounding box labels (including cuboid and cylindrical boxes) as label data.

You can export bounding box labels in the form of `.json` files.

The `position` of a bounding box is relative to world space, and is aligned with the three world axes (`x`, `y`, `z`).

The `angle` of a bounding box is relative to world space refers to its rotation about the vertical (`z`) axis, measured in radians. It is `0` when facing towards `-x`, `PI/2` when facing towards `-y`, PI when facing towards `+x`, and `-PI/2` when facing towards `+y`.

The `size` of a bounding box is relative to model space (local coordinate system), which is defined as follows:

- `x`: Front along `width` dimension
- `y`: Left along `length` dimension
- `z`: Up along `height` dimension

