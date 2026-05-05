export const palette = {
  white: '#FFFFFF',
  black: '#000000',
  iosBlue: '#007AFF',
  electricBlue: '#0A84FF',
  surface_light: '#F2F2F7',
  surface_dark: '#1C1C1E',
  subtext_light: '#8E8E93',
  subtext_dark: '#636366',
  separator_light: '#E5E5EA',
  separator_dark: '#38383A',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
};

export type Theme = {
  background: string;
  surface: string;
  accent: string;
  text: string;
  subtext: string;
  separator: string;
  cardShadow: string;
  isDark: boolean;
};

export const lightTheme: Theme = {
  background: palette.white,
  surface: palette.surface_light,
  accent: palette.iosBlue,
  text: palette.black,
  subtext: palette.subtext_light,
  separator: palette.separator_light,
  cardShadow: 'rgba(0,0,0,0.08)',
  isDark: false,
};

export const darkTheme: Theme = {
  background: palette.black,
  surface: palette.surface_dark,
  accent: palette.electricBlue,
  text: palette.white,
  subtext: palette.subtext_dark,
  separator: palette.separator_dark,
  cardShadow: 'rgba(0,0,0,0.5)',
  isDark: true,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  full: 999,
};

export const typography = {
  largeRate: {
    fontSize: 64,
    fontWeight: '700' as const,
    letterSpacing: -2,
  },
  rateLabel: {
    fontSize: 18,
    fontWeight: '500' as const,
    letterSpacing: 0.2,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: '600' as const,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '400' as const,
    letterSpacing: 0.2,
  },
};
