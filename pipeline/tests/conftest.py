import sys
from pathlib import Path

# Make pipeline/*.py importable regardless of pytest's working directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
