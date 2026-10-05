import { z } from 'zod';
import { displayName } from '../display-name.js';

/**
 * Knowledge Graph spec D §3.1: the semantic layer's data. A concept is a named group of tickets and notes,
 * curated by members and (through MCP) by an assistant acting for one. Its visibility is D4's, computed at
 * read time from its items — never stored here.
 */
export const CONCEPT_EVENT_TYPES = [
  'concept.created',
  'concept.renamed',
  'concept.described',
  'concept.item_tagged',
  'concept.item_untagged',
  'concept.linked',
  'concept.unlinked',
  'concept.merged',
  'concept.deleted',
] as const;
export type ConceptEventType = (typeof CONCEPT_EVENT_TYPES)[number];

export const CONCEPT_ITEM_KINDS = ['ticket', 'note'] as const;
export type ConceptItemKind = (typeof CONCEPT_ITEM_KINDS)[number];
/** `broader`: the OTHER concept is broader than this one. `related`: symmetric. */
export const CONCEPT_RELATIONS = ['broader', 'related'] as const;
export type ConceptRelation = (typeof CONCEPT_RELATIONS)[number];
export const CONCEPT_SUMMARY_MAX = 2000;

const entityId = z.string().min(1);
const summary = z.string().max(CONCEPT_SUMMARY_MAX);

export const conceptCreatedPayload = z
  .object({ name: displayName, summary: summary.optional(), fromSuggestion: entityId.optional() })
  .strict();
export type ConceptCreatedPayload = z.infer<typeof conceptCreatedPayload>;
export const conceptRenamedPayload = z.object({ name: displayName }).strict();
export type ConceptRenamedPayload = z.infer<typeof conceptRenamedPayload>;
/** `''` clears the summary. */
export const conceptDescribedPayload = z.object({ summary }).strict();
export type ConceptDescribedPayload = z.infer<typeof conceptDescribedPayload>;
export const conceptItemTaggedPayload = z.object({ itemKind: z.enum(CONCEPT_ITEM_KINDS), itemId: entityId }).strict();
export type ConceptItemTaggedPayload = z.infer<typeof conceptItemTaggedPayload>;
export const conceptItemUntaggedPayload = conceptItemTaggedPayload;
export type ConceptItemUntaggedPayload = ConceptItemTaggedPayload;
export const conceptLinkedPayload = z.object({ otherId: entityId, relation: z.enum(CONCEPT_RELATIONS) }).strict();
export type ConceptLinkedPayload = z.infer<typeof conceptLinkedPayload>;
export const conceptUnlinkedPayload = conceptLinkedPayload;
export type ConceptUnlinkedPayload = ConceptLinkedPayload;
/** Its tags move to `intoId`; this concept is deleted (§3.1). */
export const conceptMergedPayload = z.object({ intoId: entityId }).strict();
export type ConceptMergedPayload = z.infer<typeof conceptMergedPayload>;
export const conceptDeletedPayload = z.object({}).strict();
export type ConceptDeletedPayload = z.infer<typeof conceptDeletedPayload>;

/** The schema per type, so the vocabulary, the projection and the door read one table. */
export const CONCEPT_PAYLOADS: Record<ConceptEventType, z.ZodTypeAny> = {
  'concept.created': conceptCreatedPayload,
  'concept.renamed': conceptRenamedPayload,
  'concept.described': conceptDescribedPayload,
  'concept.item_tagged': conceptItemTaggedPayload,
  'concept.item_untagged': conceptItemUntaggedPayload,
  'concept.linked': conceptLinkedPayload,
  'concept.unlinked': conceptUnlinkedPayload,
  'concept.merged': conceptMergedPayload,
  'concept.deleted': conceptDeletedPayload,
};
