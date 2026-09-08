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


LIGHT = {
    'surface': '#F2F2F7', 'surfaceRaised': '#FFFFFF', 'surfaceSunken': '#E5E5EA',
    'text': '#000000', 'textInverted': '#FFFFFF', 'accent': '#007AFF', 'accentText': '#FFFFFF',
    'danger': '#FF3B30', 'dangerText': '#FFFFFF', 'warning': '#FF9500', 'warningText': '#FFFFFF',
    'success': '#34C759', 'successText': '#FFFFFF', 'categoryOpen': '#8E8E93',
    'categoryActive': '#007AFF', 'categoryTerminal': '#34C759', 'blocked': '#FF3B30',
    'pending': '#FF9500', 'restricted': '#AF52DE', 'contested': '#FF2D55',
    'customMarker': '#AF52DE',
}
DARK = {
    'surface': '#000000', 'surfaceRaised': '#1C1C1E', 'surfaceSunken': '#2C2C2E',
    'text': '#FFFFFF', 'textInverted': '#000000', 'accent': '#0A84FF', 'accentText': '#FFFFFF',
    'danger': '#FF453A', 'dangerText': '#FFFFFF', 'warning': '#FF9F0A', 'warningText': '#000000',
    'success': '#30D158', 'successText': '#000000', 'categoryOpen': '#8E8E93',
    'categoryActive': '#0A84FF', 'categoryTerminal': '#30D158', 'blocked': '#FF453A',
    'pending': '#FF9F0A', 'restricted': '#BF5AF2', 'contested': '#FF375F',
    'customMarker': '#BF5AF2',
}
MUTED = {'light': (60, 60, 67, 0.6), 'dark': (235, 235, 245, 0.6)}

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
    verdict = 'FAIL ' + '+'.join(bad) if bad else 'pass'
    print(f"{fg + ' on ' + bg:40} {mn:>4} {row[0]:7.2f} {row[1]:7.2f}  {verdict}")
print('-' * 78)
print(f"{fails} of {len(PAIRS)} declared pairs FAIL under HIG verbatim")
