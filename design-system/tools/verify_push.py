#!/usr/bin/env python3
"""Prove a DesignSync push landed the bytes that left.

    python3 verify_push.py <get_file-result.json|txt> <local-file>

A write count is not evidence. `write_files` reporting 26 successes says 26 calls
returned, not that 26 files hold what they held on disk — and this repo has a
recorded history of exactly that shape: a squash merge whose per-file checksums
passed because they skipped the files the drop landed in.

So this compares BYTES, and it prints the first differing offset rather than a
bare verdict, because "differs" without a location is the same dead end as
"identical" without a control.

Exit 0 = identical. Exit 1 = differs (details on stdout). Exit 2 = could not compare,
which is NOT a pass — a comparison that could not run has proved nothing.
"""
import hashlib
import json
import sys


def payload(path):
    """The tool result is a JSON envelope with a `content` string; a raw dump is
    also accepted so a hand-saved result still works."""
    raw = open(path, 'rb').read()
    try:
        obj = json.loads(raw.decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return raw
    if isinstance(obj, dict) and isinstance(obj.get('content'), str):
        return obj['content'].encode('utf-8')
    return raw


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    try:
        remote = payload(sys.argv[1])
        local = open(sys.argv[2], 'rb').read()
    except OSError as err:
        print(f"could not read: {err}")
        return 2

    rh = hashlib.sha256(remote).hexdigest()
    lh = hashlib.sha256(local).hexdigest()
    if rh == lh:
        print(f"identical  {len(local)} bytes  sha256 {lh[:16]}")
        return 0

    print(f"DIFFERS  local {len(local)}b {lh[:16]}  remote {len(remote)}b {rh[:16]}")
    for i in range(min(len(local), len(remote))):
        if local[i] != remote[i]:
            lo, hi = max(0, i - 40), i + 40
            print(f"first difference at byte {i}")
            print(f"  local : {local[lo:hi]!r}")
            print(f"  remote: {remote[lo:hi]!r}")
            return 1
    shorter = 'remote' if len(remote) < len(local) else 'local'
    print(f"common prefix identical; {shorter} is truncated at "
          f"{min(len(local), len(remote))} bytes")
    return 1


if __name__ == '__main__':
    sys.exit(main())
