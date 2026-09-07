import { Text } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createReplicaDataSource, type ReplicaDataSource } from '@gisik-nokma/app-core';
import { createHttpTransport, createOutbox, createReplica, createSyncEngine, type SyncStatus } from '@gisik-nokma/sync-client';
import { createOpSqliteStorage } from './storage/op-sqlite-storage.js';
import { BoardScreen } from './screens/board-screen.js';
import { HelpScreen } from './screens/help-screen.js';
import { TicketScreen } from './screens/ticket-screen.js';
import { registerPushToken } from './push/register-push.js';

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:3000';
// Interim session plumbing until Plan 6's session handling is the reference
// for this app: token + workspace from build-time env in dev builds.
const TOKEN = process.env.EXPO_PUBLIC_DEV_TOKEN ?? '';
const WORKSPACE = process.env.EXPO_PUBLIC_DEV_WORKSPACE ?? '';

const Stack = createNativeStackNavigator();

export function App() {
  const [ds, setDs] = useState<ReplicaDataSource | null>(null);
  const [status, setStatus] = useState<SyncStatus>('offline');
  const [queued, setQueued] = useState(0);
  const [failed, setFailed] = useState(0);
  const workspaceId = useMemo(() => WORKSPACE, []);

  useEffect(() => {
    if (workspaceId === '' || TOKEN === '') return;
    let stop: (() => void) | undefined;
    void (async () => {
      const storage = await createOpSqliteStorage();
      const replica = await createReplica({ storage });
      const outbox = createOutbox({ storage, replica });
      const engine = createSyncEngine({
        replica,
        outbox,
        transport: createHttpTransport({ baseUrl: API_BASE, token: TOKEN }),
      });
      const dataSource = createReplicaDataSource({ workspaceId, replica, outbox, engine, storage });
      setDs(dataSource);
      const refreshQueue = (): void => {
        void dataSource.query.syncStatus(workspaceId).then((s) => {
          setQueued(s.queued);
          setFailed(s.failed);
        });
      };
      const offStatus = engine.onStatus(setStatus);
      const offChange = dataSource.subscribe(workspaceId, 0, refreshQueue);
      refreshQueue();
      void engine.start(workspaceId);
      void registerPushToken({ baseUrl: API_BASE, token: TOKEN });
      stop = () => {
        offStatus();
        offChange();
        engine.stop();
      };
    })();
    return () => stop?.();
  }, [workspaceId]);

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen
          name="Board"
          options={({ navigation }) => ({
            title: 'Gisik Nokma',
            headerRight: () => (
              <Text
                accessibilityRole="button"
                onPress={() => navigation.navigate('Help')}
                style={{ fontSize: 15, paddingHorizontal: 8 }}
              >
                Help
              </Text>
            ),
          })}
        >
          {() => <BoardScreen ds={ds} workspaceId={workspaceId} status={status} queued={queued} failed={failed} />}
        </Stack.Screen>
        {/*
          Registered BEFORE Ticket and reachable from the Board's header, and
          deliberately not gated on a token or a workspace: the content is
          bundled, so this screen works signed out and with no signal — which is
          when the FAQ's answers about signing in and about offline are worth
          the most.
        */}
        <Stack.Screen name="Help" component={HelpScreen} options={{ title: 'Manual & FAQ' }} />
        <Stack.Screen name="Ticket">
          {({ route }) => <TicketScreen ds={ds} ticketId={(route.params as { ticketId: string }).ticketId} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
