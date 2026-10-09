import subprocess


def test_help():
    assert subprocess.call(['python', '-m', 'sta', 'plugins', '--help']) == 0
    assert subprocess.call(['sta', 'plugins', '--help']) == 0
