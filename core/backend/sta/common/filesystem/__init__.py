"""
Enables FastAPI to connect to abstract filesystem backends.

:class:`FileIO` is used to read and write from certain types of files on the filesystem; a few
basic ones are included in this library. Downstream libraries can define their own file types by
subclassing :class:`FileIO`.
"""

from .base import *
from .config import *
from .io import *
from .path import *
