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
    text: '#F6F8F5',
    tint: '#72D39B',
    background: '#070907',
    foreground: '#F6F8F5',
    card: '#111612',
    cardForeground: '#F6F8F5',
    primary: '#70D49A',
    primaryForeground: '#071009',
    secondary: '#171D19',
    secondaryForeground: '#D8E2DB',
    muted: '#161B18',
    mutedForeground: '#89958E',
    accent: '#22332A',
    accentForeground: '#BFE8CE',
    destructive: '#CE756D',
    destructiveForeground: '#190B0A',
    border: '#29332D',
    input: '#26322B',
    emerald: '#73D39B',
    gold: '#D6B36B',
    tableBlack: '#111615',
    tableGreen: '#0B2920',
    tableBlue: '#0B1C2D',
    tableBurgundy: '#2C111B',
    tablePurple: '#21152E',
  },
  dark: {
    text: '#F6F8F5',
    tint: '#72D39B',
    background: '#070907',
    foreground: '#F6F8F5',
    card: '#111612',
    cardForeground: '#F6F8F5',
    primary: '#70D49A',
    primaryForeground: '#071009',
    secondary: '#171D19',
    secondaryForeground: '#D8E2DB',
    muted: '#161B18',
    mutedForeground: '#89958E',
    accent: '#22332A',
    accentForeground: '#BFE8CE',
    destructive: '#CE756D',
    destructiveForeground: '#190B0A',
    border: '#29332D',
    input: '#26322B',
    emerald: '#73D39B',
    gold: '#D6B36B',
    tableBlack: '#111615',
    tableGreen: '#0B2920',
    tableBlue: '#0B1C2D',
    tableBurgundy: '#2C111B',
    tablePurple: '#21152E',
  },
  radius: 18,
};

export default colors;
