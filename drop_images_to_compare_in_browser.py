"""Open ImageCompare with files dropped onto this script on Windows."""

import base64
import json
import mimetypes
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import webbrowser


def make_page(paths):
    images = [
        {"name": path.name, "type": mimetypes.guess_type(path.name)[0] or "",
         "data": base64.b64encode(path.read_bytes()).decode("ascii")}
        for path in paths
    ]
    payload = json.dumps(images, ensure_ascii=True).replace("<", "\\u003c")
    script = """<script>
for (const [i, image] of PAYLOAD.entries()) {
  const bytes = Uint8Array.from(atob(image.data), c => c.charCodeAt(0));
  const file = new File([bytes], image.name, {type: image.type});
  (i === 0 ? handleFileA : handleFileB)(file);
}
</script>
""".replace("PAYLOAD", payload)
    html = Path(__file__).with_name("index.html").read_text(encoding="utf-8")
    return html.replace("</body>", script + "</body>", 1)


def main():
    paths = [Path(arg) for arg in sys.argv[1:]]
    if len(paths) > 2:
        raise ValueError("Drop one or two images at a time.")
    if not paths:
        webbrowser.open(Path(__file__).with_name("index.html").resolve().as_uri())
        return
    page = make_page(paths)
    # Keep the copy available for a slow browser start, then remove image data.
    with tempfile.TemporaryDirectory(prefix="imagecompare-") as directory:
        target = Path(directory) / "index.html"
        target.write_text(page, encoding="utf-8")
        if not webbrowser.open(target.as_uri()):
            raise RuntimeError("Could not open the default browser.")
        time.sleep(120)


if __name__ == "__main__":
    # Explorer normally starts python.exe; keep the cleanup wait out of sight.
    pythonw = Path(sys.executable).with_name("pythonw.exe")
    if os.name == "nt" and Path(sys.executable).name.lower() != "pythonw.exe" and pythonw.exists():
        subprocess.Popen([str(pythonw), str(Path(__file__).resolve()), *sys.argv[1:]])
    else:
        try:
            main()
        except (OSError, ValueError, RuntimeError) as error:
            if os.name == "nt":
                import ctypes
                ctypes.windll.user32.MessageBoxW(None, str(error), "ImageCompare", 0x10)
            else:
                raise
