import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommentsThread, type CommentActions, type TicketComment } from '../../src/views/comments-thread.js';

/**
 * Cases 26.110–26.114 — what the thread DRAWS for an edited, a deleted and a live comment, and what its
 * controls hand back to the host. The write itself (26.115) is the sheet's and is proven in
 * `ticket-sheet-comments.test.tsx`; the gate decides what commits (T2), so these cases read facts only.
 */
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const base = { recordedAt: '2026-10-02T08:00:00.000Z', files: [] };
const MINE: TicketComment = { ...base, commentId: '01MINE', authorId: 'u_me', body: doc('mine'), editedAt: '2026-10-02T09:30:00.000Z', deletedAt: null };
const THEIRS: TicketComment = { ...base, commentId: '01THEIRS', authorId: 'u_them', body: doc('theirs'), editedAt: null, deletedAt: null };
const GONE: TicketComment = { ...base, commentId: '01GONE', authorId: 'u_them', body: null, editedAt: null, deletedAt: '2026-10-02T10:00:00.000Z' };
const nameOf = (id: string) => (id === 'u_me' ? 'Asha Marak' : 'Ravi Sangma');

function actions(over: Partial<CommentActions> = {}): CommentActions {
  return {
    currentUserId: 'u_me',
    canModerate: false,
    renderEditor: (_c, done) => (
      <button type="button" onClick={done}>
        fake editor
      </button>
    ),
    deleteComment: vi.fn(async () => null),
    ...over,
  };
}
const item = (id: string) => screen.getByTestId(`comment-${id}`);

describe('26.110–26.114 comment actions', () => {
  it('26.110 "edited" only on an edited comment, with its time on press', () => {
    render(<CommentsThread comments={[MINE, THEIRS]} nameOf={nameOf} actions={actions()} />);
    expect(within(item('01THEIRS')).queryByText('edited')).toBeNull(); // control
    fireEvent.click(within(item('01MINE')).getByRole('button', { name: /edited/ }));
    expect(within(item('01MINE')).getByText(/^Edited /)).toBeTruthy();
  });

  it('26.111 a deleted comment is a placeholder with author and time, and no actions', () => {
    render(<CommentsThread comments={[GONE, THEIRS]} nameOf={nameOf} actions={actions({ canModerate: true })} />);
    expect(within(item('01GONE')).getByText('Comment deleted')).toBeTruthy();
    expect(within(item('01GONE')).getByText('Ravi Sangma')).toBeTruthy();
    expect(within(item('01GONE')).queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(within(item('01THEIRS')).getByText('theirs')).toBeTruthy(); // control
  });

  it('26.112 author gets Edit+Delete; a moderator Delete only; anyone else nothing', () => {
    const { rerender } = render(<CommentsThread comments={[MINE, THEIRS]} nameOf={nameOf} actions={actions()} />);
    fireEvent.click(within(item('01MINE')).getByRole('button', { name: "More actions for Asha Marak's comment" }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Edit', 'Delete']);
    expect(within(item('01THEIRS')).queryByRole('button', { name: /More actions/ })).toBeNull();
    rerender(<CommentsThread comments={[MINE, THEIRS]} nameOf={nameOf} actions={actions({ canModerate: true })} />);
    fireEvent.click(within(item('01THEIRS')).getByRole('button', { name: "More actions for Ravi Sangma's comment" }));
    expect(within(item('01THEIRS')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Delete']);
  });

  it('26.113 Edit opens the host editor in place; Cancel closes it', () => {
    const renderEditor = vi.fn((_c: TicketComment, done: () => void) => (
      <button type="button" onClick={done}>
        fake editor
      </button>
    ));
    render(<CommentsThread comments={[MINE]} nameOf={nameOf} actions={actions({ renderEditor })} />);
    fireEvent.click(within(item('01MINE')).getByRole('button', { name: /More actions/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(renderEditor).toHaveBeenCalledWith(MINE, expect.any(Function));
    expect(within(item('01MINE')).queryByText('mine')).toBeNull();
    fireEvent.click(within(item('01MINE')).getByRole('button', { name: 'Cancel' }));
    expect(within(item('01MINE')).getByText('mine')).toBeTruthy();
  });

  it('26.113 Escape closes the open editor too', () => {
    render(<CommentsThread comments={[MINE]} nameOf={nameOf} actions={actions()} />);
    fireEvent.click(within(item('01MINE')).getByRole('button', { name: /More actions/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'fake editor' }), { key: 'Escape' });
    expect(within(item('01MINE')).getByText('mine')).toBeTruthy();
  });

  it('26.112 Escape closes the menu and returns focus to the "…" button', () => {
    render(<CommentsThread comments={[MINE]} nameOf={nameOf} actions={actions()} />);
    const more = within(item('01MINE')).getByRole('button', { name: /More actions/ });
    fireEvent.click(more);
    fireEvent.keyDown(screen.getAllByRole('menuitem')[0]!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(more);
  });

  it('26.114 Delete asks once; Cancel sends nothing; a refusal is shown and the comment stays', async () => {
    const deleteComment = vi.fn(async () => 'Only the person who wrote a comment, or a workspace owner or admin, can delete it.');
    render(<CommentsThread comments={[MINE]} nameOf={nameOf} actions={actions({ deleteComment })} />);
    const open = () => {
      fireEvent.click(within(item('01MINE')).getByRole('button', { name: /More actions/ }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    };
    open();
    expect(screen.getByText('Delete this comment? It is removed for everyone.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteComment).not.toHaveBeenCalled(); // control
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the person who wrote a comment');
    expect(within(item('01MINE')).getByText('mine')).toBeTruthy();
    expect(deleteComment).toHaveBeenCalledTimes(1);
  });
});
