/**
 * Store for persisting manual product/client matches
 * Saves to localStorage so matches are remembered across sessions
 */

const PRODUCT_MATCHES_KEY = 'csv_product_matches';
const CLIENT_MATCHES_KEY = 'csv_client_matches';

export interface ManualMatch {
  csvName: string;      // Name from CSV (normalized)
  matchedId: string;    // ID of matched product/client
  matchedName: string;  // Name of matched product/client
}

function normalizeForStorage(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Product matches
export function getProductMatches(): Record<string, ManualMatch> {
  try {
    const stored = localStorage.getItem(PRODUCT_MATCHES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveProductMatch(csvName: string, productId: string, productName: string): void {
  const matches = getProductMatches();
  const key = normalizeForStorage(csvName);
  matches[key] = { csvName: key, matchedId: productId, matchedName: productName };
  localStorage.setItem(PRODUCT_MATCHES_KEY, JSON.stringify(matches));
}

export function findSavedProductMatch(csvName: string): ManualMatch | undefined {
  const key = normalizeForStorage(csvName);
  const matches = getProductMatches();
  return matches[key];
}

export function clearProductMatches(): void {
  localStorage.removeItem(PRODUCT_MATCHES_KEY);
}

// Client matches
export function getClientMatches(): Record<string, ManualMatch> {
  try {
    const stored = localStorage.getItem(CLIENT_MATCHES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveClientMatch(csvName: string, clientId: string, clientName: string): void {
  const matches = getClientMatches();
  const key = normalizeForStorage(csvName);
  matches[key] = { csvName: key, matchedId: clientId, matchedName: clientName.toUpperCase() };
  localStorage.setItem(CLIENT_MATCHES_KEY, JSON.stringify(matches));
}

export function findSavedClientMatch(csvName: string): ManualMatch | undefined {
  const key = normalizeForStorage(csvName);
  const matches = getClientMatches();
  return matches[key];
}

export function clearClientMatches(): void {
  localStorage.removeItem(CLIENT_MATCHES_KEY);
}
