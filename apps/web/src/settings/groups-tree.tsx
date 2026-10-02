'use client';

import { useId, useRef, useState, type DragEvent, type KeyboardEvent, type ReactElement } from 'react';
import {
  newUlid,
  rankBetween,
  type GroupCreatedPayload,
  type GroupRenamedPayload,
  type GroupReorderedPayload,
  type GroupRow,
} from '@gisik-nokma/domain';
import { Button, Dialog, PlusIcon } from '@gisik-nokma/ui';

/** One thing the tree asks the page to file. The page turns it into a claim; the tree knows no envelope. */
export type GroupAction =
  | { type: 'group.created'; id: string; payload: GroupCreatedPayload }
  | { type: 'group.renamed'; id: string; payload: GroupRenamedPayload }
  | { type: 'group.reordered'; id: string; payload: GroupReorderedPayload }
  | { type: 'group.deleted'; id: string; payload: Record<string, never> };

/** `message` is the whole sentence to show, already worded (the server's own reason, or the transport's). */
export type GroupActionResult = { ok: true } | { ok: false; message: string };

export type GroupsTreeProps = {
  workspaceId: string;
  /** Workspace owner or admin: the door refuses every group event from anyone else, so the controls are not drawn. */
  canEdit: boolean;
  groups: readonly GroupRow[];
  onSubmit: (action: GroupAction) => Promise<GroupActionResult>;
};

export const GROUPS_EMPTY_SENTENCE = 'No groups yet. Add the first one to sort your projects.';
export const GROUPS_EMPTY_READ_ONLY = 'No groups yet.';

type TreeNode = { group: GroupRow; children: TreeNode[] };

/** `a` before `b` by rank; the id breaks a tie so the order is a function of the set, not of the wire. */
function byRank(a: GroupRow, b: GroupRow): number {
  if (a.rank !== b.rank) return a.rank < b.rank ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The flat rows folded into a forest, every group kept (the grouped view on the workspace home prunes empty
 * branches; THIS screen exists to manage them). A parent the list does not name makes its child a root rather
 * than dropping the branch.
 */
function buildForest(groups: readonly GroupRow[]): TreeNode[] {
  const known = new Set(groups.map((group) => group.id));
  const byParent = new Map<string | null, GroupRow[]>();
  for (const group of groups) {
    const parent = group.parentId !== null && known.has(group.parentId) ? group.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), group]);
  }
  const build = (parent: string | null): TreeNode[] =>
    [...(byParent.get(parent) ?? [])].sort(byRank).map((group) => ({ group, children: build(group.id) }));
  return build(null);
}

/** The direct children of `parent` (null = the roots), in rank order. */
function siblingsOf(groups: readonly GroupRow[], parent: string | null): GroupRow[] {
  return groups.filter((group) => group.parentId === parent).sort(byRank);
}

/** A rank that puts a new sibling after `siblings`' last one. */
function rankAfterLast(siblings: readonly GroupRow[]): string {
  return rankBetween(siblings[siblings.length - 1]?.rank ?? null, null);
}

/**
 * The inline name field a new group and a rename both use. Enter commits the trimmed name, Escape cancels; Save
 * and Cancel are there too because a phone has no Escape key. A blank name commits nothing.
 */
function NameField({
  label,
  initial,
  onCommit,
  onCancel,
}: {
  label: string;
  initial: string;
  onCommit: (name: string) => void;
  onCancel: () => void;
}): ReactElement {
  const [value, setValue] = useState(initial);
  const commit = (): void => {
    const name = value.trim();
    if (name !== '') onCommit(name);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <span className="gn-groups__field">
      <input
        className="gn-field__input gn-groups__input"
        type="text"
        aria-label={label}
        value={value}
        autoFocus
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <Button onClick={commit} disabled={value.trim() === ''}>
        Save
      </Button>
      <Button onClick={onCancel}>Cancel</Button>
    </span>
  );
}

/**
 * Settings → Groups (prefixes and groups plan Task 11, cases 22.200–22.215): the workspace's project-group tree.
 *
 * A real tree for assistive technology (`role="tree"` > `treeitem` with `aria-level`, a nested `role="group"` per
 * parent) and, in CSS, one column per level: a node is a row of its box and its children column, every box a fixed
 * width (so a level shares one x), with connectors from the parent to the children column's spine and from the spine
 * to each child. The level strip is the level's colour (`--gn-level-N`, one per level,
 * never per group) and is also NAMED (`Level N group: <name>`) so colour is never the only signal. At 40rem or
 * less the same markup is an indented list.
 *
 * It decides nothing the server decides: a sibling-name clash or an in-use delete is the door's, and the sentence
 * the door answers with is shown as given. It only does not OFFER what is certain to be refused — Delete is drawn
 * on a group with no projects and no children, a ⊕ is not drawn on level 4 (the tree is four deep), and a
 * non-admin gets none of the controls.
 *
 * Reordering is native HTML5 drag within ONE sibling list (the board's drag is built for its columns and cards;
 * a vertical list of siblings needs none of that), and Alt+↑/↓ on the name is the non-pointer path. The new rank
 * is `rankBetween` of the two siblings the box lands between. There is no touch drag: a phone reorders through
 * the keyboard path only.
 */
export function GroupsTree({ workspaceId, canEdit, groups, onSubmit }: GroupsTreeProps): ReactElement {
  const base = useId();
  const [adding, setAdding] = useState<string | 'root' | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<GroupRow | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const dragging = useRef<string | null>(null);
  const inFlight = useRef(false);

  /** Files one action; true when it committed. A second action waits for the first to answer. */
  const submit = async (action: GroupAction): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setRefusal(null);
    try {
      const result = await onSubmit(action);
      if (!result.ok) setRefusal(result.message);
      return result.ok;
    } catch (cause) {
      setRefusal(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      inFlight.current = false;
    }
  };

  const create = async (parent: GroupRow | null, name: string): Promise<void> => {
    const level = parent === null ? 1 : parent.level + 1;
    const payload: GroupCreatedPayload = {
      parentId: parent?.id ?? null,
      level,
      name,
      rank: rankAfterLast(siblingsOf(groups, parent?.id ?? null)),
    };
    if (await submit({ type: 'group.created', id: newUlid(), payload })) setAdding(null);
  };

  const rename = async (group: GroupRow, name: string): Promise<void> => {
    if (name === group.name) {
      setRenaming(null);
      return;
    }
    if (await submit({ type: 'group.renamed', id: group.id, payload: { name } })) setRenaming(null);
  };

  /** Move `group` so it sits at index `at` of its siblings with itself removed. */
  const placeAt = async (group: GroupRow, at: number): Promise<void> => {
    const others = siblingsOf(groups, group.parentId).filter((sibling) => sibling.id !== group.id);
    let rank: string;
    try {
      rank = rankBetween(others[at - 1]?.rank ?? null, others[at]?.rank ?? null);
    } catch {
      setRefusal('These groups cannot be reordered here: two of them share a place in the order.');
      return;
    }
    await submit({ type: 'group.reordered', id: group.id, payload: { rank } });
  };

  const moveBy = (group: GroupRow, step: -1 | 1): void => {
    const siblings = siblingsOf(groups, group.parentId);
    const at = siblings.findIndex((sibling) => sibling.id === group.id);
    const to = at + step;
    if (at < 0 || to < 0 || to >= siblings.length) return;
    void placeAt(group, to);
  };

  const dropOn = (target: GroupRow): void => {
    const draggedId = dragging.current;
    dragging.current = null;
    const dragged = groups.find((group) => group.id === draggedId);
    if (dragged === undefined || dragged.id === target.id || dragged.parentId !== target.parentId) return;
    const siblings = siblingsOf(groups, dragged.parentId);
    const from = siblings.findIndex((sibling) => sibling.id === dragged.id);
    const over = siblings.findIndex((sibling) => sibling.id === target.id);
    const others = siblings.filter((sibling) => sibling.id !== dragged.id);
    const targetAmongOthers = others.findIndex((sibling) => sibling.id === target.id);
    // Moving down lands AFTER the box it is dropped on; moving up lands BEFORE it.
    void placeAt(dragged, from < over ? targetAmongOthers + 1 : targetAmongOthers);
  };

  const renderDraft = (parent: GroupRow | null): ReactElement => (
    <li role="none" className="gn-groups__draft">
      <NameField
        label="Group name"
        initial=""
        onCommit={(name) => void create(parent, name)}
        onCancel={() => setAdding(null)}
      />
    </li>
  );

  const renderNode = (node: TreeNode): ReactElement => {
    const { group } = node;
    const nameId = `${base}-${group.id}`;
    const deletable = group.projectCount === 0 && group.childCount === 0;
    const addingHere = adding === group.id;
    const onNameKey = (event: KeyboardEvent<HTMLButtonElement>): void => {
      if (!event.altKey) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveBy(group, event.key === 'ArrowUp' ? -1 : 1);
      }
    };
    return (
      <li
        key={group.id}
        role="treeitem"
        aria-level={group.level}
        // While the name is a text field there is no element carrying `nameId`, so the item is labelled by the
        // group's name directly: a screen reader never loses what the item is.
        aria-labelledby={renaming === group.id ? undefined : nameId}
        aria-label={renaming === group.id ? group.name : undefined}
        aria-selected={false}
        className="gn-groups__node"
        data-group-id={group.id}
      >
        <div
          className="gn-groups__box"
          draggable={canEdit && renaming !== group.id}
          onDragStart={(event: DragEvent<HTMLDivElement>) => {
            dragging.current = group.id;
            event.dataTransfer?.setData('text/plain', group.id);
          }}
          onDragOver={(event: DragEvent<HTMLDivElement>) => {
            // Only a sibling is a valid place: the default (no drop) stays for every other box.
            const dragged = groups.find((candidate) => candidate.id === dragging.current);
            if (canEdit && dragged !== undefined && dragged.parentId === group.parentId) event.preventDefault();
          }}
          onDrop={(event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            if (canEdit) dropOn(group);
          }}
          onDragEnd={() => {
            dragging.current = null;
          }}
        >
          <span
            role="img"
            className="gn-groups__strip"
            data-level={group.level}
            aria-label={`Level ${group.level} group: ${group.name}`}
          />
          {renaming === group.id ? (
            <NameField
              label={`Rename ${group.name}`}
              initial={group.name}
              onCommit={(name) => void rename(group, name)}
              onCancel={() => setRenaming(null)}
            />
          ) : canEdit ? (
            <button
              type="button"
              id={nameId}
              className="gn-groups__name gn-groups__name--button"
              onClick={() => {
                setRefusal(null);
                setRenaming(group.id);
              }}
              onKeyDown={onNameKey}
            >
              {group.name}
            </button>
          ) : (
            <span id={nameId} className="gn-groups__name">
              {group.name}
            </span>
          )}
          {canEdit && deletable ? (
            <Button
              variant="danger-quiet"
              className="gn-groups__delete"
              aria-label={`Delete ${group.name}`}
              onClick={() => setConfirming(group)}
            >
              Delete
            </Button>
          ) : null}
          {canEdit && group.level < 4 ? (
            <button
              type="button"
              className="gn-groups__add"
              aria-label={`Add a group under ${group.name}`}
              onClick={() => {
                setRefusal(null);
                setAdding(group.id);
              }}
            >
              <PlusIcon />
            </button>
          ) : null}
        </div>
        {node.children.length > 0 || addingHere ? (
          <ul role="group" className="gn-groups__children">
            {node.children.map(renderNode)}
            {addingHere ? renderDraft(group) : null}
          </ul>
        ) : null}
      </li>
    );
  };

  const forest = buildForest(groups);
  const empty = groups.length === 0;
  return (
    <div className="gn-groups" data-workspace-id={workspaceId}>
      {canEdit ? (
        <div className="gn-groups__toolbar">
          <Button
            variant="primary"
            onClick={() => {
              setRefusal(null);
              setAdding('root');
            }}
          >
            <PlusIcon />
            Add group
          </Button>
        </div>
      ) : null}
      {refusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {refusal}
        </p>
      ) : null}
      {empty ? (
        <p className="gn-groups__empty">{canEdit ? GROUPS_EMPTY_SENTENCE : GROUPS_EMPTY_READ_ONLY}</p>
      ) : null}
      {!empty || adding === 'root' ? (
        <ul role="tree" aria-label="Project groups" className="gn-groups__tree">
          {forest.map(renderNode)}
          {adding === 'root' ? renderDraft(null) : null}
        </ul>
      ) : null}
      <Dialog
        open={confirming !== null}
        title={`Delete the group “${confirming?.name ?? ''}”?`}
        onClose={() => setConfirming(null)}
        describedBy={`${base}-delete-body`}
      >
        <div className="gn-groups__confirm">
          <p id={`${base}-delete-body`} className="gn-groups__confirm-note">
            This group has no projects and no sub-groups, so nothing is filed under it. Deleting it cannot be undone.
          </p>
          <div className="gn-groups__confirm-actions">
            <Button onClick={() => setConfirming(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                const target = confirming;
                setConfirming(null);
                if (target !== null) void submit({ type: 'group.deleted', id: target.id, payload: {} });
              }}
            >
              Delete group
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
