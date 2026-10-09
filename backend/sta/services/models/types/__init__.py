from .name import *
from .quality import *
from .uri import *

try:
    from urllib.parse import urlparse

    import hypothesis.strategies as st
    from hypothesis.provisional import urls as st_urls
    from hypothesis.strategies._internal.types import _global_type_lookup

    _global_type_lookup[Name] = st.text(
        st.characters(codec="utf-8", blacklist_characters="\0"),
        min_size=1,
        max_size=255,
    )
    _global_type_lookup[FileURI] = st_urls() \
        .map(lambda url: urlparse(url).path.lstrip('/')) \
        .filter(lambda x: not x.startswith('..')) \
        .filter(lambda x: 1 <= len(x) <= 255)
except ImportError:
    pass
