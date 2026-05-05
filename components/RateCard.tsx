import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Theme, spacing, radius, typography, palette } from '../constants/theme';

interface RateCardProps {
  rate: number | null;
  lastUpdated: string | null;
  isLoading: boolean;
  theme: Theme;
}

function formatRate(rate: number): string {
  return rate.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatLastUpdated(iso: string | null): string {
  if (!iso) return 'Jamais mis à jour';
  const date = new Date(iso);
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function RateCard({ rate, lastUpdated, isLoading, theme }: RateCardProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;
  const prevRateRef = useRef<number | null>(null);

  // Animate when rate changes
  useEffect(() => {
    if (rate !== null && rate !== prevRateRef.current) {
      prevRateRef.current = rate;

      Animated.sequence([
        Animated.parallel([
          Animated.timing(scaleAnim, {
            toValue: 1.04,
            duration: 150,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.7,
            duration: 100,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 6,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 1,
            duration: 150,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }
  }, [rate]);

  const gradientColors: [string, string] = theme.isDark
    ? ['#1C1C1E', '#0D0D0F']
    : ['#FFFFFF', '#F8F8FC'];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          shadowColor: theme.cardShadow,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { borderColor: theme.separator }]}
      >
        {/* Label */}
        <View style={styles.labelRow}>
          <View style={[styles.badge, { backgroundColor: theme.accent + '20' }]}>
            <Text style={[styles.badgeText, { color: theme.accent }]}>Western Union</Text>
          </View>
          <Text style={[styles.currencyPair, { color: theme.subtext }]}>EUR → ARS</Text>
        </View>

        {/* Main rate */}
        <View style={styles.rateRow}>
          {isLoading && rate === null ? (
            <Text style={[styles.placeholder, { color: theme.subtext }]}>—</Text>
          ) : (
            <>
              <Text style={[styles.ratePrefix, { color: theme.subtext }]}>1 EUR =</Text>
              <Text style={[styles.rateValue, { color: theme.text }]}>
                {rate !== null ? formatRate(rate) : '—'}
              </Text>
              <Text style={[styles.rateSuffix, { color: theme.accent }]}> ARS</Text>
            </>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={[styles.dot, { backgroundColor: isLoading ? palette.orange : palette.green }]} />
          <Text style={[styles.footerText, { color: theme.subtext }]}>
            {isLoading ? 'Mise à jour...' : `Mis à jour à ${formatLastUpdated(lastUpdated)}`}
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
    marginHorizontal: spacing.md,
  },
  gradient: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 0.5,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  currencyPair: {
    fontSize: 13,
    fontWeight: '500',
  },
  rateRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: spacing.lg,
    flexWrap: 'wrap',
  },
  ratePrefix: {
    fontSize: 18,
    fontWeight: '400',
    marginBottom: 6,
    marginRight: 6,
  },
  rateValue: {
    ...typography.largeRate,
    lineHeight: 68,
  },
  rateSuffix: {
    fontSize: 22,
    fontWeight: '600',
    marginBottom: 10,
  },
  placeholder: {
    ...typography.largeRate,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  footerText: {
    fontSize: 12,
  },
});
