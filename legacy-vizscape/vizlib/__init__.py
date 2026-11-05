"""vizlib 包引导：把仓库根（含 docmd/docrender/templates）放进 sys.path。"""
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
