#!/usr/bin/env bash
# The shared case runner (harness.sh) and its CTL_TEST_ONLY filter (process finding P21; test-cases 13.2224–13.2227).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
fails=0
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter
T="$(mktemp -d "${TMPDIR:-/tmp}/ctl-harness-test.XXXXXX")"
trap 'rm -rf "$T"' EXIT
# a three-case suite on the harness: each case records that it ran; gamma fails when GAMMA_RED=1
cat > "$T/three.test.sh" <<EOF
#!/usr/bin/env bash
set -u
fails=0
. "$HERE/test/harness.sh"
check "13.9001 alpha" 'echo alpha >> "$T/ran"'
check "13.9002 beta" 'echo beta >> "$T/ran"'
check "13.9003 gamma" 'echo gamma >> "$T/ran"; [ "\${GAMMA_RED:-0}" = 0 ]'
ctl_test_only_end three.test.sh
[ "\$fails" -eq 0 ] && echo "three.test.sh: ok" || { echo "three.test.sh: \$fails FAILED"; exit 1; }
EOF
three() { rm -f "$T/ran"; out="$(env -u CTL_TEST_ONLY "$@" bash "$T/three.test.sh" 2>&1)"; rc=$?; ran="$(cat "$T/ran" 2>/dev/null | tr '\n' ' ')"; }
check "13.2224 a filter matching 1 case runs exactly that case and reports it: '1 of 3 cases ran', exit 0" \
  'three CTL_TEST_ONLY="^13\.9002 "; [ $rc -eq 0 ] && [ "$ran" = "beta " ] && [ "$(printf "%s\n" "$out" | grep -c "^  ok ")" -eq 1 ] && printf "%s\n" "$out" | grep -qxF "  CTL_TEST_ONLY=^13\.9002 : 1 of 3 cases ran"'
check "13.2225 a filter matching NO case exits non-zero with '0 cases matched' and runs nothing (never a silent green)" \
  'three CTL_TEST_ONLY=nomatch; [ $rc -eq 1 ] && [ -z "$ran" ] && printf "%s\n" "$out" | grep -q "^three.test.sh: 0 cases matched CTL_TEST_ONLY=nomatch$" && ! printf "%s\n" "$out" | grep -q "three.test.sh: ok"'
check "13.2226 no filter runs every case and prints nothing of the harness's own (the output is the old form); CONTROL: a red case in a slice still fails the file" \
  'three; [ $rc -eq 0 ] && [ "$ran" = "alpha beta gamma " ] && [ "$out" = "$(printf "%s\n" "  ok   13.9001 alpha" "  ok   13.9002 beta" "  ok   13.9003 gamma" "three.test.sh: ok")" ] && three CTL_TEST_ONLY=gamma GAMMA_RED=1 && [ $rc -eq 1 ] && [ "$ran" = "gamma " ]'
wired() { local f n=0; for f in "$HERE"/test/*.test.sh; do grep -q '^\. "\$HERE/test/harness\.sh"' "$f" && [ "$(grep -c "^ctl_test_only_end $(basename "$f")\$" "$f")" = 1 ] && ! grep -q '^check() {' "$f" || { echo "       (not wired: $f)"; return 1; }; n=$((n+1)); done; [ "$n" -ge 10 ]; }
check "13.2227 every scripts/ctl/test/*.test.sh sources harness.sh, defines no check() of its own and calls ctl_test_only_end before its verdict (so the filter reaches every suite)" 'wired'
ctl_test_only_end harness.test.sh
[ "$fails" -eq 0 ] && echo "harness.test.sh: ok" || { echo "harness.test.sh: $fails FAILED"; exit 1; }
