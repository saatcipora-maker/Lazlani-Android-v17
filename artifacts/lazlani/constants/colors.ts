export type ThemeName = 'aydinlik' | 'sage' | 'karanlik' | 'lazlani' | 'dream' | 'samsun' | 'midnight' | 'kristal';

export interface ThemePalette {
  text: string;
  tint: string;
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  success: string;
  warning: string;
  tabBar: string;
  radius: number;
  /** true for dark-background themes; false for light-background themes */
  isDark: boolean;
}

const BASE = {
  destructive: '#EF4444',
  destructiveForeground: '#FFFFFF',
  success: '#22C55E',
  warning: '#F59E0B',
  radius: 16,
};

export const THEMES: Record<ThemeName, ThemePalette> = {
  aydinlik: {
    ...BASE,
    isDark: false,
    text: '#0D0B24',
    tint: '#7C3AED',
    background: '#F5F3FF',
    foreground: '#0D0B24',
    card: '#FFFFFF',
    cardForeground: '#0D0B24',
    primary: '#7C3AED',
    primaryForeground: '#FFFFFF',
    secondary: '#EDE9FE',
    secondaryForeground: '#4C1D95',
    muted: '#F3F0FF',
    // Fixed: was #6B7280 (low contrast on light purple bg), now darker
    mutedForeground: '#5B5674',
    accent: '#EC4899',
    accentForeground: '#FFFFFF',
    border: '#D9D3F0',
    input: '#F0ECFF',
    tabBar: '#FFFFFF',
  },
  sage: {
    ...BASE,
    isDark: true,
    text: '#E8F0E8',
    tint: '#7EC87E',
    background: '#2D3B2D',
    foreground: '#E8F0E8',
    card: '#3A4A3A',
    cardForeground: '#E8F0E8',
    primary: '#7EC87E',
    primaryForeground: '#0D1F0D',
    secondary: '#445444',
    secondaryForeground: '#B4D4B4',
    muted: '#3A4A3A',
    mutedForeground: '#8AAA8A',
    accent: '#A3D977',
    accentForeground: '#0D1F0D',
    border: '#4E6A4E',
    input: '#3A4A3A',
    tabBar: '#1E2B1E',
  },
  karanlik: {
    ...BASE,
    isDark: true,
    text: '#F0EBFF',
    tint: '#9B59F5',
    background: '#5C4E8A',
    foreground: '#F0EBFF',
    card: '#3D3468',
    cardForeground: '#F0EBFF',
    primary: '#9B59F5',
    primaryForeground: '#FFFFFF',
    secondary: '#4A3F70',
    secondaryForeground: '#C8B8FF',
    muted: '#3D3468',
    mutedForeground: '#C8BEEE',
    accent: '#EC4899',
    accentForeground: '#FFFFFF',
    border: '#6A5BAA',
    input: '#3D3468',
    tabBar: '#15122E',
  },
  lazlani: {
    ...BASE,
    isDark: true,
    text: '#E8FFE8',
    tint: '#22C55E',
    background: '#1A2E1A',
    foreground: '#E8FFE8',
    card: '#243524',
    cardForeground: '#E8FFE8',
    primary: '#22C55E',
    primaryForeground: '#0A1A0A',
    secondary: '#1E3D1E',
    secondaryForeground: '#86EFAC',
    muted: '#243524',
    mutedForeground: '#7DC87D',
    accent: '#4ADE80',
    accentForeground: '#0A1A0A',
    border: '#2E5C2E',
    input: '#1E3D1E',
    tabBar: '#0F1F0F',
  },
  dream: {
    ...BASE,
    isDark: true,
    text: '#F5E8FF',
    tint: '#D97EF5',
    background: '#2D1B3D',
    foreground: '#F5E8FF',
    card: '#3D2552',
    cardForeground: '#F5E8FF',
    primary: '#D97EF5',
    primaryForeground: '#1A0D26',
    secondary: '#4A2E60',
    secondaryForeground: '#E8C4FF',
    muted: '#3D2552',
    mutedForeground: '#C8A0DD',
    accent: '#F472B6',
    accentForeground: '#1A0D26',
    border: '#5A3575',
    input: '#3D2552',
    tabBar: '#1A0D26',
  },
  samsun: {
    ...BASE,
    isDark: true,
    text: '#E8F4FF',
    tint: '#0EA5E9',
    background: '#0D2137',
    foreground: '#E8F4FF',
    card: '#132C47',
    cardForeground: '#E8F4FF',
    primary: '#0EA5E9',
    primaryForeground: '#FFFFFF',
    secondary: '#1A3A55',
    secondaryForeground: '#7DD3FC',
    muted: '#132C47',
    // Fixed: improved contrast on dark navy
    mutedForeground: '#7AB8D8',
    accent: '#38BDF8',
    accentForeground: '#061525',
    border: '#1E4060',
    input: '#132C47',
    tabBar: '#061525',
  },
  midnight: {
    ...BASE,
    isDark: true,
    text: '#F0F0F0',
    tint: '#3B82F6',
    background: '#000000',
    foreground: '#F0F0F0',
    card: '#0A0A0A',
    cardForeground: '#F0F0F0',
    primary: '#3B82F6',
    primaryForeground: '#FFFFFF',
    secondary: '#111111',
    secondaryForeground: '#93C5FD',
    muted: '#0A0A0A',
    // Fixed: was #6B7280 (too dark on black bg), now much lighter
    mutedForeground: '#9CA3AF',
    accent: '#60A5FA',
    accentForeground: '#FFFFFF',
    border: '#1F1F1F',
    input: '#111111',
    tabBar: '#000000',
  },
  kristal: {
    ...BASE,
    isDark: false,
    text: '#1E1B2E',
    tint: '#7C6CF0',
    background: '#F7F4F0',
    foreground: '#1E1B2E',
    card: '#FFFFFF',
    cardForeground: '#1E1B2E',
    primary: '#7C6CF0',
    primaryForeground: '#FFFFFF',
    secondary: '#EDE8FA',
    secondaryForeground: '#4A3F80',
    muted: '#F0EBF8',
    mutedForeground: '#7A7295',
    accent: '#C4B5FD',
    accentForeground: '#1E1B2E',
    border: '#E4DCEF',
    input: '#EDE8FA',
    tabBar: '#FDFBFF',
  },
};

export const THEME_META: Record<ThemeName, { label: string; swatch: string[] }> = {
  aydinlik:  { label: 'Aydınlık',       swatch: ['#F5F3FF', '#7C3AED'] },
  sage:      { label: 'Sage',           swatch: ['#2D3B2D', '#7EC87E'] },
  karanlik:  { label: 'Karanlık',       swatch: ['#5C4E8A', '#9B59F5'] },
  lazlani:   { label: 'Lazlani',        swatch: ['#1A2E1A', '#22C55E'] },
  dream:     { label: 'Dream',          swatch: ['#2D1B3D', '#D97EF5'] },
  samsun:    { label: 'Samsun',         swatch: ['#0D2137', '#0EA5E9'] },
  midnight:  { label: 'Midnight',       swatch: ['#000000', '#3B82F6'] },
  kristal:   { label: 'Kristal Saten',  swatch: ['#F7F4F0', '#7C6CF0'] },
};

export const THEME_ORDER: ThemeName[] = ['aydinlik', 'sage', 'karanlik', 'lazlani', 'dream', 'samsun', 'midnight', 'kristal'];

// Legacy default export kept for any stray imports
const colors = {
  dark: THEMES.karanlik,
  light: THEMES.aydinlik,
  radius: 16,
};
export default colors;
