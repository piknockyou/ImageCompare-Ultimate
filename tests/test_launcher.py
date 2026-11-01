import base64
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import drop_images_to_compare_in_browser as compare


class LauncherTests(unittest.TestCase):
    def test_page_embeds_images_and_unicode_names(self):
        with tempfile.TemporaryDirectory() as directory:
            files = [Path(directory) / "ümlaut.png", Path(directory) / "second.png"]
            for path in files:
                path.write_bytes(b"image bytes")
            page = compare.make_page(files)
        self.assertIn(json.dumps("ümlaut.png"), page)
        self.assertIn(base64.b64encode(b"image bytes").decode(), page)
        self.assertIn("handleFileA : handleFileB", page)

    def test_more_than_two_files_is_rejected(self):
        with patch.object(sys, "argv", ["launcher", "a", "b", "c"]):
            with self.assertRaisesRegex(ValueError, "one or two"):
                compare.main()


if __name__ == "__main__":
    unittest.main()
