import { z } from 'zod';
import { newUlid, type ConceptAudienceResponse, type ConceptListResponse, type ConceptView, type SuggestionListResponse } from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs, readOrNotFound } from './reads.js';
import { envelopeFor, submitBatch, submitOne } from './submit.js';

/**
 * Knowledge Graph spec D §5: concepts. Reads call the API (D4 is the server's, `routes/concepts.ts`), and writes go
 * through the ingest door as the session's user with `origin: 'mcp'` (`envelopeFor`), so the door's D4 rules, not this
 * file, decide. D6's switch has no effect here.
 *
 * Two writes follow the planner's R1 ruling (2026-10-05; `apps/server/src/concepts/merge.ts`), because every concept
 * row key is written and removed by ONE concept's stream and the door refuses anything else:
 * - a `related` link is posted on the LOWER of the two ids, the other as `otherId`, whichever way round it was asked
 *   (`concept.related-stream`); `broader` stays on `conceptId`, since it has a direction;
 * - a merge C → D is a sequence in ONE batch: `concept.item_tagged` on D for each of C's live items D lacks, then
 *   `concept.merged` on C, which the door refuses while any is missing (`concept.merge-incomplete`). The batch is not
 *   atomic (each event commits alone), and need not be: a partial merge is a state a person could make by hand, the
 *   refusal comes back in the server's words, and a retry completes it.
 */
const id = z.string().min(1);
const enc = encodeURIComponent;
const itemRef = z.object({ kind: z.enum(['ticket', 'note']), id });
const conceptOf = async (session: Session, conceptId: string): Promise<ConceptView> =>
  (await readOrNotFound(session, `/v1/concepts/${enc(conceptId)}`, 'concept')) as ConceptView;
const itemKey = (item: { kind: string; id: string }): string => `${item.kind}:${item.id}`;

const listShape = { workspaceId: id, item: itemRef.optional(), ...pageArgs };
const getShape = { conceptId: id };
const manageShape = {
  action: z.enum(['create', 'rename', 'describe', 'merge', 'delete']),
  workspaceId: id.optional(),
  conceptId: id.optional(),
  name: z.string().min(1).optional(),
  summary: z.string().max(2000).optional(),
  intoId: id.optional(),
  confirm_name: z.string().optional(),
};
const tagShape = { conceptId: id, action: z.enum(['add', 'remove']), items: z.array(itemRef).min(1).max(50), confirm_name: z.string().optional() };
const linkShape = { conceptId: id, otherId: id, relation: z.enum(['broader', 'related']), action: z.enum(['add', 'remove']) };
const reviewShape = { workspaceId: id, ...pageArgs };
const resolveShape = {
  workspaceId: id,
  suggestionId: id,
  action: z.enum(['accept', 'reject']),
  name: z.string().min(1).optional(),
  summary: z.string().max(2000).optional(),
};

export function conceptTools(session: Session): ToolDefinition[] {
  const ev = (workspaceId: string, conceptId: string, type: string, payload: unknown) =>
    envelopeFor(session, workspaceId, { kind: 'concept', id: conceptId }, type, payload);
  return [
    {
      name: 'list_concepts',
      description:
        'The concepts (named groups of tickets and notes) you can see in a workspace: you see a concept only when you can ' +
        'see every item in it. Give `item` to list only the concepts that contain that ticket or note.',
      inputSchema: listShape,
      handler: async (args) => {
        const a = z.object(listShape).parse(args);
        const qs = a.item === undefined ? '' : `?item=${enc(itemKey(a.item))}`;
        const body = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/concepts${qs}`, 'concept')) as ConceptListResponse;
        const { items, nextCursor } = page(body.concepts, a.cursor, a.limit);
        return { workspaceId: body.workspaceId, concepts: items, nextCursor };
      },
    },
    {
      name: 'get_concept',
      description:
        'One concept: its summary, its items (tickets and notes, each with who tagged it and how), its links to broader and ' +
        'related concepts, and who created it.',
      inputSchema: getShape,
      handler: async (args) => conceptOf(session, z.object(getShape).parse(args).conceptId),
    },
    {
      name: 'manage_concept',
      description:
        'Create (workspaceId, name, summary?), rename (conceptId, name), describe (conceptId, summary; empty clears), ' +
        'merge (conceptId into intoId: its items are added to intoId, then it is deleted) or delete (conceptId) a concept. ' +
        "merge and delete need confirm_name — the concept's exact name; without it you get a preview and nothing happens. " +
        'An item in the trash when its concept is merged is not carried: after a restore it is in neither concept.',
      inputSchema: manageShape,
      handler: async (args) => {
        const a = z.object(manageShape).parse(args);
        if (a.action === 'create') {
          if (a.workspaceId === undefined || a.name === undefined) throw new Error('create needs workspaceId and name');
          return submitOne(session, ev(a.workspaceId, newUlid(), 'concept.created', { name: a.name, ...(a.summary === undefined ? {} : { summary: a.summary }) }));
        }
        if (a.conceptId === undefined) throw new Error(`${a.action} needs conceptId`);
        const concept = await conceptOf(session, a.conceptId);
        if (a.action === 'rename') {
          if (a.name === undefined) throw new Error('rename needs name');
          return submitOne(session, ev(concept.workspaceId, concept.id, 'concept.renamed', { name: a.name }));
        }
        if (a.action === 'describe') {
          if (a.summary === undefined) throw new Error('describe needs summary');
          return submitOne(session, ev(concept.workspaceId, concept.id, 'concept.described', { summary: a.summary }));
        }
        if (a.action === 'merge') {
          if (a.intoId === undefined) throw new Error('merge needs intoId');
          const into = await conceptOf(session, a.intoId);
          const preview = await confirmOrPreview(concept.name, a.confirm_name, async () => ({
            sentence: `Merges "${concept.name}" into "${into.name}"; its items move and "${concept.name}" is deleted.`,
            counts: { items: concept.items.length },
          }));
          if (preview !== null) return preview;
          const held = new Set(into.items.map(itemKey));
          const tags = concept.items
            .filter((item) => !held.has(itemKey(item)))
            .map((item) => ev(into.workspaceId, into.id, 'concept.item_tagged', { itemKind: item.kind, itemId: item.id }));
          return submitBatch(session, [...tags, ev(concept.workspaceId, concept.id, 'concept.merged', { intoId: into.id })]);
        }
        const preview = await confirmOrPreview(concept.name, a.confirm_name, async () => ({
          sentence: `Deletes the concept "${concept.name}".`,
          counts: { items: concept.items.length },
        }));
        if (preview !== null) return preview;
        return submitOne(session, ev(concept.workspaceId, concept.id, 'concept.deleted', {}));
      },
    },
    {
      name: 'tag_items',
      description:
        'Add tickets and notes to a concept, or remove them. An add that would NARROW who can see the concept (you see a ' +
        "concept only if you see every item) answers a preview — \"Fewer people will see this concept: 3 of 9 members\" — until confirm_name is the concept's exact name. Removing never needs it.",
      inputSchema: tagShape,
      handler: async (args) => {
        const a = z.object(tagShape).parse(args);
        const concept = await conceptOf(session, a.conceptId);
        const type = a.action === 'add' ? 'concept.item_tagged' : 'concept.item_untagged';
        if (a.action === 'add') {
          const adds = a.items.map((item) => `add=${enc(itemKey(item))}`).join('&');
          // A 404 here is the concept or an item the caller cannot see (the route answers both alike).
          const audience = (await readOrNotFound(
            session,
            `/v1/workspaces/${enc(concept.workspaceId)}/concepts/audience?conceptId=${enc(concept.id)}&${adds}`,
            'concept or item',
          )) as ConceptAudienceResponse;
          if (audience.after < audience.before) {
            const preview = await confirmOrPreview(concept.name, a.confirm_name, async () => ({
              sentence: `Fewer people will see this concept: ${String(audience.after)} of ${String(audience.members)} members`,
              counts: { members: audience.members, before: audience.before, after: audience.after },
            }));
            if (preview !== null) return preview;
          }
        }
        return submitBatch(session, a.items.map((item) => ev(concept.workspaceId, concept.id, type, { itemKind: item.kind, itemId: item.id })));
      },
    },
    {
      name: 'link_concepts',
      description:
        'Link two concepts (relation broader: otherId is the broader one; related: either way round), or remove that link.',
      inputSchema: linkShape,
      handler: async (args) => {
        const a = z.object(linkShape).parse(args);
        const concept = await conceptOf(session, a.conceptId);
        // R1: a related link lives on the lower id's stream; broader on the narrower concept's, as asked.
        const [stream, other] = a.relation === 'related' && a.otherId < concept.id ? [a.otherId, concept.id] : [concept.id, a.otherId];
        return submitOne(session, ev(concept.workspaceId, stream, a.action === 'add' ? 'concept.linked' : 'concept.unlinked', { otherId: other, relation: a.relation }));
      },
    },
    // KG-D Task 5 (spec §4.2/§5.2): the model's suggestions, reviewed and resolved by the assistant for its person.
    {
      name: 'review_suggestions',
      description:
        'Concepts the model SUGGESTS for a workspace: groups of tickets and notes that read alike, each with a provisional ' +
        'label from its most distinctive words. Only suggestions whose items you can all see. Accept or reject one with resolve_suggestion.',
      inputSchema: reviewShape,
      handler: async (args) => {
        const a = z.object(reviewShape).parse(args);
        const body = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/suggestions`, 'workspace')) as SuggestionListResponse;
        const { items, nextCursor } = page(body.suggestions, a.cursor, a.limit);
        return { workspaceId: body.workspaceId, suggestions: items, nextCursor };
      },
    },
    {
      name: 'resolve_suggestion',
      description:
        'accept (name, summary?) makes the suggestion a concept with its items tagged; if an item cannot be tagged, the ' +
        "concept is still made and the error names that item's index; reject records that this group is " +
        'not a concept, and it will not be suggested again unless more than half of it changes.',
      inputSchema: resolveShape,
      handler: async (args) => {
        const a = z.object(resolveShape).parse(args);
        // Read through the route, so the suggestion is one this person sees in full (D4), and the door checks it again.
        const body = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/suggestions`, 'workspace')) as SuggestionListResponse;
        const s = body.suggestions.find((x) => x.id === a.suggestionId);
        if (s === undefined) throw new Error('suggestion not found or not visible to you');
        if (a.action === 'reject') {
          return submitOne(
            session,
            envelopeFor(session, a.workspaceId, { kind: 'workspace', id: a.workspaceId }, 'workspace.concept_suggestion_rejected', {
              signature: s.signature,
              itemHashes: s.itemHashes,
            }),
          );
        }
        if (a.name === undefined) throw new Error('accept needs name');
        // ONE batch, not atomic (`ingest-service.ts`): a refused tag leaves the concept and the earlier tags committed,
        // each visible, attributed and removable (D2), and `submitBatch` names the refused event's index.
        const conceptId = newUlid();
        return submitBatch(session, [
          ev(a.workspaceId, conceptId, 'concept.created', { name: a.name, fromSuggestion: s.id, ...(a.summary === undefined ? {} : { summary: a.summary }) }),
          ...s.items.map((item) => ev(a.workspaceId, conceptId, 'concept.item_tagged', { itemKind: item.kind, itemId: item.id })),
        ]);
      },
    },
  ];
}
