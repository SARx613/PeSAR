import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Theme, spacing, radius, palette } from '../constants/theme';
import { RatePoint } from '../store/useRateStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - spacing.md * 2 - spacing.md * 2;

interface MiniChartProps {
  history: RatePoint[];
  currentRate: number | null;
  theme: Theme;
}

function getTrend(history: RatePoint[]): 'up' | 'down' | 'flat' {
  if (history.length < 2) return 'flat';
  const first = history[0].rate;
  const last = history[history.length - 1].rate;
  const diff = ((last - first) / first) * 100;
  if (diff > 0.1) return 'up';
  if (diff < -0.1) return 'down';
  return 'flat';
}

function formatChange(history: RatePoint[]): string {
  if (history.length < 2) return '—';
  const first = history[0].rate;
  const last = history[history.length - 1].rate;
  const diff = last - first;
  const pct = ((diff / first) * 100).toFixed(2);
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(2)} (${sign}${pct}%)`;
}

export function MiniChart({ history, currentRate, theme }: MiniChartProps) {
  const chartData = useMemo(() => {
    if (history.length < 2) return null;
    return history.map((p) => ({ value: p.rate }));
  }, [history]);

  const trend = getTrend(history);
  const trendColor =
    trend === 'up' ? palette.green : trend === 'down' ? palette.red : theme.subtext;
  const trendLabel = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '→';
  const changeStr = formatChange(history);

  if (!chartData || history.length < 2) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>Évolution 24h</Text>
        </View>
        <View style={styles.placeholder}>
          <Text style={[styles.placeholderText, { color: theme.subtext }]}>
            Données insuffisantes — actualisez pour charger l'historique
          </Text>
        </View>
      </View>
    );
  }

  const lineColor = theme.isDark ? theme.accent : theme.accent;

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Évolution 24h</Text>
        <View style={styles.trendPill}>
          <Text style={[styles.trendText, { color: trendColor }]}>
            {trendLabel} {changeStr}
          </Text>
        </View>
      </View>

      <LineChart
        data={chartData}
        width={CHART_WIDTH - spacing.md * 2}
        height={100}
        color={lineColor}
        thickness={2}
        hideDataPoints
        curved
        areaChart
        startFillColor={lineColor}
        endFillColor={theme.isDark ? '#0A84FF05' : '#007AFF05'}
        startOpacity={0.25}
        endOpacity={0.02}
        noOfSections={3}
        yAxisColor="transparent"
        xAxisColor={theme.separator}
        rulesColor={theme.separator + '60'}
        rulesType="solid"
        hideYAxisText
        backgroundColor="transparent"
        initialSpacing={4}
        endSpacing={4}
        disableScroll
      />

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: theme.subtext }]}>
          {history.length} points · dernières{' '}
          {Math.round((history.length * 15) / 60)}h
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.md,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
  },
  trendPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  trendText: {
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  placeholder: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  placeholderText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    marginTop: spacing.xs,
    alignItems: 'flex-end',
  },
  footerText: {
    fontSize: 11,
  },
});
