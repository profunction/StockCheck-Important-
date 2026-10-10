# The public website

The homepage (`web/index.html`) and the five product pages
(`web/products/<slug>/`), served at the site root. Plain HTML, CSS and JS,
no build step for the homepage. Design and first version: the
`bryann2kpro/suxin-website` repository, brought in here and wired to the
apps (sign-in, trial, Android download, WhatsApp, pricing).

- `web/assets/site.css`: the layout system (dark by default, light via the sun/moon button)
- `web/assets/suxin.css`: SuXin additions (pricing, WhatsApp, header fit)
- `web/assets/site.js`: menus, tabs, theme, language, links (`LINKS` at the top)
- `web/assets/i18n.js`: English source text -> [中文, Bahasa Melayu]; new text needs a line here
- `web/assets/theme.js`: applies the saved theme before the page draws; also loaded by every app

After changing the header, drawer or footer in `web/index.html`, rebuild the
product pages (Python 3.12 or newer):

    python3.12 site/www/build_products.py

`node site/build.mjs` writes the 404 page, sitemap.xml, robots.txt and llms.txt.
