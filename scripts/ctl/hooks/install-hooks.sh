#!/usr/bin/env bash
# scripts/ctl/hooks/install-hooks.sh — copy the hook to ~/.claude/scripts and register it (idempotent).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
dst="$HOME/.claude/scripts/ctl-scripts-only.py"
python3 "$HERE/ctl-scripts-only.py" --self-test >/dev/null || { echo "FAIL install-hooks self-test red — not installing"; exit 1; }
mkdir -p "$HOME/.claude/scripts"; cp "$HERE/ctl-scripts-only.py" "$dst"; chmod +x "$dst"
python3 - "$dst" <<'PY'
import json, sys, os
dst = sys.argv[1]; p = os.path.expanduser('~/.claude/settings.json')
s = json.load(open(p))
pre = s.setdefault('hooks', {}).setdefault('PreToolUse', [])
if not any(h.get('command') == dst for m in pre for h in m.get('hooks', [])):
    pre.append({"matcher": "Bash", "hooks": [{"type": "command", "command": dst, "statusMessage": "ctl: raw forms refused"}]})
    json.dump(s, open(p, 'w'), indent=2); print("registered", dst)
else:
    print("already registered", dst)
PY
echo "OK install-hooks $dst"
