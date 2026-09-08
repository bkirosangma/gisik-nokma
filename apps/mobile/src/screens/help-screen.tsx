import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import {
  HELP_CONTENT,
  searchHelp,
  type HelpBlock,
  type HelpDocument,
  type HelpSpan,
} from '@gisik-nokma/app-core';
import { helpPaletteFor, helpPalette, themeFor } from './help-theme.js';
import type { ThemeName } from '@gisik-nokma/ui/tokens';

/**
 * The manual and FAQ on the phone.
 *
 * ## Why this file exists at all, when web and desktop share one component
 *
 * React Native has no DOM: there is no `<p>`, no `<table>`, and `HelpBrowser`'s
 * markup means nothing here. What it CANNOT be is a second parse — this screen
 * reads exactly the same `HELP_CONTENT` the other two render, so a sentence
 * cannot say one thing on a laptop and another on a phone. Two renderers over
 * one parsed document is the floor; three parsers would have been the mistake.
 *
 * ## It works with no signal and no session
 *
 * The content is bundled with the app. `apps/mobile`'s board and ticket screens
 * are dark without a token and a workspace — this one is not, and that is the
 * point: the FAQ's answer to *"why can't I sign in"* is worth least behind a
 * sign-in, and its answer to *"what happens offline"* is worth least over a
 * network.
 *
 * ## Tables are rendered as labelled rows, not a grid
 *
 * A three-column markdown table does not fit a phone, and a horizontally
 * scrolling grid is worse than useless one-handed. Each row is drawn as its
 * header cell followed by its value, stacked — which loses the visual alignment
 * and keeps every word. That is the right trade for a document whose whole
 * purpose is being read.
 */

/**
 * Colours come from the design tokens, never as literals.
 *
 * React Native has no CSS custom properties, so `var(--gn-…)` — how every other
 * surface in this product reaches a colour — is simply unavailable here. The
 * `@gisik-nokma/ui/tokens` subpath is the answer: it resolves a role to its
 * value as a plain string, carries no runtime dependencies and, unlike the
 * package root, pulls no React DOM components into a React Native bundle.
 *
 * This is not merely tidy. `apps/mobile/src` is one of the token-discipline
 * scan's roots (`packages/ui/test/helpers/colour-scan.ts`), so a hex literal in
 * this file turns the branch red — which it did, in the first draft of this
 * screen, exactly as intended.
 *
 * It follows the device's appearance, and the reason it did not until 2026-09-08
 * turned out to be wrong.
 *
 * The note that stood here said pinning to light was deliberate because
 * "doing it here for one screen would leave the board and ticket screens light
 * while the help screen went dark". Measured: `board-screen.tsx` and
 * `ticket-screen.tsx` declare **no colours at all** — no `StyleSheet`, no
 * `color`, no `backgroundColor`. There was no light theme for this screen to
 * become inconsistent with. A deferral reason that is not checked is a deferral
 * that outlives its own justification, which is what happened here for a month.
 *
 * `useColorScheme()` answers `null` when the platform has no opinion, and `null`
 * means light — the same default the app had before. The styles are built per
 * theme and memoised, because `StyleSheet.create` at module scope can only ever
 * capture one of them.
 *
 * What this file CANNOT do alone is make the native shell follow the system:
 * that is `app.json`'s `userInterfaceStyle`, set to `automatic` in the same
 * change. Without it the OS never reports dark and this hook returns light
 * forever — a themed screen that can never be dark, which reads exactly like a
 * themed screen that works.
 */
export function makeHelpStyles(theme: ThemeName) {
  const token = helpPalette(theme);
  return StyleSheet.create({
  screen: { flex: 1, backgroundColor: token.surface },
  content: { padding: 16, paddingBottom: 48 },
  search: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: token.borderStrong,
    borderRadius: 6,
    paddingHorizontal: 12,
    fontSize: 16,
    color: token.text,
    backgroundColor: token.surfaceRaised,
    marginBottom: 16,
  },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tab: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: token.borderStrong,
    borderRadius: 6,
  },
  tabOn: { borderColor: token.accent, backgroundColor: token.surfaceSunken },
  tabText: { fontSize: 15, color: token.text },
  tabTextOn: { fontWeight: '600' },
  none: {
    padding: 12,
    borderWidth: 1,
    borderColor: token.border,
    borderLeftWidth: 3,
    borderLeftColor: token.warning,
    borderRadius: 6,
    marginBottom: 16,
  },
  resultTitle: { fontSize: 15, fontWeight: '600', color: token.accent, marginTop: 10 },
  resultWhere: { fontSize: 13, color: token.textMuted },
  h2: { fontSize: 20, fontWeight: '700', color: token.text, marginTop: 24, marginBottom: 8 },
  h3: { fontSize: 16, fontWeight: '600', color: token.text, marginTop: 16, marginBottom: 4 },
  p: { fontSize: 16, lineHeight: 24, color: token.text, marginBottom: 10 },
  quote: {
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: token.accent,
    marginBottom: 10,
  },
  listItem: { flexDirection: 'row', marginBottom: 6 },
  bullet: { width: 22, fontSize: 16, lineHeight: 24, color: token.textMuted },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: 'Courier', backgroundColor: token.surfaceSunken },
  cellLabel: { fontWeight: '600' },
  });
}

/**
 * Both sheets, built once at module load. `StyleSheet.create` registers styles
 * with the native side, so building them per render would churn that registry
 * on every keystroke in the search box; there are exactly two themes, so there
 * is nothing to compute lazily.
 */
const SHEETS = { light: makeHelpStyles('light'), dark: makeHelpStyles('dark') } as const;
type HelpStyles = (typeof SHEETS)['light'];

/** The sheet for a device appearance. */
function helpStylesFor(scheme: string | null | undefined): HelpStyles {
  return SHEETS[themeFor(scheme)];
}

function spanStyle(styles: HelpStyles, span: HelpSpan) {
  if (span.kind === 'bold') return styles.bold;
  if (span.kind === 'italic') return styles.italic;
  if (span.kind === 'code') return styles.code;
  return undefined;
}

function Spans({ spans, styles }: { spans: readonly HelpSpan[]; styles: HelpStyles }) {
  return (
    <>
      {spans.map((span, i) => (
        <Text key={i} style={spanStyle(styles, span)}>
          {span.text}
        </Text>
      ))}
    </>
  );
}

function Block({ block, styles }: { block: HelpBlock; styles: HelpStyles }) {
  if (block.kind === 'paragraph') {
    return (
      <Text style={styles.p}>
        <Spans spans={block.spans} styles={styles} />
      </Text>
    );
  }
  if (block.kind === 'quote') {
    return (
      <View style={styles.quote}>
        <Text style={styles.p}>
          <Spans spans={block.spans} styles={styles} />
        </Text>
      </View>
    );
  }
  if (block.kind === 'list') {
    return (
      <View>
        {block.items.map((item, i) => (
          <View key={i} style={styles.listItem}>
            {/* The marker is real text, so an ordered list still reads as steps
                in order — the manual is instructions and the numbers are load
                bearing. */}
            <Text style={styles.bullet}>{block.ordered ? `${i + 1}.` : '•'}</Text>
            <Text style={[styles.p, { flex: 1 }]}>
              <Spans spans={item} styles={styles} />
            </Text>
          </View>
        ))}
      </View>
    );
  }
  return (
    <View>
      {block.rows.map((row, r) => (
        <View key={r} style={{ marginBottom: 10 }}>
          {row.map((cell, c) => (
            <Text key={c} style={styles.p}>
              {block.head[c] !== undefined ? (
                <Text style={styles.cellLabel}>
                  <Spans spans={block.head[c]} styles={styles} />
                  {': '}
                </Text>
              ) : null}
              <Spans spans={cell} styles={styles} />
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function Blocks({ blocks, styles }: { blocks: readonly HelpBlock[]; styles: HelpStyles }) {
  return (
    <>
      {blocks.map((block, i) => (
        <Block key={i} block={block} styles={styles} />
      ))}
    </>
  );
}

export function HelpScreen() {
  // The device's appearance, read at render. `useColorScheme()` re-renders when
  // the OS setting changes, so switching a phone to dark mode with this screen
  // open moves it — and `null` (no opinion) resolves to light, the behaviour
  // this screen already had.
  const styles = helpStylesFor(useColorScheme());
  const [query, setQuery] = useState('');
  const [documentId, setDocumentId] = useState<HelpDocument['id']>('manual');
  const result = useMemo(() => searchHelp(HELP_CONTENT, query), [query]);
  const active = HELP_CONTENT.find((d) => d.id === documentId) ?? HELP_CONTENT[0];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Search the manual and FAQ"
        accessibilityLabel="Search the manual and FAQ"
        autoCorrect={false}
      />

      {result.kind === 'matches' ? (
        <View>
          <Text style={styles.p}>
            {result.matches.length} {result.matches.length === 1 ? 'answer' : 'answers'}
          </Text>
          {result.matches.map((match) => (
            <View key={`${match.document}-${match.entry.id}`}>
              <Text style={styles.resultTitle}>{match.entry.title}</Text>
              <Text style={styles.resultWhere}>
                {match.documentTitle} · {match.sectionTitle}
              </Text>
              {match.excerpt.length > 0 ? <Text style={styles.p}>{match.excerpt}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {result.kind === 'none' && result.reason.kind === 'no-match' ? (
        <View style={styles.none}>
          {/* Which KIND of nothing, exactly as the other surfaces say it. */}
          <Text style={styles.p}>
            Nothing matches “{result.reason.query}”. All {result.reason.searched} entries were
            searched, so this is a real absence rather than a search that did not run — the product
            may simply not do that thing yet.
          </Text>
        </View>
      ) : null}

      <View style={styles.tabs}>
        {HELP_CONTENT.map((doc) => (
          <Pressable
            key={doc.id}
            style={[styles.tab, doc.id === documentId ? styles.tabOn : null]}
            accessibilityRole="button"
            accessibilityState={{ selected: doc.id === documentId }}
            onPress={() => setDocumentId(doc.id)}
          >
            <Text style={[styles.tabText, doc.id === documentId ? styles.tabTextOn : null]}>
              {doc.id === 'manual' ? 'Manual' : 'FAQ'}
            </Text>
          </Pressable>
        ))}
      </View>

      {active === undefined ? null : (
        <View>
          <Blocks blocks={active.intro} styles={styles} />
          {active.sections.map((section) => (
            <View key={section.id}>
              <Text style={styles.h2}>{section.title}</Text>
              <Blocks blocks={section.intro} styles={styles} />
              {section.entries.map((entry) => (
                <View key={entry.id}>
                  <Text style={styles.h3}>{entry.title}</Text>
                  <Blocks blocks={entry.blocks} styles={styles} />
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
