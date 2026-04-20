document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn   = document.getElementById('analyzeBtn');
  const exportBtn    = document.getElementById('exportBtn');
  const input        = document.getElementById('linksInput');
  const tbody        = document.getElementById('resultsTable').querySelector('tbody');
  const progressBar  = document.getElementById('progressBar');
  const progressBox  = document.getElementById('progressBox');
  const statsBar     = document.getElementById('statsBar');
  const searchInput  = document.getElementById('searchInput');
  const filterSelect = document.getElementById('filterSelect');

  const themeToggle  = document.getElementById('themeToggle');
  const savedTheme = localStorage.getItem('siteAnalyzerTheme') || 'light';
  document.body.dataset.theme = savedTheme;

  function updateThemeToggle(theme) {
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
    themeToggle.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    themeToggle.setAttribute('aria-label', themeToggle.title);
  }

  updateThemeToggle(savedTheme);
  themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = nextTheme;
    localStorage.setItem('siteAnalyzerTheme', nextTheme);
    updateThemeToggle(nextTheme);
  });

  let resultsData = [];
  let sortCol = null;
  let sortAsc = true;
  const CONCURRENCY_LIMIT = 5;
  const TIMEOUT_MS = 15000;

  // ─── PARKING SIGNALS ──────────────────────────────────────────────────────
  const PARKING_TITLE_PATTERNS = [
    /parking/i, /domain for sale/i, /buy this domain/i, /domain sale/i,
    /this domain/i, /under construction/i, /coming soon/i, /website coming/i,
    /parked domain/i, /sedoparking/i, /hugedomains/i, /afternic/i, /dan\.com/i,
    /namejet/i, /sedo\.com/i, /domain available/i, /this web page is parked/i,
    /this domain may be for sale/i
  ];
  const PARKING_BODY_PATTERNS = [
    /domain for sale/i, /buy this domain/i, /hugedomains\.com/i,
    /sedoparking\.com/i, /afternic\.com/i, /dan\.com/i, /parking/i,
    /this domain is parked/i, /domain may be for sale/i,
    /related links/i, /sponsored links/i, /this web page is parked/i,
    /click here to buy now/i, /make an offer/i
  ];
  const PARKING_DOMAINS = [
    'sedoparking.com','hugedomains.com','afternic.com','dan.com','namejet.com',
    'sedo.com','godaddy.com','namecheap.com','uniregistry.com','bodis.com',
    'parkingcrew.com','above.com','buydomains.com','squadhelp.com','undeveloped.com',
    'efty.com','flippa.com','brandpa.com','domainagents.com','domcop.com',
    'domainnamesoup.com','parked.com','parklogic.com','skenzo.com'
  ];

  // ─── SITE TYPE DETECTION ──────────────────────────────────────────────────
  function detectSiteType(doc, html, url) {
    const title        = (doc.title || '').trim();
    const bodyText     = (doc.body?.innerText || doc.body?.textContent || '').toLowerCase().slice(0, 5000);
    const metaDesc     = doc.querySelector('meta[name="description"]')?.content || '';
    const metaKeywords = doc.querySelector('meta[name="keywords"]')?.content || '';
    const canonicalUrl = doc.querySelector('link[rel="canonical"]')?.href || '';
    const domain       = new URL(url).hostname.replace('www.', '');
    const htmlLower    = html.toLowerCase();

    const scripts    = doc.querySelectorAll('script[src]').length;
    const styles     = doc.querySelectorAll('link[rel="stylesheet"]').length;
    const forms      = doc.querySelectorAll('form').length;
    const images     = doc.querySelectorAll('img').length;
    const iframes    = doc.querySelectorAll('iframe').length;
    const allLinks   = Array.from(doc.querySelectorAll('a[href]'));
    const totalLinks = allLinks.length;
    const navLinks   = doc.querySelectorAll('nav a, header a, [role="navigation"] a').length;
    const buttons    = doc.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]').length;
    const paragraphs = doc.querySelectorAll('p').length;
    const headings   = doc.querySelectorAll('h1, h2, h3').length;
    const articleEl  = doc.querySelectorAll('article, .post, .entry, .blog-post').length;
    const productEl  = doc.querySelectorAll('[class*="product"], [id*="product"], [class*="cart"], [id*="cart"], [class*="shop"]').length;
    const videoEl    = doc.querySelectorAll('video, [class*="video"], iframe[src*="youtube"], iframe[src*="vimeo"]').length;
    const canonicalDomain = canonicalUrl ? (() => { try { return new URL(canonicalUrl).hostname.replace('www.',''); } catch { return ''; } })() : '';
    const wordCount  = bodyText.trim().split(/\s+/).filter(Boolean).length;

    const internalLinks = allLinks.filter(a => {
      try { return new URL(a.href, url).hostname.replace('www.','').includes(domain); } catch { return false; }
    }).length;
    const externalLinks = totalLinks - internalLinks;

    // PARKING
    let parkingScore = 0;
    if (PARKING_TITLE_PATTERNS.some(p => p.test(title))) parkingScore += 40;
    parkingScore += PARKING_BODY_PATTERNS.filter(p => p.test(bodyText)).length * 15;
    if (PARKING_DOMAINS.some(d => canonicalDomain.includes(d))) parkingScore += 60;
    if (totalLinks > 0 && externalLinks / totalLinks > 0.8 && totalLinks < 20) parkingScore += 20;
    if (wordCount < 30 && paragraphs < 2 && headings < 2) parkingScore += 15;
    if (navLinks < 2 && totalLinks < 10 && scripts < 2) parkingScore += 10;
    if (PARKING_DOMAINS.some(d => htmlLower.includes(d))) parkingScore += 30;
    if (/sponsored.{0,20}link/i.test(html) || /related.{0,20}link/i.test(html)) parkingScore += 25;

    const base = { wordCount, internalLinks, navLinks, images };

    if (parkingScore >= 40) return { verdict:'Parked / For sale', status:'danger', score:parkingScore, cms:'', isEcommerce:false, isBlog:false, ...base };

    const sizeKb = new Blob([html]).size / 1024;
    if (sizeKb < 1.5 && totalLinks < 3 && wordCount < 10)
      return { verdict:'Empty page', status:'danger', score:0, cms:'', isEcommerce:false, isBlog:false, ...base };
    if (/access denied|403 forbidden|403 error|cloudflare.{0,80}security/i.test(title) ||
        /access denied|403 forbidden|rate limit|captcha required/i.test(bodyText.slice(0,500)))
      return { verdict:'Blocked / 403', status:'error', score:0, cms:'', isEcommerce:false, isBlog:false, wordCount:0, internalLinks:0, navLinks:0, images:0 };
    if (/under construction|coming soon|website under/i.test(title) ||
        (wordCount < 80 && /under construction|coming soon|launching soon|stay tuned/i.test(bodyText)))
      return { verdict:'Under construction', status:'warning', score:10, cms:'', isEcommerce:false, isBlog:false, ...base };

    // REAL SCORE
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

    const cmsMarkers = {
      WordPress:  /wp-content|wp-includes|\/themes\//i,
      Drupal:     /drupal|sites\/default\/files/i,
      Joomla:     /joomla|\/components\/com_/i,
      Wix:        /wix\.com|wixsite\.com|wixstatic\.com/i,
      Webflow:    /webflow\.com|\.webflow\./i,
      Shopify:    /shopify|myshopify/i,
      Squarespace:/squarespace\.com/i,
      PrestaShop: /prestashop/i,
      Magento:    /magento/i,
      OpenCart:   /opencart/i,
      Bitrix:     /bitrix|1c-bitrix/i,
      Tilda:      /tilda\.ws|tildacdn/i,
      Bootstrap:  /bootstrap\.min\.css|bootstrap\.css/i,
      React:      /react\.js|react-dom|_next\/static|next\.config/i,
      Vue:        /vue\.js|nuxt/i,
      Angular:    /ng-app|angular\.js|ng-version/i,
    };

    let detectedCMS = '';
    for (const [cms, pat] of Object.entries(cmsMarkers)) {
      if (pat.test(html)) { realScore += 20; detectedCMS = cms; break; }
    }

    const isEcommerce = productEl > 0 || /add to cart|buy now|checkout|add to bag/i.test(bodyText);
    if (isEcommerce) realScore += 15;
    const isBlog = articleEl > 0 || /blog|news|post|article/i.test(title);
    if (isBlog) realScore += 10;
    if (videoEl > 0) realScore += 8;
    if (internalLinks > 5) realScore += 15;
    else if (internalLinks > 2) realScore += 8;

    let verdict, status;
    if (realScore >= 70) {
      verdict = isEcommerce ? '✓ E-commerce store' : isBlog ? '✓ Blog / Media' : '✓ Full website';
      status = 'success';
    } else if (realScore >= 35) {
      verdict = isEcommerce ? '~ Store (light)' : '~ Landing / Business card';
      status = 'warning';
    } else if (realScore >= 15) {
      verdict = '~ Minimal landing';
      status = 'warning';
    } else {
      verdict = '✗ Empty / Broken';
      status = 'danger';
    }

    return { verdict, status, score: Math.round(realScore), cms: detectedCMS, isEcommerce, isBlog, wordCount, internalLinks, navLinks, images };
  }

  // ─── MAIN CLICK ───────────────────────────────────────────────────────────
  analyzeBtn.addEventListener('click', async () => {
    const rawUrls = input.value.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    if (rawUrls.length === 0) { alert("Paste URLs for scanning"); return; }

    tbody.innerHTML = '';
    resultsData = [];
    sortCol = null; sortAsc = true;
    document.querySelectorAll('.sort-arrow').forEach(el => el.remove());
    analyzeBtn.disabled = true;
    exportBtn.style.display = 'none';
    statsBar.style.display = 'none';
    progressBox.style.display = 'block';
    progressBar.style.width = '0%';
    if (searchInput)  searchInput.value = '';
    if (filterSelect) filterSelect.value = 'all';

    const rowsMap = new Map();
    rawUrls.forEach(url => {
      let cleanUrl = url;
      if (!/^https?:\/\//i.test(cleanUrl)) cleanUrl = 'https://' + cleanUrl;
      const tr = document.createElement('tr');
      tr.dataset.url = cleanUrl;
      tr.innerHTML = `
        <td style="color:#94a3b8;font-size:10px;text-align:center">—</td>
        <td style="color:#94a3b8;font-size:10px;text-align:center">—</td>
        <td class="url-col" title="${cleanUrl}"><a href="${cleanUrl}" target="_blank">${cleanUrl.replace(/^https?:\/\//,'')}</a></td>
        <td colspan="10" style="color:#94a3b8;font-style:italic;font-size:11px;">Queued...</td>
      `;
      tbody.appendChild(tr);
      rowsMap.set(cleanUrl, tr);
    });

    let completedCount = 0;
    const processUrl = async (url) => {
      const tr = rowsMap.get(url);
      tr.cells[3].colSpan = 10;
      tr.cells[3].textContent = 'Analyzing...';
      tr.cells[3].style.color = '#2563eb';
      const result = await analyzeSingleUrl(url);
      updateRow(tr, result);
      resultsData.push(result);
      completedCount++;
      progressBar.style.width = `${(completedCount / rawUrls.length) * 100}%`;
      analyzeBtn.textContent = `Processing (${completedCount}/${rawUrls.length})...`;
    };

    const queue = [...rowsMap.keys()];
    while (queue.length > 0) {
      const batch = queue.splice(0, CONCURRENCY_LIMIT);
      await Promise.all(batch.map(url => processUrl(url)));
    }

    analyzeBtn.textContent = 'Start Scan';
    analyzeBtn.disabled = false;
    exportBtn.style.display = 'inline-block';
    updateStats();
  });

  // ─── ANALYZE SINGLE ───────────────────────────────────────────────────────
  async function analyzeSingleUrl(url) {
    const result = {
      url, status:'error', verdict:'Error', httpCode:'-', redirectUrl:'',
      size:'0,0', title:'-', links:0, complexity:0, responseTime:0,
      score:0, cms:'', isEcommerce:false, isBlog:false, wordCount:0, images:0, navLinks:0
    };

    try {
      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const t0 = performance.now();

      const response = await fetch(url, {
        method:'GET', signal:controller.signal, cache:'no-store', credentials:'omit', redirect:'follow'
      });

      clearTimeout(timeoutId);
      result.responseTime = Math.round(performance.now() - t0);
      result.httpCode = response.status;
      if (response.url && response.url !== url) result.redirectUrl = response.url;

      if (response.status === 404) { result.verdict='✗ 404 Not found'; result.status='danger'; return result; }
      if (response.status === 403 || response.status === 401) { result.verdict=`✗ Access denied (${response.status})`; result.status='error'; return result; }
      if (response.status >= 500) { result.verdict=`✗ Server error (${response.status})`; result.status='error'; return result; }

      const html   = await response.text();
      const sizeKb = new Blob([html]).size / 1024;
      result.size  = sizeKb.toLocaleString('en-US', { minimumFractionDigits:1, maximumFractionDigits:1 });

      const parser = new DOMParser();
      const doc    = parser.parseFromString(html, 'text/html');
      result.title = doc.title ? doc.title.trim().substring(0,40) + (doc.title.length > 40 ? '…' : '') : 'No title';

      const domain = new URL(url).hostname.replace('www.','');
      const allAnchor = Array.from(doc.querySelectorAll('a[href]'));
      const internalSet = new Set(allAnchor
        .filter(a => { try { return new URL(a.href, url).hostname.replace('www.','').includes(domain); } catch { return false; } })
        .map(a => a.href));

      result.links      = internalSet.size;
      result.complexity = doc.querySelectorAll('script[src]').length
                        + doc.querySelectorAll('link[rel="stylesheet"]').length
                        + doc.querySelectorAll('form').length;

      const det = detectSiteType(doc, html, url);
      result.verdict     = det.verdict;
      result.status      = det.status;
      result.score       = det.score;
      result.cms         = det.cms || '';
      result.isEcommerce = det.isEcommerce || false;
      result.isBlog      = det.isBlog || false;
      result.wordCount   = det.wordCount || 0;
      result.images      = det.images || doc.querySelectorAll('img').length;
      result.navLinks    = det.navLinks || 0;

    } catch (err) {
      result.responseTime = TIMEOUT_MS;
      if (err.name === 'AbortError') result.verdict = '⏱ Timeout';
      else if (err.message?.includes('Failed to fetch') || err.message?.includes('net::')) result.verdict = '✗ Unavailable / CORS';
      else result.verdict = `✗ Error`;
      result.status = 'error';
    }
    return result;
  }

  // ─── RENDER ROW ───────────────────────────────────────────────────────────
  function updateRow(tr, data) {
    let badgeClass = 'badge-error';
    if (data.status === 'success') badgeClass = 'badge-success';
    if (data.status === 'warning') badgeClass = 'badge-warning';
    if (data.status === 'danger')  badgeClass = 'badge-danger';

    tr.className = `row-${data.status}`;
    tr.dataset.status = data.status;
    tr.dataset.title  = (data.title || '').toLowerCase();
    tr.dataset.url2   = data.url.toLowerCase();

    const shortUrl = data.url.replace(/^https?:\/\//, '').replace(/\/$/, '');

    // HTTP chip
    let httpClass = 'http-ok';
    const code = parseInt(data.httpCode);
    if (isNaN(code)) httpClass = 'http-none';
    else if (code >= 500) httpClass = 'http-err';
    else if (code >= 400) httpClass = 'http-warn';
    const httpHtml = `<span class="http-chip ${httpClass}">${data.httpCode}</span>`;

    // Response time
    let rtClass = 'rt-fast';
    if (data.responseTime > 3000) rtClass = 'rt-slow';
    else if (data.responseTime > 1200) rtClass = 'rt-med';
    const rtHtml = data.responseTime > 0
      ? `<span class="rt-chip ${rtClass}">${data.responseTime} ms</span>`
      : '<span class="rt-chip rt-none">—</span>';

    // Redirect
    const redirHtml = data.redirectUrl
      ? `<a class="redir-badge" href="${data.redirectUrl}" target="_blank" title="${data.redirectUrl}">↪ redirect</a>`
      : '';

    // CMS tag
    const cmsCssMap = {
      WordPress:'cms-wp', Shopify:'cms-shop', Wix:'cms-wix', Tilda:'cms-tilda',
      React:'cms-react', Vue:'cms-vue', Angular:'cms-react', Bitrix:'cms-bitrix',
      Webflow:'cms-other', Drupal:'cms-other', Joomla:'cms-other',
      Squarespace:'cms-other', PrestaShop:'cms-shop', Magento:'cms-shop',
      OpenCart:'cms-shop', Bootstrap:'cms-other',
    };
    let cmsHtml = '<span class="cms-empty">—</span>';
    const tags = [];
    if (data.cms) tags.push(`<span class="cms-tag ${cmsCssMap[data.cms]||'cms-other'}">${data.cms}</span>`);
    if (data.isEcommerce && !['Shopify','Magento','PrestaShop','OpenCart'].includes(data.cms)) tags.push(`<span class="cms-tag cms-ecom">eCommerce</span>`);
    if (data.isBlog && !data.cms) tags.push(`<span class="cms-tag cms-blog">Blog/Media</span>`);
    if (tags.length) cmsHtml = tags.join(' ');

    // Score chip
    let scClass = 'score-zero';
    if (data.score >= 70) scClass = 'score-high';
    else if (data.score >= 35) scClass = 'score-med';
    else if (data.score > 0) scClass = 'score-low';
    const scoreHtml = `<span class="score-chip ${scClass}">${data.score || '—'}</span>`;

    const mc = (val, thr = 1) => {
      const cls = (val > 0 && val >= thr) ? 'highlight' : val === 0 ? 'zero' : '';
      return `<td class="metric-cell ${cls}">${val != null ? val : '—'}</td>`;
    };

    tr.innerHTML = `
      <td style="text-align:center;padding:8px 6px;">${httpHtml}</td>
      <td style="text-align:center;padding:8px 6px;">${rtHtml}</td>
      <td class="url-col" title="${data.url}">
        <a href="${data.url}" target="_blank">${shortUrl}</a>
        ${redirHtml}
      </td>
      <td class="metric-cell">${data.size} </td>
      <td class="title-cell" title="${data.title||''}">${data.title||'—'}</td>
      ${mc(data.links, 3)}
      ${mc(data.complexity, 3)}
      ${mc(data.wordCount, 100)}
      ${mc(data.images, 2)}
      ${mc(data.navLinks, 3)}
      <td>${cmsHtml}</td>
      <td><span class="badge ${badgeClass}">${data.verdict}</span></td>
      <td style="text-align:center">${scoreHtml}</td>
    `;

    tr.title = 'Double-click to recheck';
    tr.ondblclick = () => recheckRow(tr, data.url);
  }

  // ─── RE-CHECK ─────────────────────────────────────────────────────────────
  async function recheckRow(tr, url) {
    const cells = tr.querySelectorAll('td');
    if (cells[2]) cells[2].style.opacity = '0.5';
    if (cells[4]) cells[4].textContent = '⟳ Rechecking...';
    const result = await analyzeSingleUrl(url);
    const idx = resultsData.findIndex(r => r.url === url);
    if (idx !== -1) resultsData[idx] = result;
    updateRow(tr, result);
    updateStats();
  }

  // ─── STATS ────────────────────────────────────────────────────────────────
  function updateStats() {
    const c = resultsData.reduce((acc, r) => { acc[r.status] = (acc[r.status]||0)+1; return acc; }, {});
    statsBar.innerHTML = `
      <span class="stat-badge suc">✓ Full websites: ${c.success||0}</span>
      <span class="stat-badge wrn">~ Landing pages: ${c.warning||0}</span>
      <span class="stat-badge dng">✗ Parked/Empty: ${c.danger||0}</span>
      <span class="stat-badge err">⚠ Errors: ${c.error||0}</span>
    `;
    statsBar.style.display = 'flex';
  }

  // ─── FILTER + SEARCH ──────────────────────────────────────────────────────
  function applyFilter() {
    const q   = (searchInput?.value || '').toLowerCase().trim();
    const cat = filterSelect?.value || 'all';
    Array.from(tbody.querySelectorAll('tr')).forEach(tr => {
      const matchCat = cat === 'all' || tr.dataset.status === cat;
      const matchQ   = !q || tr.dataset.url2?.includes(q) || tr.dataset.title?.includes(q);
      tr.style.display = (matchCat && matchQ) ? '' : 'none';
    });
  }
  searchInput?.addEventListener('input', applyFilter);
  filterSelect?.addEventListener('change', applyFilter);

  // ─── SORT ─────────────────────────────────────────────────────────────────
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.style.cursor = 'pointer';
    th.title = 'Click to sort';
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortCol === col) sortAsc = !sortAsc; else { sortCol = col; sortAsc = true; }
      document.querySelectorAll('th[data-sort] .sort-arrow').forEach(el => el.remove());
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = sortAsc ? ' ▲' : ' ▼';
      th.appendChild(arrow);
      sortResults();
    });
  });

  function sortResults() {
    if (!sortCol || !resultsData.length) return;
    const numericCols = ['score','links','complexity','wordCount','images','navLinks','responseTime','httpCode'];
    const sorted = [...resultsData].sort((a, b) => {
      let va = a[sortCol], vb = b[sortCol];
      if (numericCols.includes(sortCol)) {
        va = parseFloat(va) || 0; vb = parseFloat(vb) || 0;
      } else if (sortCol === 'size') {
        va = parseFloat(String(va).replace(/\s/g,'').replace(',','.')) || 0;
        vb = parseFloat(String(vb).replace(/\s/g,'').replace(',','.')) || 0;
      } else {
        va = String(va||'').toLowerCase(); vb = String(vb||'').toLowerCase();
      }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    tbody.innerHTML = '';
    sorted.forEach(data => {
      const tr = document.createElement('tr');
      tr.dataset.url    = data.url;
      tr.dataset.status = data.status;
      tr.dataset.url2   = data.url.toLowerCase();
      tr.dataset.title  = (data.title||'').toLowerCase();
      tbody.appendChild(tr);
      updateRow(tr, data);
    });
    applyFilter();
  }

  // ─── EXPORT CSV ───────────────────────────────────────────────────────────
  exportBtn.addEventListener('click', () => {
    const hdr  = ['URL','Redirect','HTTP','Time (ms)','Size (KB)','Title','Links','Complexity','Words','Images','Nav','CMS','eCommerce','Blog','Score','Verdict'];
    const rows = resultsData.map(r => [
      r.url, r.redirectUrl||'', r.httpCode, r.responseTime,
      r.size, `"${(r.title||'').replace(/"/g,'""')}"`,
      r.links, r.complexity, r.wordCount, r.images, r.navLinks,
      `"${r.cms||''}"`, r.isEcommerce?'Yes':'No', r.isBlog?'Yes':'No',
      r.score, `"${r.verdict}"`
    ]);
    const csv  = [hdr,...rows].map(e=>e.join(',')).join('\n');
    const blob = new Blob(["\ufeff"+csv], {type:'text/csv;charset=utf-8;'});
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `site_analysis_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });
});
