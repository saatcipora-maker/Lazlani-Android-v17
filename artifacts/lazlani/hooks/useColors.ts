import { useTheme } from '@/context/ThemeContext';

/**
 * Returns the active theme palette plus computed helpers.
 *
 * All existing `const colors = useColors()` callsites continue to work;
 * they now also get two extra helpers:
 *
 *   colors.isDark      — true when the theme has a dark background
 *   colors.onColor(bg) — returns '#FFFFFF' or '#1A1A2E' for the best
 *                        readable text color on any hex background
 */
export function useColors() {
  const { colors } = useTheme();

  /**
   * Given any 6-digit hex background colour (#rrggbb), returns the
   * most readable foreground colour (white or near-black).
   * Falls back to '#FFFFFF' for malformed input.
   */
  const onColor = (bgHex: string): string => {
    if (!bgHex || bgHex.length < 7) return '#FFFFFF';
    const r = parseInt(bgHex.slice(1, 3), 16);
    const g = parseInt(bgHex.slice(3, 5), 16);
    const b = parseInt(bgHex.slice(5, 7), 16);
    // Relative luminance (perceived brightness)
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? '#1A1A2E' : '#FFFFFF';
  };

  return { ...colors, onColor };
}
