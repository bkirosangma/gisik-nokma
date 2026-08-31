import type { FastifyInstance } from 'fastify';
import type { Auth } from './auth.js';

/**
 * The vendor surface, mounted whole.
 *
 * better-auth is a Web-standard `(Request) => Promise<Response>` handler that
 * owns every endpoint under one prefix, so it is mounted as a catch-all rather
 * than route by route. `['GET', 'POST']` is not a guess: `auth.api` was
 * enumerated — 46 entries, 44 of which carry an HTTP `path` (`setPassword` and
 * `consumePhoneNumberOTP` are server-only helpers), and the distinct methods
 * across those 44 are exactly `GET` and `POST`. No PUT, PATCH or DELETE
 * anywhere. Some are GET where a reader would expect POST
 * (`/passkey/generate-register-options`, `/magic-link/verify`), and one carries
 * a path parameter (`/reset-password/:token`), which is exactly why the mount is
 * a wildcard and not a table of paths that would need editing on every upgrade.
 *
 * `/api/auth/*` and not `/v1/*`: the product API is ours and versioned; this
 * prefix is better-auth's own default and the one its client library and every
 * page of its documentation assume. Unifying them would buy consistency and cost
 * the ability to point at the library's docs.
 */
export function registerAuthRoutes(app: FastifyInstance, auth: Auth): void {
  // Read once, at assembly, and refuse rather than improvise.
  //
  // The earlier shape here was `auth.options.baseURL ?? \`http://${request.headers.host}\``,
  // and the fallback was the defect: it reintroduced the attacker-controlled
  // Host header in exactly the situation the line exists to exclude, so the
  // comment below promised something the code did not do unconditionally.
  // Throwing costs a misconfigured deployment its boot instead of its integrity,
  // and it happens here rather than inside the handler so the failure is one
  // startup error and not a 500 on every sign-in.
  const baseUrl = auth.options.baseURL;
  if (baseUrl === undefined || baseUrl === '') {
    throw new Error(
      'registerAuthRoutes: the auth instance has no baseURL. This mount will not fall back to the request Host header — pass baseUrl to createAuth.',
    );
  }

  // Encapsulated so the body parser below cannot reach the product routes.
  // Verified, not assumed: with this scope in place `POST /v1/events` still
  // arrives parsed and still answers 400 FST_ERR_VALIDATION for an unknown key,
  // i.e. the instance-wide `removeAdditional: false` policy is untouched.
  void app.register(async (scope) => {
    // better-auth wants the request body as bytes, and Fastify's JSON parser
    // would hand over an object we could only re-serialise. This is load-bearing
    // rather than tidy: removed, `request.body` is no longer a Buffer, every
    // POST reaches better-auth with no body, and 12 of the 17 checks in
    // `test/auth/sign-in-flows.test.ts` fail. Run, not reasoned.
    //
    // It also decides WHO answers a request the vendor should be judging. Both
    // ways, measured: a POST with `content-type: application/json` and an EMPTY
    // body is Fastify's 400 `FST_ERR_CTP_EMPTY_JSON_BODY` without this parser
    // and better-auth's own 200 with it; a form-encoded POST is 415 either way,
    // but with the parser the 415 is better-auth's `UNSUPPORTED_MEDIA_TYPE`,
    // naming the types it allows, instead of Fastify's opaque
    // `FST_ERR_CTP_INVALID_MEDIA_TYPE`. A POST carrying no content-type at all
    // reaches the handler with `request.body === undefined` either way — the
    // parser gets no credit for that one.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, body, done) => {
      done(null, body);
    });

    scope.route({
      method: ['GET', 'POST'],
      url: '/api/auth/*',
      handler: async (request, reply) => {
        // The origin is the configured baseURL, unconditionally — the request's
        // Host header never reaches this URL, in any configuration.
        //
        // Stated exactly, because the tempting sentence here is a false one:
        // this is NOT closing an observed hole. Measured both ways with a forged
        // `Host: evil.example` — the magic link and the OAuth `redirect_uri` come
        // back identical, because better-auth resolves every absolute URL of its
        // own from `options.baseURL` and never from the request. So no test can
        // cover the CHOICE; what is covered is the guard above, which is what
        // makes the choice unconditional. The point of both is that an endpoint
        // which one day does read the request URL cannot inherit Host by default.
        const url = new URL(request.url, baseUrl);

        const headers = new Headers();
        for (const [key, value] of Object.entries(request.headers)) {
          if (typeof value === 'string') headers.append(key, value);
          else if (Array.isArray(value)) for (const item of value) headers.append(key, item);
        }

        // GET may not carry a body, and an empty Buffer is not the same as no
        // body: `new Request(url, { body: emptyBuffer })` would set
        // `content-length: 0` on a request the vendor expects to be bodyless.
        const raw = request.body;
        const body =
          request.method === 'POST' && Buffer.isBuffer(raw) && raw.length > 0 ? raw : undefined;

        const response = await auth.handler(new Request(url, { method: request.method, headers, body }));

        reply.status(response.status);
        for (const [key, value] of response.headers) {
          // Set-Cookie is the one header that legitimately repeats — sign-out
          // clears three at once — and `Headers.get` would join them with a
          // comma into a single unparseable cookie. `getSetCookie()` is the only
          // accessor that keeps them apart, and Fastify sends a string array as
          // repeated headers.
          if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
        }
        const cookies = response.headers.getSetCookie();
        if (cookies.length > 0) reply.header('set-cookie', cookies);

        // `text()` and not the stream: the response is already buffered in
        // memory by the handler, and a string payload with an explicit
        // content-type is sent by Fastify verbatim rather than re-serialised.
        // An empty string is the honest body for the 302 that magic-link
        // verification answers with, and for the bodyless 404 the vendor gives
        // an unknown sub-path.
        return reply.send(await response.text());
      },
    });
  });
}
