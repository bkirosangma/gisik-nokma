### Task 12a: The Google Picker — attaching a Drive file as a reference

Owner sign-off 2026-08-20: Drive files may be attached **as references only**, through the Google Picker under the non-sensitive per-file `drive.file` scope, reusing the Google OAuth the workspace already signs in with. Nothing is copied; the `attachment.added` event *is* the whole record (a reference has no bytes, so it has no `attachments` row and no object key).

**Configuration.** `packages/editor` never reads `process.env` — it is one library behind three shells, and only a shell knows its own environment. The host passes a `DrivePickerConfig`; `apps/web` fills it from:

| Variable | What it is |
|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | The **same** OAuth client id as Google sign-in (Plan 4's server-side `GOOGLE_CLIENT_ID`). `drive.file` is added by **incremental consent at the moment of picking** — it is never appended to the sign-in request, so signing in stays a sign-in. |
| `NEXT_PUBLIC_GOOGLE_PICKER_API_KEY` | The Picker developer key (a browser key, restricted by HTTP referrer). |
| `NEXT_PUBLIC_GOOGLE_APP_ID` | The Google Cloud project number. The Picker requires it to hand back per-file (`drive.file`) grants. |

Server-side `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (Plan 4, better-auth's social provider) are untouched: this flow needs no server involvement at all.

**Files:**
- Create: `packages/editor/src/drive/google-picker.ts`
- Create: `packages/editor/src/drive/attachment-claims.ts`
- Modify: `packages/editor/src/index.ts` (exports)
- Test: `packages/editor/test/google-picker.test.ts`

**Interfaces:**
- Consumes: `DRIVE_FILE_SCOPE`, `DriveReference`, `isDriveReference`, `newUlid` (`@gisik-nokma/domain`, Task 11a and Plan 1).
- Produces (cross-plan API — Plan 6's ticket sheet and Plan 10's shells consume these):
  - `type DrivePickerConfig = { clientId: string; developerKey: string; appId: string }`
  - `type PickedDriveFile = { id: string; name: string; mimeType: string; url?: string; iconUrl?: string }`
  - `type DrivePickerDeps = { loadScript(src): Promise<void>; google(): GooglePickerGlobals; gapi(): GapiGlobals; now(): Date }`; `createBrowserPickerDeps(): DrivePickerDeps`
  - `GOOGLE_GSI_SRC`, `GOOGLE_API_SRC`
  - `requestDriveFileToken(config, deps): Promise<string>` — asks for `DRIVE_FILE_SCOPE` and nothing else
  - `openDrivePicker(config, deps): Promise<DriveReference[]>` — resolves `[]` when the user cancels
  - `toDriveReference(picked: PickedDriveFile, capturedAt: Date): DriveReference`
  - `composeDriveReferenceAdded(reference, mintId?): { type: 'attachment.added'; payload: { kind: 'drive-reference'; attachmentId: string } & DriveReference }` and `composeUploadAttachmentAdded(result: UploadResult): { type: 'attachment.added'; payload: { kind: 'upload'; attachmentId; filename; mime; size; sha256 } }` — the two claims a client submits through `POST /v1/events`, composed in one place so no shell hand-builds a payload (pending Plan 3 amendment; see Open questions)

- [ ] **Step 1: Write the failing picker test**

`packages/editor/test/google-picker.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { DRIVE_FILE_SCOPE, isDriveReference } from '@gisik-nokma/domain';
import { composeDriveReferenceAdded, composeUploadAttachmentAdded } from '../src/drive/attachment-claims.js';
import {
  GOOGLE_API_SRC,
  GOOGLE_GSI_SRC,
  openDrivePicker,
  requestDriveFileToken,
  toDriveReference,
  type DrivePickerConfig,
  type DrivePickerDeps,
} from '../src/drive/google-picker.js';

const CONFIG: DrivePickerConfig = { clientId: 'client-123.apps.googleusercontent.com', developerKey: 'dev-key', appId: '48291057' };

const DOC = {
  id: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
  name: 'GST filing Aug 2026.pdf',
  mimeType: 'application/pdf',
  url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
  iconUrl: 'https://drive-thirdparty.googleusercontent.com/16/type/application/pdf',
};

/** A fake Google, recording exactly what the picker was configured with. */
function fakeGoogle(action: 'picked' | 'cancel', docs = [DOC]) {
  const seen = { scopes: [] as string[], prompts: [] as string[], token: '', developerKey: '', appId: '', views: 0, visible: false };
  const google = {
    accounts: {
      oauth2: {
        initTokenClient(config: { client_id: string; scope: string; callback: (response: { access_token?: string; error?: string }) => void }) {
          seen.scopes.push(config.scope);
          return {
            requestAccessToken(overrides?: { prompt?: string }) {
              seen.prompts.push(overrides?.prompt ?? '(none)');
              config.callback({ access_token: 'ya29.fake-token' });
            },
          };
        },
      },
    },
    picker: {
      DocsView: class {},
      Action: { PICKED: 'picked', CANCEL: 'cancel' },
      PickerBuilder: class {
        addView() { seen.views += 1; return this; }
        setOAuthToken(token: string) { seen.token = token; return this; }
        setDeveloperKey(key: string) { seen.developerKey = key; return this; }
        setAppId(appId: string) { seen.appId = appId; return this; }
        setCallback(cb: (data: { action: string; docs?: typeof docs }) => void) { this.cb = cb; return this; }
        cb: ((data: { action: string; docs?: typeof docs }) => void) | null = null;
        build() {
          const cb = this.cb;
          return {
            setVisible: (visible: boolean) => {
              seen.visible = visible;
              cb?.(action === 'picked' ? { action: 'picked', docs } : { action: 'cancel' });
            },
          };
        }
      },
    },
  };
  return { google, seen };
}

function deps(google: unknown, loaded: string[] = []): DrivePickerDeps {
  return {
    loadScript: vi.fn(async (src: string) => {
      loaded.push(src);
    }),
    google: () => google as never,
    gapi: () => ({ load: (_name: string, cb: () => void) => cb() }),
    now: () => new Date('2026-08-20T10:00:00.000Z'),
  };
}

describe('the Google Picker path', () => {
  it('asks for the per-file scope and nothing else, with incremental consent', async () => {
    const { google, seen } = fakeGoogle('picked');
    const token = await requestDriveFileToken(CONFIG, deps(google));
    expect(token).toBe('ya29.fake-token');
    expect(seen.scopes).toEqual([DRIVE_FILE_SCOPE]);
    // Incremental: no forced consent screen when the grant already exists.
    expect(seen.prompts).toEqual(['']);
  });

  it('planted defect: the requested scope is exactly one non-sensitive scope', async () => {
    const { google, seen } = fakeGoogle('picked');
    await requestDriveFileToken(CONFIG, deps(google));
    const requested = seen.scopes[0]!;
    expect(requested.split(' ')).toHaveLength(1);
    expect(requested).toBe('https://www.googleapis.com/auth/drive.file');
    for (const broader of ['drive.readonly', 'auth/drive ', 'drive.metadata']) {
      expect(requested).not.toContain(broader);
    }
  });

  it('loads both Google scripts, configures the picker, and maps the picked file to a reference', async () => {
    const loaded: string[] = [];
    const { google, seen } = fakeGoogle('picked');
    const references = await openDrivePicker(CONFIG, deps(google, loaded));
    expect(loaded).toEqual([GOOGLE_GSI_SRC, GOOGLE_API_SRC]);
    expect(seen).toMatchObject({ token: 'ya29.fake-token', developerKey: 'dev-key', appId: '48291057', visible: true });
    expect(references).toHaveLength(1);
    expect(references[0]).toEqual({
      driveFileId: DOC.id,
      name: DOC.name,
      mimeType: DOC.mimeType,
      webViewLink: DOC.url,
      iconLink: DOC.iconUrl,
      capturedAt: '2026-08-20T10:00:00.000Z',
    });
    expect(isDriveReference(references[0])).toBe(true);
  });

  it('cancelling attaches nothing', async () => {
    const { google } = fakeGoogle('cancel');
    await expect(openDrivePicker(CONFIG, deps(google))).resolves.toEqual([]);
  });

  it('planted defect: a doc without a usable view link is dropped, never guessed at', async () => {
    const { google } = fakeGoogle('picked', [{ ...DOC, url: undefined } as typeof DOC]);
    await expect(openDrivePicker(CONFIG, deps(google))).resolves.toEqual([]);
  });

  it('composes an upload claim from the server answer, hash included', () => {
    const event = composeUploadAttachmentAdded({
      attachmentId: '01J9GATA000000000000000000',
      url: '/v1/attachments/01J9GATA000000000000000000',
      mime: 'image/png',
      filename: 'shelf.png',
      size: 12,
      sha256: 'b'.repeat(64),
    });
    expect(event.payload).toEqual({
      kind: 'upload',
      attachmentId: '01J9GATA000000000000000000',
      filename: 'shelf.png',
      mime: 'image/png',
      size: 12,
      sha256: 'b'.repeat(64),
    });
    // The URL is a transport detail, not part of the claim.
    expect(event.payload).not.toHaveProperty('url');
  });

  it('composes attachment.added as a drive-reference claim with a fresh ULID', () => {
    const reference = toDriveReference(DOC, new Date('2026-08-20T10:00:00.000Z'));
    const event = composeDriveReferenceAdded(reference, () => '01J9GATD000000000000000000');
    expect(event).toEqual({
      type: 'attachment.added',
      payload: {
        kind: 'drive-reference',
        attachmentId: '01J9GATD000000000000000000',
        driveFileId: DOC.id,
        name: DOC.name,
        mimeType: DOC.mimeType,
        webViewLink: DOC.url,
        iconLink: DOC.iconUrl,
        capturedAt: '2026-08-20T10:00:00.000Z',
      },
    });
  });
});
```

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/google-picker.test.ts`
Expected: FAIL — the modules do not exist.

- [ ] **Step 2: Implement the picker module**

`packages/editor/src/drive/google-picker.ts`:

```ts
import { DRIVE_FILE_SCOPE, type DriveReference } from '@gisik-nokma/domain';

export const GOOGLE_GSI_SRC = 'https://accounts.google.com/gsi/client';
export const GOOGLE_API_SRC = 'https://apis.google.com/js/api.js';

/**
 * Supplied by the host shell, never read from process.env in here (this
 * package is shared by Next.js, Tauri and an RN webview). `clientId` is
 * the same OAuth client as Google sign-in: drive.file is requested by
 * incremental consent at pick time, so signing in never asks for Drive.
 */
export type DrivePickerConfig = { clientId: string; developerKey: string; appId: string };

/** A row of Google's picker callback payload, in the fields we read. */
export type PickedDriveFile = { id: string; name: string; mimeType: string; url?: string; iconUrl?: string };

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken(overrides?: { prompt?: string }): void };
type PickerCallbackData = { action: string; docs?: PickedDriveFile[] };

type PickerBuilder = {
  addView(view: unknown): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setAppId(appId: string): PickerBuilder;
  setCallback(callback: (data: PickerCallbackData) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
};

export type GooglePickerGlobals = {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
      }): TokenClient;
    };
  };
  picker: {
    PickerBuilder: new () => PickerBuilder;
    DocsView: new () => unknown;
    Action: { PICKED: string; CANCEL: string };
  };
};

export type GapiGlobals = { load(name: string, callback: () => void): void };

export type DrivePickerDeps = {
  loadScript(src: string): Promise<void>;
  google(): GooglePickerGlobals;
  gapi(): GapiGlobals;
  /** Injected clock: capturedAt is a fact about when we looked. */
  now(): Date;
};

/** Real-browser deps. Tests inject fakes; nothing here touches the network in a test run. */
export function createBrowserPickerDeps(): DrivePickerDeps {
  const loaded = new Map<string, Promise<void>>();
  return {
    loadScript(src) {
      const existing = loaded.get(src);
      if (existing) return existing;
      const pending = new Promise<void>((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = src;
        tag.async = true;
        tag.onload = () => resolve();
        tag.onerror = () => reject(new Error(`could not load ${src}`));
        document.head.append(tag);
      });
      loaded.set(src, pending);
      return pending;
    },
    google: () => (globalThis as unknown as { google: GooglePickerGlobals }).google,
    gapi: () => (globalThis as unknown as { gapi: GapiGlobals }).gapi,
    now: () => new Date(),
  };
}

/**
 * One access token, one scope: DRIVE_FILE_SCOPE. `prompt: ''` is the
 * incremental-consent request — Google shows a consent screen only if this
 * user has not already granted it, and the sign-in session is reused.
 */
export async function requestDriveFileToken(config: DrivePickerConfig, deps: DrivePickerDeps): Promise<string> {
  await deps.loadScript(GOOGLE_GSI_SRC);
  return new Promise<string>((resolve, reject) => {
    const client = deps.google().accounts.oauth2.initTokenClient({
      client_id: config.clientId,
      scope: DRIVE_FILE_SCOPE,
      callback: (response) => {
        if (typeof response.access_token === 'string' && response.access_token.length > 0) resolve(response.access_token);
        else reject(new Error(response.error ?? 'Google did not grant access to the picked file.'));
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/**
 * A picked file becomes a reference: the name and type Drive reported, the
 * link, and the instant we looked. Nothing is fetched, nothing is copied.
 */
export function toDriveReference(picked: PickedDriveFile, capturedAt: Date): DriveReference {
  const reference: DriveReference = {
    driveFileId: picked.id,
    name: picked.name,
    mimeType: picked.mimeType,
    webViewLink: picked.url ?? '',
    capturedAt: capturedAt.toISOString(),
  };
  if (picked.iconUrl !== undefined) reference.iconLink = picked.iconUrl;
  return reference;
}

/**
 * Open Google's own picker and resolve the references the user chose.
 * Cancelling resolves `[]` — an empty pick is not an error. A doc Google
 * hands back without a view link is dropped rather than have us invent a
 * URL for it: a link we constructed is not a link Drive gave us.
 */
export async function openDrivePicker(config: DrivePickerConfig, deps: DrivePickerDeps): Promise<DriveReference[]> {
  const token = await requestDriveFileToken(config, deps);
  await deps.loadScript(GOOGLE_API_SRC);
  await new Promise<void>((resolve) => {
    deps.gapi().load('picker', () => resolve());
  });
  const google = deps.google();
  return new Promise<DriveReference[]>((resolve) => {
    const picker = new google.picker.PickerBuilder()
      .addView(new google.picker.DocsView())
      .setOAuthToken(token)
      .setDeveloperKey(config.developerKey)
      .setAppId(config.appId)
      // google.picker.Response.ACTION and .DOCUMENTS are literally the
      // strings 'action' and 'docs'; reading the keys is the same data.
      .setCallback((data) => {
        if (data.action !== google.picker.Action.PICKED) {
          if (data.action === google.picker.Action.CANCEL) resolve([]);
          return;
        }
        const capturedAt = deps.now();
        resolve((data.docs ?? []).map((doc) => toDriveReference(doc, capturedAt)).filter((ref) => ref.webViewLink !== ''));
      })
      .build();
    picker.setVisible(true);
  });
}
```

`packages/editor/src/drive/attachment-claims.ts`:

```ts
import { type DriveReference, newUlid } from '@gisik-nokma/domain';
import type { UploadResult } from '../upload.js';

export type UploadAttachmentAddedEvent = {
  type: 'attachment.added';
  payload: { kind: 'upload'; attachmentId: string; filename: string; mime: string; size: number; sha256: string };
};

export type DriveReferenceAddedEvent = {
  type: 'attachment.added';
  payload: { kind: 'drive-reference'; attachmentId: string } & DriveReference;
};

/**
 * The claim that puts an uploaded file on a ticket. Every value comes from
 * the upload's 201 answer — the sniffed mime, the measured size, the
 * server's hash — because the local File's claims are exactly what the
 * server declined to trust. Composed here, in one place, so no shell
 * hand-builds this payload.
 */
export function composeUploadAttachmentAdded(result: UploadResult): UploadAttachmentAddedEvent {
  return {
    type: 'attachment.added',
    payload: {
      kind: 'upload',
      attachmentId: result.attachmentId,
      filename: result.filename,
      mime: result.mime,
      size: result.size,
      sha256: result.sha256,
    },
  };
}

/**
 * The claim that puts a Drive file on a ticket. There is no upload call and
 * no server row: a reference has no bytes, so the event IS the record
 * (spec §2 — "events carry references"). The client submits it through
 * POST /v1/events like any other claim.
 */
export function composeDriveReferenceAdded(
  reference: DriveReference,
  mintId: () => string = newUlid,
): DriveReferenceAddedEvent {
  return { type: 'attachment.added', payload: { kind: 'drive-reference', attachmentId: mintId(), ...reference } };
}
```

Append to `packages/editor/src/index.ts`:

```ts
export {
  createBrowserPickerDeps,
  openDrivePicker,
  requestDriveFileToken,
  toDriveReference,
  GOOGLE_API_SRC,
  GOOGLE_GSI_SRC,
  type DrivePickerConfig,
  type DrivePickerDeps,
  type PickedDriveFile,
} from './drive/google-picker.js';
export {
  composeDriveReferenceAdded,
  composeUploadAttachmentAdded,
  type DriveReferenceAddedEvent,
  type UploadAttachmentAddedEvent,
} from './drive/attachment-claims.js';
```

- [ ] **Step 3: Run the picker test to verify it passes**

Run: `pnpm --filter @gisik-nokma/editor exec vitest run test/google-picker.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 4: Commit**

```bash
git add packages/editor
git commit -m "Attach Drive files as references through Google's own picker: one non-sensitive per-file scope asked for at pick time, a pointer recorded as a claim, and a doc without a real link dropped rather than guessed at"
```

---

