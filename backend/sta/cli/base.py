from __future__ import annotations

import click

__all__ = ['get_config_path_option']

def get_config_path_option():
    return click.option('-c', '--config', 'config_path', metavar='<file>', type=click.Path(exists=True, file_okay=True, dir_okay=False, path_type=str), required=True,
                        help='The configuration of the application, which schema is defined by :class:`AppConfig`.')
