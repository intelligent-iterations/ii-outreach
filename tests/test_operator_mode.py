import unittest

from src.reddit.main import _effective_safe_mode


class OperatorModeTests(unittest.TestCase):
    def test_operator_triage_forces_safe_mode(self):
        safe_mode, note = _effective_safe_mode(safe_mode=False, no_triage=False)
        self.assertTrue(safe_mode)
        self.assertIn("forcing review staging", note)

    def test_no_triage_keeps_requested_live_mode(self):
        safe_mode, note = _effective_safe_mode(safe_mode=False, no_triage=True)
        self.assertFalse(safe_mode)
        self.assertIsNone(note)


if __name__ == "__main__":
    unittest.main()
