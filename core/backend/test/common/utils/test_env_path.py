"""Relative-path anchoring shared by `FILESYSTEM_ROOT` and `STA_JWT_PRIVATE_KEY_PATH`."""

from sta.common.utils import env_path as domain
from sta.common.utils.env_path import anchored_path


def test_absolute_value_is_returned_without_searching(tmp_path, monkeypatch):
    def discover(**_kwargs):
        msg = "an absolute value must not need the `.env` location"
        raise AssertionError(msg)

    monkeypatch.setattr(domain, "find_dotenv", discover)

    assert anchored_path(tmp_path / "jwt-signing.key") == tmp_path / "jwt-signing.key"


def test_relative_value_anchors_at_a_given_env_file(tmp_path, monkeypatch):
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)

    resolved = anchored_path("keys/jwt-signing.key", dotenv_path=tmp_path / "deployments" / ".env")

    assert resolved == tmp_path / "deployments" / "keys" / "jwt-signing.key"


def test_relative_value_anchors_at_the_discovered_env_file(tmp_path, monkeypatch):
    # The same upward search the configuration loaders perform, so a value they read
    # from `.env` anchors at that file rather than at the caller.
    env_dir = tmp_path / "checkout"
    launch_dir = env_dir / "core" / "backend"
    launch_dir.mkdir(parents=True)
    (env_dir / ".env").write_text("FILESYSTEM_ROOT=data\n")
    monkeypatch.chdir(launch_dir)

    assert anchored_path("jwt-signing.key") == env_dir / "jwt-signing.key"


def test_relative_value_without_an_env_file_follows_the_working_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(domain, "find_dotenv", lambda **_kwargs: "")

    assert anchored_path("jwt-signing.key").resolve() == tmp_path / "jwt-signing.key"
