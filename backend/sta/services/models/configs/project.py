from pydantic import BaseModel, Field, PositiveInt

from sta.common.spatial import Vector3

__all__ = ["ProjectConfig"]


class ProjectConfig(BaseModel):
    """Represents the configuration of a project."""

    @staticmethod
    def default():
        return ProjectConfig(frame_cache_size=256)

    frame_cache_size: PositiveInt
    """The maximum number of frames stored in the cache once loaded from the server."""

    auto_tracks: bool = False
    """
    If `True`, each object track only has one bounding box, and such objects
    are managed by the program without explicit input from the user.
    """

    init_camera_position: Vector3 = Field(default_factory=lambda: Vector3(x=0, y=0, z=100))
    """
    When opening the annotation editor, this sets the initial position of the camera
    relative to the origin of the frame.
    """

    init_camera_target: Vector3 = Field(default_factory=Vector3.zeros)
    """
    When opening the annotation editor, this sets the initial target of the camera
    relative to the origin of the frame.
    """
