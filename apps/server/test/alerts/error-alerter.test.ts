import { describe, expect, it } from 'vitest';
import { INTERNAL_ERROR_BODY, buildApp } from '../../src/app.js';
import {
  NoopErrorAlerter,
  WebhookErrorAlerter,
  alertWithoutWaiting,
  alerterFromConfig,
  type ErrorAlerter,
} from '../../src/alerts/error-alerter.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createPool } from '../../src/db.js';
import type { IngestService } from '../../src/ingest/ingest-service.js';

/**
 * The same recipe `test/app.test.ts` uses, duplicated rather than shared: this
 * file's whole subject is the error handler, and it must stay database-free for
 * the same reason that one does. `createAuth` opens no connection, and no test
 * here reaches an `/api/auth/*` path or a route behind `requireSession` that
 * gets past validation, so the pool whose port nothing listens on is never
 * asked for a client.
 */
const offlinePool = createPool('postgres://unused:unused@127.0.0.1:1/unused');

function fakeIngest(): IngestService {
  return {
    ingestBatch: async () => [],
    ingestClientBatch: async () => [],
    ingestAtomic: async () => ({ status: 'committed', results: [] }),
    ingestClientAtomic: async () => ({ status: 'committed', results: [] }),
    onEventCommitted: () => () => {},
  };
}

function buildTestApp(alerter?: ErrorAlerter) {
  return buildApp(
    {
      db: { query: async () => [{ ok: 1 }] },
      pool: offlinePool,
      ingest: fakeIngest(),
      auth: createAuth({
        pool: offlinePool,
        otpSender: new LogOtpSender(() => {}),
        magicLinkSender: new LogMagicLinkSender(() => {}),
        baseUrl: 'http://localhost:3000',
        secret: 'test-secret-not-used-anywhere-real',
        // The browser's origin, so better-auth trusts the product's own client.
        webOrigin: 'http://localhost:3001',
      }),
      serverAppend: async () => [],
      webOrigin: 'http://localhost:3001',
      store: createObjectStoreFromEnv({}),
    },
    alerter === undefined ? {} : { alerter },
  );
}

/** Two macrotasks — long enough for Node to declare a floating rejection unhandled. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise((resolve) => setTimeout(resolve, 10));
}

/**
 * A promise that has NOT settled yet but can be made to, plus the handle that
 * settles it.
 *
 * The hang tests below need exactly this and not `new Promise(() => {})`: a
 * promise that can never settle makes "the alert has not been delivered" true
 * by construction, under every implementation and even under none. Releasing
 * the gate afterwards is what turns that into a claim about the code — and it
 * also stops the suite leaving a permanently-pending promise behind for the
 * life of the test process.
 */
function openGate(): { gate: Promise<void>; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

/**
 * Collects unhandled rejections that ESCAPE the code under test, and returns
 * what escaped — the rows, not a count, so a failure names the rejection.
 *
 * Its own falsifiability was checked by floating a rejection deliberately
 * inside `body` and watching this return it; that line is not left in, because
 * a test that always passes is what this collector exists to catch.
 */
async function escapedRejectionsDuring(body: () => Promise<void>): Promise<unknown[]> {
  const escaped: unknown[] = [];
  const collect = (reason: unknown): void => void escaped.push(reason);
  process.on('unhandledRejection', collect);
  try {
    await body();
    await settle();
  } finally {
    process.off('unhandledRejection', collect);
  }
  return escaped;
}

describe('WebhookErrorAlerter', () => {
  it('POSTs a Slack-compatible text payload, with a bounded deadline', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response('ok');
    }) as typeof fetch;

    const alerter = new WebhookErrorAlerter('https://hooks.example/T/B', fakeFetch);
    await alerter.notify('GET /explode', new Error('boom'));

    expect(calls.map((call) => call.url)).toEqual(['https://hooks.example/T/B']);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(calls[0]?.init?.headers).toEqual({ 'content-type': 'application/json' });
    const text = (JSON.parse(String(calls[0]?.init?.body)) as { text: string }).text;
    expect(text).toContain('GET /explode');
    expect(text).toContain('boom');
    // A webhook that never answers must not leave a socket open for the life of
    // the process. Asserted as a wired signal, not by waiting out a timeout.
    expect(calls[0]?.init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('describes a non-Error rejection reason too — a thrown string still reaches the webhook', async () => {
    const bodies: string[] = [];
    const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body));
      return new Response('ok');
    }) as typeof fetch;

    await new WebhookErrorAlerter('https://hooks.example/T/B', fakeFetch).notify('backup', 'disk full');

    expect(bodies.map((body) => (JSON.parse(body) as { text: string }).text)).toEqual([
      'gisik-nokma error — backup: disk full',
    ]);
  });

  it('planted defect: a dead webhook does not throw into the caller', async () => {
    const throwingFetch = (() => {
      throw new Error('connection refused');
    }) as unknown as typeof fetch;
    await expect(
      new WebhookErrorAlerter('https://hooks.example/T/B', throwingFetch).notify('ingest', new Error('boom')),
    ).resolves.toBeUndefined();
  });

  it('planted defect: a webhook that REJECTS does not reject into the caller either', async () => {
    const rejectingFetch = (async () => {
      throw new Error('502 from the receiver');
    }) as typeof fetch;
    await expect(
      new WebhookErrorAlerter('https://hooks.example/T/B', rejectingFetch).notify('ingest', new Error('boom')),
    ).resolves.toBeUndefined();
  });
});

describe('alerterFromConfig', () => {
  it('is a webhook alerter when the url is set, a noop when it is not', () => {
    expect(alerterFromConfig('https://hooks.example/x')).toBeInstanceOf(WebhookErrorAlerter);
    expect(alerterFromConfig(null)).toBeInstanceOf(NoopErrorAlerter);
  });

  it('the noop resolves and reaches no network — absent config is the dev default, not a degraded server', async () => {
    await expect(alerterFromConfig(null).notify('anything', new Error('boom'))).resolves.toBeUndefined();
  });
});

describe('alertWithoutWaiting', () => {
  /**
   * 13.129 — `alertWithoutWaiting` CONTAINS a synchronous throw from `notify`: it does not propagate out of `alertWithoutWaiting` itself.
   */
  it('contains a SYNCHRONOUS throw from the alerter', () => {
    const alerter: ErrorAlerter = {
      notify() {
        throw new Error('alerter exploded before it returned a promise');
      },
    };
    expect(() => {
      alertWithoutWaiting(alerter, 'ctx', new Error('boom'));
    }).not.toThrow();
  });

  /**
   * 13.130 — it contains a REJECTING `notify` too, asserted with a real `process.on('unhandledRejection')` collector rather than by inspection.
   */
  it('contains a REJECTION from the alerter — nothing escapes as an unhandled rejection', async () => {
    const alerter: ErrorAlerter = { notify: async () => Promise.reject(new Error('webhook down')) };
    const escaped = await escapedRejectionsDuring(async () => {
      alertWithoutWaiting(alerter, 'ctx', new Error('boom'));
    });
    expect(escaped).toEqual([]);
  });

  /**
   * 13.131 — it does not WAIT for the alerter, proven with a RELEASABLE gate rather than an unresolvable promise (which would make "not settled yet" trivially true).
   */
  it('does not WAIT for the alerter — it returns while notify is unsettled, and the alert lands afterwards', async () => {
    let settled = false;
    const { gate, release } = openGate();
    // A RELEASABLE gate, not `new Promise(() => {})`. With a promise that can
    // never settle, `expect(settled).toBe(false)` is true under EVERY
    // implementation — including one where this function's body is empty and
    // `notify` is never called at all — so that assertion alone proves nothing.
    // The release below is the positive control: it can only flip `settled` if
    // `alertWithoutWaiting` really did invoke `notify`.
    const alerter: ErrorAlerter = {
      notify: () =>
        gate.finally(() => {
          settled = true;
        }),
    };

    alertWithoutWaiting(alerter, 'ctx', new Error('boom'));
    expect(settled).toBe(false);

    release();
    await settle();
    expect(settled).toBe(true);
  });
});

describe('the app error handler', () => {
  /**
   * 13.132 — the 5xx handler answers the exact `INTERNAL_ERROR_BODY` shape by `toEqual`, and the body does not carry the thrown error’s message.
   */
  it('answers the fixed 500 body, alerts once, and leaks nothing', async () => {
    const notified: Array<{ context: string; error: unknown }> = [];
    const app = buildTestApp({
      notify: async (context, error) => void notified.push({ context, error }),
    });
    app.get('/explode', async () => {
      throw new Error('secret internal detail /etc/passwd');
    });

    const response = await app.inject({ method: 'GET', url: '/explode' });

    expect(response.statusCode).toBe(500);
    // NOT the plan's `{ error: 'internal_error' }`: this repo's 5xx body is the
    // exported constant, pinned by `toEqual` in four other places.
    expect(response.json()).toEqual(INTERNAL_ERROR_BODY);
    expect(response.body).not.toContain('secret internal detail');
    expect(response.body).not.toContain('/etc/passwd');
    expect(notified.map((call) => call.context)).toEqual(['GET /explode']);
    expect((notified[0]?.error as Error).message).toBe('secret internal detail /etc/passwd');
    await app.close();
  });

  /**
   * 13.133 — the alert context carries the REDACTED url, asserted to literally equal the redacted string: an invite token must not be paged out to a webhook.
   */
  it('the alert context carries the REDACTED url — an invite token must not be paged out to a webhook', async () => {
    const contexts: string[] = [];
    const app = buildTestApp({ notify: async (context) => void contexts.push(context) });
    app.get('/v1/invites/:token/explode', async () => {
      throw new Error('boom');
    });

    const response = await app.inject({ method: 'GET', url: '/v1/invites/super-secret-token/explode' });

    expect(response.statusCode).toBe(500);
    expect(contexts).toEqual(['GET /v1/invites/[redacted]/explode']);
    await app.close();
  });

  /**
   * 6.221 — the alert context also redacts a credential in the QUERY: a 5xx on the magic-link verify route must not page the token to a webhook.
   */
  it('6.221 the alert context redacts a query-string credential', async () => {
    const contexts: string[] = [];
    const app = buildTestApp({ notify: async (context) => void contexts.push(context) });
    app.get('/api/auth/magic-link/verify', async () => {
      throw new Error('boom');
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/magic-link/verify?token=TESTMARKER-not-a-token&callbackURL=%2Fw',
    });

    expect(response.statusCode).toBe(500);
    // Control: the route and the non-secret parameter are still there.
    expect(contexts).toEqual(['GET /api/auth/magic-link/verify?token=[redacted]&callbackURL=%2Fw']);
    await app.close();
  });

  /**
   * 13.134 — planted defect: a 400 from a schema refusal is the door WORKING — zero alert contexts are recorded, confirming sub-500s never page.
   */
  it('planted defect: a schema refusal is the door WORKING — 400 keeps its shape and pages nobody', async () => {
    const contexts: string[] = [];
    const app = buildTestApp({ notify: async (context) => void contexts.push(context) });

    const response = await app.inject({ method: 'POST', url: '/v1/events', payload: { nope: true } });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });
    expect(contexts).toEqual([]);
    await app.close();
  });

  /**
   * 13.135 — planted defect: an alerter that THROWS still leaves the response exactly 500 + `INTERNAL_ERROR_BODY`. The rejecting case is the test below.
   */
  it('planted defect: an alerter that THROWS leaves the 500 exactly as it is', async () => {
    const app = buildTestApp({
      notify() {
        throw new Error('the alerting channel is the outage now');
      },
    });
    app.get('/explode', async () => {
      throw new Error('boom');
    });

    const response = await app.inject({ method: 'GET', url: '/explode' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(INTERNAL_ERROR_BODY);
    await app.close();
  });

  it('planted defect: an alerter that REJECTS leaves the 500 alone and escapes no rejection', async () => {
    const app = buildTestApp({ notify: async () => Promise.reject(new Error('webhook down')) });
    app.get('/explode', async () => {
      throw new Error('boom');
    });

    let response: Awaited<ReturnType<typeof app.inject>> | undefined;
    const escaped = await escapedRejectionsDuring(async () => {
      response = await app.inject({ method: 'GET', url: '/explode' });
    });

    expect(escaped).toEqual([]);
    expect(response?.statusCode).toBe(500);
    expect(response?.json()).toEqual(INTERNAL_ERROR_BODY);
    await app.close();
  });

  /**
   * 13.136 — planted defect: an alerter that HANGS does not hold the response — the 500 is answered while the alert is still unsettled.
   */
  it('planted defect: an alerter that HANGS does not hold the response — it answers with the alert still unsettled', async () => {
    let settled = false;
    const { gate, release } = openGate();
    const app = buildTestApp({
      notify: () =>
        gate.finally(() => {
          settled = true;
        }),
    });
    app.get('/explode', async () => {
      throw new Error('boom');
    });

    const response = await app.inject({ method: 'GET', url: '/explode' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual(INTERNAL_ERROR_BODY);
    // The claim this test exists for, in two halves, and it needs BOTH. The
    // first alone is satisfied by a handler that never alerts; the second alone
    // is satisfied by a handler that awaits the alert before answering. ORDER is
    // the whole point: the 500 was already read while the alert was unsettled.
    expect(settled).toBe(false);
    release();
    await settle();
    expect(settled).toBe(true);
    await app.close();
  });

  /**
   * 13.137 — with NO alerter configured, nothing reaches the network. `globalThis.fetch` is replaced BEFORE `buildTestApp()` is called, which is what closes the instrumentation gap.
   */
  it('with NO alerter configured the 500 is unchanged and NOTHING reaches the network — absent alerting is the dev default', async () => {
    // The stub goes in BEFORE `buildTestApp`, and that ordering is the test.
    // `WebhookErrorAlerter`'s `fetchFn` defaults to the global `fetch` and
    // captures it at CONSTRUCTION, so a stub installed after the app is built
    // would be watching a function the alerter never holds — and a default that
    // opened a socket on every 5xx (in this file and the ~sixty other test files
    // that build an app) would pass unseen. Rows, not a count: a wrong default
    // fails this naming the url it posted to.
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response('ok');
    }) as typeof fetch;

    try {
      const app = buildTestApp();
      app.get('/explode', async () => {
        throw new Error('boom');
      });

      const response = await app.inject({ method: 'GET', url: '/explode' });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual(INTERNAL_ERROR_BODY);
      // After a settle, so that a default alerter which posts asynchronously is
      // caught rather than raced past.
      await settle();
      expect(calls.map((call) => call.url)).toEqual([]);
      await app.close();
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
