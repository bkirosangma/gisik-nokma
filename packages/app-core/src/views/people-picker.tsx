import { memberLabel } from '../member-label.js';
import type { RosterMember } from '../view-types.js';

/**
 * The checkbox roster a caller uses to pick an EXPLICIT audience.
 *
 * ## Why this is an extraction rather than a second component
 *
 * It lived inline in `visibility-editor.tsx` (`:617-660`) as the body of that
 * component's `explicit` arm, and the notes series needed the same control for
 * `note.created`/`note.scope_set`'s `explicit` mode. Copying forty lines would
 * have produced two spellings of one rule — and the rule they spell is not
 * cosmetic: **the label is `memberLabel`, and it is the reason E4-6 was fixed.**
 * A picker labelled by `actorLabel(member.id, member.name)` offers the raw id
 * to a member whose display name is blank, which is a shape this product really
 * mints: better-auth's magic-link plugin creates `name: ''` for an email
 * sign-up, and the dev roster ships exactly that row. Two copies of the label
 * choice are two chances for one of them to drift back.
 *
 * ## What the caller keeps
 *
 * Only the STATE. This component owns no `useState`: the selection is the
 * caller's (a draft audience in the visibility editor, a draft scope in the
 * note dialogs), because the caller is what submits it and a picker holding its
 * own copy could disagree with the claim that leaves.
 *
 * `gn-visibility__*` classes rather than a new family: the control and the
 * screen it was born on are one thing, and a second class set for the same
 * markup would be a second set of rules to keep in step for no gain. The names
 * are historical, not a claim about which screen renders them.
 */
export function PeoplePicker({
  members,
  selected,
  onToggle,
  legend = 'Who, exactly',
}: {
  members: RosterMember[];
  selected: string[];
  onToggle: (userId: string) => void;
  legend?: string;
}) {
  return (
    <fieldset className="gn-visibility__people">
      <legend>{legend}</legend>
      {members.length === 0 ? (
        /*
         * A read that has not ANSWERED and a roster that is genuinely empty are
         * different facts, and this says the first one — because the roster of a
         * workspace you are in is never empty (you are on it), so an empty list
         * here means the read did not land. See `shell-refusal.tsx` for the
         * same distinction made on a page.
         */
        <p className="gn-visibility__no-roster">
          No one to choose from. The roster for this workspace has not been read.
        </p>
      ) : (
        members.map((member) => (
          <label key={member.id} className="gn-visibility__person">
            <input
              type="checkbox"
              checked={selected.includes(member.id)}
              onChange={() => onToggle(member.id)}
            />
            {/* A ROSTER MEMBER'S LABEL, through the shared `memberLabel` — the
                same function that names a person everywhere else, and the same
                function the roster JOIN's value is built with, so a person's row
                and their claim line cannot disagree.

                E4-6 is why this is not `actorLabel(member.id, member.name)`:
                that fallback is the raw id, which is right for PROVENANCE
                ("never blank, never a fabricated 'system'") and wrong for a
                CHOOSER. A member whose display name is empty was offered as
                `01M1V035TASFV2G9WPWFV9QDVW`; the dev roster ships exactly that
                row (`accountant@e2e.gisik-nokma.local`, `name = ''`), so it is a
                shape the product really meets rather than a fixture's invention.

                `actorLabel` is NOT gone and is not the same job: it is still
                what `visibility-editor.tsx` renders that screen's claims
                through, because it checks `SYSTEM_ACTOR_NAMES` FIRST — a step a
                picker must never take, and one auto-close must never lose. It
                keeps no email step of its own; the email reaches it through the
                join, not through this call. */}
            {memberLabel(member)}
          </label>
        ))
      )}
    </fieldset>
  );
}
