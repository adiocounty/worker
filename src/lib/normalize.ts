import type { RetailerCandidate } from '../types';

export function normalizeText(input?: string): string {
  return (input || '').trim().replace(/\s+/g, ' ');
}

export function normalizeName(input?: string): string {
  return normalizeText(input)
    .replace(/\s*[-–—]+\s*/g, ' - ')
    .replace(/\bmini mart\b/gi, 'Mini Mart');
}

export function normalizeAddress(input?: string): string {
  return normalizeText(input)
    .replace(/\bStreet\b/gi, 'St')
    .replace(/\bAvenue\b/gi, 'Ave')
    .replace(/\bRoad\b/gi, 'Rd')
    .replace(/\bBoulevard\b/gi, 'Blvd')
    .replace(/\bHighway\b/gi, 'Hwy');
}

export function normalizePostalCode(input?: string): string {
  const value = normalizeText(input);
  const match = value.match(/\b\d{5}(?:-\d{4})?\b/);
  return match?.[0] || value;
}

export function buildSourceKey(candidate: RetailerCandidate): string {
  const raw = [
    normalizeName(candidate.retailer_name).toLowerCase(),
    normalizeAddress(candidate.address1).toLowerCase(),
    normalizeText(candidate.city).toLowerCase(),
    normalizePostalCode(candidate.postal_code).toLowerCase(),
    normalizeText(candidate.state || 'OR').toLowerCase()
  ].join('|');

  return fnv1a(raw);
}

export function normalizeCandidate(candidate: RetailerCandidate): RetailerCandidate {
  return {
    retailer_name: normalizeName(candidate.retailer_name),
    address1: normalizeAddress(candidate.address1),
    city: normalizeText(candidate.city),
    state: normalizeText(candidate.state || 'OR') || 'OR',
    postal_code: normalizePostalCode(candidate.postal_code),
    has_video_lottery: Boolean(candidate.has_video_lottery),
    has_video_poker: Boolean(candidate.has_video_poker),
    source_url: candidate.source_url,
    source_name: candidate.source_name,
    raw: candidate.raw
  };
}

export function computeConfidence(candidate: RetailerCandidate): number {
  let score = 0.45;
  if (candidate.retailer_name) score += 0.15;
  if (candidate.address1) score += 0.15;
  if (candidate.city) score += 0.10;
  if (candidate.postal_code) score += 0.05;
  if (candidate.has_video_lottery) score += 0.07;
  if (candidate.has_video_poker) score += 0.03;
  return Math.min(1, score);
}

function fnv1a(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}
