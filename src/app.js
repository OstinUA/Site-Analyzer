import { analyzeSingleUrl } from './analyzer.js';
import { DEFAULTS } from './constants.js';
import { clearSortArrows, createQueuedRow, renderResultRow, renderStats } from './dom-utils.js';
import { normalizeInputUrls } from './url-utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const analyzeButton = document.getElementById('analyzeBtn');
  const exportButton = document.getElementById('exportBtn');
  const linksInput = document.getElementById('linksInput');
  const resultsTableBody = document.querySelector('#resultsTable tbody');
  const progressBar = document.getElementById('progressBar');
  const progressContainer = document.getElementById('progressBox');
  const statsBar = document.getElementById('statsBar');
  const searchInput = document.getElementById('searchInput');
  const filterSelect = document.getElementById('filterSelect');
  const themeToggle = document.getElementById('themeToggle');

  const state = {
    resultsData: [],
    sortColumn: null,
    sortAscending: true,
    activeScanToken: 0
  };

  initializeTheme(themeToggle);
  bindSorting(state, () => sortAndRenderResults(state, resultsTableBody, createRecheckHandler));
  bindFiltering(searchInput, filterSelect, resultsTableBody);

  async function createRecheckHandler(row, url) {
    const refreshed = await analyzeSingleUrl(url, DEFAULTS);
    const index = state.resultsData.findIndex((item) => item.url === url);
    if (index !== -1) state.resultsData[index] = refreshed;
    renderResultRow(row, refreshed, { onRecheck: createRecheckHandler });
    renderStats(statsBar, state.resultsData);
    applyFilter(searchInput, filterSelect, resultsTableBody);
  }

  analyzeButton.addEventListener('click', async () => {
    const { validUrls, invalidUrls } = normalizeInputUrls(linksInput.value);

    if (!validUrls.length) {
      alert('Paste at least one valid HTTP/HTTPS URL for scanning.');
      return;
    }

    if (invalidUrls.length) {
      console.warn('Skipped invalid URLs:', invalidUrls);
    }

    state.activeScanToken += 1;
    const currentToken = state.activeScanToken;

    resetUiForNewScan({
      analyzeButton,
      exportButton,
      statsBar,
      progressContainer,
      progressBar,
      searchInput,
      filterSelect,
      resultsTableBody,
      state
    });

    const rowsByUrl = new Map();
    for (const url of validUrls) {
      const row = createQueuedRow(url);
      resultsTableBody.appendChild(row);
      rowsByUrl.set(url, row);
    }

    let completedCount = 0;
    await runConcurrent(validUrls, DEFAULTS.concurrencyLimit, async (url) => {
      if (state.activeScanToken !== currentToken) return;

      const row = rowsByUrl.get(url);
      const progressCell = row?.cells?.[3];
      if (progressCell) {
        progressCell.colSpan = 10;
        progressCell.textContent = 'Analyzing...';
        progressCell.style.color = '#2563eb';
      }

      const result = await analyzeSingleUrl(url, DEFAULTS);
      state.resultsData.push(result);
      renderResultRow(row, result, { onRecheck: createRecheckHandler });

      completedCount += 1;
      progressBar.style.width = `${(completedCount / validUrls.length) * 100}%`;
      analyzeButton.textContent = `Processing (${completedCount}/${validUrls.length})...`;
    });

    analyzeButton.textContent = '▶ Start Scan';
    analyzeButton.disabled = false;
    exportButton.style.display = 'inline-block';
    renderStats(statsBar, state.resultsData);
    applyFilter(searchInput, filterSelect, resultsTableBody);
  });

  exportButton.addEventListener('click', () => {
    if (!state.resultsData.length) return;

    const headers = [
      'URL', 'Redirect', 'HTTP', 'Time (ms)', 'Size (KB)', 'Title',
      'Links', 'Complexity', 'Words', 'Images', 'Nav', 'CMS',
      'eCommerce', 'Blog', 'Score', 'Verdict'
    ];

    const rows = state.resultsData.map((item) => [
      item.url,
      item.redirectUrl || '',
      item.httpCode,
      item.responseTime,
      item.size,
      sanitizeCsvField(item.title || ''),
      item.links,
      item.complexity,
      item.wordCount,
      item.images,
      item.navLinks,
      sanitizeCsvField(item.cms || ''),
      item.isEcommerce ? 'Yes' : 'No',
      item.isBlog ? 'Yes' : 'No',
      item.score,
      sanitizeCsvField(item.verdict || '')
    ]);

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `site_analysis_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
});

function sanitizeCsvField(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function runConcurrent(items, limit, worker) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) {
      const next = queue.shift();
      if (!next) break;
      await worker(next);
    }
  });

  await Promise.all(workers);
}

function initializeTheme(themeToggle) {
  const currentTheme = localStorage.getItem(DEFAULTS.themeStorageKey) || 'light';
  document.body.dataset.theme = currentTheme;
  setThemeButton(themeToggle, currentTheme);

  themeToggle?.addEventListener('click', () => {
    const nextTheme = document.body.dataset.theme === 'dark' ? 'light' : 'dark';
    document.body.dataset.theme = nextTheme;
    localStorage.setItem(DEFAULTS.themeStorageKey, nextTheme);
    setThemeButton(themeToggle, nextTheme);
  });
}

function setThemeButton(themeToggle, theme) {
  if (!themeToggle) return;
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  themeToggle.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  themeToggle.setAttribute('aria-label', themeToggle.title);
}

function resetUiForNewScan(ui) {
  ui.resultsTableBody.innerHTML = '';
  ui.state.resultsData = [];
  ui.state.sortColumn = null;
  ui.state.sortAscending = true;

  clearSortArrows();

  ui.analyzeButton.disabled = true;
  ui.analyzeButton.textContent = 'Processing (0/0)...';
  ui.exportButton.style.display = 'none';
  ui.statsBar.style.display = 'none';
  ui.progressContainer.style.display = 'block';
  ui.progressBar.style.width = '0%';

  if (ui.searchInput) ui.searchInput.value = '';
  if (ui.filterSelect) ui.filterSelect.value = 'all';
}

function bindFiltering(searchInput, filterSelect, tbody) {
  searchInput?.addEventListener('input', () => applyFilter(searchInput, filterSelect, tbody));
  filterSelect?.addEventListener('change', () => applyFilter(searchInput, filterSelect, tbody));
}

function applyFilter(searchInput, filterSelect, tbody) {
  const query = (searchInput?.value || '').toLowerCase().trim();
  const category = filterSelect?.value || 'all';

  for (const row of tbody.querySelectorAll('tr')) {
    const matchesCategory = category === 'all' || row.dataset.status === category;
    const matchesQuery = !query || row.dataset.url2?.includes(query) || row.dataset.title?.includes(query);
    row.style.display = matchesCategory && matchesQuery ? '' : 'none';
  }
}

function bindSorting(state, onSortChanged) {
  const headers = document.querySelectorAll('th[data-sort]');
  for (const header of headers) {
    header.style.cursor = 'pointer';
    header.title = 'Click to sort';
    header.addEventListener('click', () => {
      const selectedColumn = header.dataset.sort;
      if (state.sortColumn === selectedColumn) {
        state.sortAscending = !state.sortAscending;
      } else {
        state.sortColumn = selectedColumn;
        state.sortAscending = true;
      }

      clearSortArrows();
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = state.sortAscending ? ' ▲' : ' ▼';
      header.appendChild(arrow);

      onSortChanged();
    });
  }
}

function sortAndRenderResults(state, tbody, onRecheck) {
  if (!state.sortColumn || !state.resultsData.length) return;

  const numericColumns = new Set(['score', 'links', 'complexity', 'wordCount', 'images', 'navLinks', 'responseTime', 'httpCode']);

  state.resultsData.sort((a, b) => {
    const column = state.sortColumn;
    let valueA = a[column];
    let valueB = b[column];

    if (numericColumns.has(column)) {
      valueA = Number.parseFloat(valueA) || 0;
      valueB = Number.parseFloat(valueB) || 0;
    } else if (column === 'size') {
      valueA = Number.parseFloat(String(valueA).replace(/\s/g, '').replace(',', '.')) || 0;
      valueB = Number.parseFloat(String(valueB).replace(/\s/g, '').replace(',', '.')) || 0;
    } else {
      valueA = String(valueA || '').toLowerCase();
      valueB = String(valueB || '').toLowerCase();
    }

    if (valueA < valueB) return state.sortAscending ? -1 : 1;
    if (valueA > valueB) return state.sortAscending ? 1 : -1;
    return 0;
  });

  tbody.innerHTML = '';
  for (const result of state.resultsData) {
    const row = document.createElement('tr');
    tbody.appendChild(row);
    renderResultRow(row, result, { onRecheck });
  }
}
