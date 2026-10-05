#!/usr/bin/env python3
"""pw-ports.py <slot> — print two free Playwright ports, `KG FG`, one line (ctl run-tests, 13.2281-13.2282).

The range is CTL_PW_PORT_BASE (default 3300) .. +CTL_PW_PORT_COUNT-1 (default 100, a test seam), in windows of 10 per test slot: slot n starts at base + 10*((n-1) % 10), so two runs that hold
different slots start in different windows and cannot pick the same port (a slot is exclusive); slot 0 (a dry-run holds none) starts at base. From its
window the walk goes on, circularly, to the first port that is FREE: a plain bind of 127.0.0.1 and of ::1 must succeed (vite binds `localhost`, which is ::1
here), so a server a lane or a reviewer left running is skipped — one on 127.0.0.1 or ::1, and one on the WILDCARD 0.0.0.0 or :: too (a node / next dev server
started with no host, `vite --host`). No SO_REUSEADDR: with it a BSD/macOS bind to 127.0.0.1 succeeds beside a wildcard listener, which then reads as free
(FIX 1, 13.2282); the cost is that a port in TIME_WAIT reads as held and is skipped. The two ports are different. Exit 1 when fewer than two are free."""
import socket
import sys

base = int(__import__("os").environ.get("CTL_PW_PORT_BASE") or 3300)
count = int(__import__("os").environ.get("CTL_PW_PORT_COUNT") or 100)
slot = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 0


def free(port):
    for fam, addr in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
        s = socket.socket(fam, socket.SOCK_STREAM)
        try:
            s.bind((addr, port))
        except OSError as e:
            if fam == socket.AF_INET6 and e.errno in (49, 99):  # no ::1 on this host: not a held port
                continue
            return False
        finally:
            s.close()
    return True


start = 10 * (max(slot, 1) - 1) % count
found = []
for i in range(count):
    p = base + (start + i) % count
    if free(p):
        found.append(p)
        if len(found) == 2:
            break
if len(found) < 2:
    print("no two free ports in %d-%d" % (base, base + count - 1), file=sys.stderr)
    sys.exit(1)
print(*found)
