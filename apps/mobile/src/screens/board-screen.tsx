import { useEffect, useState } from 'react';
import { FlatList, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { syncStatusLabel, type ReplicaDataSource, type TicketSummary } from '@gisik-nokma/app-core';
import { loadBoard } from './board-read.js';
import { boardRowAccessibilityLabel } from './board-row-a11y.js';

type Nav = { navigate(name: 'Ticket', params: { ticketId: string }): void };

export function BoardScreen(props: {
  ds: ReplicaDataSource | null;
  workspaceId: string;
  status: string;
  queued: number;
  failed: number;
  initError?: string | null;
}) {
  const navigation = useNavigation<Nav>();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [query, setQuery] = useState('');
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const { ds, workspaceId } = props;

  useEffect(() => {
    if (ds === null) return;
    const refresh = (): void => {
      if (query === '') setOfflineCopy(false);
      void loadBoard(ds, workspaceId, query).then((result) => {
        if (!result.ok) {
          setReadError(result.error);
          return;
        }
        setReadError(null);
        if (query !== '') setOfflineCopy(result.offlineCopy); // always true on the replica — the label is the honesty
        setTickets(result.tickets);
      });
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
      {props.initError != null ? <Text accessibilityRole="alert">{props.initError}</Text> : null}
      <TextInput placeholder="Search" value={query} onChangeText={setQuery} />
      {offlineCopy && query !== '' ? <Text>searching offline copy</Text> : null}
      {readError !== null ? <Text accessibilityRole="alert">{readError}</Text> : null}
      <FlatList
        data={tickets}
        keyExtractor={(t) => t.ticketId}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate('Ticket', { ticketId: item.ticketId })}
            accessibilityRole="button"
            accessibilityLabel={boardRowAccessibilityLabel(item)}
          >
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
