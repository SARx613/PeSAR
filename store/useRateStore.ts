import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RatePoint {
  rate: number;
  timestamp: string;
}

export interface RateStore {
  // Rate data
  currentRate: number | null;
  history: RatePoint[];
  lastUpdated: string | null;

  // Alert thresholds
  highThreshold: number | null;
  lowThreshold: number | null;

  // Theme
  isDark: boolean;

  // Push notifications
  expoPushToken: string | null;

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Actions
  setRate: (rate: number) => void;
  appendHistory: (point: RatePoint) => void;
  setThresholds: (high: number | null, low: number | null) => void;
  toggleTheme: () => void;
  setExpoPushToken: (token: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearHistory: () => void;
}

export const useRateStore = create<RateStore>()(
  persist(
    (set, get) => ({
      currentRate: null,
      history: [],
      lastUpdated: null,
      highThreshold: null,
      lowThreshold: null,
      isDark: false,
      expoPushToken: null,
      isLoading: false,
      error: null,

      setRate: (rate: number) => {
        const now = new Date().toISOString();
        const history = get().history;
        const newPoint: RatePoint = { rate, timestamp: now };

        // Keep last 96 points (24h at 15-min intervals)
        const updatedHistory = [...history, newPoint].slice(-96);

        set({
          currentRate: rate,
          lastUpdated: now,
          history: updatedHistory,
          error: null,
        });
      },

      appendHistory: (point: RatePoint) => {
        set((state) => ({
          history: [...state.history, point].slice(-96),
        }));
      },

      setThresholds: (high, low) => {
        set({ highThreshold: high, lowThreshold: low });
      },

      toggleTheme: () => {
        set((state) => ({ isDark: !state.isDark }));
      },

      setExpoPushToken: (token) => {
        set({ expoPushToken: token });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      setError: (error) => {
        set({ error });
      },

      clearHistory: () => {
        set({ history: [] });
      },
    }),
    {
      name: 'pesar-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        history: state.history,
        highThreshold: state.highThreshold,
        lowThreshold: state.lowThreshold,
        isDark: state.isDark,
        expoPushToken: state.expoPushToken,
        currentRate: state.currentRate,
        lastUpdated: state.lastUpdated,
      }),
    },
  ),
);
