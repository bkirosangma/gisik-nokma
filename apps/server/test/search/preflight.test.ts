import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { newUlid } from '@gisik-nokma/domain';
import { REQUIRED_EXTENSIONS, formatPreflight, searchPreflight } from '../../src/tools/search-preflight.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * The notes search plan's Task 1 (spec §7.1, cases 18.121–18.124): the two
 * extensions arrive with a migration, every Postgres image that runs the tests
 * has to be able to provide them, and an operator gets a tool that answers
 * "can this database do it" BEFORE the migration runs against it.
 *
 * ## Why three of these cases open a database and one does not
 *
 * 18.121 and 18.123 are statements about a database the migrations have built,
 * so they open one. 18.122 is a statement about four FILES — and it is here,
 * beside them, because the four files are the reason the other three can pass:
 * `postgres:16-alpine` has no pgvector, so on that image 18.121 reddens no
 * matter what the migration says. The image sites and the migration are one
 * change with two halves, and a file that proves only one half is a file that
 * lets the other rot.
 *
 * ## What 18.124 is really asserting
 *
 * Not "the extensions are installed" — 18.121 already says that, and it is true
 * of a database where the migration has already run, which is the ONE database
 * a pre-flight tool is never asked about. The tool's whole job is to answer for
 * a database the migration has NOT touched yet, so the control that matters is
 * a name that is **available and not installed**: it must report
 * `available: true` with a null `installedVersion`, and that is what makes
 * reading `pg_extension` (installed things only) fail the case rather than pass
 * it. `postgis` is the second control, the other direction: absent from
 * `pg_available_extensions` entirely, and reported as unavailable.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const ROOT = resolve(import.meta.dirname, '../../../..');
const CI_FILE = resolve(ROOT, '.github/workflows/ci.yml');

/** Compare dotted versions of up to three components: `'0.8.6' >= '0.8.0'`. */
function versionAtLeast(actual: string, floor: string): boolean {
  const a = actual.split('.').map(Number);
  const b = floor.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

describe('18.121–18.124 postgres images, extensions and the pre-flight', () => {
  /**
   * 18.121 — a fresh test database has BOTH extensions, and the control is an
   * extension nothing in this repo creates.
   *
   * `createTestDatabase` runs every migration, so this is a statement about the
   * migration and not about the image — the image half is 18.122. The control
   * is `postgis`: a name that exists nowhere in this repository, so a suite
   * that somehow reported it present would be reading something other than the
   * database under test.
   *
   * Mutation: drop `CREATE EXTENSION vector` from the migration.
   */
  it('18.121 — every fresh test database has pg_trgm and vector installed', async () => {
    const { rows } = await db.pool.query<{ extname: string }>('SELECT extname FROM pg_extension ORDER BY extname');
    const installed = rows.map((row) => row.extname);

    expect(installed).toContain('pg_trgm');
    expect(installed).toContain('vector');
    expect(installed, 'postgis is the control: nothing in this repo creates it').not.toContain('postgis');
  });

  /**
   * 18.122 — the four Postgres image sites.
   *
   * Two compose files, two CI service blocks, one image string. The COUNT is
   * asserted rather than only the distinct value: deleting a site, or adding a
   * fifth that still says `pgvector/pgvector:pg16`, both leave the distinct set
   * correct, and only the count catches them. A missing `image:` key throws
   * instead of being skipped, because a site that silently drops out of the
   * list is the failure this case exists to prevent.
   *
   * Mutation: change one site back to `postgres:16-alpine`.
   */
  describe('18.122 — the four Postgres image sites name one image', () => {
    type Site = { label: string; image: string };

    function composeSite(label: string, path: string): Site {
      const doc = parseYaml(readFileSync(path, 'utf8')) as { services?: Record<string, { image?: string }> };
      const image = doc.services?.['postgres']?.image;
      if (!image) throw new Error(`${label}: services.postgres.image is missing`);
      return { label, image };
    }

    function ciSites(): Site[] {
      const doc = parseYaml(readFileSync(CI_FILE, 'utf8')) as {
        jobs?: Record<string, { services?: Record<string, { image?: string }> }>;
      };
      const sites: Site[] = [];
      for (const [job, definition] of Object.entries(doc.jobs ?? {})) {
        const image = definition.services?.['postgres']?.image;
        if (image) sites.push({ label: `ci.yml:jobs.${job}.services.postgres`, image });
      }
      return sites;
    }

    function allSites(): Site[] {
      return [
        composeSite('docker-compose.yml', resolve(ROOT, 'docker-compose.yml')),
        composeSite('docker-compose.dev.yml', resolve(ROOT, 'docker-compose.dev.yml')),
        ...ciSites(),
      ];
    }

    it('names pgvector/pgvector:pg16 at all four sites and nowhere else', () => {
      const sites = allSites();
      expect(sites.map((site) => site.label)).toHaveLength(4);
      expect([...new Set(sites.map((site) => site.image))]).toEqual(['pgvector/pgvector:pg16']);
    });
  });

  /**
   * 18.123 — the generated `tsv` carries the three columns at three weights.
   *
   * The weights are read by suffix rather than by whole token: `tsvector`
   * concatenation offsets the right operand's positions by the left operand's
   * maximum, so pinning `'room':1B` would pin an arithmetic detail of the
   * generator rather than the claim that the BODY is weight B. The claim is the
   * letter.
   *
   * Mutation: swap `A` and `B` in the migration's generated column.
   */
  it('18.123 — proj_note_search.tsv is generated from the three columns with weights A/B/C', async () => {
    const noteId = newUlid();
    const workspaceId = newUlid();
    await db.pool.query(
      `INSERT INTO proj_note_search (note_id, workspace_id, home_project_id, title, body_text, ticket_text)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [noteId, workspaceId, newUlid(), 'cold', 'room', 'xylophone'],
    );

    const { rows } = await db.pool.query<{ tsv: string }>(
      'SELECT tsv::text AS tsv FROM proj_note_search WHERE note_id = $1',
      [noteId],
    );
    const tsv = rows[0]?.tsv ?? '';

    function weightOf(lexeme: string): string {
      const token = tsv.split(' ').find((entry) => entry.startsWith(`'${lexeme}':`));
      return token?.slice(-1) ?? '';
    }

    expect(weightOf('cold'), 'title is weight A').toBe('A');
    expect(weightOf('room'), 'body is weight B').toBe('B');
    expect(weightOf('xylophone'), 'ticket_text is weight C').toBe('C');
    expect(weightOf('no-such-lexeme'), 'control: a word in no column has no weight').toBe('');
  });

  /**
   * 18.124 — the pre-flight tool, against a database the migrations HAVE built.
   *
   * Both controls are in this `it` on purpose. `postgis` is the negative one;
   * `hstore` is the one that kills the mutation — it is available on this image
   * and installed nowhere (no migration in this repo runs `CREATE EXTENSION` —
   * `grep -rn 'CREATE EXTENSION' apps/server/migrations/` is empty; this
   * migration is the first), so a tool reading `pg_extension` reports it
   * unavailable and this case reddens.
   *
   * Mutation: query `pg_extension` instead of `pg_available_extensions`.
   */
  it('18.124 — the pre-flight reports both extensions, an absent one, and an available-but-uninstalled one', async () => {
    const report = await searchPreflight(db.pool);
    const byName = new Map(report.extensions.map((entry) => [entry.name, entry]));

    for (const name of REQUIRED_EXTENSIONS) {
      expect(byName.get(name)?.available, `${name} is available`).toBe(true);
    }
    expect(report.missing, 'nothing required is missing').toEqual([]);
    expect(report.role?.name).toBeTruthy();
    expect(report.canCreateExtensions, 'the connected role may create these').toBe(true);

    // Spec §7.1 records this number and floors it: an HNSW index used with a
    // visibility filter needs vector >= 0.8.0.
    const vector = byName.get('vector');
    expect(vector?.installedVersion, 'the migration installed vector').toBeTruthy();
    expect(
      versionAtLeast(vector?.defaultVersion ?? '0.0.0', '0.8.0'),
      `vectors's default_version is >= 0.8.0 (read ${String(vector?.defaultVersion)})`,
    ).toBe(true);

    const withControls = await searchPreflight(db.pool, {
      extensions: [...REQUIRED_EXTENSIONS, 'postgis', 'hstore'],
    });
    const control = new Map(withControls.extensions.map((entry) => [entry.name, entry]));

    expect(control.get('postgis')?.available, 'control: postgis is not available on this image').toBe(false);
    expect(withControls.missing, 'control: the absence is reported').toContain('postgis');

    expect(control.get('hstore')?.available, 'control: hstore IS available and NOT installed').toBe(true);
    expect(control.get('hstore')?.installedVersion, 'control: ...and reports no installed version').toBeNull();

    expect(formatPreflight(report)).toContain('vector');
  });
});
