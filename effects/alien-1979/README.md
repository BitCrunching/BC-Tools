# Alien 1979 mode (parked, not wired into the site)

Retro "MU/TH/UR 6000" terminal look from the old `dev_easter` branch (commits d9280ac, 5584369, f55606b), unlocked by accepting every cookie category and shown on desktop only.

- `alien.css`: all `html.alien-1979-mode` overrides (green-on-black terminals, cookie banner, cards).
- `alien.js`: toggling the class, forced dark theme, title and hero text swap, unlock flags in localStorage (`bc-alien-1979-mode`).

Both files are copied unchanged from the September single-page site. They expect old pieces (mission log card, `bc:anomaly-unlock` event, Starship launch card) that no longer exist, so they need porting before use.
