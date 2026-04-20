export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function clearSortArrows() {
  document.querySelectorAll('.sort-arrow').forEach((element) => element.remove());
}

export function createQueuedRow(url) {
  const safeUrl = escapeHtml(url);
  const tr = document.createElement('tr');
  tr.dataset.url = url;
  tr.innerHTML = `
    <td style="color:#94a3b8;font-size:10px;text-align:center">—</td>
    <td style="color:#94a3b8;font-size:10px;text-align:center">—</td>
    <td class="url-col" title="${safeUrl}"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl.replace(/^https?:\/\//, '')}</a></td>
    <td colspan="10" style="color:#94a3b8;font-style:italic;font-size:11px;">Queued...</td>
  `;
  return tr;
}

function metricCell(value, threshold = 1) {
  const isNumber = typeof value === 'number';
  const cls = isNumber && value >= threshold ? 'highlight' : isNumber && value === 0 ? 'zero' : '';
  return `<td class="metric-cell ${cls}">${value ?? '—'}</td>`;
}

function scoreClass(score) {
  if (score >= 70) return 'score-high';
  if (score >= 35) return 'score-med';
  if (score > 0) return 'score-low';
  return 'score-zero';
}

function httpClass(httpCode) {
  const code = Number.parseInt(httpCode, 10);
  if (Number.isNaN(code)) return 'http-none';
  if (code >= 500) return 'http-err';
  if (code >= 400) return 'http-warn';
  return 'http-ok';
}

function responseTimeClass(responseTime) {
  if (!responseTime) return 'rt-none';
  if (responseTime > 3000) return 'rt-slow';
  if (responseTime > 1200) return 'rt-med';
  return 'rt-fast';
}

export function renderStats(statsBarElement, resultsData) {
  const summary = resultsData.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  statsBarElement.innerHTML = `
    <span class="stat-badge suc">✓ Full websites: ${summary.success || 0}</span>
    <span class="stat-badge wrn">~ Landing pages: ${summary.warning || 0}</span>
    <span class="stat-badge dng">✗ Parked/Empty: ${summary.danger || 0}</span>
    <span class="stat-badge err">⚠ Errors: ${summary.error || 0}</span>
  `;

  statsBarElement.style.display = 'flex';
}

export function renderResultRow(tr, data, options = {}) {
  const shortUrl = data.url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const safeUrl = escapeHtml(data.url);
  const safeShortUrl = escapeHtml(shortUrl);
  const safeTitle = escapeHtml(data.title || '—');
  const safeVerdict = escapeHtml(data.verdict || '—');
  const safeRedirect = escapeHtml(data.redirectUrl || '');

  const badgeClassMap = {
    success: 'badge-success',
    warning: 'badge-warning',
    danger: 'badge-danger',
    error: 'badge-error'
  };

  const cmsCssMap = {
    WordPress: 'cms-wp',
    Shopify: 'cms-shop',
    Wix: 'cms-wix',
    Tilda: 'cms-tilda',
    React: 'cms-react',
    Vue: 'cms-vue',
    Angular: 'cms-react',
    Bitrix: 'cms-bitrix',
    Webflow: 'cms-other',
    Drupal: 'cms-other',
    Joomla: 'cms-other',
    Squarespace: 'cms-other',
    PrestaShop: 'cms-shop',
    Magento: 'cms-shop',
    OpenCart: 'cms-shop',
    Bootstrap: 'cms-other'
  };

  const tags = [];
  if (data.cms) tags.push(`<span class="cms-tag ${cmsCssMap[data.cms] || 'cms-other'}">${escapeHtml(data.cms)}</span>`);
  if (data.isEcommerce && !['Shopify', 'Magento', 'PrestaShop', 'OpenCart'].includes(data.cms)) tags.push('<span class="cms-tag cms-ecom">eCommerce</span>');
  if (data.isBlog && !data.cms) tags.push('<span class="cms-tag cms-blog">Blog/Media</span>');
  const cmsHtml = tags.length ? tags.join(' ') : '<span class="cms-empty">—</span>';

  const redirectHtml = safeRedirect
    ? `<a class="redir-badge" href="${safeRedirect}" target="_blank" rel="noopener noreferrer" title="${safeRedirect}">↪ redirect</a>`
    : '';

  const responseTimeHtml = data.responseTime > 0
    ? `<span class="rt-chip ${responseTimeClass(data.responseTime)}">${data.responseTime} ms</span>`
    : '<span class="rt-chip rt-none">—</span>';

  tr.className = `row-${data.status}`;
  tr.dataset.status = data.status;
  tr.dataset.title = (data.title || '').toLowerCase();
  tr.dataset.url2 = data.url.toLowerCase();

  tr.innerHTML = `
    <td style="text-align:center;padding:8px 6px;"><span class="http-chip ${httpClass(data.httpCode)}">${escapeHtml(data.httpCode)}</span></td>
    <td style="text-align:center;padding:8px 6px;">${responseTimeHtml}</td>
    <td class="url-col" title="${safeUrl}">
      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeShortUrl}</a>
      ${redirectHtml}
    </td>
    <td class="metric-cell">${escapeHtml(data.size)}</td>
    <td class="title-cell" title="${safeTitle}">${safeTitle}</td>
    ${metricCell(data.links, 3)}
    ${metricCell(data.complexity, 3)}
    ${metricCell(data.wordCount, 100)}
    ${metricCell(data.images, 2)}
    ${metricCell(data.navLinks, 3)}
    <td>${cmsHtml}</td>
    <td><span class="badge ${badgeClassMap[data.status] || 'badge-error'}">${safeVerdict}</span></td>
    <td style="text-align:center"><span class="score-chip ${scoreClass(data.score)}">${data.score || '—'}</span></td>
  `;

  tr.title = 'Double-click to recheck';
  if (typeof options.onRecheck === 'function') {
    tr.ondblclick = () => options.onRecheck(tr, data.url);
  }
}
