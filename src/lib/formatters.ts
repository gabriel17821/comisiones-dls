/**
 * Format a number with thousands separators and two decimal places
 */
export const formatCurrency = (value: number): string => {
  return value.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

/**
 * Format a number with thousands separators (no decimals)
 */
export const formatNumber = (value: number): string => {
  return value.toLocaleString('en-US');
};

/**
 * Format input with thousands separators while typing
 */
export const formatInputNumber = (value: string): string => {
  // Remove all non-digits
  const numbers = value.replace(/\D/g, '');
  if (!numbers) return '';
  return parseInt(numbers, 10).toLocaleString('en-US');
};

/**
 * Parse formatted number back to number
 */
export const parseFormattedNumber = (value: string): number => {
  return parseInt(value.replace(/,/g, ''), 10) || 0;
};

/**
 * Parse a date string safely to avoid timezone issues.
 * Forces noon (12:00) to prevent day shifts when converting between timezones.
 */
export const parseDateSafe = (dateString: string): Date => {
  // If it's a date-only string (YYYY-MM-DD), parse as local time at noon
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  // For ISO strings or timestamps, parse and adjust to noon local
  const date = new Date(dateString);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
};

/**
 * Format a date for display in Spanish locale
 */
export const formatDateSafe = (dateString: string, formatStr: string = "d MMM yyyy"): string => {
  const date = parseDateSafe(dateString);
  // This will be handled by date-fns format function
  return dateString; // placeholder, actual formatting done by date-fns
};
