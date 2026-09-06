import { mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalDiskStore } from '../../src/attachments/local-disk-store.js';
import {
  InvalidObjectKeyError,
  ObjectNotFoundError,
  assertValidObjectKey,
} from '../../src/attachments/object-store.js';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  return Buffer.concat(chunks);
}

// `root` is nested one level inside `sandbox`, not `sandbox` itself: the
// traversal test below asserts that `..`-escaping keys never create anything
// above `root`. If `root` were mkdtemp's own directory, "above root" would be
// the machine's shared $TMPDIR — a location other processes and other test
// runs can write to, which already produced one false failure while
// developing this file (a stray `$TMPDIR/escape` from an earlier mutation
// run outlived that run and reddened the next one). Nesting means "outside
// root" stays inside `sandbox`, which afterAll deletes every run.
let sandbox = '';
let root = '';
let store: LocalDiskStore;

beforeAll(async () => {
  sandbox = await mkdtemp(join(tmpdir(), 'gisik-store-'));
  root = join(sandbox, 'store');
  await mkdir(root, { recursive: true });
  store = new LocalDiskStore(root);
});
afterAll(async () => {
  await rm(sandbox, { recursive: true, force: true });
});

describe('LocalDiskStore', () => {
  /**
   * 9.144 — `LocalDiskStore.put` → `getStream` round-trips the exact bytes.
   */
  it('put → getStream round-trips the exact bytes', async () => {
    const bytes = Buffer.from('these are the attachment bytes, verbatim');
    await store.put('w/ws1/a/att1', Readable.from(bytes), { mime: 'application/pdf', size: bytes.length });
    const back = await streamToBuffer(await store.getStream('w/ws1/a/att1'));
    expect(back.equals(bytes)).toBe(true);
  });

  /**
   * 9.145 — `getStream` on a missing key throws `ObjectNotFoundError`.
   */
  it('getStream on a missing key throws ObjectNotFoundError', async () => {
    await expect(store.getStream('w/ws1/a/nothere')).rejects.toBeInstanceOf(ObjectNotFoundError);
  });

  /**
   * 9.146 — `delete` removes the object; deleting an already-deleted key is a quiet no-op.
   */
  it('delete removes the object; deleting again is a quiet no-op', async () => {
    const bytes = Buffer.from('short-lived');
    await store.put('w/ws1/a/gone', Readable.from(bytes), { mime: 'image/png', size: bytes.length });
    await store.delete('w/ws1/a/gone');
    await expect(store.getStream('w/ws1/a/gone')).rejects.toBeInstanceOf(ObjectNotFoundError);
    await expect(store.delete('w/ws1/a/gone')).resolves.toBeUndefined();
  });

  /**
   * 9.147 — planted defect: traversal (`..`) and malformed keys are refused before the disk is ever touched.
   */
  it('planted defect: traversal and malformed keys are refused before touching the disk', async () => {
    const bytes = Buffer.from('x');
    const maliciousKeys = ['../escape', 'w/../../etc/passwd', '/absolute', 'w//a', '', 'w/a/.', 'w/a/..', 'a.b/c', 'w/a b'];
    for (const key of maliciousKeys) {
      await expect(
        store.put(key, Readable.from(bytes), { mime: 'image/png', size: 1 }),
        `key "${key}" must be refused`,
      ).rejects.toBeInstanceOf(InvalidObjectKeyError);
      expect(() => assertValidObjectKey(key)).toThrow(InvalidObjectKeyError);
    }
    // Nothing escaped: no object landed inside root under an unexpected
    // name...
    const entries = await readdir(root);
    expect(entries.every((entry) => entry === 'w')).toBe(true);
    // ...and nothing landed *outside* root either. `readdir(root)` alone
    // cannot see that — `../escape` and `w/../../etc/passwd` both resolve
    // above root, so an un-refused write would land there, invisible to the
    // check above. Confirm those specific escape targets were never created,
    // still inside `sandbox` (see the comment on `root` above) so this can
    // never read a file some other process or run left behind.
    await expect(stat(join(sandbox, 'escape'))).rejects.toThrow();
    await expect(stat(join(sandbox, 'etc', 'passwd'))).rejects.toThrow();
  });

  /**
   * 9.242 — `LocalDiskStore.list` round-trips every key it was given, each with a `Date` `lastModified`.
   */
  it('list round-trips every key it was given, each with a Date lastModified', async () => {
    await store.put('w/wsL/a/one', Readable.from(Buffer.from('a')), { mime: 'text/plain', size: 1 });
    await store.put('w/wsL/a/two', Readable.from(Buffer.from('b')), { mime: 'text/plain', size: 1 });
    await store.put('w/wsL/b/three', Readable.from(Buffer.from('c')), { mime: 'text/plain', size: 1 });
    const listing = await store.list();
    const keys = listing.map((entry) => entry.key).sort();
    expect(keys).toEqual(expect.arrayContaining(['w/wsL/a/one', 'w/wsL/a/two', 'w/wsL/b/three']));
    for (const entry of listing) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }
  });

  /**
   * 9.243 — `LocalDiskStore.list` with a prefix returns only keys starting with it.
   */
  it('list with a prefix returns only keys starting with it', async () => {
    await store.put('w/wsP/a/only', Readable.from(Buffer.from('x')), { mime: 'text/plain', size: 1 });
    await store.put('w/wsP/b/other', Readable.from(Buffer.from('y')), { mime: 'text/plain', size: 1 });
    const listing = await store.list('w/wsP/a/');
    expect(listing.map((entry) => entry.key)).toEqual(['w/wsP/a/only']);
  });

  /**
   * The docblock's structural claim, pinned: a symlink inside `rootDir` is
   * neither `isDirectory()` nor `isFile()` on its `Dirent`, so `list()`'s walk
   * skips it — not because of a check, but because neither branch matches.
   * The target lives OUTSIDE the store's `root` (in `sandbox`, still cleaned
   * up by `afterAll`) specifically so a regression that started following
   * symlinks would surface as a leaked out-of-root key, not merely a
   * differently-named in-root one.
   */
  /**
   * 9.255 — `LocalDiskStore.list` skips a symlink planted inside `rootDir`, even one pointing outside `root` — structural: neither `isDirectory()` nor `isFile()` matches its `Dirent`.
   */
  it('list skips a symlink planted inside rootDir, even one pointing outside root', async () => {
    const outsideTarget = join(sandbox, 'outside-target.txt');
    await writeFile(outsideTarget, 'not a real attachment');
    const linkPath = join(root, 'w', 'wsSym', 'a', 'linked');
    await mkdir(join(root, 'w', 'wsSym', 'a'), { recursive: true });
    await symlink(outsideTarget, linkPath);
    try {
      const listing = await store.list('w/wsSym/');
      expect(listing.map((entry) => entry.key)).toEqual([]);
    } finally {
      await rm(linkPath, { force: true });
    }
  });

  /**
   * 9.244 — `LocalDiskStore.list` on an empty store returns an empty array — including a store directory that does not exist yet.
   */
  it('list on an empty store returns an empty array', async () => {
    const emptySandbox = await mkdtemp(join(tmpdir(), 'gisik-store-empty-'));
    try {
      const emptyStore = new LocalDiskStore(join(emptySandbox, 'store'));
      expect(await emptyStore.list()).toEqual([]);
    } finally {
      await rm(emptySandbox, { recursive: true, force: true });
    }
  });

  /**
   * 9.148 — a failed write leaves no partial object behind — the torn-write-proof property.
   */
  it('a failed write leaves no partial object behind', async () => {
    const bad = new Readable({
      read() {
        this.destroy(new Error('stream broke mid-flight'));
      },
    });
    await expect(store.put('w/ws1/a/broken', bad, { mime: 'image/png', size: 10 })).rejects.toThrow('stream broke mid-flight');
    await expect(store.getStream('w/ws1/a/broken')).rejects.toBeInstanceOf(ObjectNotFoundError);
  });
});
