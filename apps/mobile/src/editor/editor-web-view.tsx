import { useCallback, useEffect, useMemo, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { EditorToHostMessage, HostToEditorMessage } from '@gisik-nokma/editor/webview-bridge';
import { parseRawEditorMessage, serializeHostMessage } from './editor-bridge.js';
import {
  EDITOR_LOAD_FAILURE_MESSAGE,
  EDITOR_PARSE_FAILURE_MESSAGE,
  EDITOR_READY_TIMEOUT_MESSAGE,
  EDITOR_READY_TIMEOUT_MS,
  readyTimedOut,
} from './editor-refusals.js';

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
  const { initialDoc, editable = true, html, onChange, onSubmit, onRequestUpload, onMentionQuery, onEditorError } = props;
  const source = useMemo(() => ({ html }), [html]);
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
          send({ bridge: 1, kind: 'loadDoc', doc: initialDoc, editable });
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
      }
    },
    [editable, initialDoc, onChange, onEditorError, onMentionQuery, onRequestUpload, onSubmit, send],
  );

  return (
    <WebView
      ref={ref}
      originWhitelist={['about:*']}
      source={source}
      onMessage={onMessage}
      javaScriptEnabled
      // Door (b): the WebView itself failing to load used to render a blank
      // rectangle with nothing telling the person why.
      onError={() => onEditorError?.(EDITOR_LOAD_FAILURE_MESSAGE)}
      onHttpError={() => onEditorError?.(EDITOR_LOAD_FAILURE_MESSAGE)}
    />
  );
}
