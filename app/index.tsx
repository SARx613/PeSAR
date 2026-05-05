import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Animated,
  SafeAreaView,
} from 'react-native';
import { useRateStore } from '../store/useRateStore';
import { lightTheme, darkTheme, spacing, radius, palette } from '../constants/theme';
import { RateCard } from '../components/RateCard';
import { MiniChart } from '../components/MiniChart';
import { AlertModal } from '../components/AlertModal';
import { ThemeToggle } from '../components/ThemeToggle';
import { useRateFetcher } from '../hooks/useRateFetcher';
import { fetchCurrentRate } from '../services/api';

export default function HomeScreen() {
  const {
    currentRate,
    history,
    lastUpdated,
    isLoading,
    error,
    highThreshold,
    lowThreshold,
    isDark,
    toggleTheme,
    setThresholds,
    setRate,
    setLoading,
    setError,
  } = useRateStore();

  const theme = isDark ? darkTheme : lightTheme;
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const headerOpacity = useRef(new Animated.Value(0)).current;

  // Start foreground polling
  useRateFetcher();

  // Animate header on mount
  React.useEffect(() => {
    Animated.timing(headerOpacity, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { rate } = await fetchCurrentRate();
      setRate(rate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion');
    } finally {
      setRefreshing(false);
    }
  }, [setRate, setError]);

  const hasAlerts = highThreshold !== null || lowThreshold !== null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.accent}
            colors={[theme.accent]}
          />
        }
      >
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: headerOpacity }]}>
          <View>
            <Text style={[styles.appTitle, { color: theme.text }]}>PeSAR</Text>
            <Text style={[styles.appSubtitle, { color: theme.subtext }]}>
              Taux EUR → ARS
            </Text>
          </View>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </Animated.View>

        {/* Error banner */}
        {error !== null && !isLoading && (
          <View style={[styles.errorBanner, { backgroundColor: palette.red + '18' }]}>
            <Text style={[styles.errorText, { color: palette.red }]}>
              ⚠️ {error}
            </Text>
          </View>
        )}

        {/* Rate card */}
        <RateCard
          rate={currentRate}
          lastUpdated={lastUpdated}
          isLoading={isLoading}
          theme={theme}
        />

        <View style={styles.gap} />

        {/* Chart */}
        <MiniChart
          history={history}
          currentRate={currentRate}
          theme={theme}
        />

        <View style={styles.gap} />

        {/* Alert configuration */}
        <View style={[styles.alertSection, { backgroundColor: theme.surface }]}>
          <View style={styles.alertSectionHeader}>
            <Text style={[styles.alertSectionTitle, { color: theme.text }]}>
              Alertes
            </Text>
            {hasAlerts && (
              <View style={[styles.alertActiveBadge, { backgroundColor: theme.accent + '20' }]}>
                <Text style={[styles.alertActiveBadgeText, { color: theme.accent }]}>
                  Actives
                </Text>
              </View>
            )}
          </View>

          {hasAlerts ? (
            <View style={styles.alertRows}>
              {highThreshold !== null && (
                <View style={styles.alertRow}>
                  <Text style={{ fontSize: 16 }}>📈</Text>
                  <Text style={[styles.alertRowLabel, { color: theme.subtext }]}>
                    Seuil haut
                  </Text>
                  <Text style={[styles.alertRowValue, { color: palette.green }]}>
                    {highThreshold.toLocaleString('fr-FR')} ARS
                  </Text>
                </View>
              )}
              {lowThreshold !== null && (
                <View style={styles.alertRow}>
                  <Text style={{ fontSize: 16 }}>📉</Text>
                  <Text style={[styles.alertRowLabel, { color: theme.subtext }]}>
                    Seuil bas
                  </Text>
                  <Text style={[styles.alertRowValue, { color: palette.red }]}>
                    {lowThreshold.toLocaleString('fr-FR')} ARS
                  </Text>
                </View>
              )}
            </View>
          ) : (
            <Text style={[styles.alertEmptyText, { color: theme.subtext }]}>
              Aucune alerte configurée. Définissez un seuil pour être notifié.
            </Text>
          )}

          <TouchableOpacity
            onPress={() => setAlertModalVisible(true)}
            style={[styles.configureBtn, { backgroundColor: theme.accent }]}
            activeOpacity={0.85}
          >
            <Text style={styles.configureBtnText}>
              {hasAlerts ? 'Modifier les alertes' : 'Configurer une alerte'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.subtext }]}>
            Source : dolarapi.com · Western Union
          </Text>
          <Text style={[styles.footerText, { color: theme.subtext }]}>
            Glisser pour actualiser
          </Text>
        </View>
      </ScrollView>

      {/* Alert modal */}
      <AlertModal
        visible={alertModalVisible}
        onClose={() => setAlertModalVisible(false)}
        currentRate={currentRate}
        highThreshold={highThreshold}
        lowThreshold={lowThreshold}
        onSave={setThresholds}
        theme={theme}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  appTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
  },
  appSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    marginTop: 2,
  },
  errorBanner: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
  },
  gap: {
    height: spacing.md,
  },
  alertSection: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  alertSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  alertSectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  alertActiveBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  alertActiveBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  alertRows: {
    marginBottom: spacing.md,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  alertRowLabel: {
    fontSize: 14,
    flex: 1,
  },
  alertRowValue: {
    fontSize: 15,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  alertEmptyText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  configureBtn: {
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  configureBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    paddingTop: spacing.xl,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: 12,
  },
});
