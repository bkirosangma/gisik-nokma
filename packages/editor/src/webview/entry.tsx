import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { TicketEditor } from '../components/TicketEditor.js';
import { serializeEditorMessage, type EditorToHostMessage } from './bridge.js';
import { createEditorBridge, type EditorBridge } from './create-editor-bridge.js';
import '../styles/editor.css';

function post(message: EditorToHostMessage): void {
  const json = serializeEditorMessage(message);
  const rnWebView = (window as { ReactNativeWebView?: { postMessage(data: string): void } }).ReactNativeWebView;
  if (rnWebView) {
    rnWebView.postMessage(json);
  } else {
    // Browser dev harness: the parent frame plays host.
    window.parent.postMessage(json, '*');
  }
}

function WebviewEditorApp(): React.JSX.Element {
  const editorRef = useRef<Editor | null>(null);
  const bridgeRef = useRef<EditorBridge | null>(null);

  const handleReady = (): void => {
    const editor = editorRef.current;
    if (!editor || bridgeRef.current) return;
    const bridge = createEditorBridge({ editor, post });
    bridgeRef.current = bridge;

    const onMessage = (event: MessageEvent): void => {
      let data: unknown = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return; // hostile/foreign string — ignored
        }
      }
      bridge.handleHostMessage(data);
    };
    // iOS delivers on window, Android's RN WebView on document — listen on both.
    window.addEventListener('message', onMessage);
    document.addEventListener('message', onMessage as EventListener);
  };

  useEffect(
    () => () => {
      bridgeRef.current?.dispose();
    },
    [],
  );

  return (
    <TicketEditor
      queryUsers={(query) => bridgeRef.current?.resolveMentions(query) ?? Promise.resolve([])}
      // The note picker's data source, over the same round trip: the note list
      // lives on the host, and the WebView has no access to it.
      queryNotes={(query) => bridgeRef.current?.resolveNotes(query) ?? Promise.resolve([])}
      // Files never cross the bridge: the host owns uploads end to end.
      uploadAttachment={() => Promise.reject(new Error('uploads are host-mediated in the webview'))}
      onAttachmentAdded={() => {}}
      captureFiles={() => {
        bridgeRef.current?.requestUpload();
        return true;
      }}
      onSubmit={(doc) => post({ bridge: 1, kind: 'submit', doc })}
      onEditorReady={handleReady}
      editorRef={editorRef}
    />
  );
}

const rootElement = document.getElementById('editor-root');
if (rootElement) {
  createRoot(rootElement).render(<WebviewEditorApp />);
}
