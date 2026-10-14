# JSOX brand files

- `suxin-mark.svg` — the app icon: the J drawn as a line joining two nodes.
- `suxin-wordmark.svg` — JSOX in the same strokes; letters use `currentColor`,
  so it follows the text colour on light and dark backgrounds.
- Product icons share the mark, each on its own colour:
  JSOX POS `#0B1B2B` (ink) · JSOX WMS `#12385A` (harbour blue) ·
  JSOX Barcode Scan `#0F4C4A` (deep teal) · node accent `#2DD4BF` / `#14B8A6`.

The name is set in one place for code: `web/js/brand.js`. Screen texts in
the three languages name the products directly (JSOX POS, JSOX Barcode Scan,
JSOX WMS, JSOX Every Data); a rename is a find-and-replace in the string
files (`web/js/i18n.js`, `web/wh/strings.js`, `web/js/strings-pro.js`,
`web/js/guides.js`, `app/src/main/res/values*/strings.xml`).
