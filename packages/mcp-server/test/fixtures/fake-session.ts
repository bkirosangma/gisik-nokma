import type { GisikClient } from '../../src/http-client.js';
import type { Session } from '../../src/session.js';

/**
 * Spread into a fake `Session` for the verbs most tests never use: byte transfers (`getBytes`, `postMultipart`)
 * and the JSON `put`. A call is a test bug and says so; a test that needs one overrides it.
 */
export const NO_TRANSFER: Pick<Session, 'getBytes' | 'postMultipart' | 'put'> = {
  getBytes: async () => {
    throw new Error('getBytes is not stubbed in this test');
  },
  postMultipart: async () => {
    throw new Error('postMultipart is not stubbed in this test');
  },
  put: async () => {
    throw new Error('put is not stubbed in this test');
  },
};

/** The same three for a fake `GisikClient` (the stdio door's HTTP layer). */
export const NO_CLIENT_TRANSFER: Pick<GisikClient, 'getBytes' | 'postMultipart' | 'put'> = {
  getBytes: async () => {
    throw new Error('getBytes is not stubbed in this test');
  },
  postMultipart: async () => {
    throw new Error('postMultipart is not stubbed in this test');
  },
  put: async () => {
    throw new Error('put is not stubbed in this test');
  },
};
