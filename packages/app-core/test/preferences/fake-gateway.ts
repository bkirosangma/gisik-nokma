import type { PreferencesDoc } from '@gisik-nokma/domain';
import type { PreferencesGateway } from '../../src/preferences/preferences-gateway.js';

/**
 * A `PreferencesGateway` over one in-memory value.
 *
 * `stored` is `unknown` and NOT `PreferencesDoc`, which is the whole reason
 * this helper exists rather than a `vi.fn()` pair: the tolerance and the
 * refusals under test are about documents that are NOT valid, and a fake typed
 * to the valid shape could not hold one to hand back.
 *
 * `saves` records every document handed to `save`, in order, so a test can
 * assert both what was written and — the direction that matters more often —
 * that NOTHING was.
 */
export class FakePreferencesGateway implements PreferencesGateway {
  stored: unknown;
  readonly saves: PreferencesDoc[] = [];
  loads = 0;

  constructor(stored: unknown) {
    this.stored = stored;
  }

  async load(): Promise<unknown> {
    this.loads += 1;
    return this.stored;
  }

  async save(document: PreferencesDoc): Promise<void> {
    this.saves.push(document);
    this.stored = document;
  }
}

/** A gateway whose `load` REJECTS — a transport failure, not a corrupt document. */
export class FailingPreferencesGateway implements PreferencesGateway {
  readonly saves: PreferencesDoc[] = [];

  async load(): Promise<unknown> {
    throw new Error('preferences unreachable');
  }

  async save(document: PreferencesDoc): Promise<void> {
    this.saves.push(document);
  }
}

/** A valid document whose OTHER TWO KEYS are non-empty, so a write that drops them shows. */
export const PROJECT_ID = '01J9GTKA000000000000000000';

export function documentWith(savedFilters: PreferencesDoc['savedFilters']): PreferencesDoc {
  return {
    savedFilters,
    listColumns: { [PROJECT_ID]: ['status', 'assignee'] },
    grouping: { [PROJECT_ID]: 'epic' },
  };
}
