import { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { syncStatusLabel, type ReplicaDataSource, type TicketSummary } from '@gisik-nokma/app-core';

type Nav = { navigate(name: 'Ticket', params: { ticketId: string }): void };

export function BoardScreen(props: {
  ds: ReplicaDataSource | null;
  workspaceId: string;
  status: string;
  queued: number;
  failed: number;
}) {
  const navigation = useNavigation<Nav>();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [query, setQuery] = useState('');
  const [offlineCopy, setOfflineCopy] = useState(false);
  const { ds, workspaceId } = props;

  useEffect(() => {
    if (ds === null) return;
    const refresh = (): void => {
      if (query === '') {
        setOfflineCopy(false);
        void ds.query.listTicketSummaries(workspaceId).then(setTickets);
      } else {
        void Promise.all([ds.query.searchOfflineCopy(workspaceId, query), ds.query.listTicketSummaries(workspaceId)]).then(
          ([result, all]) => {
            setOfflineCopy(result.offlineCopy); // always true on the replica — the label is the honesty
            const byId = new Map(all.map((t) => [t.ticketId, t]));
            const found = result.hits
              .map((hit) => byId.get(hit.ticketId))
              .filter((t): t is TicketSummary => t !== undefined);
            setTickets(found);
          },
        );
      }
    };
    refresh();
    return ds.subscribe(workspaceId, 0, refresh);
  }, [ds, workspaceId, query]);

  return (
    <View>
      {/*
        `syncStatusLabel` is app-core's Task 13 helper (`sync/sync-status-bar.tsx`)
        — the same wording the web `SyncStatusBar` renders, minus its `<div>`
        markup, which RN cannot mount. `failed` has no equivalent helper (the
        web component inlines it), so its wording is matched here by hand.
      */}
      <Text accessibilityRole="text">{syncStatusLabel(props.status, props.queued)}</Text>
      {props.failed > 0 ? <Text accessibilityRole="text">{props.failed} needs attention</Text> : null}
      <TextInput placeholder="Search" value={query} onChangeText={setQuery} />
      {offlineCopy && query !== '' ? <Text>searching offline copy</Text> : null}
      <FlatList
        data={tickets}
        keyExtractor={(t) => t.ticketId}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => navigation.navigate('Ticket', { ticketId: item.ticketId })}>
            <Text>
              {item.title} · {item.stateId}
            </Text>
            {item.pending ? <Text>claim in transit</Text> : null}
            {item.openContests > 0 ? <Text>{item.openContests} contested</Text> : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
