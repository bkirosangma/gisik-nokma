"""Same declared-pair sweep, but on Apple's INCREASED-CONTRAST system colors
(the 'accessible' variants Apple ships alongside the stock palette), plus a
separator promoted to clear 3:1. Still HIG — Apple's own values, not invented."""
def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def parse(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def over(fg_rgba, bg):
    r, g, b, a = fg_rgba
    R, G, B = parse(bg)
    return (r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a))


def L(rgb):
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def cr(a, b):
    la, lb = L(a), L(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


# Apple increased-contrast ("accessible") system colors.
LIGHT = {
    'surface': '#F2F2F7', 'surfaceRaised': '#FFFFFF', 'surfaceSunken': '#E5E5EA',
    'text': '#000000', 'textInverted': '#FFFFFF',
    'accent': '#0040DD', 'accentText': '#FFFFFF',
    'danger': '#D70015', 'dangerText': '#FFFFFF',
    'warning': '#B25000', 'warningText': '#FFFFFF',
    'success': '#248A3D', 'successText': '#FFFFFF',
    'categoryOpen': '#6C6C70', 'categoryActive': '#0040DD', 'categoryTerminal': '#248A3D',
    'blocked': '#D70015', 'pending': '#B25000', 'restricted': '#8944AB',
    'contested': '#D30F45', 'customMarker': '#8944AB',
}
DARK = {
    'surface': '#000000', 'surfaceRaised': '#1C1C1E', 'surfaceSunken': '#2C2C2E',
    'text': '#FFFFFF', 'textInverted': '#000000',
    'accent': '#409CFF', 'accentText': '#000000',
    'danger': '#FF6961', 'dangerText': '#000000',
    'warning': '#FFB340', 'warningText': '#000000',
    'success': '#30DB5B', 'successText': '#000000',
    'categoryOpen': '#98989D', 'categoryActive': '#409CFF', 'categoryTerminal': '#30DB5B',
    'blocked': '#FF6961', 'pending': '#FFB340', 'restricted': '#DA8FFF',
    'contested': '#FF6482', 'customMarker': '#DA8FFF',
}
# ⚠ THE ONE VALUE HERE THAT IS NOT APPLE'S. secondaryLabel is alpha-composited
# over the background. Apple raises the opacity at increased contrast, but 0.8 is
# a RECONSTRUCTION, not a documented Apple value — every other constant in this
# file is a real Apple hex. Look up the documented increased-contrast opacity and
# re-run before quoting the three textMuted rows as Apple's numbers. Margins are
# wide (5.14–11.13 against 4.5), so the verdict is unlikely to move.
MUTED = {'light': (60, 60, 67, 0.8), 'dark': (235, 235, 245, 0.8)}

PAIRS = [
    ('text', 'surface', 4.5), ('text', 'surfaceRaised', 4.5), ('textMuted', 'surface', 4.5),
    ('accentText', 'accent', 4.5), ('dangerText', 'danger', 4.5),
    ('warningText', 'warning', 4.5), ('successText', 'success', 4.5),
    ('customMarker', 'surface', 4.5), ('text', 'surfaceSunken', 4.5),
    ('textMuted', 'surfaceRaised', 4.5), ('textMuted', 'surfaceSunken', 4.5),
    ('accent', 'surface', 4.5), ('accent', 'surfaceRaised', 4.5),
]
for r in ['categoryOpen', 'categoryActive', 'categoryTerminal', 'blocked', 'pending',
          'restricted', 'contested']:
    PAIRS.append((r, 'surface', 3))
    PAIRS.append((r, 'surfaceRaised', 3))

fails = 0
worst = (99.0, '')
print(f"{'pair':40} {'min':>4} {'light':>7} {'dark':>7}  verdict")
print('-' * 78)
for fg, bg, mn in PAIRS:
    row = []
    for theme, M in (('light', LIGHT), ('dark', DARK)):
        bgh = M[bg]
        fgc = over(MUTED[theme], bgh) if fg == 'textMuted' else parse(M[fg])
        row.append(cr(fgc, parse(bgh)))
    bad = [t for t, v in zip(('light', 'dark'), row) if v < mn]
    if bad:
        fails += 1
    for t, v in zip(('light', 'dark'), row):
        if v - mn < worst[0]:
            worst = (v - mn, f"{fg} on {bg} ({t}) {v:.2f} vs {mn}")
    verdict = 'FAIL ' + '+'.join(bad) if bad else 'pass'
    print(f"{fg + ' on ' + bg:40} {mn:>4} {row[0]:7.2f} {row[1]:7.2f}  {verdict}")
print('-' * 78)
print(f"{fails} of {len(PAIRS)} declared pairs FAIL on Apple's increased-contrast palette")
print(f"thinnest margin: {worst[1]}")

# Separator candidates for R1: what clears 3:1 against each light background?
print()
print("R1 separator candidates (light) — ratio against surface / surfaceRaised / surfaceSunken:")
for name, hexv in [('HIG opaqueSeparator #C6C6C8', '#C6C6C8'),
                   ('systemGray3 #C7C7CC', '#C7C7CC'),
                   ('systemGray2 #AEAEB2', '#AEAEB2'),
                   ('systemGray  #8E8E93', '#8E8E93'),
                   ('accessible gray #6C6C70', '#6C6C70')]:
    vals = [cr(parse(hexv), parse(LIGHT[b])) for b in ('surface', 'surfaceRaised', 'surfaceSunken')]
    ok = 'clears 3:1' if min(vals) >= 3 else 'below 3:1'
    print(f"  {name:30} {vals[0]:5.2f} {vals[1]:5.2f} {vals[2]:5.2f}   {ok}")
