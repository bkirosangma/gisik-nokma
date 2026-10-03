import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FORBIDDEN = /^(sigma(\/|$)|@sigma\/|graphology)/;
const ALLOWED_DIR = join(PKG, 'src', 'render', 'sigma') + sep;

/** The PROGRAM's files (from tsconfig.typecheck.json), not a directory walk: what tsc compiles is what is checked. */
function programFiles(): { files: string[]; options: ts.CompilerOptions } {
  const configPath = join(PKG, 'tsconfig.typecheck.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, PKG);
  return { files: parsed.fileNames, options: parsed.options };
}

/**
 * Every import the TypeScript pre-processor sees (static, `export … from`, side-effect `import 'x'`, dynamic `import('x')`,
 * `require`), RESOLVED with the program's options. A regex walker misses side-effect imports (spec §4.1).
 */
export function forbiddenImports(files: readonly string[], options: ts.CompilerOptions): string[] {
  const host = ts.createCompilerHost(options);
  const hits: string[] = [];
  for (const file of files) {
    const info = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
    for (const imported of info.importedFiles) {
      const resolved = ts.resolveModuleName(imported.fileName, file, options, host).resolvedModule;
      const name = resolved?.packageId?.name ?? imported.fileName;
      if (FORBIDDEN.test(name) || FORBIDDEN.test(imported.fileName)) hits.push(`${relative(PKG, file)} → ${imported.fileName}`);
    }
  }
  return hits;
}

describe('the renderer seam (spec §4.1)', () => {
  it('27.202 no file outside src/render/sigma/ imports sigma, @sigma/* or graphology*; control: the detector does see program.ts\'s imports', () => {
    const { files, options } = programFiles();
    const outside = files.filter((file) => !file.startsWith(ALLOWED_DIR));
    const inside = files.filter((file) => file.startsWith(ALLOWED_DIR));
    expect(forbiddenImports(outside, options)).toEqual([]);
    // control: the same detector over the allowed directory reports sigma and graphology, so an empty answer above is evidence
    const seen = forbiddenImports(inside, options).join('\n');
    expect(seen).toContain('→ sigma');
    expect(seen).toContain('→ graphology');
  });

  it('27.203 a side-effect import and a dynamic import are caught; control: a relative import is not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kg-seam-'));
    const bad = join(dir, 'bad.ts');
    writeFileSync(bad, "import 'sigma';\nexport const later = () => import('graphology');\n");
    const ok = join(dir, 'ok.ts');
    writeFileSync(ok, "import './bad.js';\nexport {};\n");
    const { options } = programFiles();
    expect(forbiddenImports([bad], options)).toHaveLength(2);
    expect(forbiddenImports([ok], options)).toEqual([]);
  });
});
