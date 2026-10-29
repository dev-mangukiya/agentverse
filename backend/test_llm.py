"""Compatibility entrypoint: opt-in benchmark, no silent successful error strings."""

import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(
        str(Path(__file__).parent / "scripts/benchmark.py"), run_name="__main__"
    )
