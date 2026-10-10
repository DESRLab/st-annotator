from .base import *
from .registry import *

OP_REGISTRY = OperationRegistry()
"""Plugins can register additional operations to this registry."""

from .special import register_special_ops  # noqa: E402

register_special_ops(OP_REGISTRY)

del register_special_ops
