/**
 * Today and offsets as YYYY-MM-DD, for form defaults.
 *
 * Hoisted out of component initializers: a `Date.now()` written inline in a
 * lazy useState reads as an impure render to the React compiler, and the same
 * two lines were pasted into every document form anyway.
 */
export const todayIso = () => new Date().toISOString().split('T')[0];

export const plusDaysIso = (days) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
