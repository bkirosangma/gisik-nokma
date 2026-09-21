import { useEffect, useState } from 'react';
import { Alert, Button, ScrollView, Text, View } from 'react-native';
import {
  OfflineAcceptError,
  resolveContest,
  type ContestLike,
  type ReplicaDataSource,
  type ResolveContestInput,
} from '@gisik-nokma/app-core';
import { IST_CLOCK_NOTE, newSubmittedEvent, plainTextToDoc, renderContestedClaimText } from '@gisik-nokma/domain';
import { EDITOR_HTML } from '../editor/editor-html.generated.js';
import { EditorWebView, type EditorWebViewProps } from '../editor/editor-web-view.js';
import { loadTicket } from './ticket-read.js';
import { buildCommentEvent } from './ticket-comment.js';
import { queryWorkspaceMembers } from './mention-query.js';

type EditorDoc = Exclude<EditorWebViewProps['initialDoc'], null>;

type TicketWithPending = Awaited<ReturnType<ReplicaDataSource['query']['getTicketWithPending']>>;

export function TicketScreen(props: { ds: ReplicaDataSource | null; ticketId: string; apiBase: string; token: string }) {
  const { ds, ticketId, apiBase, token } = props;
  const [ticket, setTicket] = useState<TicketWithPending>(null);
  const [draft, setDraft] = useState<EditorDoc>(plainTextToDoc('') as EditorDoc);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  useEffect(() => {
    if (ds === null) return;
    const refresh = (): void => {
      void loadTicket(ds, ticketId).then((result) => {
        if (!result.ok) {
          setReadError(result.error);
          return;
        }
        setReadError(null);
        setTicket(result.ticket);
      });
    };
    refresh();
    return ds.subscribe('', 0, refresh);
  }, [ds, ticketId]);

  if (ds === null) return <Text>Opening…</Text>;
  if (readError !== null) return <Text accessibilityRole="alert">{readError}</Text>;
  if (ticket === null) return <Text>Opening…</Text>;
  const state = ticket.pending?.pending ?? ticket.confirmed;
  const openContests = ticket.contests.filter((c) => !c.resolved);
  const title = String((state?.fields.title?.value as string | undefined) ?? '');

  const onComment = (): void => {
    if (state === null || state === undefined) return;
    setError(null);
    // Interim, flagged by the plan this task adapts: the session user id is
    // not wired up (no auth flow in this shell yet), so buildCommentEvent
    // claims a placeholder that cannot resolve to any workspace member
    // (E2-42) rather than guessing the ticket's assignee. Becomes the real
    // signed-in user once Plan 6's session handling reaches this app.
    void ds
      .ingest([buildCommentEvent({ workspaceId: state.workspaceId, ticketId, body: draft })])
      .catch((err: unknown) => {
        if (err instanceof OfflineAcceptError) return; // queued locally — the expected offline outcome
        setError(err instanceof Error ? err.message : 'comment refused');
      });
  };

  // Trap from Lane B (Plan 10 Task 13): resolveContest deliberately does NOT
  // catch OfflineAcceptError — answering ok:true for a queued claim would
  // show "the server accepted your discard" for a discard the server has
  // never seen. Await/catch it here, exactly like onComment above.
  const onResolve = (contest: ContestLike, input: ResolveContestInput): void => {
    setError(null);
    resolveContest(ds.ingest, contest, input, { userId: contest.claimantId, origin: 'mobile' })
      .then((result) => {
        if (!result.ok) setError(`${result.refused?.rule}: ${result.refused?.reason}`);
      })
      .catch((err: unknown) => {
        if (err instanceof OfflineAcceptError) return; // queued locally — the expected offline outcome
        setError(err instanceof Error ? err.message : 'resolution refused');
      });
  };

  // "Redo legally" needs a FRESH envelope (resolveContest throws if handed the
  // contested claim's own id back) — app-core's ContestBanner pushes building
  // that envelope to the host on purpose (§ contest-banner.tsx docblock),
  // since what "redo" means depends on the claim's type. This shell's minimal
  // redo resubmits the identical claim under a fresh id/clientTime; it does
  // not offer inline editing of the claim before resubmitting — a full
  // per-event-type redo editor is out of Task 17's scope.
  const onRedo = (contest: ContestLike): void => {
    const replacementEvent = newSubmittedEvent({
      workspaceId: contest.originalEvent.workspaceId,
      entity: { kind: 'ticket', id: contest.ticketId },
      type: contest.originalEvent.type,
      payload: contest.originalEvent.payload,
      actorId: contest.claimantId,
      origin: 'mobile',
    });
    onResolve(contest, { resolution: 'redone', replacementEvent });
  };

  const onDiscard = (contest: ContestLike): void => {
    Alert.alert('Discard claim?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => onResolve(contest, { resolution: 'discarded' }) },
    ]);
  };

  return (
    <ScrollView>
      <Text>{title}</Text>
      <Text>
        State: {state?.stateId} {ticket.pending !== null ? '(claim in transit)' : ''}
      </Text>
      {openContests.map((c) => (
        <View key={c.contestedEventId} accessibilityRole="alert">
          {/*
            renderContestedClaimText (app-core's real ContestBanner uses the
            same function) — the "when" is IST through formatIstInstant
            internally, the same date the ticket's calendar marker and the
            web banner show. IST_CLOCK_NOTE names the clock for a
            collaborator elsewhere.
          */}
          <Text accessibilityHint={IST_CLOCK_NOTE}>
            {renderContestedClaimText({ originalEvent: c.originalEvent, rule: c.rule, reason: c.reason })}
          </Text>
          <Button title="Redo legally" onPress={() => onRedo(c)} />
          <Button title="Convert to comment" onPress={() => onResolve(c, { resolution: 'converted-to-comment' })} />
          <Button title="Discard" onPress={() => onDiscard(c)} />
        </View>
      ))}
      <EditorWebView
        initialDoc={draft}
        onChange={setDraft}
        html={EDITOR_HTML}
        onMentionQuery={(query) => queryWorkspaceMembers({ apiBase, token, workspaceId: state?.workspaceId ?? '', query })}
      />
      {error !== null ? <Text accessibilityRole="alert">{error}</Text> : null}
      <Text accessibilityRole="text">
        Comments from the phone are not attributed to you yet — sign-in for the phone is still interim.
      </Text>
      <Button title="Comment" onPress={onComment} />
    </ScrollView>
  );
}
