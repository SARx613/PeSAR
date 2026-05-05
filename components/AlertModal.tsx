import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Theme, spacing, radius, typography, palette } from '../constants/theme';

interface AlertModalProps {
  visible: boolean;
  onClose: () => void;
  currentRate: number | null;
  highThreshold: number | null;
  lowThreshold: number | null;
  onSave: (high: number | null, low: number | null) => void;
  theme: Theme;
}

export function AlertModal({
  visible,
  onClose,
  currentRate,
  highThreshold,
  lowThreshold,
  onSave,
  theme,
}: AlertModalProps) {
  const [highText, setHighText] = useState('');
  const [lowText, setLowText] = useState('');

  useEffect(() => {
    if (visible) {
      setHighText(highThreshold != null ? String(highThreshold) : '');
      setLowText(lowThreshold != null ? String(lowThreshold) : '');
    }
  }, [visible]);

  const handleSave = () => {
    const high = highText.trim() ? parseFloat(highText.replace(',', '.')) : null;
    const low = lowText.trim() ? parseFloat(lowText.replace(',', '.')) : null;
    onSave(
      high !== null && !isNaN(high) ? high : null,
      low !== null && !isNaN(low) ? low : null,
    );
    onClose();
  };

  const handleClear = () => {
    setHighText('');
    setLowText('');
    onSave(null, null);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); onClose(); }}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          {/* Handle */}
          <View style={[styles.handle, { backgroundColor: theme.separator }]} />

          <Text style={[styles.title, { color: theme.text }]}>Configurer les alertes</Text>

          {currentRate !== null && (
            <View style={[styles.currentRateBadge, { backgroundColor: theme.accent + '15' }]}>
              <Text style={[styles.currentRateText, { color: theme.accent }]}>
                Taux actuel : {currentRate.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} ARS
              </Text>
            </View>
          )}

          <Text style={[styles.sectionLabel, { color: theme.subtext }]}>
            Vous recevrez une notification dès que le taux franchit l'un de ces seuils.
          </Text>

          {/* High threshold */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <Text style={[styles.inputLabelEmoji]}>📈</Text>
              <Text style={[styles.inputLabelText, { color: theme.text }]}>Seuil haut (ARS)</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: highText ? palette.green : theme.separator,
                },
              ]}
              value={highText}
              onChangeText={setHighText}
              placeholder="ex: 1350"
              placeholderTextColor={theme.subtext}
              keyboardType="numeric"
              returnKeyType="next"
            />
          </View>

          {/* Low threshold */}
          <View style={styles.inputGroup}>
            <View style={styles.inputLabel}>
              <Text style={styles.inputLabelEmoji}>📉</Text>
              <Text style={[styles.inputLabelText, { color: theme.text }]}>Seuil bas (ARS)</Text>
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.background,
                  color: theme.text,
                  borderColor: lowText ? palette.red : theme.separator,
                },
              ]}
              value={lowText}
              onChangeText={setLowText}
              placeholder="ex: 1200"
              placeholderTextColor={theme.subtext}
              keyboardType="numeric"
              returnKeyType="done"
              onSubmitEditing={handleSave}
            />
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={handleClear}
              style={[styles.secondaryBtn, { borderColor: theme.separator }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { color: theme.subtext }]}>
                Effacer
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSave}
              style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Enregistrer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  keyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    marginBottom: spacing.md,
  },
  currentRateBadge: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    alignSelf: 'flex-start',
    marginBottom: spacing.md,
  },
  currentRateText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  inputLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  inputLabelEmoji: {
    fontSize: 16,
    marginRight: spacing.xs,
  },
  inputLabelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 17,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 2,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
