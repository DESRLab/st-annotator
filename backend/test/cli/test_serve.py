import subprocess


def test_help():
    assert subprocess.call(['python', '-m', 'sta', 'serve', '--help']) == 0
    assert subprocess.call(['sta', 'serve', '--help']) == 0
