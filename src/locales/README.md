# Locale files

`en.json` is the source of truth — every key the app can render, in English.

`ha.json`, `ig.json`, `yo.json`, `pcm.json` are **intentionally empty (`{}`)**
right now. This is not a bug: `useTranslation().t()` falls back to the
English string for any key missing from the active locale's dictionary. That
means:

- The language selector (settings, and later signup) can ship and be fully
  functional before a single word is translated.
- Selecting Hausa/Igbo/Yoruba/Pidgin today will look identical to English —
  expected, not broken.
- Translations can be dropped into these files incrementally, one key or one
  screen at a time, with no code changes and no deploy risk — a partially
  translated file is a safe, normal intermediate state.

See `spup-translation-handoff.csv` (sent to Amy separately, not committed
here) for the key → English → translation sheet used to source these.

When adding a new user-facing string anywhere in the app: add the key to
`en.json` first, then reference it via `t('your.key')`. Don't hardcode new
UI text as a raw string in a component that's already using `t()` elsewhere
in the same file — it'll silently never be translated.
