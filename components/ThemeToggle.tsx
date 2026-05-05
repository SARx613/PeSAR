import React from 'react';
import { TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Theme } from '../constants/theme';

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const icon = theme.isDark ? '☀️' : '🌙';

  return (
    <TouchableOpacity
      onPress={onToggle}
      style={[styles.button, { backgroundColor: theme.surface }]}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.Text style={styles.icon}>{icon}</Animated.Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 18,
  },
});
