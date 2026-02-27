/**
 * Shared utilities for numeric input handling.
 * - Accepts both . and , as decimal separators
 * - Auto-clears zero on focus
 * - Displays with comma separator
 */

/** Normalize a user-typed numeric string (replace , with . for parsing) */
export const normalizeNumeric = (value: string): string => {
  return value.replace(/,/g, ".");
};

/** Parse a numeric input string, accepting both , and . */
export const parseNumericInput = (value: string): number => {
  const normalized = normalizeNumeric(value);
  const parsed = parseFloat(normalized);
  return isNaN(parsed) ? 0 : parsed;
};

/** Format a number for display (comma as decimal separator) */
export const formatNumericDisplay = (value: number | string): string => {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  // Use French locale formatting (comma separator)
  return num.toString().replace(".", ",");
};

/** onFocus handler: select all text so typing replaces the zero */
export const handleNumericFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  if (e.target.value === "0" || e.target.value === "0,0" || e.target.value === "0.0") {
    e.target.select();
  }
};

/** Get local datetime string for datetime-local inputs (YYYY-MM-DDTHH:MM) */
export const getLocalDateTimeString = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
};

/** Convert a local datetime-local string to a proper ISO timestamp preserving local time intent */
export const localDateTimeToISO = (localStr: string): string => {
  if (!localStr) return new Date().toISOString();
  // datetime-local gives us "YYYY-MM-DDTHH:MM" which new Date() parses as local
  const d = new Date(localStr);
  return d.toISOString();
};
