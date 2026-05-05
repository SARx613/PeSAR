import { useEffect } from 'react';
import { requestNotificationPermissions } from '../hooks/useNotifications';
import { registerPushToken } from './api';
import { useRateStore } from '../store/useRateStore';

/**
 * Hook that requests push notification permissions on first mount,
 * stores the token in the Zustand store, and registers it with the
 * Vercel backend so it can receive silent push updates.
 */
export function usePushTokenRegistration(): void {
  const { setExpoPushToken, expoPushToken } = useRateStore();

  useEffect(() => {
    async function register() {
      // Skip if already registered
      if (expoPushToken) {
        // Re-register with backend in case it was cleared
        await registerPushToken(expoPushToken);
        return;
      }

      const token = await requestNotificationPermissions();
      if (token) {
        setExpoPushToken(token);
        await registerPushToken(token);
      }
    }

    register();
  }, []);
}
