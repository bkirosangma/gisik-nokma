import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * The RN webview bundle: ONE self-contained html file (scripts and styles
 * inlined) so Plan 10 can ship it as a static asset with no dev server
 * and no network fetches inside the WebView.
 */
export default defineConfig({
  root: 'src/webview',
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: '../../dist-webview',
    emptyOutDir: true,
  },
});
