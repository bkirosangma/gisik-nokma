import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useColorScheme, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { EditorToHostMessage, HostToEditorMessage } from '@gisik-nokma/editor/webview-bridge';
import { loadDocMessage, parseRawEditorMessage, serializeHostMessage } from './editor-bridge.js';
import {
  EDITOR_LOAD_FAILURE_MESSAGE,
  EDITOR_PARSE_FAILURE_MESSAGE,
  EDITOR_READY_TIMEOUT_MESSAGE,
  EDITOR_READY_TIMEOUT_MS,
  readyTimedOut,
} from './editor-refusals.js';
import { EDITOR_FRAME_STYLE, EDITOR_LOADING_OVERLAY_STYLE, EDITOR_MIN_HEIGHT } from './editor-band.js';
import { SkeletonBlock } from '../components/skeleton.js';
import { skeletonGround } from '../components/skeleton-model.js';
import { themeFor } from '../screens/help-theme.js';

type LoadDocMessage = Extract<HostToEditorMessage, { kind: 'loadDoc' }>;
type ChangeMessage = Extract<EditorToHostMessage, { kind: 'change' }>;
type SubmitMessage = Extract<EditorToHostMessage, { kind: 'submit' }>;
type MentionResultsMessage = Extract<HostToEditorMessage, { kind: 'mentionResults' }>;

/** Structural, not redeclared — the one place this app names the shape of a mention result. */
export type MentionResult = MentionResultsMessage['users'][number];

export type EditorWebViewProps = {
  /**
   * `DocJson | null` (the protocol's own `loadDoc.doc` type) — deliberately
   * NOT `unknown`. `undefined` typechecked here once and was a real bug:
   * `JSON.stringify` drops an `undefined` property entirely, so a `loadDoc`
   * sent with `doc: undefined` arrives at the editor as if `doc` were never
   * present, `parseHostMessage` refuses the whole message, `setEditable`
   * never runs, and the editor silently comes up fully editable with no
   * document loaded — the opposite of what `editable={false}` asked for.
   * `null` is the protocol's real "nothing to load" value and round-trips
   * correctly; pass that, never `undefined`.
   */
  initialDoc: LoadDocMessage['doc'];
  editable?: boolean;
  /** Trash Plan 3: ids of permanently erased items; chips to them in `initialDoc` draw "Deleted item". */
  purgedIds?: readonly string[];
  /** The bundled webview page — `packages/editor`'s `build:webview` output, baked in by `scripts/generate-editor-html.mjs`. */
  html: string;
  onChange(doc: ChangeMessage['doc']): void;
  onSubmit?(doc: SubmitMessage['doc']): void;
  /**
   * Fire-and-forget: the editor does not wait for a reply and there is no
   * completion path back into it today — this component exposes no way to
   * send `insertImage` (or `uploadFailed`) once a host upload finishes, so
   * wiring this callback lets the host run its own upload but the result
   * can never be inserted into the document. Full attach support is out of
   * Task 17's scope; wire this only once a completion path is added.
   */
  onRequestUpload?(): void;
  onMentionQuery?(query: string): Promise<MentionResult[]>;
  /**
   * E2-53: the host's three refusal doors — a frame that failed to parse, the
   * `WebView` itself failing to load, and `ready` never arriving — all report
   * through this one callback rather than staying silent.
   */
  onEditorError?(message: string): void;
};

/**
 * RN host for Plan 7's webview editor. Speaks the REAL versioned
 * `{bridge, kind}` protocol (`packages/editor/src/webview/bridge.ts`), not
 * a locally-invented one — `StreamItem` already taught this codebase what
 * happens when a client redeclares a frame union by hand (app-core's
 * replica docs). Uses `WebView.postMessage`, which the bundled page already
 * listens for on both `window` (iOS) and `document` (Android) — see
 * `packages/editor/src/webview/entry.tsx` — rather than hand-built
 * `injectJavaScript` scripts.
 */
export function EditorWebView(props: EditorWebViewProps) {
  const ref = useRef<WebView>(null);
  const { initialDoc, editable = true, purgedIds, html, onChange, onSubmit, onRequestUpload, onMentionQuery, onEditorError } = props;
  const source = useMemo(() => ({ html }), [html]);
  const ground = skeletonGround(themeFor(useColorScheme()));
  const readyReceivedRef = useRef(false);

  const send = useCallback((message: HostToEditorMessage): void => {
    ref.current?.postMessage(serializeHostMessage(message));
  }, []);

  // Door (c): `ready` never arriving used to wait forever with nothing on
  // screen. `readyTimedOut` is the pure decision; this effect is the one
  // impure place it fires from.
  useEffect(() => {
    readyReceivedRef.current = false;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      if (readyTimedOut({ readyReceived: readyReceivedRef.current, elapsedMs: Date.now() - startedAt, timeoutMs: EDITOR_READY_TIMEOUT_MS })) {
        onEditorError?.(EDITOR_READY_TIMEOUT_MESSAGE);
      }
    }, EDITOR_READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [html, onEditorError]);

  const onMessage = useCallback(
    (event: WebViewMessageEvent): void => {
      const message = parseRawEditorMessage(event.nativeEvent.data);
      // Door (a): a frame that failed to parse used to be dropped silently.
      if (message === null) {
        onEditorError?.(EDITOR_PARSE_FAILURE_MESSAGE);
        return;
      }
      switch (message.kind) {
        case 'ready':
          readyReceivedRef.current = true;
          send(loadDocMessage(initialDoc, editable, purgedIds));
          break;
        case 'change':
          onChange(message.doc);
          break;
        case 'submit':
          onSubmit?.(message.doc);
          break;
        case 'requestUpload':
          onRequestUpload?.();
          break;
        case 'mentionQuery': {
          const requestId = message.requestId;
          void (onMentionQuery?.(message.query) ?? Promise.resolve([]))
            .catch(() => [] as MentionResult[]) // an unanswered mentionQuery leaves the popup pending forever — always reply in-protocol
            .then((users) => send({ bridge: 1, kind: 'mentionResults', requestId, users }));
          break;
        }
        case 'noteQuery': {
          // ALWAYS REPLY, for the reason the arm above states in its own
          // comment — a dropped request leaves the editor's picker pending
          // forever. The answer is EMPTY because this app has no notes surface
          // yet: no screen reads notes, so there is nothing to search, and the
          // picker's honest outcome is "No notes match". Inventing a source
          // here would put a stub behind a promise the reader would take for a
          // real search.
          //
          // ⚠ WHEN MOBILE GAINS NOTES, THIS IS THE SEAM TO WIDEN — and it
          // should take an `onNoteQuery` prop then, exactly as
          // `onMentionQuery` does, rather than growing a store in this file.
          send({ bridge: 1, kind: 'noteResults', requestId: message.requestId, candidates: [] });
          break;
        }
        case 'ticketQuery': {
          // THE SAME RULE `noteQuery` FOLLOWS, ABOVE, for the same reason: this
          // app has no ticket search surface yet, so the honest answer is
          // empty rather than a stub behind a promise nobody built. When
          // mobile gains one, this is the seam to widen — an `onTicketQuery`
          // prop, exactly as `onMentionQuery` does.
          send({ bridge: 1, kind: 'ticketResults', requestId: message.requestId, candidates: [] });
          break;
        }
      }
    },
    [editable, initialDoc, onChange, onEditorError, onMentionQuery, onRequestUpload, onSubmit, purgedIds, send],
  );

  return (
    <WebView
      ref={ref}
      originWhitelist={['about:*']}
      source={source}
      style={EDITOR_FRAME_STYLE}
      // The page is loading: a skeleton of the editor's own height COVERS the WebView (an absolute overlay on the screen's ground, see
      // `EDITOR_LOADING_OVERLAY_STYLE`), so the ScrollView keeps its band and the slot does not grow while the page loads (spec §3.3).
      startInLoadingState
      renderLoading={() => (
        <View style={[EDITOR_LOADING_OVERLAY_STYLE, { backgroundColor: ground }]}>
          <SkeletonBlock height={EDITOR_MIN_HEIGHT} />
        </View>
      )}
      onMessage={onMessage}
      javaScriptEnabled
      // Door (b): the WebView itself failing to load used to render a blank
      // rectangle with nothing telling the person why.
      onError={() => onEditorError?.(EDITOR_LOAD_FAILURE_MESSAGE)}
      onHttpError={() => onEditorError?.(EDITOR_LOAD_FAILURE_MESSAGE)}
    />
  );
}
