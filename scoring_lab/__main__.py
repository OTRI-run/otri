import sys
from pathlib import Path

# `python scoring_lab` as well as `python -m scoring_lab`: the repository root must be importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scoring_lab.lab import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
