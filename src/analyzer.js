import {
  CMS_MARKERS,
  DEFAULTS,
  PARKING_BODY_PATTERNS,
  PARKING_DOMAINS,
  PARKING_TITLE_PATTERNS
} from './constants.js';
import { getDomainFromUrl, truncateText } from './url-utils.js';

export function buildDefaultResult(url) {
  return {
    url,
    status: 'error',
    verdict: 'Error',
    httpCode: '-',
    redirectUrl: '',
    size: '0.0',
    title: '-',
    links: 0,
    complexity: 0,
    responseTime: 0,
    score: 0,
    cms: '',
    isEcommerce: false,
    isBlog: false,
    wordCount: 0,
    images: 0,
    navLinks: 0
  };
}

function countInternalLinks(anchors, baseUrl, domain) {
  const uniqueInternal = new Set();

  for (const anchor of anchors) {
    try {
      const resolved = new URL(anchor.href, baseUrl);
      if (resolved.hostname.replace(/^www\./i, '').includes(domain)) {
        uniqueInternal.add(resolved.toString());
      }
    } catch {
      continue;
    }
  }

  return uniqueInternal.size;
}

function detectSiteType(doc, html, url) {
  const title = (doc.title || '').trim();
  const bodyText = (doc.body?.innerText || doc.body?.textContent || '').toLowerCase().slice(0, 5000);
  const metaDesc = doc.querySelector('meta[name="description"]')?.content || '';
  const metaKeywords = doc.querySelector('meta[name="keywords"]')?.content || '';
  const canonicalUrl = doc.querySelector('link[rel="canonical"]')?.href || '';
  const domain = getDomainFromUrl(url);
  const htmlLower = html.toLowerCase();

  const scripts = doc.querySelectorAll('script[src]').length;
  const styles = doc.querySelectorAll('link[rel="stylesheet"]').length;
  const forms = doc.querySelectorAll('form').length;
  const images = doc.querySelectorAll('img').length;
  const iframes = doc.querySelectorAll('iframe').length;
  const allLinks = Array.from(doc.querySelectorAll('a[href]'));
  const totalLinks = allLinks.length;
  const navLinks = doc.querySelectorAll('nav a, header a, [role="navigation"] a').length;
  const buttons = doc.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').length;
  const paragraphs = doc.querySelectorAll('p').length;
  const headings = doc.querySelectorAll('h1, h2, h3').length;
  const articleEl = doc.querySelectorAll('article, .post, .entry, .blog-post').length;
  const productEl = doc.querySelectorAll('[class*="product"], [id*="product"], [class*="cart"], [id*="cart"], [class*="shop"]').length;
  const videoEl = doc.querySelectorAll('video, [class*="video"], iframe[src*="youtube"], iframe[src*="vimeo"]').length;
  const canonicalDomain = canonicalUrl ? getDomainFromUrl(canonicalUrl) : '';
  const wordCount = bodyText.trim().split(/\s+/).filter(Boolean).length;

  const internalLinks = allLinks.filter((a) => {
    try {
      return new URL(a.href, url).hostname.replace(/^www\./i, '').includes(domain);
    } catch {
      return false;
    }
  }).length;
  const externalLinks = totalLinks - internalLinks;

  let parkingScore = 0;
  if (PARKING_TITLE_PATTERNS.some((p) => p.test(title))) parkingScore += 40;
  parkingScore += PARKING_BODY_PATTERNS.filter((p) => p.test(bodyText)).length * 15;
  if (PARKING_DOMAINS.some((d) => canonicalDomain.includes(d))) parkingScore += 60;
  if (totalLinks > 0 && externalLinks / totalLinks > 0.8 && totalLinks < 20) parkingScore += 20;
  if (wordCount < 30 && paragraphs < 2 && headings < 2) parkingScore += 15;
  if (navLinks < 2 && totalLinks < 10 && scripts < 2) parkingScore += 10;
  if (PARKING_DOMAINS.some((d) => htmlLower.includes(d))) parkingScore += 30;
  if (/sponsored.{0,20}link/i.test(html) || /related.{0,20}link/i.test(html)) parkingScore += 25;

  const base = { wordCount, internalLinks, navLinks, images };

  if (parkingScore >= 40) return { verdict: 'Parked / For sale', status: 'danger', score: parkingScore, cms: '', isEcommerce: false, isBlog: false, ...base };

  const sizeKb = new Blob([html]).size / 1024;
  if (sizeKb < 1.5 && totalLinks < 3 && wordCount < 10) {
    return { verdict: 'Empty page', status: 'danger', score: 0, cms: '', isEcommerce: false, isBlog: false, ...base };
  }

  if (/access denied|403 forbidden|403 error|cloudflare.{0,80}security/i.test(title)
    || /access denied|403 forbidden|rate limit|captcha required/i.test(bodyText.slice(0, 500))) {
    return { verdict: 'Blocked / 403', status: 'error', score: 0, cms: '', isEcommerce: false, isBlog: false, wordCount: 0, internalLinks: 0, navLinks: 0, images: 0 };
  }

  if (/under construction|coming soon|website under/i.test(title)
    || (wordCount < 80 && /under construction|coming soon|launching soon|stay tuned/i.test(bodyText))) {
    return { verdict: 'Under construction', status: 'warning', score: 10, cms: '', isEcommerce: false, isBlog: false, ...base };
  }

  let realScore = 0;
  realScore += Math.min(paragraphs * 2, 20);
  realScore += Math.min(headings * 3, 15);
  realScore += Math.min(wordCount / 10, 30);
  realScore += Math.min(navLinks * 3, 15);
  realScore += Math.min(scripts * 2, 10);
  realScore += Math.min(styles * 3, 12);
  realScore += forms > 0 ? 8 : 0;
  realScore += buttons > 0 ? 5 : 0;
  realScore += images > 2 ? 8 : 0;
  realScore += iframes > 0 ? 3 : 0;
  if (metaDesc.length > 50) realScore += 10;
  if (metaKeywords.length > 10) realScore += 5;
  if (doc.querySelector('meta[property="og:title"]')) realScore += 8;
  if (doc.querySelector('meta[name="twitter:card"]')) realScore += 5;

  let detectedCMS = '';
  for (const [cms, pat] of Object.entries(CMS_MARKERS)) {
    if (pat.test(html)) {
      realScore += 20;
      detectedCMS = cms;
      break;
    }
  }

  const isEcommerce = productEl > 0 || /add to cart|buy now|checkout|add to bag/i.test(bodyText);
  if (isEcommerce) realScore += 15;

  const isBlog = articleEl > 0 || /blog|news|post|article/i.test(title);
  if (isBlog) realScore += 10;

  if (videoEl > 0) realScore += 8;
  if (internalLinks > 5) realScore += 15;
  else if (internalLinks > 2) realScore += 8;

  let verdict = '✗ Empty / Broken';
  let status = 'danger';

  if (realScore >= 70) {
    verdict = isEcommerce ? '✓ E-commerce store' : isBlog ? '✓ Blog / Media' : '✓ Full website';
    status = 'success';
  } else if (realScore >= 35) {
    verdict = isEcommerce ? '~ Store (light)' : '~ Landing / Business card';
    status = 'warning';
  } else if (realScore >= 15) {
    verdict = '~ Minimal landing';
    status = 'warning';
  }

  return {
    verdict,
    status,
    score: Math.round(realScore),
    cms: detectedCMS,
    isEcommerce,
    isBlog,
    wordCount,
    internalLinks,
    navLinks,
    images
  };
}

export async function analyzeSingleUrl(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULTS.timeoutMs;
  const titleMaxLength = options.titleMaxLength || DEFAULTS.titleMaxLength;
  const result = buildDefaultResult(url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const t0 = performance.now();

    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow'
    });

    clearTimeout(timeoutId);
    result.responseTime = Math.round(performance.now() - t0);
    result.httpCode = response.status;
    if (response.url && response.url !== url) result.redirectUrl = response.url;

    if (response.status === 404) {
      result.verdict = '✗ 404 Not found';
      result.status = 'danger';
      return result;
    }

    if (response.status === 401 || response.status === 403) {
      result.verdict = `✗ Access denied (${response.status})`;
      result.status = 'error';
      return result;
    }

    if (response.status >= 500) {
      result.verdict = `✗ Server error (${response.status})`;
      result.status = 'error';
      return result;
    }

    const html = await response.text();
    const sizeKb = new Blob([html]).size / 1024;
    result.size = sizeKb.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    result.title = truncateText(doc.title, titleMaxLength);

    const domain = getDomainFromUrl(url);
    const allAnchors = Array.from(doc.querySelectorAll('a[href]'));

    result.links = countInternalLinks(allAnchors, url, domain);
    result.complexity = doc.querySelectorAll('script[src]').length
      + doc.querySelectorAll('link[rel="stylesheet"]').length
      + doc.querySelectorAll('form').length;

    const detected = detectSiteType(doc, html, url);
    result.verdict = detected.verdict;
    result.status = detected.status;
    result.score = detected.score;
    result.cms = detected.cms || '';
    result.isEcommerce = Boolean(detected.isEcommerce);
    result.isBlog = Boolean(detected.isBlog);
    result.wordCount = detected.wordCount || 0;
    result.images = detected.images || doc.querySelectorAll('img').length;
    result.navLinks = detected.navLinks || 0;
  } catch (error) {
    result.responseTime = timeoutMs;
    if (error?.name === 'AbortError') {
      result.verdict = '⏱ Timeout';
    } else if (error?.message?.includes('Failed to fetch') || error?.message?.includes('net::')) {
      result.verdict = '✗ Unavailable / CORS';
    } else {
      result.verdict = '✗ Error';
    }
    result.status = 'error';
  }

  return result;
}
