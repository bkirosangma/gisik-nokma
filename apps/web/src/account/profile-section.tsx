'use client';

import { useState } from 'react';
import { Button } from '@gisik-nokma/ui';

export type ProfileSectionProps = {
  name: string;
  email: string;
  onSave: (name: string) => Promise<{ error: string | null }>;
};

/**
 * Name is editable via better-auth's core `updateUser` (no plugin needed —
 * `apps/web/src/auth-client.ts` documents this route already exists
 * unconditionally). Email is READ-ONLY on purpose: changing it needs a
 * verification round-trip this plan does not build (spec non-goal), so it
 * renders as plain text rather than a disabled `.gn-field__input` — the
 * established "disabled input" read-only pattern (`packages/ui/src/ui.css`'s
 * `.gn-field__input:disabled` docblock) puts the value in the DOM as an input
 * VALUE, invisible to `getByText`/a page's own text search, which is wrong
 * for a fact a person may want to copy or a screen reader's "read everything"
 * pass to surface as ordinary text.
 */
export function ProfileSection({ name, email, onSave }: ProfileSectionProps) {
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await onSave(draft);
    setSaving(false);
    if (result.error !== null) setError(result.error);
  };

  return (
    <section className="gn-account__section gn-account__profile">
      <h2 className="gn-account__section-title">Profile</h2>
      <label className="gn-field">
        <span className="gn-field__label">Name</span>
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="gn-field__input"
        />
      </label>
      <p className="gn-field gn-account__readonly">
        <span className="gn-field__label">Email</span>
        <span>{email}</span>
      </p>
      {error !== null ? (
        <p role="alert" className="gn-shell__refusal">
          {error}
        </p>
      ) : null}
      <Button variant="primary" onClick={() => void save()} disabled={saving}>
        Save name
      </Button>
    </section>
  );
}
