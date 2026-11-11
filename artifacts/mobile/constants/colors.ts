/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    text: '#3E2A1A',
    tint: '#C9A24B',
    background: '#F5EFE6',
    foreground: '#3E2A1A',
    card: '#EFE5D8',
    cardForeground: '#3E2A1A',
    primary: '#C9A24B',
    primaryForeground: '#3E2A1A',
    secondary: '#E5DACB',
    secondaryForeground: '#3E2A1A',
    muted: '#EFE5D7',
    mutedForeground: '#8B7562',
    accent: '#E2C275',
    accentForeground: '#3E2A1A',
    destructive: '#A74737',
    destructiveForeground: '#FFF8EC',
    border: '#D9CCA9',
    input: '#D9CCA9',
    deep: '#3E2A1A',
    paper: '#F5EFE6',
    gold: '#C9A24B',
  },
  radius: 18,
};

export default colors;
