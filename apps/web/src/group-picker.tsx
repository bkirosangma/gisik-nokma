'use client';

import { useEffect, useId, useState, type KeyboardEvent } from 'react';
import type { GroupRow } from '@gisik-nokma/domain';
import type { GroupChoice } from './group-picker-seeds.js';

export type { GroupChoice } from './group-picker-seeds.js';

/**
 * The four-level group picker (prefixes and groups plan Task 9, R6 / FD3 / FD11).
 *
 * One type-ahead per level. Each lists only the children of the pick above it
 * (R4: the same name under another branch is another group), and a level opens
 * only once the one above it has a value. Typing a name that matches exactly
 * (ignoring case) selects the existing group; typing one that matches nothing
 * makes a PENDING new group, shown with a "New" tag and created by `groupSeeds`
 * in the same batch as the project's own claim.
 *
 * **Hand-rolled, not `@react-aria/combobox`.** The react-aria packages are
 * dependencies of `packages/ui` only (pnpm is strict), and the ui package exports
 * a single-value `Select`, not a combobox that can commit a typed value. Adding
 * them to `apps/web` would change the lockfile every parallel lane shares, so the
 * WAI-ARIA combobox pattern is written directly: an `<input role="combobox">`
 * with `aria-activedescendant` over a `role="listbox"`, Up/Down/Enter/Escape, and
 * a "Create “<text>”" option LAST when nothing matches exactly.
 *
 * **The value is one chain.** `groupId` is the deepest EXISTING pick; the levels
 * above it are found by walking `parentId`, and `pendingNames` fill the levels
 * after it. A level under a pending group has nothing existing to list, so it can
 * only take another pending name.
 *
 * **Someone created it first (22.165).** When a `groups` refresh now contains a
 * group a pending name was about to create — the door answered `group.name-taken`
 * and the form re-read the list — the picker ADOPTS the existing group in place
 * of the pending one and says so, rather than refusing or doubling it.
 */

/** A level's value: an existing group, or a name still to be created. */
type LevelValue = { kind: 'existing'; row: GroupRow } | { kind: 'pending'; name: string };

const LEVELS = [1, 2, 3, 4] as const;
const sameName = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The values of levels 1…n for a choice, top-down. */
export function levelsOf(groups: GroupRow[], value: GroupChoice): LevelValue[] {
  const chain: LevelValue[] = [];
  for (let at = value.groupId; at !== null; ) {
    const row = groups.find((candidate) => candidate.id === at);
    if (row === undefined) break;
    chain.unshift({ kind: 'existing', row });
    at = row.parentId;
  }
  return [...chain, ...value.pendingNames.map((name): LevelValue => ({ kind: 'pending', name }))];
}

/** The choice for a chain of level values (existing ones first, then pending). */
export function choiceOf(levels: LevelValue[]): GroupChoice {
  let groupId: string | null = null;
  const pendingNames: string[] = [];
  for (const entry of levels) {
    if (entry.kind === 'existing') groupId = entry.row.id;
    else pendingNames.push(entry.name);
  }
  return { groupId, pendingNames };
}

/**
 * Swaps each leading pending name that now matches an existing child (ignoring
 * case) for that group. `adopted` names what it swapped, top-down; empty when
 * nothing changed. Pure, so a form can use it on a re-read without a picker.
 */
export function reconcileChoice(
  groups: GroupRow[],
  value: GroupChoice,
): { choice: GroupChoice; adopted: string[] } {
  let groupId = value.groupId;
  let rest = value.pendingNames;
  const adopted: string[] = [];
  while (rest.length > 0) {
    const match = groups.find((row) => row.parentId === groupId && sameName(row.name, rest[0]!));
    if (match === undefined) break;
    adopted.push(match.name);
    groupId = match.id;
    rest = rest.slice(1);
  }
  return { choice: adopted.length === 0 ? value : { groupId, pendingNames: rest }, adopted };
}

export function GroupPicker(props: {
  groups: GroupRow[];
  value: GroupChoice;
  onChange: (choice: GroupChoice) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const { groups, value, onChange, disabled = false, idPrefix } = props;
  const [notice, setNotice] = useState<string | null>(null);
  const levels = levelsOf(groups, value);

  useEffect(() => {
    const { choice, adopted } = reconcileChoice(groups, value);
    if (adopted.length === 0) return;
    setNotice(`Using the existing ${adopted.join(' › ')}.`);
    onChange(choice);
    // Driven by the data only: `onChange` is the caller's setter and may change identity every render.
  }, [groups, value]);

  /** Level `n` (1-based) takes `next`; everything below it is dropped. */
  const commit = (n: number, next: LevelValue | null) => {
    setNotice(null);
    onChange(choiceOf(next === null ? levels.slice(0, n - 1) : [...levels.slice(0, n - 1), next]));
  };

  return (
    <div className="gn-group-picker" role="group" aria-label="Group">
      {LEVELS.map((n) => {
        const above = n === 1 ? undefined : levels[n - 2];
        const enabled = !disabled && (n === 1 || above !== undefined);
        // Existing children of the pick above (the root for level 1); none under a pending group.
        const options =
          n === 1
            ? groups.filter((row) => row.parentId === null)
            : above?.kind === 'existing'
              ? groups.filter((row) => row.parentId === above.row.id)
              : [];
        return (
          <LevelCombobox
            key={n}
            id={`${idPrefix}-group-level-${n}`}
            level={n}
            options={options}
            current={levels[n - 1] ?? null}
            disabled={!enabled}
            onCommit={(next) => commit(n, next)}
          />
        );
      })}
      {notice !== null && (
        <p className="gn-group-picker__notice" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

function LevelCombobox(props: {
  id: string;
  level: number;
  options: GroupRow[];
  current: LevelValue | null;
  disabled: boolean;
  onCommit: (next: LevelValue | null) => void;
}) {
  const { id, level, options, current, disabled, onCommit } = props;
  const listId = useId();
  const tagId = `${id}-new`;
  /** What the person has typed since they last committed; `null` = showing the committed value. */
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const committedName = current === null ? '' : current.kind === 'existing' ? current.row.name : current.name;
  const committedKey = current === null ? '' : current.kind === 'existing' ? `e:${current.row.id}` : `p:${current.name}`;
  // A commit (or an upstream clear) ends any edit in progress.
  useEffect(() => {
    setDraft(null);
    setActive(-1);
  }, [committedKey]);

  const text = draft ?? committedName;
  const needle = (draft ?? '').trim().toLowerCase();
  const matches = needle === '' ? options : options.filter((row) => row.name.toLowerCase().includes(needle));
  const exact = options.find((row) => sameName(row.name, draft ?? ''));
  const createText = (draft ?? '').trim();
  const showCreate = createText !== '' && exact === undefined;
  const rows: Array<{ key: string; label: string; pick: () => LevelValue }> = [
    ...matches.map((row) => ({ key: row.id, label: row.name, pick: (): LevelValue => ({ kind: 'existing', row }) })),
    ...(showCreate
      ? [{ key: 'create', label: `Create “${createText}”`, pick: (): LevelValue => ({ kind: 'pending', name: createText }) }]
      : []),
  ];

  const finish = (value: LevelValue | null) => {
    setOpen(false);
    setActive(-1);
    setDraft(null);
    if (value !== null) onCommit(value);
  };

  /** Blur / Enter without a highlighted option: an exact name selects it; any other text is a new group. */
  const resolve = () => {
    if (draft === null) return finish(null);
    if (draft.trim() === '') return finish(null); // the empty box already cleared the level
    if (exact !== undefined) return finish({ kind: 'existing', row: exact });
    return finish({ kind: 'pending', name: draft.trim() });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(rows.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      // Never let Enter submit the surrounding form from inside a picker.
      event.preventDefault();
      const highlighted = open ? rows[active] : undefined;
      if (highlighted !== undefined) finish(highlighted.pick());
      else resolve();
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      finish(null);
    }
  };

  return (
    <div className="gn-group-picker__level">
      <label className="gn-group-picker__label" htmlFor={id}>
        Level {level} group
      </label>
      <div className="gn-group-picker__control">
        <input
          id={id}
          className="gn-field__input gn-group-picker__input"
          role="combobox"
          type="text"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open && rows.length > 0}
          aria-controls={listId}
          aria-activedescendant={open && active >= 0 && rows[active] ? `${listId}-${active}` : undefined}
          aria-describedby={current?.kind === 'pending' && draft === null ? tagId : undefined}
          disabled={disabled}
          value={text}
          placeholder={disabled ? '' : 'Type to search or add'}
          onFocus={() => setOpen(true)}
          onBlur={resolve}
          onChange={(event) => {
            const next = event.target.value;
            setDraft(next);
            setOpen(true);
            setActive(-1);
            // Emptying the box clears this level and, with it, every level below.
            if (next.trim() === '' && current !== null) onCommit(null);
          }}
          onKeyDown={onKeyDown}
        />
        {current?.kind === 'pending' && draft === null && (
          <span id={tagId} className="gn-group-picker__tag">
            New
          </span>
        )}
        <ul
          id={listId}
          className="gn-group-picker__list"
          role="listbox"
          aria-label={`Level ${level} group options`}
          hidden={!(open && rows.length > 0)}
        >
          {rows.map((row, index) => (
            <li
              key={row.key}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className={`gn-group-picker__option${index === active ? ' gn-group-picker__option--active' : ''}${row.key === 'create' ? ' gn-group-picker__option--create' : ''}`}
              // Keep focus in the input, so the blur that resolves a typed name does not fire first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => finish(row.pick())}
            >
              {row.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
