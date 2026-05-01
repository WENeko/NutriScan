// src/lib/timezoneUtils.ts
// Outils pour gestion UTC <-> local (utilisateur)

/**
 * Convertit une date ISO UTC vers une chaîne lisible en heure locale
 * @param utcIso date UTC (string) type: '2024-04-17T10:20:30.000Z'
 * @param locale locale facultative (par défaut browser)
 */
export function utcToLocalDisplay(utcIso: string, locale?: string) {
  const date = new Date(utcIso);
  return date.toLocaleString(locale || undefined, { timeZoneName: 'short' });
}

/**
 * Convertit une date heure locale JS vers ISO UTC
 * @param date Date ou string locale (type '2024-04-17T12:20:30')
 */
export function localToUtcIso(date: Date | string) {
  if (!date) return undefined;
  const jsDate = typeof date === 'string' ? new Date(date) : date;
  return new Date(jsDate.getTime() - jsDate.getTimezoneOffset() * 60000).toISOString();
}

/**
 * Renvoie la timezone navigateur (IANA)
 * @returns ex: 'Europe/Paris'
 */
export function getUserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}