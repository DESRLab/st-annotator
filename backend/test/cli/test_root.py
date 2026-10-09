import subprocess


def test_help():
    assert subprocess.call(['python', '-m', 'sta', '--help']) == 0
    assert subprocess.call(['sta', '--help']) == 0
