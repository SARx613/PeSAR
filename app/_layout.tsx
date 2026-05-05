import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRateStore } from '../store/useRateStore';
import { lightTheme, darkTheme } from '../constants/theme';
import { useNotificationListeners } from '../hooks/useNotifications';
import { usePushTokenRegistration } from '../services/pushToken';
import { registerBackgroundFetch } from '../hooks/useRateFetcher';

export default function RootLayout() {
  const isDark = useRateStore((s) => s.isDark);
  const theme = isDark ? darkTheme : lightTheme;

  // Wire notification listeners
  useNotificationListeners();

  // Register Expo push token and send to backend
  usePushTokenRegistration();

  // Register background fetch task
  useEffect(() => {
    registerBackgroundFetch();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.background },
            animation: 'ios_from_right',
          }}
        />
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
