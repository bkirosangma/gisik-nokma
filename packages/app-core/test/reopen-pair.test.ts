import { describe, expect, it } from 'vitest';
import { domainRegistry, newSubmittedEvent, type WorkflowDef } from '@gisik-nokma/domain';
import { buildReopenPair, nonTerminalStates } from '../src/offline/reopen-pair.js';
import { reopenStateOptions } from '../src/flows/guarded-child-event.js';

const WS = 'ws_1';
const PARENT = '01J9GPAR000000000000000000';

const wf = {
  id: 'wf',
  version: 1,
  name: 'W',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' as const },
    { id: 'doing', name: 'Doing', category: 'active' as const },
    { id: 'done', name: 'Done', category: 'terminal' as const },
  ],
  transitions: [],
} as unknown as WorkflowDef;

describe('nonTerminalStates', () => {
  it('12.200 — offers exactly the non-terminal states', () => {
    expect(nonTerminalStates(wf)).toEqual([
      { id: 'todo', name: 'To do' },
      { id: 'doing', name: 'Doing' },
    ]);
  });

  /**
   * 12.222 — the divergence, pinned so the two answers cannot be mistaken for
   * one. `nonTerminalStates` reads a definition's state list; `reopenStateOptions`
   * reads its declared EDGES and is what the online reopen dialog is fed from
   * (`create-ticket-flow.tsx` -> `ReopenDialog`). On this definition — whose
   * `transitions` array is empty, as the plan's own fixture wrote it — the two
   * disagree completely: two offers versus none.
   *
   * The assertion is deliberately on the SAME fixture the test above uses, so
   * a future edit that "fixes" one of them has to confront the other in the
   * same file. If this test ever goes green with equal arrays, either
   * `nonTerminalStates` grew a reachability filter (delete it and keep
   * `reopenStateOptions`) or `reopenStateOptions` lost one (a real regression
   * in the shipped online picker).
   */
  it('12.222 — is NOT the reopen picker: it ignores reachability, reopenStateOptions does not', () => {
    expect(reopenStateOptions(wf, 'done')).toEqual([]);
    expect(nonTerminalStates(wf)).toHaveLength(2);
    expect(nonTerminalStates(wf)).not.toEqual(reopenStateOptions(wf, 'done'));
  });
});

describe('buildReopenPair', () => {
  const child = () =>
    newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: '01J9GCHD000000000000000000' },
      type: 'ticket.created',
      payload: {
        typeId: 'sub-task',
        projectId: '01J9GPRJ000000000000000000',
        parentId: PARENT,
        title: 'Late child',
      },
      actorId: 'user_a',
      origin: 'desktop',
    });

  it('12.220 — emits parent transition WITH cause first, then the child event — order is the contract', () => {
    const c = child();
    const [reopen, reissued] = buildReopenPair({
      workspaceId: WS,
      parentTicketId: PARENT,
      reopenToStateId: 'doing',
      childEvent: c,
      actor: { userId: 'user_a', origin: 'desktop' },
    });
    expect(reopen).toMatchObject({
      entity: { kind: 'ticket', id: PARENT },
      type: 'ticket.transitioned',
      actorId: 'user_a',
      payload: { to: 'doing', cause: { kind: 'reopened-for-child', childTicketId: c.entity.id } },
    });
    expect(reissued).toEqual(c); // the child claim itself is untouched — same id, same payload
  });

  /**
   * 12.221 — THE CHECK THE PLAN'S OWN TEST COULD NOT MAKE.
   *
   * The prescribed test asserted `payload: { toStateId: 'doing', cause: … }`
   * with `toMatchObject` against an envelope this same function had just
   * built. Nothing in that passes the payload through a schema, so it is green
   * for any spelling the builder happens to use — including one the real door
   * refuses. `ticketTransitionedPayloadSchema` names the destination `to`
   * (`packages/domain/src/workflow.ts:138`).
   *
   * This parses through `domainRegistry`, the registration the ingest door
   * itself consults, and carries the NEGATIVE CONTROL in the same test: the
   * plan's spelling is built by hand and asserted to FAIL that parse. Without
   * the control, a registry that answered `success: true` for everything
   * (a schema loosened to `z.unknown()`, a lookup returning undefined and a
   * `?.` swallowing it) would leave this test green while proving nothing.
   */
  it('12.221 — the built payload parses under the REAL registration, and the plan-text spelling does not', () => {
    const registration = domainRegistry.get('ticket.transitioned', 1);
    expect(registration, 'ticket.transitioned must be registered for this test to mean anything').toBeDefined();
    expect(registration?.entityKind).toBe('ticket');

    const [reopen] = buildReopenPair({
      workspaceId: WS,
      parentTicketId: PARENT,
      reopenToStateId: 'doing',
      childEvent: child(),
      actor: { userId: 'user_a', origin: 'desktop' },
    });

    const accepted = registration?.payloadSchema.safeParse(reopen.payload);
    expect(accepted?.success, JSON.stringify(accepted)).toBe(true);

    // NEGATIVE CONTROL — the spelling Plan 10 Task 13's published signature
    // block prescribed. `to` is missing and required; the schema is not
    // `.strict()`, so `toStateId` is stripped rather than named in the error.
    const planSpelling = {
      toStateId: 'doing',
      cause: { kind: 'reopened-for-child', childTicketId: '01J9GCHD000000000000000000' },
    };
    const refused = registration?.payloadSchema.safeParse(planSpelling);
    expect(refused?.success, 'if this passes, the schema no longer requires `to` and 12.220 is unpinned').toBe(false);
  });

  it('12.223 — the cause names the child ENTITY id, not the child event id', () => {
    const c = child();
    const [reopen] = buildReopenPair({
      workspaceId: WS,
      parentTicketId: PARENT,
      reopenToStateId: 'doing',
      childEvent: c,
      actor: { userId: 'user_a', origin: 'desktop' },
    });
    const cause = (reopen.payload as { cause: { childTicketId: string } }).cause;
    expect(cause.childTicketId).toBe(c.entity.id);
    // The two are different values on a real envelope — without this the
    // assertion above would hold for either, since a fixture that reused one
    // id for both would make the mix-up invisible.
    expect(c.entity.id).not.toBe(c.id);
    expect(cause.childTicketId).not.toBe(c.id);
  });
});
