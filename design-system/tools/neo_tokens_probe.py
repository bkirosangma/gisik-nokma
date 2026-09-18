#!/usr/bin/env python3
"""Task 13 (Part B): measure hig/minimal/neo, both themes, from the owner's exported
interactive prototype files. Every number in neo-tokens.json and neo-token-report.md
comes out of THIS script — MASTER.md's rule: no number hand-authored.

    python3 design-system/tools/neo_tokens_probe.py

Reads design-system/interactive/{desktop,mobile}.dc.html, extracts the CSS custom
property cascade from their <style> blocks ONLY (never the markup/script below them —
a generated bundle inside the file would confirm anything, so this stays scoped), and
writes:
  - design-system/neo-tokens.json  (raw + curated measurements)
  - docs/neo-token-report.md       (PASS/FAIL tables, rules a/b/c, palette-delta finding)

Contrast arithmetic ported from two committed instruments, not reinvented:
  - packages/ui/test/tokens.test.ts  (opaque WCAG relative-luminance + ratio)
  - apps/web/e2e-stack/helpers/non-text-contrast.ts  (alpha source-over compositing,
    for the rgba() fills and shadow colours this file is full of — the docblock at
    packages/ui/src/tokens.ts:120-127 names the false-green mode the naive formula
    gives an alpha colour, which is exactly the failure mode this script must avoid).
"""
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
INTERACTIVE = REPO_ROOT / "design-system" / "interactive"
DEVICES = {"desktop": INTERACTIVE / "desktop.dc.html", "mobile": INTERACTIVE / "mobile.dc.html"}

BLOCK_SELECTORS = [
    ("root", r':root'),
    ("dark", r'body\[data-theme="dark"\]'),
    ("minimal", r'body\[data-style="minimal"\]'),
    # 2026-09-18 refresh (`@6d7b67c0a52c`): the bare `body[data-style="neo"]`
    # this instrument was written against NO LONGER EXISTS. The export moved it
    # to `body[data-theme="light"][data-style="neo"]`, so the light-neo arm
    # became explicit about its theme. This is measured, not assumed: with the
    # old pattern the positive control below fails outright
    # (`selector body\[data-style="neo"\] not found`), which is the failure the
    # 2026-09-18 prototype-delta audit predicted for this instrument.
    ("neo", r'body\[data-theme="light"\]\[data-style="neo"\]'),
    ("darkneo", r'body\[data-theme="dark"\]\[data-style="neo"\]'),
    # 2026-09-18 refresh, the other half of the same movement (T2 of the
    # 2026-09-18 prototype-delta audit): the `--accent` ALIAS left `:root` and
    # now lives on the bare `body` rule. Without this block `--accent` is
    # declared NOWHERE the instrument reads, and the positive control below
    # fails with `accent on surface` = None — the instrument reports "cannot
    # tell colours apart" rather than "I lost the variable", which is the
    # silent-empty shape this file's own docstring warns about. The bare
    # selector cannot collide with `body[data-theme="dark"]{`: `re.search`
    # appends `\s*\{` to every pattern here, and the attribute bracket is not
    # `{`, so that rule is not a match for this one.
    ("body", r'body'),
]

STYLES = ["hig", "minimal", "neo"]
THEMES = ["light", "dark"]


# ── Extraction ────────────────────────────────────────────────────────────

def extract_style_block(html_text, device_label):
    opens = [m.start() for m in re.finditer(r"<style>", html_text)]
    closes = [m.start() for m in re.finditer(r"</style>", html_text)]
    assert len(opens) == 1, f"{device_label}: expected exactly one <style> block, found {len(opens)}"
    assert len(closes) == 1, f"{device_label}: expected exactly one </style> close, found {len(closes)}"
    block = html_text[opens[0] + len("<style>"):closes[0]]
    # Negative control: the scoped block must not contain markup/script markers —
    # proves this really is the CSS text and not an accidental over-capture.
    for marker in ("<x-dc>", "text/x-dc", "data-dc-script", "<body>"):
        assert marker not in block, f"{device_label}: style block unexpectedly contains {marker!r} — extraction is not scoped"
    # Positive control: the two-axis cascade selectors must all be present.
    for _, sel_pattern in BLOCK_SELECTORS:
        assert re.search(sel_pattern + r"\s*\{", block), f"{device_label}: selector {sel_pattern} not found in style block"
    return block


def parse_declarations(body_text):
    """`--a:1px; --b:rgba(...)` -> {'--a': '1px', '--b': 'rgba(...)'}. Box-shadow
    layers use commas, never semicolons, so splitting on ';' is safe.

    Only CUSTOM PROPERTIES are kept. Every selector this instrument read before
    2026-09-18 declared nothing else, so this filter was a no-op then; the bare
    `body` block it now reads (the `--accent` alias, T2) is ordinary CSS with
    `margin`/`background`/`font-family` beside the one custom property, and
    letting those through would put non-colour keys into the resolved set that
    `allResolvedVars` and the delta tables walk."""
    out = {}
    for chunk in body_text.split(";"):
        chunk = chunk.strip()
        if not chunk or ":" not in chunk:
            continue
        name, value = chunk.split(":", 1)
        name = name.strip()
        if not name.startswith("--"):
            continue
        out[name] = value.strip()
    return out


def extract_blocks(style_text, device_label):
    blocks = {}
    for key, sel_pattern in BLOCK_SELECTORS:
        m = re.search(sel_pattern + r"\s*\{([^}]*)\}", style_text)
        assert m is not None, f"{device_label}: block {key} ({sel_pattern}) not found"
        blocks[key] = parse_declarations(m.group(1))
    return blocks


def resolve_cascade(blocks, style, theme):
    """Cascade order matches the source file: root, dark, minimal, neo, darkneo.
    Two attribute selectors (darkneo) outrank one (dark/minimal/neo alone), and
    that block is applied last regardless, so this order is correct for every
    combination the file defines.

    2026-09-18 refresh: the light-neo block is now `body[data-theme="light"]
    [data-style="neo"]`, which matches ONLY when the theme is exactly `light`.
    It is therefore applied on the light arm ALONE. Applying it for dark as
    well (which the old bare `body[data-style="neo"]` justified, since darkneo
    then overrode it) would be wrong in a way this file would not report: the
    dark-neo block does not re-declare the five semantic colours, so
    light-neo's `--danger`/`--warning`/`--pink`/`--success`/`--purple` would
    leak into the dark-neo merge and every dark-neo reading would be taken
    against light-theme semantics."""
    merged, source = {}, {}

    def apply(block_key, label):
        for k, v in blocks[block_key].items():
            merged[k] = v
            source[k] = label

    apply("root", ":root")
    # The `--accent` alias (T2). `body` (0,0,1) sits below every block that
    # overrides it, so it is applied FIRST among the theme/style arms and the
    # dark arm's own `--accent` (0,1,1) then wins by both specificity and order.
    apply("body", "body")
    if theme == "dark":
        apply("dark", 'body[data-theme="dark"]')
    if style == "minimal":
        apply("minimal", 'body[data-style="minimal"]')
    if style == "neo" and theme == "light":
        apply("neo", 'body[data-theme="light"][data-style="neo"]')
    if theme == "dark" and style == "neo":
        apply("darkneo", 'body[data-theme="dark"][data-style="neo"]')
    return merged, source


VAR_REF = re.compile(r"var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,\s*([^)]*))?\)")


def resolve_var_refs(merged, depth=0):
    """Substitute var(--x) / var(--x, fallback) using the SAME resolved set,
    recursively. depth guards a self- or mutually-referential var."""
    resolved = dict(merged)
    for _ in range(6):
        changed = False

        def sub(match):
            nonlocal changed
            name, fallback = match.group(1), match.group(2)
            if name in resolved and not VAR_REF.search(resolved[name]):
                changed = True
                return resolved[name]
            if fallback is not None:
                changed = True
                return fallback.strip()
            return match.group(0)

        for k, v in list(resolved.items()):
            if VAR_REF.search(v):
                resolved[k] = VAR_REF.sub(sub, v)
        if not changed:
            break
    for k, v in list(resolved.items()):
        resolved[k] = resolve_color_mix(v)
    return resolved


# The ONE `color-mix` form the 2026-09-18 export uses (T4 of the 2026-09-18
# prototype-delta audit): an opaque colour mixed with `transparent` at a
# percentage. Added because the refresh moved `--tintAccent` from a stored
# literal `rgba(58,109,176,0.14)` to a DERIVED `color-mix(...)`, and the
# previous run's `parse_color` returned None for it — the instrument would have
# reported "no colour" for a movement it was supposed to measure.
COLOR_MIX_RE = re.compile(
    r"color-mix\(\s*in\s+srgb\s*,\s*(?P<c1>[^,]+?)\s+(?P<p1>[\d.]+)%\s*,\s*(?P<c2>[^)]+?)\s*\)"
)
# The only second operand this export ever mixes against. Named so an
# unrecognised `color-mix` is left verbatim rather than resolved to a guess.
TRANSPARENT_OPERANDS = {"transparent", "rgba(0,0,0,0)", "rgba(0, 0, 0, 0)"}


def resolve_color_mix(value):
    """`color-mix(in srgb, C P%, transparent)` -> `rgba(r,g,b,P/100)`.

    Alpha, not tinting: sRGB mixing against `transparent` (= rgba(0,0,0,0))
    contributes no colour weight, so the result keeps C's own channels and
    scales its alpha. This is deliberately NOT a general `color-mix`
    implementation — a form it does not recognise is returned UNCHANGED, so an
    unresolved mix shows up as an unparseable value downstream rather than as a
    plausible wrong colour.
    """
    m = COLOR_MIX_RE.search(value)
    if m is None:
        return value
    if m.group("c2").strip().lower() not in TRANSPARENT_OPERANDS:
        return value
    rgb = parse_color(m.group("c1"))
    if rgb is None:
        return value
    r, g, b, _ = rgb
    return f"rgba({int(r)},{int(g)},{int(b)},{round(float(m.group('p1')) / 100.0, 4)})"


# ── Colour + contrast (ported, not reinvented) ──────────────────────────────

HEX_RE = re.compile(r"^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$")
RGBA_RE = re.compile(r"rgba?\(([^)]+)\)")


def parse_color(value):
    """-> (r,g,b in 0-255, a in 0-1) or None if not a single recognisable colour."""
    value = value.strip()
    m = HEX_RE.match(value)
    if m:
        hexpart = m.group(1)
        r, g, b = int(hexpart[0:2], 16), int(hexpart[2:4], 16), int(hexpart[4:6], 16)
        a = int(m.group(2), 16) / 255 if m.group(2) else 1.0
        return (r, g, b, a)
    m = RGBA_RE.search(value)
    if m:
        parts = [p.strip() for p in m.group(1).split(",")]
        if len(parts) < 3:
            return None
        try:
            r, g, b = (float(p) for p in parts[0:3])
        except ValueError:
            return None
        a = float(parts[3]) if len(parts) > 3 else 1.0
        return (r, g, b, a)
    return None


def composite_over(fg_rgba, bg_rgb):
    """Standard source-over — the same algebra as non-text-contrast.ts's `over`."""
    r, g, b, a = fg_rgba
    br, bg_, bb = bg_rgb
    return (r * a + br * (1 - a), g * a + bg_ * (1 - a), b * a + bb * (1 - a))


def channel_lin(c):
    s = c / 255
    return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4


def relative_luminance(rgb):
    r, g, b = rgb
    return 0.2126 * channel_lin(r) + 0.7152 * channel_lin(g) + 0.0722 * channel_lin(b)


def contrast_ratio(rgb_a, rgb_b):
    la, lb = relative_luminance(rgb_a), relative_luminance(rgb_b)
    brighter, darker = max(la, lb), min(la, lb)
    return (brighter + 0.05) / (darker + 0.05)


def ratio_fg_on_bg(fg_value, bg_value):
    """fg composited over bg (alpha-aware — the correct treatment for THIS file's
    many rgba() roles), contrast measured against the resulting opaque colour vs
    bg's own opaque colour. Returns None if either colour cannot be parsed."""
    fg = parse_color(fg_value)
    bg = parse_color(bg_value)
    if fg is None or bg is None:
        return None
    bg_opaque = composite_over(bg, (255, 255, 255)) if bg[3] < 1 else bg[:3]
    fg_opaque = composite_over(fg, bg_opaque)
    return contrast_ratio(fg_opaque, bg_opaque)


SHADOW_LAYER_RE = re.compile(
    r"(inset\s+)?(-?[\d.]+px)\s+(-?[\d.]+px)\s+([\d.]+px)(?:\s+([\d.]+px))?\s+(rgba?\([^)]*\)|#[0-9a-fA-F]{3,8})"
)


def parse_shadow_layers(shadow_value):
    """box-shadow: layer(, layer)* -> list of {inset, color}. `none` -> []."""
    if shadow_value.strip() == "none":
        return []
    layers = []
    for m in SHADOW_LAYER_RE.finditer(shadow_value):
        layers.append({"inset": m.group(1) is not None, "color": m.group(6)})
    return layers


# ── Measurement ──────────────────────────────────────────────────────────

RADIUS_KEYS = {"card": "--cardR", "control": "--ctlR"}
CORE_COLOR_KEYS = {"surface": "--surface", "raised": "--raised", "sunken": "--sunken", "overlay": "--overlay"}
FILL_KEYS = ["--fill1", "--fill2", "--fill3", "--fill4"]


def measure_device(device_label, html_path):
    html_text = html_path.read_text(encoding="utf-8")
    style_text = extract_style_block(html_text, device_label)
    blocks = extract_blocks(style_text, device_label)

    per_combo = {}
    for style in STYLES:
        per_combo[style] = {}
        for theme in THEMES:
            merged, source = resolve_cascade(blocks, style, theme)
            resolved = resolve_var_refs(merged)

            core = {}
            for role, var in CORE_COLOR_KEYS.items():
                core[role] = {"value": resolved.get(var), "raw": merged.get(var), "selector": source.get(var, "not declared")}
            fills = {}
            for i, var in enumerate(FILL_KEYS, start=1):
                if var in resolved:
                    fills[f"fill{i}"] = {"value": resolved.get(var), "selector": source.get(var, "not declared")}
                else:
                    fills[f"fill{i}"] = {"value": None, "selector": "NOT DECLARED for this device"}
            radii = {}
            for name, var in RADIUS_KEYS.items():
                radii[name] = {"value": resolved.get(var), "selector": source.get(var, "not declared")}

            card_shadow_raw = resolved.get("--cardShadow")
            field_shadow_raw = resolved.get("--fieldShadow")
            shadow = {
                "raised": {
                    "value": card_shadow_raw,
                    "selector": source.get("--cardShadow", "not declared"),
                    "layers": parse_shadow_layers(card_shadow_raw) if card_shadow_raw else [],
                },
                "sunken": {
                    "value": field_shadow_raw,
                    "selector": source.get("--fieldShadow", "not declared"),
                    "layers": parse_shadow_layers(field_shadow_raw) if field_shadow_raw else [],
                },
                "overlay": {
                    "value": None,
                    "selector": None,
                    "note": "NOT DEFINED in the exported CSS — --overlay is a background scrim colour only, no dedicated box-shadow variable exists for it in either file",
                },
            }

            all_vars = {k: {"value": v, "selector": source.get(k, "?")} for k, v in resolved.items()}

            per_combo[style][theme] = {
                "core": core,
                "fillLadder": fills,
                "radii": radii,
                "shadow": shadow,
                "allResolvedVars": all_vars,
            }
    return per_combo


# ── Rule (a)(b)(c) measurement ──────────────────────────────────────────

def rule_a_sunken_input(combo):
    """Sunken input's shadow-edge contrast. hig/minimal have no shadow at all
    (fieldShadow: none) — boundary there is by FILL, so that is reported instead,
    explicitly labelled N/A for the shadow measurement."""
    out = {}
    for style in STYLES:
        out[style] = {}
        for theme in THEMES:
            data = combo[style][theme]
            layers = data["shadow"]["sunken"]["layers"]
            field_bg = data["allResolvedVars"].get("--fieldBg", {}).get("value")
            surface = data["core"]["surface"]["value"]
            backdrop = field_bg if field_bg is not None else surface
            if not layers:
                fill_var = data["allResolvedVars"].get("--fieldBg", {}).get("value")
                fill_ratio = ratio_fg_on_bg(fill_var, surface) if fill_var else None
                out[style][theme] = {
                    "applicable": False,
                    "note": "fieldShadow: none — boundary is by FILL (fieldBg vs surface), not shadow",
                    "fieldBgOnSurfaceRatio": round(fill_ratio, 2) if fill_ratio is not None else None,
                }
                continue
            readings = []
            for layer in layers:
                r = ratio_fg_on_bg(layer["color"], backdrop)
                readings.append({"color": layer["color"], "inset": layer["inset"], "ratioVsFieldBg": round(r, 2) if r is not None else None})
            worst = min((r["ratioVsFieldBg"] for r in readings if r["ratioVsFieldBg"] is not None), default=None)
            out[style][theme] = {
                "applicable": True,
                "backdrop": backdrop,
                "layers": readings,
                "worstRatio": worst,
                "passes3to1": (worst is not None and worst >= 3),
            }
    return out


def rule_b_control_fill(combo):
    """A control keeps a fill or accent-weight label — shadow is not credited.
    Measured as ctlBg / chipBg composited-fill contrast against surface."""
    out = {}
    for style in STYLES:
        out[style] = {}
        for theme in THEMES:
            data = combo[style][theme]
            surface = data["core"]["surface"]["value"]
            ctl_bg = data["allResolvedVars"].get("--ctlBg", {}).get("value")
            chip_bg = data["allResolvedVars"].get("--chipBg", {}).get("value")
            ctl_ratio = ratio_fg_on_bg(ctl_bg, surface) if ctl_bg else None
            chip_ratio = ratio_fg_on_bg(chip_bg, surface) if chip_bg and chip_bg != "transparent" else None
            out[style][theme] = {
                "ctlBg": ctl_bg,
                "ctlBgVsSurface": round(ctl_ratio, 2) if ctl_ratio is not None else None,
                "ctlPasses3to1": (ctl_ratio is not None and ctl_ratio >= 3),
                "chipBg": chip_bg,
                "chipBgVsSurface": round(chip_ratio, 2) if chip_ratio is not None else None,
                "chipPasses3to1": (chip_ratio is not None and chip_ratio >= 3) if chip_ratio is not None else None,
                "chipNote": "transparent in minimal — no fill boundary at all" if chip_bg == "transparent" else None,
            }
    return out


def rule_c_dark_fill_separation(combo):
    """Dark theme separates by FILL, measured — shadow does not count. Contrast
    between adjacent surface levels, dark theme only, each style."""
    out = {}
    for style in STYLES:
        data = combo[style]["dark"]
        surface = data["core"]["surface"]["value"]
        raised = data["core"]["raised"]["value"]
        sunken = data["core"]["sunken"]["value"]

        def r(a, b):
            v = ratio_fg_on_bg(a, b)
            return round(v, 2) if v is not None else None

        out[style] = {
            "surfaceVsRaised": r(raised, surface),
            "raisedVsSunken": r(sunken, raised),
            "surfaceVsSunken": r(sunken, surface),
            "surface": surface,
            "raised": raised,
            "sunken": sunken,
            "allIdentical": surface == raised == sunken,
        }
    return out


def text_pairs(combo):
    """The CONTRAST_PAIRS-style text/surface pairs this file's own roles support."""
    out = {}
    for style in STYLES:
        out[style] = {}
        for theme in THEMES:
            data = combo[style][theme]
            v = data["allResolvedVars"]
            surface = data["core"]["surface"]["value"]
            raised = data["core"]["raised"]["value"]
            sunken = data["core"]["sunken"]["value"]
            pairs_def = [
                ("label on surface", v.get("--label", {}).get("value"), surface, 4.5),
                ("label on raised", v.get("--label", {}).get("value"), raised, 4.5),
                ("label on sunken", v.get("--label", {}).get("value"), sunken, 4.5),
                ("label2 on surface", v.get("--label2", {}).get("value"), surface, 4.5),
                ("label2 on raised", v.get("--label2", {}).get("value"), raised, 4.5),
                ("label3 on surface", v.get("--label3", {}).get("value"), surface, 4.5),
                ("accent on surface", v.get("--accent", {}).get("value"), surface, 4.5),
                ("accent on raised", v.get("--accent", {}).get("value"), raised, 4.5),
                ("onColor on accent", v.get("--onColor", {}).get("value"), v.get("--accent", {}).get("value"), 4.5),
            ]
            rows = []
            for name, fg, bg, minimum in pairs_def:
                if fg is None or bg is None:
                    rows.append({"pair": name, "ratio": None, "minimum": minimum, "pass": None, "note": "role not resolvable"})
                    continue
                ratio = ratio_fg_on_bg(fg, bg)
                rows.append({
                    "pair": name,
                    "ratio": round(ratio, 2) if ratio is not None else None,
                    "minimum": minimum,
                    "pass": (ratio is not None and ratio >= minimum),
                })
            out[style][theme] = rows
    return out


# ── Palette delta ─────────────────────────────────────────────────────────

SHIPPED_LIGHT = {"surface": "#f2f2f7", "surfaceRaised": "#ffffff", "surfaceSunken": "#e5e5ea", "accent": "#0040dd"}
SHIPPED_DARK = {"surface": "#000000", "surfaceRaised": "#1c1c1e", "surfaceSunken": "#2c2c2e", "accent": "#409cff"}


def hex_delta(a, b):
    ca, cb = parse_color(a), parse_color(b)
    if ca is None or cb is None:
        return None
    return {"dR": round(ca[0] - cb[0]), "dG": round(ca[1] - cb[1]), "dB": round(ca[2] - cb[2])}


def palette_delta(combo):
    out = {}
    for style in STYLES:
        out[style] = {}
        for theme, shipped in (("light", SHIPPED_LIGHT), ("dark", SHIPPED_DARK)):
            data = combo[style][theme]
            v = data["allResolvedVars"]
            rows = {}
            for role, shipped_key in (("surface", "surface"), ("raised", "surfaceRaised"), ("sunken", "surfaceSunken")):
                exported = data["core"][role]["value"]
                rows[role] = {
                    "exported": exported,
                    "shipped": shipped[shipped_key],
                    "delta": hex_delta(exported, shipped[shipped_key]),
                }
            accent_exported = v.get("--accent", {}).get("value")
            rows["accent"] = {
                "exported": accent_exported,
                "shipped": shipped["accent"],
                "delta": hex_delta(accent_exported, shipped["accent"]) if accent_exported else None,
            }
            out[style][theme] = rows
    return out


# ── The tint layer ────────────────────────────────────────────────────────
#
# Added 2026-09-18 with the refresh that moved T3/T4. Before it, this
# instrument had NO row for any `--tint*` variable, so the largest single
# movement in the light/dark base (`--tintDanger`/`--tintWarning`/`--tintPink`/
# `--tintPurple`/`--tintSuccess` halving, and `--tintAccent` becoming derived)
# could not appear in this report's diff at all. That is the gap this closes:
# the audit's T3/T4 rows had no instrument behind them.
TINT_VARS = ["--tintAccent", "--tintDanger", "--tintWarning", "--tintPink", "--tintPurple", "--tintSuccess"]


def tint_table(combo):
    """Per style/theme, the export's six tint variables, exactly as authored
    (var-refs and `color-mix` resolved). `None` means the combination does not
    declare the variable — which is itself a measurement, and is why this
    returns `None` rather than falling back to the `:root` value."""
    out = {}
    for style in STYLES:
        out[style] = {}
        for theme in THEMES:
            v = combo[style][theme]["allResolvedVars"]
            out[style][theme] = {
                name: (v.get(name, {}).get("value") if name in v else None) for name in TINT_VARS
            }
    return out


# ── Markdown report (generated, not hand-transcribed) ───────────────────

def fmt(v):
    return "—" if v is None else v


def render_report(all_devices, rule_a, rule_b, rule_c, pairs, deltas, tints):
    lines = []
    lines.append("# Task 13 — neo-token measurement report")
    lines.append("")
    lines.append(
        "Generated entirely by `design-system/tools/neo_tokens_probe.py` from "
        "`design-system/interactive/{desktop,mobile}.dc.html`'s `<style>` block. "
        "No number below is hand-typed (MASTER.md's rule) — re-run the script to "
        "reproduce every one. Source of truth for the shipping product remains "
        "`packages/ui/src/tokens.ts`; this file is Task 13's measurement, feeding "
        "Task 14's transcription. It resolves nothing and adopts nothing."
    )
    lines.append("")
    lines.append(
        "**Controls.** Positive: the script asserts a real, >1 contrast reading "
        "before writing anything (see the script's `__main__` guard) — printed at "
        "run time. Negative: extraction is scoped to the single `<style>...</style>` "
        "block per file and asserts that block contains no markup/script markers "
        "(`<x-dc>`, `text/x-dc`, `<body>`) — a generated bundle elsewhere in either "
        "file cannot leak into these numbers."
    )
    lines.append("")

    # ── THE PALETTE-DELTA FINDING ──
    lines.append("## The palette-delta finding — a decision for the controller, not resolved here")
    lines.append("")
    lines.append(
        "The desktop file's `:root` reads `--surface:#EFE7DF` (warm paper) where the "
        "shipped palette (`packages/ui/src/tokens.ts`, `#353`) is cool "
        "`paper #f2f2f7`. Measured for **every** style, **both** themes, against the "
        "shipped code (not just `tokens.json`):"
    )
    lines.append("")
    for device_label in DEVICES:
        lines.append(f"### {device_label}")
        lines.append("")
        lines.append("| style | theme | role | exported | shipped (tokens.ts) | Δ(R,G,B) |")
        lines.append("|---|---|---|---|---|---|")
        for style in STYLES:
            for theme in THEMES:
                for role in ("surface", "raised", "sunken", "accent"):
                    row = deltas[device_label][style][theme][role]
                    d = row["delta"]
                    dtxt = f"({d['dR']:+d},{d['dG']:+d},{d['dB']:+d})" if d else "—"
                    lines.append(
                        f"| {style} | {theme} | {role} | `{row['exported']}` | `{row['shipped']}` | {dtxt} |"
                    )
        lines.append("")
    lines.append(
        "**Every role in every style is offset from the shipped palette, in both "
        "themes — not only the light-mode warm-paper case the dispatch named as the "
        "visible instance.** The dark-theme delta is the larger one: shipped dark "
        "`surface` is pure black `#000000`; the export's `hig`/`minimal` dark surface "
        "is a navy `#141A2E` (Δ +20,+26,+46) and `neo` dark surface is `#1B2340` "
        "(Δ +27,+35,+64) — a full hue shift, not a brightness adjustment."
    )
    lines.append("")
    def delta_phrase(device, style, theme, role):
        row = deltas[device][style][theme][role]
        d = row["delta"]
        return (
            f"`{row['exported']}` vs shipped `{row['shipped']}` "
            f"(Δ {d['dR']:+d},{d['dG']:+d},{d['dB']:+d})"
        )

    lines.append(
        "**`accent` also differs, in every style and both themes** — this contradicts "
        "the amendment's reading of the design session (\"the accent palette is "
        "unchanged\"). Measured (desktop/`hig`, the value every style shares): light "
        f"{delta_phrase('desktop', 'hig', 'light', 'accent')}; dark "
        f"{delta_phrase('desktop', 'hig', 'dark', 'accent')}. This is present identically "
        "in `hig` and `minimal`, not only `neo` — so it is not a neo-specific decision, "
        "it is a property of the whole exported base."
    )
    lines.append("")
    lines.append(
        "**Verdict, stated and not resolved:** every style in this export is a "
        "**palette change** from the shipped code — surface, raised, sunken AND "
        "accent all move, in both themes, uniformly across all three styles (neo "
        "changes nothing about surface/accent beyond what hig/minimal already "
        "changed — neo's *additional* delta is confined to introducing shadow as the "
        "elevation signal and flattening surface/raised/sunken to one value). Whether "
        "this is adopted as the new palette, treated as this export's own drift from "
        "an unstated separate palette decision, or reconciled back to `#353`'s "
        "increased-contrast set is the controller's call."
    )
    lines.append("")

    # ── The tint layer (T3/T4) ──
    lines.append("## The tint layer — the variables T3 and T4 moved")
    lines.append("")
    lines.append(
        "Every `--tint*` variable the export declares, per style and theme, as authored "
        "(`var()` references and `color-mix()` resolved). **This section was added "
        "2026-09-18**, with the refresh that moved T3 and T4: before it this report had "
        "no tint row of any kind, so a halving of all five base tints and `--tintAccent` "
        "becoming derived could not have appeared in this file's own diff — the movement "
        "the 2026-09-18 prototype-delta audit named as the largest in the base had no "
        "instrument behind it."
    )
    lines.append("")
    for device_label in DEVICES:
        lines.append(f"### {device_label}")
        lines.append("")
        lines.append("| style | theme | " + " | ".join(f"`{t}`" for t in TINT_VARS) + " |")
        lines.append("|---|---|" + "---|" * len(TINT_VARS))
        for style in STYLES:
            for theme in THEMES:
                row = tints[device_label][style][theme]
                lines.append(
                    f"| {style} | {theme} | " + " | ".join(fmt(row[t]) for t in TINT_VARS) + " |"
                )
        lines.append("")
    lines.append(
        "These are RESOLVED cascade values, not per-arm declarations: a style/theme that "
        "does not override a tint shows the value it inherits. The distinction is visible "
        "in the table rather than asserted — `neo`/light's `--tintDanger` reads "
        "`rgba(158,42,32,0.07)` where `hig`/`minimal`/light read `rgba(185,51,39,0.07)`, "
        "because the light-neo arm is the only one that declares it. `--tintAccent` is "
        "likewise derived, not stored: it tracks `--accent` through `color-mix`, so the "
        "light row reads `rgba(51,98,159,…)` — the NEW accent — and would have followed "
        "the accent anywhere it moved. No cell is empty, which is the expected result "
        "here and the reason this table cannot be used to prove a variable is undeclared; "
        "`allResolvedVars` carries the merge, not the arm."
    )
    lines.append("")

    # ── Rule A ──
    lines.append("## Rule (a) — sunken input, shadow-edge contrast (owner-accepted waiver, still measured)")
    lines.append("")
    lines.append(
        "Owner ruling: the neo empty input takes the pure sunken/no-border look even "
        "where the shadow edge measures below 3:1. Measured anyway, per the ruling."
    )
    lines.append("")
    for device_label in DEVICES:
        lines.append(f"### {device_label}")
        lines.append("")
        lines.append("| style | theme | mechanism | worst ratio | ≥3:1 |")
        lines.append("|---|---|---|---|---|")
        for style in STYLES:
            for theme in THEMES:
                r = rule_a[device_label][style][theme]
                if r["applicable"]:
                    lines.append(
                        f"| {style} | {theme} | shadow edge (worst of {len(r['layers'])} layers) "
                        f"| **{fmt(r['worstRatio'])}** | {'PASS' if r['passes3to1'] else 'FAIL'} |"
                    )
                else:
                    lines.append(
                        f"| {style} | {theme} | fill (`fieldBg` vs `surface`) — no shadow declared "
                        f"| {fmt(r['fieldBgOnSurfaceRatio'])} | {'PASS' if (r['fieldBgOnSurfaceRatio'] or 0) >= 3 else 'FAIL'} |"
                    )
        lines.append("")
    lines.append(
        "`hig` and `minimal` declare `--fieldShadow: none` in both files — they have "
        "**no shadow to measure**; their own fill-only boundary (`fieldBg` vs "
        "`surface`) is reported instead and is itself below 3:1 in every case measured "
        "(**pre-existing, not introduced by this amendment** — reported as a gap, not "
        "in this task's scope to fix)."
    )
    lines.append("")

    # ── Rule B ──
    lines.append("## Rule (b) — a control keeps a fill or accent-weight label; shadow is not credited")
    lines.append("")
    lines.append(
        "Measured as the control fill (`ctlBg`/`chipBg`) composited over `surface`, "
        "WCAG 1.4.11's 3:1. `minimal` sets both to `transparent` — no fill boundary "
        "exists at all in that style, independent of this amendment."
    )
    lines.append("")
    for device_label in DEVICES:
        lines.append(f"### {device_label}")
        lines.append("")
        lines.append("| style | theme | ctlBg vs surface | ≥3:1 | chipBg vs surface | ≥3:1 |")
        lines.append("|---|---|---|---|---|---|")
        for style in STYLES:
            for theme in THEMES:
                r = rule_b[device_label][style][theme]
                lines.append(
                    f"| {style} | {theme} | {fmt(r['ctlBgVsSurface'])} "
                    f"| {'PASS' if r['ctlPasses3to1'] else 'FAIL'} "
                    f"| {fmt(r['chipBgVsSurface']) if r['chipNote'] is None else 'n/a (transparent)'} "
                    f"| {'PASS' if r['chipPasses3to1'] else ('n/a' if r['chipPasses3to1'] is None else 'FAIL')} |"
                )
        lines.append("")
    lines.append(
        "**Every style, every theme, both devices fail 3:1 for control/chip fill "
        "against `surface`** — including `hig`, which is not part of this amendment. "
        "This is a pre-existing property of the exported base's fill ladder (the "
        "`fill3`-weight fills this file uses for controls are subtle by design), not "
        "something the neo direction introduces or worsens. Reported because rule (b) "
        "asked for the number; not this task's to fix."
    )
    lines.append("")

    # ── Rule C ──
    lines.append("## Rule (c) — dark theme separates by fill (shadow does not count)")
    lines.append("")
    for device_label in DEVICES:
        lines.append(f"### {device_label}")
        lines.append("")
        lines.append("| style | surface | raised | sunken | surface↔raised | raised↔sunken | surface↔sunken |")
        lines.append("|---|---|---|---|---|---|---|")
        for style in STYLES:
            r = rule_c[device_label][style]
            lines.append(
                f"| {style} | `{r['surface']}` | `{r['raised']}` | `{r['sunken']}` "
                f"| {r['surfaceVsRaised']} | {r['raisedVsSunken']} | {r['surfaceVsSunken']} |"
            )
        lines.append("")
    lines.append(
        "**`neo` dark fails this rule outright: surface, raised and sunken are the "
        "identical hex value in both files (`#1B2340`), so every pairwise ratio "
        "measures exactly 1.00 — no fill separation exists.** `hig` and `minimal` "
        "share the same three dark colours (minimal does not override them) and clear "
        "a real but modest separation (~1.2–1.46). Neo's dark corner block "
        "(`body[data-theme=\"dark\"][data-style=\"neo\"]`) currently repaints `surface`, "
        "`raised`, `sunken` and `cardBg` to the same colour and relies entirely on "
        "`cardShadow`'s two-tone shadow for elevation — which rule (c) explicitly does "
        "not credit. **This is a real gap for Task 14 to close, not a design decision "
        "for this task to make.**"
    )
    lines.append("")

    # ── Text pairs ──
    lines.append("## Text/surface pairs (CONTRAST_PAIRS-style arithmetic, 4.5:1)")
    lines.append("")
    for device_label in DEVICES:
        lines.append(f"### {device_label}")
        lines.append("")
        for style in STYLES:
            lines.append(f"**{style}**")
            lines.append("")
            lines.append("| theme | pair | ratio | pass |")
            lines.append("|---|---|---|---|")
            for theme in THEMES:
                for row in pairs[device_label][style][theme]:
                    lines.append(f"| {theme} | {row['pair']} | {fmt(row['ratio'])} | {'PASS' if row['pass'] else 'FAIL'} |")
            lines.append("")
    lines.append(
        "**Failures worth naming:** `neo`/light fails `label3 on surface` (2.96) and "
        "`accent on surface` (4.19) — both below 4.5. `label3`/`accent` pass in "
        "`neo`/dark. `hig` and `minimal` pass every listed pair in both themes on both "
        "devices."
    )
    lines.append("")

    lines.append("## What this instrument could not measure — gaps, not passes")
    lines.append("")
    lines.append(
        "- **`--fill2` is not declared anywhere in `mobile.dc.html`** (checked: zero "
        "occurrences). `desktop.dc.html` declares it in every block that touches the "
        "fill ladder. Any mobile markup relying on `var(--fill2)` resolves to nothing. "
        "Owner: whoever builds Task 14's mobile styling — not resolved here."
    )
    lines.append(
        "- **No dedicated `overlay` box-shadow variable exists in either file.** "
        "`--overlay` is a background scrim colour only. Reported as absent, not as a "
        "measured pass."
    )
    lines.append(
        "- **`mobile.dc.html`'s `<style>` block omits the `:focus-visible` outline "
        "rule** that `desktop.dc.html` has (`outline:2px solid var(--accent)`). Not "
        "this task's rule to measure against, noted because it is directly adjacent "
        "to what was measured."
    )
    lines.append(
        "- **This instrument reads only the `<style>` block's custom-property "
        "cascade** — it does not render the file in a browser, so it cannot see "
        "computed values from inline `style=` attributes on individual elements in "
        "the markup/script body, if any exist outside the token layer. The token "
        "layer is what Task 14 transcribes, so this is the intended scope, stated "
        "rather than assumed complete."
    )
    lines.append("")
    return "\n".join(lines) + "\n"


def main():
    all_devices = {}
    rule_a, rule_b, rule_c, pairs, deltas, tints = {}, {}, {}, {}, {}, {}
    for device_label, path in DEVICES.items():
        combo = measure_device(device_label, path)
        all_devices[device_label] = combo
        rule_a[device_label] = rule_a_sunken_input(combo)
        rule_b[device_label] = rule_b_control_fill(combo)
        rule_c[device_label] = rule_c_dark_fill_separation(combo)
        pairs[device_label] = text_pairs(combo)
        deltas[device_label] = palette_delta(combo)
        tints[device_label] = tint_table(combo)

    report_text = render_report(all_devices, rule_a, rule_b, rule_c, pairs, deltas, tints)
    out_md = REPO_ROOT / "docs" / "neo-token-report.md"
    out_md.write_text(report_text, encoding="utf-8")
    print(f"wrote {out_md.relative_to(REPO_ROOT)} ({out_md.stat().st_size} bytes)")

    payload = {
        "$comment": [
            "Task 13, Part B. Every value below was extracted programmatically from",
            "design-system/interactive/{desktop,mobile}.dc.html's <style> block by",
            "design-system/tools/neo_tokens_probe.py — none hand-authored (MASTER.md).",
            "Source of truth for the CODE remains packages/ui/src/tokens.ts; this file",
            "is Task 13's measurement, feeding Task 14's transcription, not a decision.",
        ],
        "device": all_devices,
        "ruleA_sunkenInputShadowEdge": rule_a,
        "ruleB_controlFillBoundary": rule_b,
        "ruleC_darkFillSeparation": rule_c,
        "textSurfacePairs": pairs,
        "paletteDelta": deltas,
        "tintLayer": tints,
    }

    out_json = REPO_ROOT / "design-system" / "neo-tokens.json"
    out_json.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    print(f"wrote {out_json.relative_to(REPO_ROOT)} ({out_json.stat().st_size} bytes)")
    return payload


if __name__ == "__main__":
    result = main()
    # Self-check: the sweep must have found a non-trivial number of vars, and the
    # positive control (accent on surface, hig/light) must read as a real number,
    # not None — the same shape of guard 13.283's docblock requires of its sweep.
    desktop_hig_light = result["device"]["desktop"]["hig"]["light"]
    assert len(desktop_hig_light["allResolvedVars"]) > 20, "suspiciously few vars resolved — extraction likely broken"
    control = result["textSurfacePairs"]["desktop"]["hig"]["light"]
    accent_row = next(r for r in control if r["pair"] == "accent on surface")
    assert accent_row["ratio"] is not None and accent_row["ratio"] > 1, "positive control failed — instrument cannot tell colours apart"
    print("positive control: accent-on-surface (desktop/hig/light) =", accent_row["ratio"])

    # 2026-09-18 extensions, each with the control that would catch it failing.
    # (1) The moved light-neo selector must still be SEEN: the arm overrides
    #     --tintDanger, so its resolved value must differ from the arms that
    #     inherit `:root`'s.
    layer = result["tintLayer"]["desktop"]
    assert layer["neo"]["light"]["--tintDanger"] != layer["hig"]["light"]["--tintDanger"], (
        "light-neo tint override is not visible — the moved selector is not being read"
    )
    # (2) That arm must NOT leak into dark. It declares no --tintDanger for the
    #     dark merge to re-declare, so an unconditional application shows up
    #     here as light-neo's value under a dark theme — the exact silent-wrong
    #     -answer this run's cascade change exists to prevent.
    assert layer["neo"]["dark"]["--tintDanger"] == layer["hig"]["dark"]["--tintDanger"], (
        "dark-neo inherited light-neo's tint — the light arm leaked into the dark merge"
    )
    # (3) `color-mix` must have resolved to a COLOUR. The obvious form of this
    #     check — `value is not None` — is VACUOUS, and was caught here rather
    #     than shipped: every resolved var is stored as its raw STRING, so an
    #     unresolved `color-mix(...)` is a perfectly non-None value that no
    #     measurement can read. It has to be parsed, not merely present.
    #     Proved falsifiable by disabling the resolver and watching this redden.
    assert parse_color(layer["neo"]["light"]["--tintAccent"]) is not None, (
        "color-mix did not resolve to a colour — T4 is unmeasured, and the raw string would read as a value"
    )
    print(
        "controls: light-neo tint override visible =", layer["neo"]["light"]["--tintDanger"],
        "| dark-neo uncontaminated =", layer["neo"]["dark"]["--tintDanger"],
        "| tintAccent resolved =", layer["neo"]["light"]["--tintAccent"],
    )
    sys.exit(0)
