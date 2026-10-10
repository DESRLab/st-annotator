from hypothesis import HealthCheck, settings

pytest_plugins = [
    "sta.testing.pytest_fixtures",
]

# This machine is shared, and pytest -n auto spawns one worker per core.
# Under that contention, hypothesis's wall-clock guards (the per-example
# deadline and the too_slow health check) flake even when the properties
# themselves hold, so relax them for the whole suite.
settings.register_profile(
    "shared-machine",
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow],
)
settings.load_profile("shared-machine")
