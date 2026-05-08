import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Theme, spacing, radius, palette } from '../constants/theme';

interface CurrencyConverterProps {
  rate: number | null;
  theme: Theme;
}

function formatARS(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatEUR(value: number): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CurrencyConverter({ rate, theme }: CurrencyConverterProps) {
  const [eurValue, setEurValue] = useState('');
  const [arsValue, setArsValue] = useState('');
  const lastEdited = useRef<'eur' | 'ars'>('eur');

  // Spin animation for the swap icon
  const spinAnim = useRef(new Animated.Value(0)).current;

  const animateSwap = useCallback(() => {
    spinAnim.setValue(0);
    Animated.timing(spinAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();
  }, [spinAnim]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleEurChange = useCallback(
    (text: string) => {
      // Accept digits, comma and dot
      const cleaned = text.replace(',', '.');
      setEurValue(text);
      lastEdited.current = 'eur';

      if (!rate || cleaned === '' || cleaned === '.') {
        setArsValue('');
        return;
      }

      const numeric = parseFloat(cleaned);
      if (isNaN(numeric)) {
        setArsValue('');
        return;
      }

      const ars = numeric * rate;
      setArsValue(formatARS(ars));
    },
    [rate]
  );

  const handleArsChange = useCallback(
    (text: string) => {
      const cleaned = text.replace(/\s/g, '').replace(',', '.');
      setArsValue(text);
      lastEdited.current = 'ars';

      if (!rate || cleaned === '' || cleaned === '.') {
        setEurValue('');
        return;
      }

      const numeric = parseFloat(cleaned);
      if (isNaN(numeric)) {
        setEurValue('');
        return;
      }

      const eur = numeric / rate;
      setEurValue(formatEUR(eur));
    },
    [rate]
  );

  const handleSwap = useCallback(() => {
    animateSwap();
    const tmpEur = eurValue;
    const tmpArs = arsValue;
    if (lastEdited.current === 'eur' && arsValue !== '') {
      setEurValue(arsValue);
      handleEurChange(arsValue);
    } else if (lastEdited.current === 'ars' && eurValue !== '') {
      setArsValue(eurValue);
      handleArsChange(eurValue);
    } else {
      setEurValue(tmpArs);
      setArsValue(tmpEur);
    }
  }, [eurValue, arsValue, animateSwap, handleEurChange, handleArsChange]);

  const disabled = rate === null;
  const inputBg = theme.isDark ? '#2C2C2E' : '#F2F2F7';
  const borderColor = theme.isDark ? '#38383A' : '#E5E5EA';
  const accentBorder = theme.accent + '55';

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.text }]}>Convertisseur</Text>
        {rate !== null && (
          <View style={[styles.rateBadge, { backgroundColor: theme.accent + '18' }]}>
            <Text style={[styles.rateBadgeText, { color: theme.accent }]}>
              1 € = {rate.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ARS
            </Text>
          </View>
        )}
      </View>

      {/* Inputs */}
      <View style={styles.inputsRow}>
        {/* EUR input */}
        <View style={styles.inputWrapper}>
          <View style={[styles.currencyTag, { backgroundColor: inputBg }]}>
            <Text style={styles.flagEmoji}>🇪🇺</Text>
            <Text style={[styles.currencyCode, { color: theme.subtext }]}>EUR</Text>
          </View>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: inputBg,
                color: theme.text,
                borderColor: lastEdited.current === 'eur' ? accentBorder : borderColor,
              },
            ]}
            value={eurValue}
            onChangeText={handleEurChange}
            placeholder={disabled ? '—' : '0,00'}
            placeholderTextColor={theme.subtext}
            keyboardType="decimal-pad"
            editable={!disabled}
            returnKeyType="done"
            maxLength={12}
          />
        </View>

        {/* Swap button */}
        <TouchableOpacity onPress={handleSwap} disabled={disabled} style={styles.swapBtn} activeOpacity={0.7}>
          <Animated.Text style={[styles.swapIcon, { transform: [{ rotate: spin }] }]}>⇄</Animated.Text>
        </TouchableOpacity>

        {/* ARS input */}
        <View style={styles.inputWrapper}>
          <View style={[styles.currencyTag, { backgroundColor: inputBg }]}>
            <Text style={styles.flagEmoji}>🇦🇷</Text>
            <Text style={[styles.currencyCode, { color: theme.subtext }]}>ARS</Text>
          </View>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: inputBg,
                color: theme.text,
                borderColor: lastEdited.current === 'ars' ? accentBorder : borderColor,
              },
            ]}
            value={arsValue}
            onChangeText={handleArsChange}
            placeholder={disabled ? '—' : '0'}
            placeholderTextColor={theme.subtext}
            keyboardType="decimal-pad"
            editable={!disabled}
            returnKeyType="done"
            maxLength={14}
          />
        </View>
      </View>

      {disabled && (
        <Text style={[styles.disabledHint, { color: theme.subtext }]}>
          En attente du taux de change…
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
  },
  rateBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  rateBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  inputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  inputWrapper: {
    flex: 1,
    gap: spacing.xs,
  },
  currencyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  flagEmoji: {
    fontSize: 14,
  },
  currencyCode: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 18,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  swapBtn: {
    paddingBottom: spacing.sm,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapIcon: {
    fontSize: 22,
    color: palette.iosBlue,
  },
  disabledHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
