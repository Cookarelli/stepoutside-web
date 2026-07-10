/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#18442F';
const tintColorDark = '#FFF9EF';
const editorialSerif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

export const OutdoorTheme = {
  colors: {
    cream: '#F7F4EC',
    paper: '#FFF9EF',
    forest: '#18442F',
    pine: '#0D2D20',
    gold: '#C69B42',
    goldText: '#745722',
    campfire: '#D9842F',
    sage: '#4B6B52',
    moss: '#4B6B52',
    charcoal: '#1E2A24',
    white: '#FFFFFF',
    danger: '#A13B2B',
    mist: '#DAD8CF',
    fog: '#DAD8CF',
    sand: '#A9A69A',
    stone: '#A9A69A',
    line: 'rgba(24,68,47,0.14)',
    lineSoft: 'rgba(30,42,36,0.08)',
    forestTint: 'rgba(24,68,47,0.09)',
    pineTint: 'rgba(13,45,32,0.10)',
    goldTint: 'rgba(198,155,66,0.14)',
    campfireTint: 'rgba(217,132,47,0.14)',
    paperTranslucent: 'rgba(255,249,239,0.82)',
    creamTranslucent: 'rgba(247,244,236,0.72)',
    onForest: '#FFF9EF',
    onForestMuted: 'rgba(255,249,239,0.74)',
    mutedText: 'rgba(30,42,36,0.66)',
    faintText: 'rgba(30,42,36,0.52)',
  },
  typography: {
    display: { fontFamily: editorialSerif, fontSize: 44, lineHeight: 52, fontWeight: '700' as const },
    h1: { fontFamily: editorialSerif, fontSize: 36, lineHeight: 43, fontWeight: '700' as const },
    h2: { fontFamily: editorialSerif, fontSize: 26, lineHeight: 32, fontWeight: '700' as const },
    h3: { fontFamily: editorialSerif, fontSize: 21, lineHeight: 27, fontWeight: '700' as const },
    body: { fontSize: 15, lineHeight: 22, fontWeight: '700' as const },
    small: { fontSize: 13, lineHeight: 19, fontWeight: '700' as const },
    label: {
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '900' as const,
      letterSpacing: 0.7,
      textTransform: 'uppercase' as const,
    },
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  radii: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    xxl: 30,
    pill: 999,
  },
  shadows: {
    card: {
      shadowColor: '#0D2D20',
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    },
    soft: {
      shadowColor: '#0D2D20',
      shadowOpacity: 0.07,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    button: {
      shadowColor: '#0D2D20',
      shadowOpacity: 0.16,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
  },
  cards: {
    paper: {
      backgroundColor: '#FFF9EF',
      borderColor: 'rgba(24,68,47,0.14)',
      borderWidth: 1,
      borderRadius: 24,
      shadowColor: '#0D2D20',
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    },
    section: {
      backgroundColor: 'rgba(255,249,239,0.82)',
      borderColor: 'rgba(24,68,47,0.12)',
      borderWidth: 1,
      borderRadius: 22,
    },
    forest: {
      backgroundColor: '#18442F',
      borderColor: 'rgba(255,249,239,0.14)',
      borderWidth: 1,
      borderRadius: 24,
      shadowColor: '#0D2D20',
      shadowOpacity: 0.18,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 3,
    },
    accent: {
      backgroundColor: 'rgba(198,155,66,0.14)',
      borderColor: 'rgba(198,155,66,0.26)',
      borderWidth: 1,
      borderRadius: 22,
    },
  },
  sections: {
    header: {
      marginBottom: 14,
    },
    title: {
      color: '#1E2A24',
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '900' as const,
    },
    eyebrow: {
      color: '#C69B42',
      fontSize: 11,
      lineHeight: 14,
      fontWeight: '900' as const,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
    },
  },
} as const;

export const Colors = {
  light: {
    text: OutdoorTheme.colors.charcoal,
    background: OutdoorTheme.colors.cream,
    tint: tintColorLight,
    icon: OutdoorTheme.colors.sage,
    tabIconDefault: OutdoorTheme.colors.sage,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: OutdoorTheme.colors.paper,
    background: OutdoorTheme.colors.pine,
    tint: tintColorDark,
    icon: 'rgba(255,249,239,0.72)',
    tabIconDefault: 'rgba(255,249,239,0.72)',
    tabIconSelected: tintColorDark,
  },
};

export const BrandColors = OutdoorTheme.colors;
export const Theme = OutdoorTheme;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
