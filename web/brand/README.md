# NEXO brand files

- `nexo-mark.svg` — the app icon: the N drawn as a line joining two nodes.
- `nexo-wordmark.svg` — NEXO in the same strokes; letters use `currentColor`,
  so it follows the text colour on light and dark backgrounds.
- Product icons share the mark, each on its own colour:
  NEXO POS `#0B1B2B` (ink) · NEXO Warehouse `#12385A` (harbour blue) ·
  NEXO Count `#0F4C4A` (deep teal) · node accent `#2DD4BF` / `#14B8A6`.

The name is set in one place for code: `web/js/brand.js`. Screen texts in
the three languages name the products directly (NEXO POS, NEXO Count,
NEXO Warehouse, NEXO Cloud); a rename is a find-and-replace in the string
files (`web/js/i18n.js`, `web/wh/strings.js`, `web/js/strings-pro.js`,
`web/js/guides.js`, `app/src/main/res/values*/strings.xml`).
