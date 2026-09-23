// The POSITIVE control for embedding-no-native-load.test.ts (case 18.164): if
// `process.dlopen` interception silently stopped working (a Node version
// change, a different module system, …), the guard's "zero native loads"
// assertion would pass for the wrong reason — a broken instrument reads the
// same as a clean import graph. This script deliberately imports the OLD,
// buggy path (`@huggingface/transformers`'s Node entry, still present as a
// devDependency for the tokenizer-equivalence test) with the identical
// wrapper, so the test can assert the harness itself still catches at least
// one dlopen before trusting a zero.
import { pathToFileURL } from 'node:url';

const modulePath = process.argv[2];
if (!modulePath) {
  throw new Error('usage: node known-native-load-child.mjs <path-to-@huggingface/transformers-node-entry>');
}

const nativeLoads = [];
const originalDlopen = process.dlopen;
process.dlopen = (...args) => {
  nativeLoads.push(String(args[1] ?? '(unknown)'));
  return originalDlopen(...args);
};

await import(pathToFileURL(modulePath).href);
process.stdout.write(JSON.stringify({ nativeLoads }));
