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
