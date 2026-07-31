/** PostCSS: Tailwind v4 first, then down-level for old Android WebViews.
 *
 * Tailwind v4 wraps utilities in `@layer` and emits `oklch()` / `color-mix()`.
 * WebViews older than Chrome ~99 ignore entire `@layer { … }` blocks, so the
 * lobby renders as unstyled HTML (white buttons, missing cards). These
 * plugins flatten layers and convert modern color functions to hex/rgba.
 */
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-preset-env": {
      browsers: [
        "chrome >= 55",
        "android >= 5",
        "samsung >= 6",
        "ios_saf >= 11",
      ],
      stage: 2,
      autoprefixer: true,
      features: {
        "cascade-layers": true,
        "oklab-function": { preserve: false },
        "color-mix": { preserve: false },
        "relative-color-syntax": { preserve: false },
        "hex-alpha-notation": { preserve: false },
        "aspect-ratio-property": true,
        "media-query-ranges": true,
        "nesting-rules": false,
        "is-pseudo-class": true,
        "has-pseudo-class": false,
      },
    },
  },
};

export default config;
