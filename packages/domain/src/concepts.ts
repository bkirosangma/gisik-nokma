import type { ConceptItemKind, ConceptRelation } from './events/concept-events.js';

/**
 * Knowledge Graph spec D §5.1: the concept reads' wire shapes (KG-D Task 4, `apps/server/src/routes/concepts.ts`).
 * Every answer is already D4's: a concept reaches a reader only when they can see every live item in it, and an
 * item in the trash is in no list here (it keeps its tag, and a restore brings it back).
 */
export type ConceptItemView = {
  kind: ConceptItemKind;
  id: string;
  /** A ticket's key and title (`CCRE-1 Renew the trade licence`, or the title alone without a key); a note's title. */
  label: string;
  taggedBy: string;
  taggedAt: string;
  origin: string;
};
/** `direction` is the OTHER concept's place relative to this one: `broader` (it is broader), `narrower`, or `related`. */
export type ConceptLinkView = { otherId: string; otherName: string; relation: ConceptRelation; direction: 'broader' | 'narrower' | 'related' };
/** `itemCount` counts live items only. */
export type ConceptSummary = { id: string; name: string; summary: string; itemCount: number; createdBy: string; origin: string };
export type ConceptView = ConceptSummary & {
  workspaceId: string;
  createdAt: string;
  fromSuggestion: string | null;
  items: ConceptItemView[];
  links: ConceptLinkView[];
};
export type ConceptListResponse = { workspaceId: string; concepts: ConceptSummary[] };
/** The narrowing preview's numbers (§3.2): the workspace's people, and how many see the concept now and with the add. */
export type ConceptAudienceResponse = { conceptId: string | null; members: number; before: number; after: number };
/** The ticket history's event shape (`routes/ticket-history.ts` `TicketHistoryEvent`), mapped client-side as that one is. */
export type ConceptHistoryResponse = { conceptId: string; events: unknown[] };
