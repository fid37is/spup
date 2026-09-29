// Client-safe constants for the logged-out language choice.
// Logged-in users' language lives in users.language_preference (see (main)/layout.tsx);
// this cookie only covers the (auth) screens, where there is no profile yet.
export const LOCALE_COOKIE = 'spup_locale'
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year
