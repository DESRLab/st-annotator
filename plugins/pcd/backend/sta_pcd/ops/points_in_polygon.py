from __future__ import annotations

import numpy as np
import numpy.typing as npt
from matplotlib.path import Path

__all__ = ["pip_mask"]


def pip_mask(
    points: npt.NDArray[np.float64],
    polygon_vertices: npt.NDArray[np.float64],
    *,
    inside: bool = False,
) -> npt.NDArray[np.bool_]:
    is_inside = Path(polygon_vertices).contains_points(points[:, :2])

    if inside:
        return is_inside
    else:
        return ~is_inside
