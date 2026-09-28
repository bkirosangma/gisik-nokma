import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PURGED_OUTBOX_NOTICE } from '@gisik-nokma/domain';
import { SYNC_NOTICE_DISMISS, SyncNotices, failedClaimNotice } from '../src/sync/sync-notices.js';

/**
 * Trash series Plan 3, Task 6 — the notices a device owes the person
 * (spec §5.7). The CSS half mirrors `sync-ux-css-binding.test.tsx` (12.199):
 * the classes rendered and the rules in `ui.css` are one fact.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const PREFIX = 'gn-sync-notices';

function styledClasses(css: string): string[] {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...new Set([...bare.matchAll(new RegExp(`\\.(${PREFIX}[A-Za-z0-9_-]*)`, 'g'))].map((m) => m[1] as string))].sort();
}

function renderedClasses(root: HTMLElement): string[] {
  const found = new Set<string>();
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const name of Array.from(el.classList)) if (name.startsWith(PREFIX)) found.add(name);
  }
  return [...found].sort();
}

describe('19.185 SyncNotices', () => {
  it('19.185 draws each sentence with a named Dismiss, reports the id, and is one fact with ui.css', async () => {
    const onDismiss = vi.fn();
    const failed = failedClaimNotice('restrict-to: Only admins may make this move.');
    const { container, unmount } = render(
      <SyncNotices
        notices={[
          { id: 'purged:e1', text: PURGED_OUTBOX_NOTICE },
          { id: 'failed:e2', text: failed },
        ]}
        onDismiss={onDismiss}
      />,
    );
    const region = screen.getByRole('region', { name: 'Sync notices' });
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText(PURGED_OUTBOX_NOTICE)).toBeInTheDocument();
    expect(failed).toBe('A change could not be saved — restrict-to: Only admins may make this move.');
    expect(failedClaimNotice(null)).toBe('A change could not be saved.');
    await userEvent.click(screen.getByRole('button', { name: `${SYNC_NOTICE_DISMISS}: ${PURGED_OUTBOX_NOTICE}` }));
    expect(onDismiss).toHaveBeenCalledWith('purged:e1');
    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    expect(renderedClasses(container)).toEqual(styledClasses(css));
    unmount();

    // CONTROL: nothing to say, nothing to press — but the live region stays mounted
    render(<SyncNotices notices={[]} onDismiss={onDismiss} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('region', { name: 'Sync notices' })).toBeEmptyDOMElement();
  });
});
