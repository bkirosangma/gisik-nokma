// Run in a FRESH child process by embedding-no-native-load.test.ts (case
// 18.164) — never imported into the vitest worker directly. A shared process
// would let an EARLIER test's import populate Node's CJS `require` cache (or
// simply have already dlopen'd a native binding for an unrelated reason), so
// a mutation that reintroduces the native import could read as "no new
// dlopen call" for the wrong reason. A clean child process is the only place
// `process.dlopen` is called exactly once per binding this run actually
// triggers.
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) {
  throw new Error('usage: node embedding-dlopen-child.mjs <path-to-dist/search/embedding.js>');
}

const nativeLoads = [];
const originalDlopen = process.dlopen;
// `process.dlopen(module, filename, flags)` is Node's own boundary for
// loading a `.node` binary — every native `require`/`import`, regardless of
// which package or which loader mechanism reaches it, calls through here.
// Wrapping it is a stronger check than grepping source for "onnxruntime":
// it would catch ANY native binding the import graph pulls in, not only the
// one this bug happened to be.
process.dlopen = (...args) => {
  nativeLoads.push(String(args[1] ?? '(unknown)'));
  return originalDlopen(...args);
};

// Caught, not left to crash the process: the STATIC import above may already
// have dlopen'd a native binding (a regression need not even reach
// `embedQuery` to be caught), and reporting `nativeLoads` alongside a
// downstream error is a more specific diagnostic than "the child exited
// non-zero" for whatever reason.
try {
  const { embedQuery } = await import(pathToFileURL(modulePath).href);
  const vector = await embedQuery('warm-up for the dlopen guard (18.164)');
  process.stdout.write(JSON.stringify({ nativeLoads, dims: vector.length }));
} catch (error) {
  process.stdout.write(JSON.stringify({ nativeLoads, error: error instanceof Error ? error.message : String(error) }));
}
