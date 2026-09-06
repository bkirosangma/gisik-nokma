import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EVIDENCE_DRIVE_REFERENCE_REASON, type WorkflowDef } from '@gisik-nokma/domain';
import { transitionRequiresEvidence } from '../src/attachments/require-evidence.js';
import { EvidencePicker } from '../src/components/EvidencePicker.js';

const DEF: WorkflowDef = {
  id: 'wf_errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
    { id: 'abandoned', name: 'Abandoned', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [{ kind: 'require-evidence' }] },
    { from: '*', to: 'abandoned', rules: [{ kind: 'require-comment' }] },
  ],
};

const ATTACHMENTS = [
  { attachmentId: '01J9GATA000000000000000000', filename: 'receipt.pdf', mime: 'application/pdf', size: 100 },
  { attachmentId: '01J9GATB000000000000000000', filename: 'shelf.png', mime: 'image/png', size: 200 },
];

describe('transitionRequiresEvidence', () => {
  /**
   * 9.107 — `transitionRequiresEvidence` reads the exact `(from, to)` transition's `require-evidence` rule when the workflow definition states one.
   */
  it('reads the exact transition', () => {
    expect(transitionRequiresEvidence(DEF, 'doing', 'done')).toBe(true);
    expect(transitionRequiresEvidence(DEF, 'todo', 'doing')).toBe(false);
  });

  /**
   * 9.108 — a from-any (`*`) rule matches every origin state, and an unrecognised `(from, to)` pair answers `false` rather than throwing.
   */
  it('matches from-any transitions and unknown pairs answer false', () => {
    expect(transitionRequiresEvidence(DEF, 'doing', 'abandoned')).toBe(false); // rule there is require-comment
    expect(transitionRequiresEvidence(DEF, 'done', 'todo')).toBe(false); // no such transition
  });

  /**
   * 9.109 — a from-any transition DOES carry a `require-evidence` rule when the definition states one there — the wildcard path is live and exercised.
   */
  it('a from-any transition DOES carry a require-evidence rule when the def says so — the wildcard path is live, not merely declined', () => {
    // Distinct from the above: that def's only wildcard edge carries
    // require-comment, so a mutation that dropped the wildcard branch
    // entirely would still pass it (both answers stay false either way).
    // This def's wildcard edge carries require-evidence and no exact edge
    // shadows it, so only a lookup that actually reads through `?? wildcard`
    // can answer true here.
    const def: WorkflowDef = {
      ...DEF,
      states: [...DEF.states, { id: 'archived', name: 'Archived', category: 'terminal' }],
      transitions: [...DEF.transitions, { from: '*', to: 'archived', rules: [{ kind: 'require-evidence' }] }],
    };
    expect(transitionRequiresEvidence(def, 'todo', 'archived')).toBe(true);
    expect(transitionRequiresEvidence(def, 'doing', 'archived')).toBe(true);
  });

  /**
   * 9.110 — an exact `(from, to)` rule wins over a from-any rule aimed at the same destination state.
   */
  it('an exact transition wins over a from-any to the same state', () => {
    const def: WorkflowDef = {
      ...DEF,
      transitions: [
        { from: 'doing', to: 'abandoned', rules: [{ kind: 'require-evidence' }] },
        { from: '*', to: 'abandoned', rules: [] },
      ],
    };
    expect(transitionRequiresEvidence(def, 'doing', 'abandoned')).toBe(true);
    expect(transitionRequiresEvidence(def, 'todo', 'abandoned')).toBe(false);
  });
});

describe('EvidencePicker', () => {
  /**
   * 9.111 — `EvidencePicker` lists a ticket's existing (uploaded) attachments as offerable options, and picking one hands its id to the caller.
   */
  it('lists existing attachments and picking one hands over its id', () => {
    const onPick = vi.fn();
    const view = render(
      <EvidencePicker
        attachments={ATTACHMENTS}
        uploadAttachment={vi.fn()}
        onAttachmentAdded={vi.fn()}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );
    const options = view.container.querySelectorAll('.evidence-picker__option');
    expect(options).toHaveLength(2);
    expect(options[0]!.textContent).toContain('receipt.pdf');
    fireEvent.click(options[1]!);
    expect(onPick).toHaveBeenCalledWith(ATTACHMENTS[1]!.attachmentId);
    view.unmount();
  });

  /**
   * 9.112 — uploading fresh evidence emits `attachment.added` FIRST, then picks the freshly-uploaded id — a claim is never picked before it exists.
   */
  it('uploading new evidence emits attachment.added first, then picks the fresh id', async () => {
    const order: string[] = [];
    const uploaded = {
      attachmentId: '01J9GATC000000000000000000',
      url: '/v1/attachments/01J9GATC000000000000000000',
      mime: 'application/pdf',
      filename: 'proof.pdf',
      size: 3,
      sha256: 'c'.repeat(64),
    };
    const uploadAttachment = vi.fn(async () => {
      order.push('upload');
      return uploaded;
    });
    const onAttachmentAdded = vi.fn(async () => {
      order.push('event');
    });
    const onPick = vi.fn(() => {
      order.push('pick');
    });
    const view = render(
      <EvidencePicker
        attachments={[]}
        uploadAttachment={uploadAttachment}
        onAttachmentAdded={onAttachmentAdded}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );
    const input = view.container.querySelector('.evidence-picker__upload input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array(3)], 'proof.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });
    await vi.waitFor(() => {
      expect(onPick).toHaveBeenCalledWith(uploaded.attachmentId);
    });
    expect(order).toEqual(['upload', 'event', 'pick']);
    view.unmount();
  });

  /**
   * 9.113 — a failed upload cancels nothing already picked and picks nothing new — the picker's prior state survives an upload failure untouched.
   */
  it('a failed upload cancels nothing and picks nothing', async () => {
    const onPick = vi.fn();
    const onCancel = vi.fn();
    const view = render(
      <EvidencePicker
        attachments={[]}
        uploadAttachment={vi.fn(async () => {
          throw new Error('refused');
        })}
        onAttachmentAdded={vi.fn()}
        onPick={onPick}
        onCancel={onCancel}
      />,
    );
    const input = view.container.querySelector('.evidence-picker__upload input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })] } });
    await vi.waitFor(() => {
      expect(view.container.textContent).toContain('refused');
    });
    expect(onPick).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    view.unmount();
  });

  /**
   * 9.114 — cancel is an explicit act with its own handler, not a fallthrough of some other control.
   */
  it('cancel is an explicit act', () => {
    const onCancel = vi.fn();
    const view = render(
      <EvidencePicker attachments={[]} uploadAttachment={vi.fn()} onAttachmentAdded={vi.fn()} onPick={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.click(view.container.querySelector('.evidence-picker__cancel') as HTMLButtonElement);
    expect(onCancel).toHaveBeenCalled();
    view.unmount();
  });

  const DRIVE_REFERENCES = [
    {
      attachmentId: '01J9GATD000000000000000000',
      driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
      name: 'receipt.pdf', // same name as an upload on purpose: names prove nothing
      mimeType: 'application/pdf',
      webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
      capturedAt: '2026-08-20T10:00:00.000Z',
    },
  ];

  /**
   * 9.63 — a Drive reference passed on `driveReferences` never appears among the offerable `.evidence-picker__option` buttons, even when its name matches an offerable upload's name exactly, and clicking anything in the unavailable section picks nothing.
   */
  it('planted defect: a Drive reference is never among the offerable options', () => {
    const onPick = vi.fn();
    const view = render(
      <EvidencePicker
        attachments={ATTACHMENTS}
        driveReferences={DRIVE_REFERENCES}
        uploadAttachment={vi.fn()}
        onAttachmentAdded={vi.fn()}
        onPick={onPick}
        onCancel={vi.fn()}
      />,
    );
    // Exactly the uploads are offerable — the reference did not sneak in on a matching name.
    const options = [...view.container.querySelectorAll('.evidence-picker__option')];
    expect(options).toHaveLength(ATTACHMENTS.length);
    for (const option of options) {
      expect(option.textContent).not.toContain('Google Drive');
    }
    // Clicking anything in the unavailable section picks nothing.
    for (const item of view.container.querySelectorAll('.evidence-picker__unavailable-item')) {
      fireEvent.click(item);
    }
    expect(onPick).not.toHaveBeenCalled();
    view.unmount();
  });

  /**
   * 9.64 — the Drive reference's unavailable section shows the server's own `EVIDENCE_DRIVE_REFERENCE_REASON`, asserted against the exported constant rather than a retyped copy.
   */
  it("planted defect: the reference is shown with the server's own reason, word for word", () => {
    const view = render(
      <EvidencePicker
        attachments={[]}
        driveReferences={DRIVE_REFERENCES}
        uploadAttachment={vi.fn()}
        onAttachmentAdded={vi.fn()}
        onPick={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const unavailable = view.container.querySelector('.evidence-picker__unavailable')!;
    expect(unavailable.textContent).toContain('receipt.pdf');
    expect(view.container.querySelector('.evidence-picker__reason')!.textContent).toBe(EVIDENCE_DRIVE_REFERENCE_REASON);
    view.unmount();
  });
});
