from pydantic import ValidationError

import pytest

from sta_pcd.models.source.data import (
    PointCloudMetadataCreate,
    PointCloudMetadataUpdate,
)


def test_weather_accepts_database_width_boundary(test_app) -> None:
    del test_app  # Establishes the filesystem/config context used by FileURI.
    value = "x" * 31

    assert PointCloudMetadataCreate(group_id=1, uri="cloud.pcd", weather=value).weather == value
    assert PointCloudMetadataUpdate(weather=value).weather == value


@pytest.mark.parametrize("model", [PointCloudMetadataCreate, PointCloudMetadataUpdate])
def test_weather_rejects_values_wider_than_database_column(model: type, test_app) -> None:
    del test_app
    fields = {"group_id": 1, "uri": "cloud.pcd"} if model is PointCloudMetadataCreate else {}
    with pytest.raises(ValidationError) as error:
        model(**fields, weather="x" * 32)

    assert any(item["loc"] == ("weather",) for item in error.value.errors())
