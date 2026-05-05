import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions from the OS.
 * Returns the Expo push token if successful.
 */
export async function requestNotificationPermissions(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('rate-alerts', {
      name: 'Alertes de taux',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#007AFF',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
    });
    return tokenData.data;
  } catch (err) {
    console.warn('[Notifications] Could not get push token:', err);
    return null;
  }
}

/**
 * Fire a local notification immediately.
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data ?? {},
        sound: true,
      },
      trigger: null, // fire immediately
    });
  } catch (err) {
    console.warn('[Notifications] Failed to schedule notification:', err);
  }
}

/**
 * Check rate thresholds and fire local notifications if crossed.
 * prev: previous rate, next: newly received rate
 */
export async function checkThresholds(
  next: number,
  prev: number,
  high: number | null,
  low: number | null,
): Promise<void> {
  if (high !== null && prev < high && next >= high) {
    await scheduleLocalNotification(
      '📈 Seuil haut atteint !',
      `1 EUR = ${next.toFixed(2)} ARS (seuil: ${high})`,
      { type: 'high_threshold', rate: next },
    );
  }

  if (low !== null && prev > low && next <= low) {
    await scheduleLocalNotification(
      '📉 Seuil bas atteint !',
      `1 EUR = ${next.toFixed(2)} ARS (seuil: ${low})`,
      { type: 'low_threshold', rate: next },
    );
  }
}

/**
 * Hook to set up notification response listeners.
 * Returns a cleanup function.
 */
export function useNotificationListeners(): void {
  const responseListenerRef = useRef<Notifications.EventSubscription | null>(null);
  const notificationListenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    notificationListenerRef.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        // Handle silent push from Vercel: update rate in background
        const { data } = notification.request.content;
        if (data?.rate && typeof data.rate === 'number') {
          const { setRate } = require('../store/useRateStore').useRateStore.getState();
          setRate(data.rate as number);
        }
      },
    );

    responseListenerRef.current = Notifications.addNotificationResponseReceivedListener(
      (_response) => {
        // User tapped a notification — app will open automatically
      },
    );

    return () => {
      notificationListenerRef.current?.remove();
      responseListenerRef.current?.remove();
    };
  }, []);
}
