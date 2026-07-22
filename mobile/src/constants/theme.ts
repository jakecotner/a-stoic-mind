/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Earthy register shared with the web app (frontend/src/App.css): parchment
// and umber rather than white and black — dark mode is a lamplit study, not
// an OLED void. Keep the two palettes in sync when either changes.
export const Colors = {
  light: {
    text: '#26241f', // --ink
    background: '#f6f2ea', // --bg
    backgroundElement: '#fdfbf6', // --card
    backgroundSelected: '#ece5d6', // --msg-user-bg
    textSecondary: '#5c574c', // --ink-soft
    gold: '#a4762f', // --gold (links, accents)
  },
  dark: {
    text: '#e7dfcf',
    background: '#211e18',
    backgroundElement: '#2a2620',
    backgroundSelected: '#383226',
    textSecondary: '#a69c86',
    gold: '#c79c55',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
