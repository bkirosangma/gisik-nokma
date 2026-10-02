import type { GisikClient } from '../../src/http-client.js';
import type { Session } from '../../src/session.js';

/** Spread into a fake `Session` that never transfers bytes; a call is a test bug and says so. */
export const NO_TRANSFER: Pick<Session, 'getBytes' | 'postMultipart'> = {
  getBytes: async () => {
    throw new Error('getBytes is not stubbed in this test');
  },
  postMultipart: async () => {
    throw new Error('postMultipart is not stubbed in this test');
  },
};

/** The same for a fake `GisikClient` (the stdio door's HTTP layer). */
export const NO_CLIENT_TRANSFER: Pick<GisikClient, 'getBytes' | 'postMultipart'> = {
  getBytes: async () => {
    throw new Error('getBytes is not stubbed in this test');
  },
  postMultipart: async () => {
    throw new Error('postMultipart is not stubbed in this test');
  },
};
