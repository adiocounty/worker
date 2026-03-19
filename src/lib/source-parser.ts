import type { RetailerCandidate } from '../types';

export function extractRetailersFromHtml(html: string, sourceUrl: string, sourceName: string): RetailerCandidate[] {
  const items: RetailerCandidate[] = [];

  for (const scriptPayload of extractJsonBlocks(html)) {
    items.push(...extractFromJson(scriptPayload, sourceUrl, sourceName));
  }

  if (items.length > 0) {
    return dedupeCandidates(items);
  }

  items.push(...extractFromDataAttributes(html, sourceUrl, sourceName));

  if (items.length > 0) {
    return dedupeCandidates(items);
  }

  items.push(...extractFromAddressBlocks(html, sourceUrl, sourceName));
  return dedupeCandidates(items);
}

function extractJsonBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  while ((match = re.exec(html)) !== null) {
    const body = match[1]?.trim();
    if (!body) continue;

    const candidates = findJsonCandidates(body);
    for (const candidate of candidates) {
      try {
        blocks.push(JSON.parse(candidate));
      } catch {
        // ignore non-JSON
      }
    }
  }

  return blocks;
}

function findJsonCandidates(body: string): string[] {
  const found: string[] = [];

  const directJson = body.match(/^\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*$/);
  if (directJson) found.push(directJson[1]);

  const assignmentRe = /(?:=|:)(\s*(\{[\s\S]*\}|\[[\s\S]*\]))\s*;?/g;
  let match: RegExpExecArray | null;
  while ((match = assignmentRe.exec(body)) !== null) {
    found.push(match[1].trim());
  }

  return found;
}

function extractFromJson(payload: unknown, sourceUrl: string, sourceName: string): RetailerCandidate[] {
  const out: RetailerCandidate[] = [];
  walk(payload, (node) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;

    const name = readString(obj, ['name', 'title', 'retailer_name', 'storeName', 'locationName']);
    const street = readString(obj, ['street', 'address', 'address1', 'streetAddress']);
    const city = readString(obj, ['city', 'addressLocality']);
    const state = readString(obj, ['state', 'addressRegion']);
    const postal = readString(obj, ['postal_code', 'postalCode', 'zip']);

    if (name && (street || city)) {
      out.push({
        retailer_name: name,
        address1: street,
        city,
        state: state || 'OR',
        postal_code: postal,
        has_video_lottery: inferFlag(obj, ['videoLottery', 'has_video_lottery']) || inferText(obj, 'video lottery'),
        has_video_poker: inferFlag(obj, ['videoPoker', 'has_video_poker']) || inferText(obj, 'video poker'),
        source_url: sourceUrl,
        source_name: sourceName,
        raw: obj
      });
    }
  });

  return out;
}

function extractFromDataAttributes(html: string, sourceUrl: string, sourceName: string): RetailerCandidate[] {
  const out: RetailerCandidate[] = [];
  const cardRe = /<[^>]+(?:data-(?:name|title)=['"][^'"]+['"][^>]*)+[^>]*>/gi;
  let match: RegExpExecArray | null;

  while ((match = cardRe.exec(html)) !== null) {
    const tag = match[0];
    const candidate: RetailerCandidate = {
      retailer_name: getAttr(tag, 'data-name') || getAttr(tag, 'data-title') || '',
      address1: getAttr(tag, 'data-address') || getAttr(tag, 'data-address1') || '',
      city: getAttr(tag, 'data-city') || '',
      state: getAttr(tag, 'data-state') || 'OR',
      postal_code: getAttr(tag, 'data-zip') || getAttr(tag, 'data-postal-code') || '',
      has_video_lottery: /video\s*lottery/i.test(tag),
      has_video_poker: /video\s*poker/i.test(tag),
      source_url: sourceUrl,
      source_name: sourceName,
      raw: tag
    };

    if (candidate.retailer_name) out.push(candidate);
  }

  return out;
}

function extractFromAddressBlocks(html: string, sourceUrl: string, sourceName: string): RetailerCandidate[] {
  const out: RetailerCandidate[] = [];
  const stripped = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r/g, '');

  const chunks = stripped.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const lines = chunk.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const cityStateZip = lines.find((line) => /,\s*[A-Z]{2}\s+\d{5}/.test(line));
    if (!cityStateZip) continue;

    const name = lines[0];
    const address1 = lines[1];
    const match = cityStateZip.match(/^(.*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
    if (!match) continue;

    out.push({
      retailer_name: name,
      address1,
      city: match[1],
      state: match[2],
      postal_code: match[3],
      has_video_lottery: /video\s*lottery/i.test(chunk),
      has_video_poker: /video\s*poker/i.test(chunk),
      source_url: sourceUrl,
      source_name: sourceName,
      raw: chunk
    });
  }

  return out;
}

function dedupeCandidates(items: RetailerCandidate[]): RetailerCandidate[] {
  const seen = new Set<string>();
  const out: RetailerCandidate[] = [];
  for (const item of items) {
    const key = [item.retailer_name, item.address1, item.city, item.postal_code]
      .map((v) => (v || '').toLowerCase().trim())
      .join('|');
    if (!item.retailer_name || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function readString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function inferFlag(obj: Record<string, unknown>, keys: string[]): boolean {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && /^(true|1|yes)$/i.test(value)) return true;
  }
  return false;
}

function inferText(obj: Record<string, unknown>, text: string): boolean {
  return JSON.stringify(obj).toLowerCase().includes(text.toLowerCase());
}

function getAttr(tag: string, attr: string): string | undefined {
  const match = tag.match(new RegExp(`${attr}=["']([^"']+)["']`, 'i'));
  return match?.[1];
}

function walk(node: unknown, visit: (value: unknown) => void): void {
  visit(node);
  if (Array.isArray(node)) {
    for (const item of node) walk(item, visit);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node as Record<string, unknown>)) {
      walk(value, visit);
    }
  }
}
