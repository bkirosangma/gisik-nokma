#!/usr/bin/env bash
# ctl post — see scripts/ctl/postman.py and docs/superpowers/specs/2026-10-03-ctl-postman-design.md
set -u
exec python3 "$(cd "$(dirname "$0")/.." && pwd)/postman.py" post "$@"
