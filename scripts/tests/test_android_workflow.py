"""Regression check for the APK workflow's manual-only trigger policy."""
import re
import unittest
from pathlib import Path


class AndroidWorkflowTriggersTest(unittest.TestCase):
    def test_apk_generation_is_manual_only(self):
        workflow = (
            Path(__file__).resolve().parents[2]
            / ".github/workflows/android_build.yml"
        ).read_text()
        section = re.search(r"^on:\s*\n((?:[ \t].*\n|\n)+)", workflow, re.MULTILINE)
        self.assertIsNotNone(section, "Workflow trigger section must exist")
        if section is None:
            return
        triggers = re.findall(r"^  ([a-z_]+):", section.group(1), re.MULTILINE)
        self.assertEqual(triggers, ["workflow_dispatch"])


if __name__ == "__main__":
    unittest.main()