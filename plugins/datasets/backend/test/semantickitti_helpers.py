"""Shared builders for synthetic SemanticKITTI test datasets."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np


def write_semantickitti_frame(
    dataset_root: Path,
    *,
    sequence: str,
    frame_idx: int,
    points: Any,
    semantic_ids: Any,
    instance_ids: Any,
) -> Path:
    """Write one Velodyne scan and its packed SemanticKITTI labels."""
    sequence_dir = dataset_root / "sequences" / sequence
    velodyne_dir = sequence_dir / "velodyne"
    labels_dir = sequence_dir / "labels"
    velodyne_dir.mkdir(parents=True, exist_ok=True)
    labels_dir.mkdir(parents=True, exist_ok=True)

    stem = f"{frame_idx:06d}"
    scan_path = velodyne_dir / f"{stem}.bin"
    np.asarray(points, dtype=np.float32).tofile(scan_path)

    packed_labels = (np.asarray(instance_ids, dtype=np.uint32) << np.uint32(16)) | np.asarray(
        semantic_ids, dtype=np.uint32
    )
    packed_labels.tofile(labels_dir / f"{stem}.label")

    return sequence_dir


def write_two_class_frames(root: Path, *, frame_count: int) -> Path:
    """Write frames containing car, truck, and unlabeled point groups."""
    dataset_root = root / "dataset"
    points = [
        [1.0, 1.0, 0.0, 0.5],
        [2.0, 1.0, 0.0, 0.5],
        [5.0, -2.0, 1.0, 0.25],
        [6.0, -2.0, 1.0, 0.25],
        [0.0, 0.0, 0.0, 0.0],
    ]
    semantic_ids = [10, 10, 18, 18, 0]
    instance_ids = [1, 1, 2, 2, 0]
    for frame_idx in range(frame_count):
        write_semantickitti_frame(
            dataset_root,
            sequence="00",
            frame_idx=frame_idx,
            points=points,
            semantic_ids=semantic_ids,
            instance_ids=instance_ids,
        )

    return dataset_root
