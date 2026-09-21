/**
 * The client half of Plan 9's NotificationTransport. No `POST
 * /v1/push/registrations` route exists on `apps/server` yet (verified:
 * `grep -rn "push" apps/server/src/routes apps/server/src/app.ts` finds
 * nothing registering one), so the 404 path below is exercised for real,
 * not a hypothetical. Written to degrade honestly — the app keeps working
 * without push rather than failing sign-in while Plan 9's transport lands.
 */
export async function registerPushToken(opts: {
  baseUrl: string;
  token: string;
  getToken?: () => Promise<{ data: string }>;
  fetchImpl?: typeof fetch;
}): Promise<{ registered: boolean; reason?: string }> {
  const doFetch = opts.fetchImpl ?? fetch;
  const getToken =
    opts.getToken ??
    (async () => {
      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') throw new Error('permission denied');
      return Notifications.getExpoPushTokenAsync();
    });

  let expoToken: string;
  try {
    expoToken = (await getToken()).data;
  } catch {
    return { registered: false, reason: 'no-token' };
  }
  let res: Response;
  try {
    res = await doFetch(`${opts.baseUrl}/v1/push/registrations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ platform: 'expo', token: expoToken }),
    });
  } catch {
    // A dropped connection is a different fact from a 404: the 404 arm below
    // means "the route is not registered yet", answered BY the server. This
    // arm means the request never got an answer at all — offline, a dropped
    // socket — so it is a third value, never coerced into either of the
    // other two (Ruling 27/33's standing rule: a refusal and a dropped
    // connection are never the same word).
    return { registered: false, reason: 'unreachable' };
  }
  if (res.status === 404) return { registered: false, reason: 'transport-unavailable' };
  if (!res.ok) return { registered: false, reason: `http-${res.status}` };
  return { registered: true };
}
