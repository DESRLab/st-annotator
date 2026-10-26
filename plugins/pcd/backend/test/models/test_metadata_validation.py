from pathlib import Path

from pydantic import ValidationError

import pytest

from sta.common.filesystem import FilesystemConfig, fs_ctx
from sta_pcd.models.source.data import (
    PointCloudMetadataCreate,
    PointCloudMetadataUpdate,
)


@pytest.mark.parametrize("model", [PointCloudMetadataCreate, PointCloudMetadataUpdate])
def test_weather_database_width_boundary(model: type, tmp_path: Path) -> None:
    # FileURI needs a filesystem context, not a running app or database schema.
    with fs_ctx(FilesystemConfig(root=tmp_path).get_fs()):
        fields = {"group_id": 1, "uri": "cloud.pcd"} if model is PointCloudMetadataCreate else {}
        value = "x" * 31
        assert model(**fields, weather=value).weather == value

        with pytest.raises(ValidationError) as error:
            model(**fields, weather="x" * 32)

        assert any(item["loc"] == ("weather",) for item in error.value.errors())
