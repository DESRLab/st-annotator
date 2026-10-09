import subprocess


def test_help():
    assert subprocess.call(['python', '-m', 'sta', 'init', '--help']) == 0
    assert subprocess.call(['sta', 'init', '--help']) == 0
