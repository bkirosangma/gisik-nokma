import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';

/** One account found by its EXACT email (`POST /v1/workspaces/:id/people-lookup`, access plan W7). */
export type LookedUpPerson = {
  userId: string;
  name: string;
  email: string;
  inWorkspace: boolean;
};

export type LookupPerson = (email: string) => Promise<LookedUpPerson | null>;

/** The outsider door (W6): the caller's own claim, answered as the claim's `IngestResult`. */
export type AssignOutsider = (userId: string, event: SubmittedEvent) => Promise<IngestResult>;
