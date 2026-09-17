#!/usr/bin/env node
/**
 * Unpack a "Bundled Page" export from the design tool into the plain files this
 * repo commits.
 *
 * ## WHY THIS EXISTS
 *
 * The owner's prototype exports arrive as a self-extracting `.html`: a small
 * outer shell plus four `<script type="__bundler/…">` blocks carrying the real
 * page as JSON, with every asset base64-encoded and gzipped. That is a
 * distribution format, not a source file — you cannot read a line number in it,
 * and `design-system/interactive/desktop.dc.html` is quoted by line number in
 * dozens of docblocks across this repo.
 *
 * So the export is unpacked here, deterministically, and the UNPACKED files are
 * committed. The bundle itself is not (it is a byte-for-byte copy of something
 * in the owner's Downloads, and a 552 KB blob whose content is already on disk
 * twice is not worth a third copy).
 *
 * ## WHAT IT REFUSES TO DO
 *
 * It will not guess. A missing block, a manifest entry that is not gzip+base64,
 * a template that still references an asset it was not given a name for — each
 * stops the run with the reason, because every one of those, silently ignored,
 * produces a file that LOOKS like the prototype and is not.
 *
 * ## THE MOBILE ENTRIES, AND WHY THEY ARE THE INTERESTING CASE
 *
 * `ext_resources` names two entries under the SAME id —
 * `./Gisik Nokma - Mobile.dc.html` appears twice with two different uuids. Two
 * different byte strings claiming one filename is a question for a human: pick
 * one and the other is silently lost. So this tool unpacks both, diffs them
 * against each other and against the committed `mobile.dc.html`, and only
 * writes when the answer is unambiguous (both identical). When they differ it
 * writes NEITHER, prints what differs, and carries on with everything else —
 * the same "name it rather than guess it" rule the rest of this repo runs on.
 *
 * Usage:
 *   node design-system/tools/unpack-bundle.mjs <bundle.html> [--out <dir>]
 */

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(HERE, '..', 'interactive');
/** The runtime's own file, named in the template as a bare uuid. */
const RUNTIME_FILE = 'support.js';
const MOBILE_FILE = 'mobile.dc.html';
const MOBILE_ID = './Gisik%20Nokma%20-%20Mobile.dc.html';
const DESKTOP_FILE = 'desktop.dc.html';

function fail(message) {
  process.stderr.write(`unpack-bundle: ${message}\n`);
  process.exit(1);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Pull one `<script type="__bundler/NAME">…</script>` payload out of the shell.
 *
 * Deliberately NOT a line-number read. The bundle's own runtime code contains
 * the literal `script[type="__bundler/manifest"]` in `document.querySelector`
 * calls (`:62`, `:63`, `:82` of the 2026-09-18 export), so a
 * grep-for-the-tag approach finds EIGHT matches for four blocks and would read
 * a runtime string constant as a payload. Matching the full element and
 * requiring the payload to be non-empty is what makes this a parse.
 */
function readBlock(source, name, { required = true } = {}) {
  const pattern = new RegExp(`<script type="__bundler/${name}">([\\s\\S]*?)</script>`);
  const match = pattern.exec(source);
  if (match === null) {
    if (!required) return null;
    fail(`no <script type="__bundler/${name}"> block in this file`);
  }
  return match[1];
}

/** Every asset, decoded and gunzipped, keyed by uuid. */
function decodeManifest(manifestJson) {
  const manifest = JSON.parse(manifestJson);
  const assets = new Map();
  for (const [uuid, entry] of Object.entries(manifest)) {
    if (entry.compressed !== true) {
      fail(`manifest entry ${uuid} is not marked compressed — this tool only knows gzip+base64`);
    }
    let bytes;
    try {
      bytes = gunzipSync(Buffer.from(entry.data, 'base64'));
    } catch (error) {
      fail(`manifest entry ${uuid} did not gunzip: ${String(error)}`);
    }
    assets.set(uuid, { mime: entry.mime, bytes });
  }
  return assets;
}

function main() {
  const args = process.argv.slice(2);
  const positional = [];
  let outDir = DEFAULT_OUT;
  let mobileEntry = null;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--out') {
      index += 1;
      outDir = resolve(args[index] ?? DEFAULT_OUT);
    } else if (args[index] === '--mobile-entry') {
      index += 1;
      const raw = args[index];
      if (raw === undefined || !/^[1-9]\d*$/.test(raw)) {
        fail(`--mobile-entry takes a 1-based entry number; got ${JSON.stringify(raw ?? null)}`);
      }
      mobileEntry = Number(raw);
    } else {
      positional.push(args[index]);
    }
  }
  const bundlePath = positional[0];
  if (bundlePath === undefined) {
    fail(
      'usage: node design-system/tools/unpack-bundle.mjs <bundle.html> [--out <dir>] ' +
        '[--mobile-entry <N>]',
    );
  }

  const source = readFileSync(resolve(bundlePath), 'utf8');
  const bundleSha = sha256(Buffer.from(source, 'utf8'));
  mkdirSync(outDir, { recursive: true });

  // The three blocks this tool cannot work without. `page_order` is read too,
  // but only to report it — a bundle without it would still unpack correctly,
  // so it is not allowed to be a hard failure.
  const manifestJson = readBlock(source, 'manifest');
  const templateJson = readBlock(source, 'template');
  const resourcesJson = readBlock(source, 'ext_resources');
  const pageOrderJson = readBlock(source, 'page_order', { required: false });
  const pageOrder = pageOrderJson === null ? 'absent' : JSON.parse(pageOrderJson);

  const assets = decodeManifest(manifestJson);
  const resources = JSON.parse(resourcesJson);

  const template = JSON.parse(templateJson);
  if (typeof template !== 'string') fail('the template block did not decode to a string');

  const written = [];
  const write = (name, bytes) => {
    writeFileSync(join(outDir, name), bytes);
    written.push({ name, bytes: bytes.length, sha: sha256(bytes) });
  };

  // ── The desktop page ────────────────────────────────────────────────────
  // Rewrite every uuid the template references into the filename this tool
  // gives it. Anything left over is an asset the developer would get a 404 for,
  // so it is a failure rather than a warning.
  const named = new Map();
  let html = template;
  const referenced = [...template.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)]
    .map((match) => match[0]);
  for (const uuid of new Set(referenced)) {
    if (!assets.has(uuid)) continue; // not an asset id (a page-local id, a React key, …)
    const resource = resources.find((entry) => entry.uuid === uuid);
    const name = resource?.id === MOBILE_ID ? MOBILE_FILE : `${RUNTIME_FILE}`;
    named.set(uuid, name);
    html = html.split(uuid).join(`./${name}`);
  }
  const leftover = [...html.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)]
    .map((match) => match[0])
    .filter((uuid) => assets.has(uuid));
  if (leftover.length > 0) {
    fail(`template still references un-named asset uuid(s): ${[...new Set(leftover)].join(', ')}`);
  }
  write(DESKTOP_FILE, Buffer.from(html, 'utf8'));

  // ── The runtime ─────────────────────────────────────────────────────────
  const runtimeUuid = [...named.entries()].find(([, name]) => name === RUNTIME_FILE)?.[0];
  if (runtimeUuid === undefined) {
    fail(`the template references no ${RUNTIME_FILE} asset — nothing defines the x-dc element`);
  }
  const runtime = assets.get(runtimeUuid).bytes;
  const runtimeText = runtime.toString('utf8');
  // The claim under test is "this is the runtime", not "this file exists". A
  // file written from the wrong manifest entry would otherwise be reported as a
  // successful unpack and fail in the browser with a blank page.
  if (!runtimeText.includes('x-dc') || !runtimeText.includes('customElements')) {
    fail(`the ${RUNTIME_FILE} asset does not define a custom element — wrong manifest entry?`);
  }
  write(RUNTIME_FILE, runtime);

  // ── The two mobile entries ──────────────────────────────────────────────
  // Both claim one filename. Identical bytes answer the question; different
  // bytes do not, and picking would silently drop whichever lost.
  const mobile = resources
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.id === MOBILE_ID)
    .map(({ entry, index }) => ({ index, uuid: entry.uuid, bytes: assets.get(entry.uuid)?.bytes }));
  const mobileNotes = [];
  if (mobile.length === 0) {
    mobileNotes.push('no mobile entry in ext_resources — nothing written');
  } else if (mobile.some((entry) => entry.bytes === undefined)) {
    mobileNotes.push('a mobile ext_resource has no manifest entry — nothing written');
  } else {
    const [first, ...rest] = mobile;
    const identical = rest.every((entry) => entry.bytes.equals(first.bytes));
    // An entry is written only when the CALLER NAMED it. There is no default:
    // this whole block exists because two byte strings claim one filename, and
    // picking one silently on the tool's own initiative would drop the other
    // without anybody having said so. `--mobile-entry` is that "somebody".
    let chosen = null;
    if (mobileEntry !== null) {
      if (mobileEntry > mobile.length) {
        fail(
          `--mobile-entry ${mobileEntry}, but this bundle has ${mobile.length} mobile ` +
            `entr${mobile.length === 1 ? 'y' : 'ies'}`,
        );
      }
      chosen = mobile[mobileEntry - 1];
    }
    const scratch = mkdtempSync(join(tmpdir(), 'unpack-mobile-'));
    try {
      const scratchPaths = mobile.map((entry, index) => {
        const path = join(scratch, `mobile-${index}.dc.html`);
        writeFileSync(path, entry.bytes);
        return path;
      });
      let committed = null;
      try {
        committed = readFileSync(join(outDir, MOBILE_FILE));
      } catch {
        committed = null;
      }
      mobileNotes.push(
        `entry #1 (${first.uuid}) ${first.bytes.length} B sha256 ${sha256(first.bytes).slice(0, 12)}` +
          rest
            .map(
              (entry) =>
                `; entry #${entry.index + 1} (${entry.uuid}) ${entry.bytes.length} B ` +
                `sha256 ${sha256(entry.bytes).slice(0, 12)}`,
            )
            .join(''),
      );
      mobileNotes.push(
        `scratch copies: ${scratchPaths.join(', ')} (kept for the diff below; the temp dir is left in place)`,
      );
      if (!identical && chosen === null) {
        const a = first.bytes.toString('utf8').split('\n');
        const b = rest[0].bytes.toString('utf8').split('\n');
        let firstDifference = -1;
        for (let line = 0; line < Math.max(a.length, b.length); line += 1) {
          if (a[line] !== b[line]) {
            firstDifference = line + 1;
            break;
          }
        }
        mobileNotes.push(
          `HELD, NOT WRITTEN: the two mobile entries DIFFER — ${a.length} vs ${b.length} lines, ` +
            `first difference at line ${firstDifference}. Entry #1 line ${firstDifference}: ` +
            `${JSON.stringify((a[firstDifference - 1] ?? '').slice(0, 120))} | entry #2 line ` +
            `${firstDifference}: ${JSON.stringify((b[firstDifference - 1] ?? '').slice(0, 120))}. ` +
            'Resolve which export is newer, then re-run with `--mobile-entry <N>` to NAME one — ' +
            'this tool will not choose.',
        );
      } else {
        const selected = chosen ?? first;
        if (chosen !== null && !identical) {
          mobileNotes.push(
            `CHOSEN by --mobile-entry ${mobileEntry}: entry #${chosen.index + 1} ` +
              `(${chosen.uuid}) ${chosen.bytes.length} B sha256 ` +
              `${sha256(chosen.bytes).slice(0, 12)}. Not written: ` +
              rest
                .filter((entry) => entry !== chosen)
                .map((entry) => `entry #${entry.index + 1} sha256 ${sha256(entry.bytes).slice(0, 12)}`)
                .join(', ') +
              '. The reason for the choice belongs in PROVENANCE.md, not here.',
          );
        }
        if (committed !== null && committed.equals(selected.bytes)) {
          mobileNotes.push(`identical to the committed ${MOBILE_FILE} — left unchanged`);
        } else {
          write(MOBILE_FILE, selected.bytes);
          mobileNotes.push(
            committed === null
              ? `no committed ${MOBILE_FILE} to compare against`
              : `DIFFERS from the committed ${MOBILE_FILE} (${committed.length} B) — replaced`,
          );
        }
      }
    } finally {
      // The scratch dir is deliberately NOT cleaned: the held case's whole
      // value is that a human can diff the two files this run refused to pick
      // between, and a path that no longer exists is not that.
      void scratch;
    }
  }

  // ── The UMD libraries ───────────────────────────────────────────────────
  // Written only if something already on disk references them by uuid. They are
  // unpkg URLs in `ext_resources`, so the default expectation is that nothing
  // does — but that is measured here rather than assumed, because "it is a URL"
  // and "nothing points at it" are different claims.
  const libraryUuids = resources
    .filter((entry) => entry.id.startsWith('http'))
    .map((entry) => entry.uuid);
  const referencedOnDisk = [runtimeText, html].some((text) =>
    libraryUuids.some((uuid) => text.includes(uuid)),
  );
  const libraryNotes = [];
  for (const uuid of libraryUuids) {
    const resource = resources.find((entry) => entry.uuid === uuid);
    if (referencedOnDisk) {
      const name = resource.id.split('/').pop();
      write(name, assets.get(uuid).bytes);
      libraryNotes.push(`${resource.id} → ${name} (referenced by uuid)`);
    } else {
      libraryNotes.push(`${resource.id} → NOT WRITTEN (no uuid reference survives the rewrite)`);
    }
  }

  // ── The report ──────────────────────────────────────────────────────────
  const lines = [];
  lines.push(`bundle: ${resolve(bundlePath)}`);
  lines.push(`bundle sha256: ${bundleSha}`);
  lines.push(`page_order: ${JSON.stringify(pageOrder)}`);
  lines.push(`out: ${outDir}`);
  lines.push('written:');
  for (const file of written) {
    lines.push(`  ${file.name}  ${file.bytes} B  sha256 ${file.sha}`);
  }
  lines.push(`mobile: ${mobileNotes.join('\n        ')}`);
  lines.push(`libraries: ${libraryNotes.join('\n           ')}`);
  lines.push(
    `assets in manifest: ${assets.size}; named by the template: ${named.size} ` +
      `(${[...named.entries()].map(([uuid, name]) => `${uuid}→${name}`).join(', ')})`,
  );
  process.stdout.write(`${lines.join('\n')}\n`);
}

main();
