/**
 * Shared tokens, taken from the Studio palette in packages/renderer/src/render-studio.ts so the
 * app and the web workspace read as one product rather than two.
 */
export const theme = {
  ink: "#171717",
  muted: "#6d6a64",
  paper: "#f1efe9",
  card: "#ffffff",
  line: "#ddd8cf",
  soft: "#f8f6f1",
  accent: "#fe5b3a",
  success: "#247747",
  danger: "#a8321f",
  radius: 18,
  space: { xs: 6, sm: 10, md: 16, lg: 24, xl: 32 },
} as const;
