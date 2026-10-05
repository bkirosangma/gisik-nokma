import { act, cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUlid, validateWorkflowDef } from '@gisik-nokma/domain';
import { createDraftStore, type WorkflowDraft } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { PHONE_BOARD_QUERY } from '../../src/views/use-phone-board.js';
import { STACKED_QUERY } from '../../src/workflow-builder/ui/builder-panels.js';
import { draftStorageKey, WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.js';

/**
 * Full-screen editing (G-9 T5, spec §4): the screen's own `data-fullscreen` layout, its floating toolbar, the floating
 * panel and the Escape ladder. jsdom applies no CSS, so the left column's panels stay in the DOM in full screen: every
 * panel query is scoped to the `Workflow panel` region, or the left column would answer it.
 */
const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const admin = { userId: newUlid(), role: 'admin' } as const;

/** jsdom has no `matchMedia`: each case says which queries match (none, the desktop, unless it says otherwise). */
function stubMatchMedia(matches: (query: string) => boolean = () => false) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: matches(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  window.sessionStorage.clear();
  stubMatchMedia();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
});

async function renderBuilder(opts: { workspaceId?: string; initialDraft?: WorkflowDraft; role?: 'admin' | 'member' } = {}) {
  const view = render(
    <WorkflowBuilderScreen
      workspaceId={opts.workspaceId ?? newUlid()}
      session={{ ...admin, role: opts.role ?? 'admin' }}
      gateway={createFakeGateway()}
      initialDraft={opts.initialDraft ?? draftFromTemplate(kanban)}
    />,
  );
  await screen.findByRole('textbox', { name: 'Workflow name' });
  const root = view.container.querySelector<HTMLElement>('.workflow-builder-screen')!;
  const header = view.container.querySelector<HTMLElement>('.workflow-builder-screen__header')!;
  return { ...view, root, header };
}

const toolbar = () => document.querySelector<HTMLElement>('.gn-wf-toolbar')!;
const panel = () => screen.queryByRole('region', { name: 'Workflow panel' });
const cornerFullScreen = () => within(screen.getByRole('region', { name: 'Canvas' })).getByRole('button', { name: 'Full screen' });

async function enterFullScreen(user: ReturnType<typeof userEvent.setup>, header: HTMLElement) {
  await user.click(within(header).getByRole('button', { name: 'Full screen' }));
}

describe('25.545 entering and leaving full screen moves focus', () => {
  it('25.545 the header button turns on data-fullscreen, the region role and its label, and focuses the name; Exit returns focus to the button that entered (header, then the canvas corner)', async () => {
    const user = userEvent.setup();
    const { root, header } = await renderBuilder();
    // Before: the attribute is there and says false, and the root has no role (so "on" cannot pass on an always-present attribute).
    expect(root).toHaveAttribute('data-fullscreen', 'false');
    expect(root).not.toHaveAttribute('role');
    expect(root).not.toHaveAttribute('aria-label');

    await enterFullScreen(user, header);
    expect(root).toHaveAttribute('data-fullscreen', 'true');
    expect(root).toHaveAttribute('role', 'region');
    expect(root).toHaveAttribute('aria-label', 'Workflow editor, full screen');
    expect(screen.getByRole('region', { name: 'Workflow editor, full screen' })).toBe(root);
    expect(within(toolbar()).getByRole('textbox', { name: 'Workflow name' })).toHaveFocus();

    await user.click(within(toolbar()).getByRole('button', { name: 'Exit full screen' }));
    expect(root).toHaveAttribute('data-fullscreen', 'false');
    expect(root).not.toHaveAttribute('role');
    expect(within(header).getByRole('button', { name: 'Full screen' })).toHaveFocus();

    // The return goes to the button that entered: the canvas corner's, not the header's.
    await user.click(cornerFullScreen());
    expect(root).toHaveAttribute('data-fullscreen', 'true');
    expect(within(toolbar()).getByRole('textbox', { name: 'Workflow name' })).toHaveFocus();
    await user.click(within(toolbar()).getByRole('button', { name: 'Exit full screen' }));
    expect(cornerFullScreen()).toHaveFocus();
    expect(within(header).getByRole('button', { name: 'Full screen' })).not.toHaveFocus();
  });
});

describe('25.546 full screen and the panel width are remembered for the session, per draft', () => {
  it('25.546 a remount restores full screen from <draftStorageKey>:fullscreen; control: another draft key does not; exit is remembered too', async () => {
    const user = userEvent.setup();
    const workspaceId = newUlid();
    const initialDraft = draftFromTemplate(kanban);
    const first = await renderBuilder({ workspaceId, initialDraft });
    await enterFullScreen(user, first.header);
    expect(window.sessionStorage.getItem(`${draftStorageKey(workspaceId, initialDraft.def.id)}:fullscreen`)).toBe('true');
    first.unmount();

    const again = await renderBuilder({ workspaceId, initialDraft });
    expect(again.root).toHaveAttribute('data-fullscreen', 'true');
    // a restored mount does not steal focus (only a press on Full screen moves it)
    expect(document.body).toHaveFocus();
    again.unmount();

    // Control: another workspace is another draft key.
    const other = await renderBuilder({ workspaceId: newUlid(), initialDraft });
    expect(other.root).toHaveAttribute('data-fullscreen', 'false');
    other.unmount();

    const third = await renderBuilder({ workspaceId, initialDraft });
    await user.click(within(toolbar()).getByRole('button', { name: 'Exit full screen' }));
    third.unmount();
    const fourth = await renderBuilder({ workspaceId, initialDraft });
    expect(fourth.root).toHaveAttribute('data-fullscreen', 'false');
  });

  it('25.546 the panel width is read from <draftStorageKey>:panelWidth, clamped to 280–480 (a stored 9999 is 480, a stored 10 is 280, 300 stays 300), and the resize handle steps it by 16 and writes it back', async () => {
    const user = userEvent.setup();
    const workspaceId = newUlid();
    const initialDraft = draftFromTemplate(kanban);
    const key = draftStorageKey(workspaceId, initialDraft.def.id);
    window.sessionStorage.setItem(`${key}:fullscreen`, 'true');
    const widthAfterMount = async (stored: string | null) => {
      if (stored === null) window.sessionStorage.removeItem(`${key}:panelWidth`);
      else window.sessionStorage.setItem(`${key}:panelWidth`, stored);
      const view = await renderBuilder({ workspaceId, initialDraft });
      await user.click(await screen.findByTestId('state-node-doing'));
      const width = panel()!.style.width;
      view.unmount();
      return width;
    };
    expect(await widthAfterMount(null)).toBe('360px'); // the default
    expect(await widthAfterMount('300')).toBe('300px'); // control: inside the range it is kept
    expect(await widthAfterMount('9999')).toBe('480px');
    expect(await widthAfterMount('481')).toBe('480px');
    expect(await widthAfterMount('480')).toBe('480px');
    expect(await widthAfterMount('10')).toBe('280px');
    expect(await widthAfterMount('279')).toBe('280px');
    expect(await widthAfterMount('280')).toBe('280px');
    expect(await widthAfterMount('junk')).toBe('360px');
    expect(await widthAfterMount('')).toBe('360px'); // not Number('') = 0, which would clamp to 280
    expect(await widthAfterMount('300.6')).toBe('301px'); // whole px

    window.sessionStorage.setItem(`${key}:panelWidth`, '300');
    await renderBuilder({ workspaceId, initialDraft });
    await user.click(await screen.findByTestId('state-node-doing'));
    const handle = within(panel()!).getByRole('separator', { name: 'Resize the panel' });
    expect(handle).toHaveAttribute('aria-valuenow', '300');
    expect(handle).toHaveAttribute('aria-valuemin', '280');
    expect(handle).toHaveAttribute('aria-valuemax', '480');
    handle.focus();
    // The handle is on the panel's LEFT edge: ArrowLeft widens it, ArrowRight narrows it.
    await user.keyboard('{ArrowLeft}');
    expect(panel()!.style.width).toBe('316px');
    expect(window.sessionStorage.getItem(`${key}:panelWidth`)).toBe('316');
    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}');
    expect(panel()!.style.width).toBe('280px'); // 268 clamps
    expect(window.sessionStorage.getItem(`${key}:panelWidth`)).toBe('280');
  });
});

describe('25.547 the floating toolbar: its order, the validator\'s count, and the More fold', () => {
  const names = ['Workflow name', 'Add state', 'Add transition', 'Zoom', 'Tidy', 'Issues', 'Publish', 'Exit full screen'];
  function controls(row: HTMLElement): HTMLElement[] {
    const inRow = within(row);
    return [
      inRow.getByRole('textbox', { name: 'Workflow name' }),
      inRow.getByRole('button', { name: 'Add state' }),
      inRow.getByRole('button', { name: 'Add transition' }),
      inRow.getByRole('group', { name: 'Zoom' }),
      inRow.getByRole('button', { name: 'Tidy' }),
      inRow.getByRole('button', { name: /^Issues \d+$/ }),
      inRow.getByRole('button', { name: 'Publish' }),
      inRow.getByRole('button', { name: 'Exit full screen' }),
    ];
  }

  it('25.547 wide: the eight controls in order, the zoom group holds Zoom out, Zoom in and Fit to screen, and there is no More', async () => {
    const user = userEvent.setup();
    const { header } = await renderBuilder();
    await enterFullScreen(user, header);
    const row = toolbar();
    const found = controls(row);
    expect(found).toHaveLength(names.length);
    for (let at = 0; at + 1 < found.length; at += 1) {
      expect(found[at]!.compareDocumentPosition(found[at + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${names[at]} before ${names[at + 1]}`).toBeTruthy();
    }
    const zoom = within(row).getByRole('group', { name: 'Zoom' });
    const zoomButtons = within(zoom).getAllByRole('button');
    expect(zoomButtons).toHaveLength(3);
    expect(zoomButtons[0]).toHaveAccessibleName('Zoom out');
    expect(zoomButtons[1]).toHaveAccessibleName('Zoom in');
    expect(zoomButtons[2]).toHaveAccessibleName('Fit to screen');
    expect(within(row).queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('25.547 the Issues badge counts validateWorkflowDef (two drafts, two counts)', async () => {
    const user = userEvent.setup();
    // One extra state, then the same plus a second To do → Doing: the counts differ, and the second differs from any count of
    // states (a badge counting states, or added states, reads the same for both drafts).
    const draftWith = (duplicateTransition: boolean) => {
      const store = createDraftStore(draftFromTemplate(kanban));
      store.actions.addState();
      const first = store.getState().def.transitions[0]!;
      if (duplicateTransition) store.actions.addTransition(first.from, first.to);
      store.actions.select({ kind: 'none' });
      return store.getState();
    };
    const one = draftWith(false);
    const two = draftWith(true);
    expect(two.def.states.length).toBe(one.def.states.length);
    const a = validateWorkflowDef(one.def).length;
    const b = validateWorkflowDef(two.def).length;
    expect(a).toBeGreaterThan(0);
    expect(b).not.toBe(a);

    const first = await renderBuilder({ initialDraft: one });
    await enterFullScreen(user, first.header);
    expect(within(toolbar()).getByRole('button', { name: `Issues ${a}` })).toBeInTheDocument();
    first.unmount();
    const second = await renderBuilder({ initialDraft: two });
    await enterFullScreen(user, second.header);
    expect(within(toolbar()).getByRole('button', { name: `Issues ${b}` })).toBeInTheDocument();
  });

  it('25.547 narrow (STACKED_QUERY): zoom and Tidy fold into More, whose menu holds them; the Issues badge stays in the row', async () => {
    stubMatchMedia((query) => query === STACKED_QUERY);
    const user = userEvent.setup();
    const { header } = await renderBuilder();
    await enterFullScreen(user, header);
    const row = within(toolbar());
    expect(row.queryByRole('button', { name: 'Tidy' })).toBeNull();
    expect(row.queryByRole('group', { name: 'Zoom' })).toBeNull();
    expect(row.queryByRole('button', { name: 'Zoom in' })).toBeNull();
    expect(row.getByRole('button', { name: /^Issues \d+$/ })).toBeInTheDocument();
    const more = row.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'More' });
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Zoom out', 'Zoom in', 'Fit to screen', 'Tidy']);
  });

  it('25.547 phone (STACKED_QUERY and PHONE_BOARD_QUERY): the Issues badge folds into More too', async () => {
    stubMatchMedia((query) => query === STACKED_QUERY || query === PHONE_BOARD_QUERY);
    const user = userEvent.setup();
    const { header } = await renderBuilder();
    await enterFullScreen(user, header);
    const row = within(toolbar());
    expect(row.queryByRole('button', { name: /^Issues/ })).toBeNull();
    await user.click(row.getByRole('button', { name: 'More' }));
    const menu = screen.getByRole('menu', { name: 'More' });
    expect(within(menu).getByRole('menuitem', { name: /^Issues \d+$/ })).toBeInTheDocument();
    // the Issues item opens the panel on the Issues tab and closes the menu
    await user.click(within(menu).getByRole('menuitem', { name: /^Issues \d+$/ }));
    expect(screen.queryByRole('menu', { name: 'More' })).toBeNull();
    expect(within(panel()!).getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('25.548 the Escape ladder: innermost first, one layer per press', () => {
  async function fullScreenWithRuleMenu() {
    const user = userEvent.setup();
    const view = await renderBuilder();
    await enterFullScreen(user, view.header);
    await user.click(await screen.findByTestId('state-node-doing'));
    const region = panel()!;
    await user.click(within(region).getByRole('tab', { name: 'States & transitions' }));
    // the first transition row (To do → Doing) inside the panel: the rows after the state rows
    const rows = within(region).getAllByRole('button').filter((button) => button.hasAttribute('aria-expanded'));
    await user.click(rows[kanban.def.states.length]!);
    await user.click(within(region).getByRole('tab', { name: 'Selection' }));
    await user.click(within(region).getByRole('button', { name: 'Add rule' }));
    return { user, ...view };
  }

  it('25.548 the open rule menu, then the panel, then full screen; a window spy sees [true, true, false]', async () => {
    const { user, root } = await fullScreenWithRuleMenu();
    const seen: boolean[] = [];
    const spy = (event: KeyboardEvent) => {
      if (event.key === 'Escape') seen.push(event.defaultPrevented);
    };
    window.addEventListener('keydown', spy);
    try {
      // precondition: all three layers are up
      expect(within(panel()!).getByRole('menu', { name: 'Add rule' })).toBeInTheDocument();
      expect(root).toHaveAttribute('data-fullscreen', 'true');

      await user.keyboard('{Escape}');
      expect(screen.queryByRole('menu', { name: 'Add rule' })).toBeNull();
      expect(panel()).not.toBeNull();
      expect(root).toHaveAttribute('data-fullscreen', 'true');

      await user.keyboard('{Escape}');
      expect(panel()).toBeNull();
      expect(root).toHaveAttribute('data-fullscreen', 'true');
      // focus was inside the panel: it stays in the full-screen region rather than falling to the body
      expect(root).toHaveFocus();

      await user.keyboard('{Escape}');
      expect(root).toHaveAttribute('data-fullscreen', 'false');

      await user.keyboard('{Escape}');
      expect(seen).toEqual([true, true, false]);
    } finally {
      window.removeEventListener('keydown', spy);
    }
  });

  it('25.548 a prevented Escape (the Dialog path) is left alone: the panel and full screen stay', async () => {
    const user = userEvent.setup();
    const { root, header } = await renderBuilder();
    await enterFullScreen(user, header);
    await user.click(await screen.findByTestId('state-node-doing'));
    expect(panel()).not.toBeNull();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    event.preventDefault();
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(panel()).not.toBeNull();
    expect(root).toHaveAttribute('data-fullscreen', 'true');
  });

  it('25.548 a Popover (Add transition) closes alone on Escape: the panel and full screen stay', async () => {
    const user = userEvent.setup();
    const { root, header } = await renderBuilder();
    await enterFullScreen(user, header);
    await user.click(await screen.findByTestId('state-node-doing'));
    await user.click(within(toolbar()).getByRole('button', { name: 'Add transition' }));
    expect(screen.getByRole('dialog', { name: 'Add transition' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Add transition' })).toBeNull();
    expect(panel()).not.toBeNull();
    expect(root).toHaveAttribute('data-fullscreen', 'true');
  });

  it('25.548 control: with nothing open, one Escape exits full screen; any other key leaves it on', async () => {
    const user = userEvent.setup();
    const { root, header } = await renderBuilder();
    await enterFullScreen(user, header);
    expect(panel()).toBeNull();
    await user.keyboard('{Enter}');
    expect(root).toHaveAttribute('data-fullscreen', 'true');
    await user.keyboard('{Escape}');
    expect(root).toHaveAttribute('data-fullscreen', 'false');
  });
});

describe('25.549 the floating panel opens on a selection and on the Issues badge, and × closes it', () => {
  it('25.549 desktop: a state opens the Selection tab with ITS inspector, a transition shows its heading, the badge opens Issues, × closes', async () => {
    const user = userEvent.setup();
    const { header } = await renderBuilder();
    await enterFullScreen(user, header);
    expect(panel()).toBeNull(); // the template draft's selection is `none`

    await user.click(await screen.findByTestId('state-node-doing'));
    const region = panel()!;
    expect(region).not.toBeNull();
    const tabs = within(region).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Selection', 'States & transitions', 'System rules', 'Issues']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    expect(within(region).getByRole('textbox', { name: 'State name' })).toHaveValue('Doing');

    // A transition, selected from its row in the panel's own list: the Selection tab then shows THAT transition.
    await user.click(within(region).getByRole('tab', { name: 'States & transitions' }));
    const rows = within(region).getAllByRole('button').filter((button) => button.hasAttribute('aria-expanded'));
    await user.click(rows[kanban.def.states.length + 1]!);
    await user.click(within(region).getByRole('tab', { name: 'Selection' }));
    const second = kanban.def.transitions[1]!;
    const nameOf = (id: string) => kanban.def.states.find((state) => state.id === id)!.name;
    expect(within(region).getByRole('heading', { name: `From ${nameOf(second.from)} to ${nameOf(second.to)}` })).toBeInTheDocument();
    expect(within(region).queryByRole('textbox', { name: 'State name' })).toBeNull();

    await user.click(within(region).getByRole('button', { name: 'Close panel' }));
    expect(panel()).toBeNull();

    await user.click(within(toolbar()).getByRole('button', { name: /^Issues \d+$/ }));
    const reopened = panel()!;
    expect(within(reopened).getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
    expect(within(reopened).getByRole('tab', { name: 'Selection' })).toHaveAttribute('aria-selected', 'false');
    expect(reopened.querySelector('.issues-panel')).not.toBeNull();
  });

  it('25.549 a row picked in the panel\'s own States & transitions tab opens in place there (the tab stays); a canvas pick after × reopens on Selection', async () => {
    const user = userEvent.setup();
    const { header } = await renderBuilder();
    await enterFullScreen(user, header);
    await user.click(await screen.findByTestId('state-node-doing'));
    const region = panel()!;
    await user.click(within(region).getByRole('tab', { name: 'States & transitions' }));
    const rows = within(region).getAllByRole('button').filter((button) => button.hasAttribute('aria-expanded'));
    await user.click(rows[kanban.def.states.length]!); // the first transition: a NEW selection, made from the list
    expect(within(region).getByRole('tab', { name: 'States & transitions' })).toHaveAttribute('aria-selected', 'true');
    expect(rows[kanban.def.states.length]).toHaveAttribute('aria-expanded', 'true');
    // control: the lists tab is kept only while the panel is OPEN on it. Closed on it, a canvas pick reopens on Selection.
    await user.click(within(region).getByRole('button', { name: 'Close panel' }));
    await user.click(await screen.findByTestId('state-node-done'));
    expect(within(panel()!).getByRole('tab', { name: 'Selection' })).toHaveAttribute('aria-selected', 'true');
    expect(within(panel()!).getByRole('textbox', { name: 'State name' })).toHaveValue('Done');
  });

  it('25.549 with nothing selected the Selection tab says so', async () => {
    const user = userEvent.setup();
    const { header } = await renderBuilder();
    await enterFullScreen(user, header);
    await user.click(within(toolbar()).getByRole('button', { name: /^Issues \d+$/ }));
    await user.click(within(panel()!).getByRole('tab', { name: 'Selection' }));
    expect(within(panel()!).getByText('Select a state or a transition')).toBeInTheDocument();
  });

  it('25.549 phone (PHONE_BOARD_QUERY): the same canvas click opens the panel; the drawer stays shut', async () => {
    stubMatchMedia((query) => query === PHONE_BOARD_QUERY || query === STACKED_QUERY);
    const user = userEvent.setup();
    const { header, container } = await renderBuilder();
    await enterFullScreen(user, header);
    await user.click(await screen.findByTestId('state-node-doing'));
    expect(within(panel()!).getByRole('textbox', { name: 'State name' })).toHaveValue('Doing');
    expect(container.querySelector('aside.workflow-builder-screen__left')).toHaveAttribute('data-open', 'false');
    expect(container.querySelector('.workflow-builder-screen__scrim')).toBeNull();
  });

  it('25.549 Exit with the panel open takes the panel with it, and re-entering does not bring it back', async () => {
    const user = userEvent.setup();
    const { header } = await renderBuilder();
    await enterFullScreen(user, header);
    await user.click(await screen.findByTestId('state-node-doing'));
    expect(panel()).not.toBeNull();
    await user.click(within(toolbar()).getByRole('button', { name: 'Exit full screen' }));
    expect(panel()).toBeNull();
    await enterFullScreen(user, header);
    expect(panel()).toBeNull();
  });

  it('25.549 control: outside full screen the same click opens no Workflow panel, and on the desktop the drawer stays data-open="false" (21.176)', async () => {
    const user = userEvent.setup();
    const { container } = await renderBuilder();
    await user.click(await screen.findByTestId('state-node-doing'));
    expect(panel()).toBeNull();
    expect(container.querySelector('aside.workflow-builder-screen__left')).toHaveAttribute('data-open', 'false');
  });
});

describe('25.550 the panel is a region, not a dialog, and the canvas stays usable', () => {
  it('25.550 an ASIDE region with no aria-modal; no Workflow panel dialog; nothing inert or aria-hidden over the Canvas', async () => {
    const user = userEvent.setup();
    const { header } = await renderBuilder();
    await enterFullScreen(user, header);
    await user.click(await screen.findByTestId('state-node-doing'));
    const region = screen.getByRole('region', { name: 'Workflow panel' });
    expect(region.tagName).toBe('ASIDE');
    expect(region).not.toHaveAttribute('aria-modal');
    expect(screen.queryByRole('dialog', { name: 'Workflow panel' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Canvas' }).closest('[inert], [aria-hidden="true"]')).toBeNull();
  });
});
