"""Commissioning syntax and real controlling-terminal regression tests (no host changes)."""
import ast
import os
from pathlib import Path
import pty
import select
import signal
import subprocess
import sys
import time
import unittest

SCRIPT = Path(__file__).with_name('commission-databrick.sh')

def embedded(marker):
    return SCRIPT.read_text().split("<<'" + marker + "'\n", 1)[1].split('\n' + marker, 1)[0]

class CommissionTests(unittest.TestCase):
    def test_shell_syntax(self):
        subprocess.run(['bash', '-n', str(SCRIPT)], check=True)

    def test_embedded_python_syntax(self):
        for marker in ('HOST_PY', 'ACTIONS_PY'):
            ast.parse(embedded(marker))

    def test_username_prompt_on_actual_nonseekable_terminal(self):
        tree = ast.parse(embedded('HOST_PY'))
        functions = ast.Module(body=[node for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name in ('require', 'username_prompt')],
            type_ignores=[])
        namespace = {'sys': sys}
        exec(compile(functions, '<prompt>', 'exec'), namespace)
        pid, fd = pty.fork()
        if pid == 0:
            try:
                value = namespace['username_prompt']()
                os._exit(0 if value == 'test-user' else 2)
            except BaseException:
                os._exit(3)
        try:
            ready, _, _ = select.select([fd], [], [], 5)
            self.assertTrue(ready, 'Terminal prompt timed out')
            self.assertIn(b'Portainer username', os.read(fd, 4096))
            os.write(fd, b'test-user\n')
            for _ in range(50):
                child, status = os.waitpid(pid, os.WNOHANG)
                if child:
                    pid = None
                    self.assertEqual(os.waitstatus_to_exitcode(status), 0)
                    break
                time.sleep(0.02)
            else:
                self.fail('Terminal input was not accepted')
        finally:
            os.close(fd)
            if pid:
                os.kill(pid, signal.SIGKILL)
                os.waitpid(pid, 0)

if __name__ == '__main__':
    unittest.main()
