import { describe, expect, it, vi } from 'vitest';
import {
  attachmentDriveReferencePayload,
  attachmentUploadedPayload,
  DRIVE_FILE_SCOPE,
  isDriveReference,
} from '@gisik-nokma/domain';
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
    const { google } = fakeGoogle('picked', [{ ...DOC, url: undefined } as unknown as typeof DOC]);
    await expect(openDrivePicker(CONFIG, deps(google))).resolves.toEqual([]);
  });

  it('a failed load of the GSI script rejects and never opens the picker', async () => {
    const { google, seen } = fakeGoogle('picked');
    const failing: DrivePickerDeps = {
      loadScript: vi.fn(async (src: string) => {
        if (src === GOOGLE_GSI_SRC) throw new Error('blocked by content blocker');
      }),
      google: () => google as never,
      gapi: () => ({ load: (_name: string, cb: () => void) => cb() }),
      now: () => new Date('2026-08-20T10:00:00.000Z'),
    };
    await expect(openDrivePicker(CONFIG, failing)).rejects.toThrow('blocked by content blocker');
    // No token was ever granted, so the picker was never built or shown.
    expect(seen.visible).toBe(false);
    expect(seen.token).toBe('');
  });

  it('a failed load of the picker API script rejects after the token is already granted, and never opens the picker', async () => {
    const { google, seen } = fakeGoogle('picked');
    const loaded: string[] = [];
    const failing: DrivePickerDeps = {
      loadScript: vi.fn(async (src: string) => {
        loaded.push(src);
        if (src === GOOGLE_API_SRC) throw new Error('apis.google.com unreachable');
      }),
      google: () => google as never,
      gapi: () => ({ load: (_name: string, cb: () => void) => cb() }),
      now: () => new Date('2026-08-20T10:00:00.000Z'),
    };
    await expect(openDrivePicker(CONFIG, failing)).rejects.toThrow('apis.google.com unreachable');
    expect(loaded).toEqual([GOOGLE_GSI_SRC, GOOGLE_API_SRC]);
    // The GSI step ran (a token request was made) before the second script
    // failed, but the picker itself — which is what would call
    // setOAuthToken and setVisible — was never constructed or shown.
    expect(seen.scopes).toEqual([DRIVE_FILE_SCOPE]);
    expect(seen.token).toBe('');
    expect(seen.visible).toBe(false);
  });

  describe('capturedAt is a UTC instant, not a locale-dependent render', () => {
    const INSTANT = new Date('2026-08-20T10:00:00.000Z');

    it('stamps the same ISO string under two different machine timezones', () => {
      // This loop's own process.env.TZ assignment is what varies TZ here —
      // it overrides whatever TZ the test runner was launched with, so a
      // shell-level `TZ=... vitest run` in front of this file is inert for
      // this test specifically. Confirmed live on this machine (`node -e`
      // with `process.env.TZ` reassigned mid-process) that the reassignment
      // genuinely moves `Date.prototype.toString()`, not just `TZ` at spawn.
      const originalTz = process.env['TZ'];
      try {
        for (const tz of ['UTC', 'Pacific/Kiritimati']) {
          process.env['TZ'] = tz;
          const reference = toDriveReference(DOC, INSTANT);
          expect(reference.capturedAt).toBe('2026-08-20T10:00:00.000Z');
        }
      } finally {
        if (originalTz === undefined) delete process.env['TZ'];
        else process.env['TZ'] = originalTz;
      }
    });
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

  it('the composed upload claim parses against the door-facing wire schema, not merely the structural guard', () => {
    const event = composeUploadAttachmentAdded({
      attachmentId: '01J9GATA000000000000000000',
      url: '/v1/attachments/01J9GATA000000000000000000',
      mime: 'image/png',
      filename: 'shelf.png',
      size: 12,
      sha256: 'b'.repeat(64),
    });
    expect(attachmentUploadedPayload.safeParse(event.payload).success).toBe(true);
  });

  it('the composed drive-reference claim parses against the door-facing wire schema, not merely isDriveReference', () => {
    const reference = toDriveReference(DOC, new Date('2026-08-20T10:00:00.000Z'));
    const event = composeDriveReferenceAdded(reference, () => '01J9GATD000000000000000000');
    const result = attachmentDriveReferencePayload.safeParse(event.payload);
    expect(result.success).toBe(true);
  });
});
