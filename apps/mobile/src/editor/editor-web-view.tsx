import { useCallback, useMemo, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { EditorToHostMessage, HostToEditorMessage } from '@gisik-nokma/editor/webview-bridge';
import { parseRawEditorMessage, serializeHostMessage } from './editor-bridge.js';

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
  const { initialDoc, editable = true, html, onChange, onSubmit, onRequestUpload, onMentionQuery } = props;
  const source = useMemo(() => ({ html }), [html]);

  const send = useCallback((message: HostToEditorMessage): void => {
    ref.current?.postMessage(serializeHostMessage(message));
  }, []);

  const onMessage = useCallback(
    (event: WebViewMessageEvent): void => {
      const message = parseRawEditorMessage(event.nativeEvent.data);
      if (message === null) return;
      switch (message.kind) {
        case 'ready':
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
      }
    },
    [editable, initialDoc, onChange, onMentionQuery, onRequestUpload, onSubmit, send],
  );

  return <WebView ref={ref} originWhitelist={['about:*']} source={source} onMessage={onMessage} javaScriptEnabled />;
}
