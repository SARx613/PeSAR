import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { fetchCurrentRate } from '../services/api';
import { useRateStore } from '../store/useRateStore';
import { checkThresholds } from './useNotifications';
import { writeRateToWidget } from '../services/sharedDefaults';

const BACKGROUND_FETCH_TASK = 'pesar-background-fetch';
const FOREGROUND_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes while app is open

// Register background fetch task (must be called at module level, outside any component)
TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const { rate } = await fetchCurrentRate();
    const store = useRateStore.getState();
    const prev = store.currentRate;
    store.setRate(rate);

    // Update iOS widget via shared UserDefaults
    writeRateToWidget(rate, store.history, new Date().toISOString());

    // Check thresholds and fire local notifications if needed
    if (prev !== null) {
      await checkThresholds(rate, prev, store.highThreshold, store.lowThreshold);
    }

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundFetch(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      console.warn('[BackgroundFetch] Background fetch is restricted on this device.');
      return;
    }

    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
      minimumInterval: 15 * 60, // 15 minutes (iOS will decide actual interval)
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch (err) {
    console.warn('[BackgroundFetch] Could not register task:', err);
  }
}

/**
 * Hook that fetches the current rate on foreground focus and on a timer.
 * Call this once in the root layout or main screen.
 */
export function useRateFetcher(): void {
  const { setRate, setLoading, setError, currentRate, highThreshold, lowThreshold } =
    useRateStore();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const fetchRate = useCallback(async () => {
    try {
      setLoading(true);
      const { rate } = await fetchCurrentRate();
      if (!isMountedRef.current) return;

      const storeState = useRateStore.getState();
      const prev = storeState.currentRate;
      setRate(rate);

      // Push to widget
      writeRateToWidget(rate, storeState.history, new Date().toISOString());

      if (prev !== null) {
        await checkThresholds(rate, prev, highThreshold, lowThreshold);
      }
    } catch (err) {
      if (!isMountedRef.current) return;
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }, [setRate, setLoading, setError, highThreshold, lowThreshold]);

  // Fetch immediately on mount and when app comes to foreground
  useEffect(() => {
    isMountedRef.current = true;
    fetchRate();

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        fetchRate();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Start polling while app is in foreground
    pollingRef.current = setInterval(fetchRate, FOREGROUND_POLL_INTERVAL);

    return () => {
      isMountedRef.current = false;
      subscription.remove();
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [fetchRate]);
}
