# scripts/ctl/test/harness.sh — the shared case runner of every scripts/ctl/test/*.test.sh. Sourced, never executed.
# check NAME CODE runs CODE in the current shell and prints `  ok   NAME` or `  FAIL NAME` (counting $fails).
# CTL_TEST_ONLY=<extended regex> (process finding P21): only the cases whose NAME matches run; the file's own setup and teardown, which sit
# outside check, run as always. ctl_test_only_end FILE, called before the file's verdict line, says how many cases ran and EXITS 1 when the
# filter matched none ("0 cases matched", never a silent green). Unset, the harness prints nothing of its own: the output is unchanged.
# A slice is only as good as its cases are self-contained: a case that leans on state an earlier case built (a `mk;` inside an earlier
# eval, a variable it set) must be sliced together with that case.
CTL_TEST_RAN=0; CTL_TEST_SKIPPED=0
check() {
  if [ -n "${CTL_TEST_ONLY:-}" ] && ! printf '%s\n' "$1" | grep -Eq -- "$CTL_TEST_ONLY"; then CTL_TEST_SKIPPED=$((CTL_TEST_SKIPPED+1)); return 0; fi
  CTL_TEST_RAN=$((CTL_TEST_RAN+1))
  if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); fi
}
ctl_test_only_end() {
  [ -n "${CTL_TEST_ONLY:-}" ] || return 0
  echo "  CTL_TEST_ONLY=$CTL_TEST_ONLY: $CTL_TEST_RAN of $((CTL_TEST_RAN + CTL_TEST_SKIPPED)) cases ran"
  if [ "$CTL_TEST_RAN" -eq 0 ]; then echo "$1: 0 cases matched CTL_TEST_ONLY=$CTL_TEST_ONLY"; exit 1; fi
}
