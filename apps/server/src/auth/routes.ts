import type { FastifyInstance } from 'fastify';
import type { Auth } from './auth.js';

/**
 * The vendor surface, mounted whole.
 *
 * better-auth is a Web-standard `(Request) => Promise<Response>` handler that
 * owns 46 endpoints under one prefix, so it is mounted as a catch-all rather
 * than route by route. `['GET', 'POST']` is not a guess: `auth.api` was
 * enumerated over all 46 endpoints and every one of them is GET or POST — no
 * PUT, PATCH or DELETE anywhere. Some are GET where a reader would expect POST
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
        // The origin comes from the auth instance's own configured baseURL
        // rather than the request's Host header, which is attacker-controlled.
        //
        // Stated exactly, because the tempting sentence here is a false one:
        // this is NOT closing an observed hole. Measured both ways with a forged
        // `Host: evil.example` — the magic link and the OAuth `redirect_uri` come
        // back identical, because better-auth resolves every absolute URL of its
        // own from `options.baseURL` and never from the request. So nothing today
        // depends on this line and NO TEST COVERS IT; it is here so that an
        // endpoint which one day does read the request URL cannot inherit the
        // Host header by default. The fallback exists because `baseURL` is
        // optional in better-auth's option type, though `createAuth` always sets
        // it.
        const origin = auth.options.baseURL ?? `http://${request.headers.host ?? 'localhost'}`;
        const url = new URL(request.url, origin);

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
