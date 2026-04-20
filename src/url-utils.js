export function normalizeUrl(rawUrl) {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeInputUrls(rawText) {
  const unique = new Set();
  const invalid = [];

  for (const line of String(rawText || '').split('\n')) {
    const normalized = normalizeUrl(line);
    if (!normalized) {
      if (line.trim()) invalid.push(line.trim());
      continue;
    }
    unique.add(normalized);
  }

  return {
    validUrls: [...unique],
    invalidUrls: invalid
  };
}

export function getDomainFromUrl(inputUrl) {
  try {
    return new URL(inputUrl).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

export function truncateText(text, maxLength) {
  const safe = String(text || '').trim();
  if (!safe) return 'No title';
  return safe.length > maxLength ? `${safe.slice(0, maxLength)}…` : safe;
}
