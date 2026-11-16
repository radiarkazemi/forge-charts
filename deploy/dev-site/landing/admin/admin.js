const sections = [
  ['Platform', [
    ['overview','Overview','◈'],
    ['users','Users & access','♙'],
    ['markets','Market feeds','⌁'],
    ['charts','Charts & workspaces','▤'],
    ['alerts','Alerts & delivery','◷'],
  ]],
  ['Operations', [
    ['billing','Plans & billing','◇'],
    ['support','Support','⊙'],
    ['content','Content & announcements','▧'],
    ['security','Security & audit','◎'],
    ['system','System health','▥'],
  ]],
];
const nav = document.querySelector('#nav');
const main = document.querySelector('#main');
const dialog = document.querySelector('#detail');
const menu = document.querySelector('#menu');
const routes = Object.fromEntries(sections.flatMap(([, links]) => links.map(([key, title]) => [key, title])));
const statusColors = {
  Healthy: 'ok', Current: 'ok', Active: 'ok', Saved: 'ok', Signed: 'ok', Published: 'ok', Complete: 'ok',
  Delayed: 'warn', Triggered: 'warn', 'Past due': 'warn',
  Down: 'bad', Failed: 'bad', Empty: 'bad',
};
const chip = status => `<span class="status ${statusColors[status] || ''}">${esc(status)}</span>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const num = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  const digits = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 2 : 5;
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
};
const ago = unix => {
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - Number(unix || 0)));
  if (!unix) return '—';
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`;
  return `${Math.round(seconds / 86400)} d ago`;
};
const tehran = unix => new Date(Number(unix) * 1000).toLocaleString('en-GB', {
  timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short',
});
const freshness = unix => {
  const age = Date.now() / 1000 - Number(unix || 0);
  if (!unix || age > 3600) return 'Down';
  if (age > 180) return 'Delayed';
  return 'Healthy';
};

nav.innerHTML = sections.map(([group, links]) => `<label>${group}</label>${links.map(([key, title, icon]) =>
  `<a href="#${key}"><span class="nav-icon" aria-hidden="true">${icon}</span>${title}</a>`).join('')}`).join('');
function setMenu(open) {
  document.querySelector('#sidebar').classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  menu.setAttribute('aria-expanded', String(open));
}
menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });
function heading(title, sub, control = '') {
  return `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div><div class="controls"><span class="badge">LIVE</span>${control}</div></div>`;
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function accounts() {
  const rows = readJson('forge.auth.users.v1');
  if (!Array.isArray(rows)) return [];
  return rows.filter(row => row && row.username).map(row => ({
    id: String(row.id || ''),
    username: String(row.username || ''),
    displayName: String(row.displayName || ''),
    createdAt: Number(row.createdAt) || 0,
    safetyComplete: Boolean(row.safetyComplete),
  }));
}
function session() {
  const row = readJson('forge.auth.session.v1');
  if (!row || !row.username) return null;
  return {
    userId: String(row.userId || ''),
    username: String(row.username || ''),
    displayName: String(row.displayName || ''),
    createdAt: Number(row.createdAt) || 0,
    safetyComplete: Boolean(row.safetyComplete),
  };
}
function storedList(keys) {
  const rows = [];
  for (const key of keys) {
    const list = readJson(key);
    if (Array.isArray(list)) rows.push(...list.map(item => ({ ...item, _store: key })));
  }
  return rows;
}

const cache = { quote: null, catalog: null, probes: [] };
async function timed(name, url) {
  const start = performance.now();
  try {
    const response = await fetch(url, { cache: 'no-store' });
    const ms = Math.round(performance.now() - start);
    const data = response.ok ? await response.json() : null;
    return { name, ok: response.ok && data, ms, status: response.status, data };
  } catch {
    return { name, ok: false, ms: Math.round(performance.now() - start), status: 0, data: null };
  }
}
async function loadCore() {
  if (cache.quote && cache.catalog) return;
  const [quote, catalog] = await Promise.all([
    timed('Gold quote', '/iran-gold/quote'),
    timed('Tehran board', '/iran-gold/tsetmc/catalog'),
  ]);
  cache.quote = quote;
  cache.catalog = catalog;
  cache.probes = [quote, catalog];
}
const periods = {
  '24h': { symbol: 'FXCM:EURUSD', resolution: '60', label: 'EURUSD · 1 hour' },
  '7d': { symbol: 'FXCM:EURUSD', resolution: '240', label: 'EURUSD · 4 hours' },
  '30d': { symbol: 'FXCM:EURUSD', resolution: '1D', label: 'EURUSD · daily' },
};
let activePeriod = '7d';
async function loadSeries() {
  const spec = periods[activePeriod];
  return timed(spec.label, `/tv-history?symbol=${encodeURIComponent(spec.symbol)}&resolution=${spec.resolution}&count=40`);
}

function showOverview(seriesProbe) {
  const quote = cache.quote?.data;
  const catalog = cache.catalog?.data;
  const prices = quote?.prices || {};
  const bars = Array.isArray(seriesProbe?.data?.bars) ? seriesProbe.data.bars : [];
  const closes = bars.map(bar => Number(bar[4])).filter(Number.isFinite);
  const latencies = cache.probes.filter(probe => probe.ms).map(probe => probe.ms);
  const latency = latencies.length ? Math.round(latencies.reduce((sum, ms) => sum + ms, 0) / latencies.length) : '—';
  const cards = [
    ['18k gold', num(prices.price_18k_per_gram), quote?.source || 'quote'],
    ['Tehran names', num(catalog?.total || 0), 'cleaned board'],
    ['Feed latency', latency === '—' ? '—' : `${latency} ms`, 'browser round trip'],
    ['EURUSD', closes.length ? closes.at(-1).toFixed(5) : '—', seriesProbe?.ok ? 'last close' : 'unavailable'],
  ].map(([label, value, note]) => `<div class="card"><label>${label}</label><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const path = closes.map((close, index) => {
    const x = closes.length < 2 ? 12 : 12 + index * (550 / (closes.length - 1));
    const y = 160 - ((close - min) / span) * 130;
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const labels = bars.length
    ? [bars[0], bars[Math.floor(bars.length / 2)], bars.at(-1)].map(bar => tehran(bar[0]).split(',')[0])
    : ['—'];
  const health = [
    ['Gold quote', cache.quote?.ok ? freshness(quote?.ts) : 'Down'],
    ['Tehran board', catalog?.total > 0 ? 'Healthy' : 'Down'],
    ['EURUSD history', seriesProbe?.ok && closes.length ? 'Healthy' : 'Down'],
  ];
  const attention = [];
  if (!cache.quote?.ok) attention.push(['#markets', 'Gold quote is not answering', 'Down']);
  else if (freshness(quote?.ts) !== 'Healthy') attention.push(['#markets', `Gold quote is ${freshness(quote.ts).toLowerCase()}`, freshness(quote.ts)]);
  if (!catalog?.total) attention.push(['#markets', 'Tehran board is empty', 'Down']);
  if (!seriesProbe?.ok) attention.push(['#system', 'EURUSD history is not answering', 'Down']);
  const triggered = storedList(['forge.alerts.v1', 'forge.dev.forge.alerts.v1']).filter(alert => alert.status === 'triggered');
  if (triggered.length) attention.push(['#alerts', `${triggered.length} alert${triggered.length === 1 ? '' : 's'} triggered in this browser`, 'Triggered']);
  const options = Object.keys(periods).map(period => `<option ${period === activePeriod ? 'selected' : ''}>${period}</option>`).join('');
  main.innerHTML = heading('Platform overview', 'Live gold, Tehran, and broker prints. No sample accounts.', `<select id="period" aria-label="Overview period">${options}</select>`) +
    `<div class="cards">${cards}</div><div class="split"><section class="panel"><div class="panel-head"><h2>${esc(periods[activePeriod].label)}</h2><span class="subtle">${esc(seriesProbe?.ok ? `${closes.length} bars` : 'No bars')}</span></div>
    <svg class="chart" viewBox="0 0 575 175" role="img" aria-label="Live EURUSD closes">
      <defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#dcaa5d" stop-opacity=".35"/><stop offset="1" stop-color="#dcaa5d" stop-opacity="0"/></linearGradient></defs>
      <path d="M0 32H575 M0 72H575 M0 112H575 M0 152H575" stroke="#393129"/>
      ${path ? `<path d="${path} L562,174 L12,174 Z" fill="url(#fill)"/><path d="${path}" fill="none" stroke="#edbf76" stroke-width="2.5" stroke-linejoin="round"/>` : ''}
    </svg><div class="axis">${labels.map(label => `<span>${esc(label)}</span>`).join('')}</div></section>
    <section class="panel"><div class="panel-head"><h2>Service health</h2><a href="#system">All services →</a></div><div class="feed-links">${health.map(([title, status]) => `<a href="#system">${esc(title)}${chip(status)}</a>`).join('')}</div></section></div>
    <section class="panel"><div class="panel-head"><h2>Needs attention</h2></div><div class="feed-links">${
      attention.length
        ? attention.map(([href, text, status]) => `<a href="${href}">${esc(text)} ${chip(status)}</a>`).join('')
        : `<a href="#markets">Watched feeds are current ${chip('Healthy')}</a>`
    }</div></section>`;
  document.querySelector('#period').addEventListener('change', event => {
    activePeriod = event.target.value;
    render();
  });
}

function showTable(key, description, headers, rows, note) {
  const options = [...new Set(rows.map(row => row.at(-1)))];
  main.innerHTML = heading(routes[key], description) + `<section class="panel">
    <div class="panel-head"><h2>Records</h2><div class="table-controls">
    <input type="search" id="filtered-search" placeholder="Search records" aria-label="Search records">
    <select id="filtered-status" aria-label="Filter by status"><option value="">All statuses</option>${options.map(status => `<option>${esc(status)}</option>`).join('')}</select></div></div>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Records table">
    <table><thead><tr>${headers.map(label => `<th scope="col">${esc(label)}</th>`).join('')}<th scope="col">Details</th></tr></thead><tbody id="records"></tbody></table></div>
    <p class="section-note">${esc(note)}</p></section>`;
  const search = document.querySelector('#filtered-search');
  const filter = document.querySelector('#filtered-status');
  const body = document.querySelector('#records');
  function updateRows() {
    const query = search.value.trim().toLowerCase();
    const visible = rows.map((row, index) => ({ row, index })).filter(({ row }) => {
      if (filter.value && row.at(-1) !== filter.value) return false;
      return row.join(' ').toLowerCase().includes(query);
    });
    body.innerHTML = visible.map(({ row, index }) => `<tr>${row.slice(0, -1).map(value => `<td>${esc(value)}</td>`).join('')}<td>${chip(row.at(-1))}</td><td><button data-record="${index}" aria-label="View ${esc(row[0])}">View</button></td></tr>`).join('')
      || `<tr><td colspan="${headers.length + 1}">No matching records</td></tr>`;
  }
  search.addEventListener('input', updateRows);
  filter.addEventListener('change', updateRows);
  body.addEventListener('click', event => {
    const button = event.target.closest('[data-record]');
    if (!button) return;
    const row = rows[Number(button.dataset.record)];
    document.querySelector('#detail-body').innerHTML = `<h2 id="detail-title">${esc(row[0])}</h2><p class="subtle">Live record</p>
    <dl class="detail-list">${headers.map((label, index) => `<dt>${esc(label)}</dt><dd>${esc(row[index])}</dd>`).join('')}</dl>`;
    dialog.setAttribute('aria-labelledby', 'detail-title');
    dialog.showModal();
  });
  updateRows();
}

function marketRows() {
  const quote = cache.quote?.data;
  const prices = quote?.prices || {};
  const gold = [
    ['18k gram', 'Gold', num(prices.price_18k_per_gram), ago(quote?.ts)],
    ['Mesghal', 'Gold', num(prices.mesghal_17), ago(quote?.ts)],
    ['24k gram', 'Gold', num(prices.price_24k_per_gram), ago(quote?.ts)],
    ['Emami coin', 'Gold', num(prices.coin_emami), ago(quote?.ts)],
    ['Half coin', 'Gold', num(prices.coin_half), ago(quote?.ts)],
    ['Quarter coin', 'Gold', num(prices.coin_quarter), ago(quote?.ts)],
    ['Ounce', 'Gold', num(prices.ounce_usd), ago(quote?.ts)],
  ].map(row => [...row, cache.quote?.ok ? freshness(quote?.ts) : 'Down']);
  const rows = (cache.catalog?.data?.rows || [])
    .filter(row => row && row.kind === 'stock' && Number(row.volume) > 0)
    .sort((a, b) => Number(b.volume) - Number(a.volume))
    .slice(0, 12)
    .map(row => [row.symbol, 'Tehran', num(row.last), num(row.volume), row.kind === 'stock' ? 'Healthy' : 'Delayed']);
  return { gold, tehran: rows };
}

async function brokerRows() {
  const specs = [
    ['EURUSD', 'FXCM:EURUSD'],
    ['XAUUSD', 'FOREXCOM:XAUUSD'],
    ['BTCUSDT', 'BINANCE:BTCUSDT'],
  ];
  const probes = await Promise.all(specs.map(([label, symbol]) => timed(label, `/tv-history?symbol=${encodeURIComponent(symbol)}&resolution=1&count=2`)));
  cache.probes = [...cache.probes.filter(probe => probe.name === 'Gold quote' || probe.name === 'Tehran board'), ...probes];
  return probes.map(probe => {
    const bars = Array.isArray(probe.data?.bars) ? probe.data.bars : [];
    const last = bars.at(-1);
    return [probe.name, 'Broker book', last ? num(last[4]) : '—', last ? ago(last[0]) : '—', probe.ok && last ? freshness(last[0]) : 'Down'];
  });
}

async function pageRows(key) {
  if (key === 'users') {
    const current = session();
    const rows = accounts().map(account => [
      account.displayName || account.username,
      account.username,
      account.safetyComplete ? 'Complete' : 'Pending',
      account.createdAt ? tehran(account.createdAt / 1000) : '—',
      current && current.userId === account.id ? 'Signed' : 'Saved',
    ]);
    return ['Accounts stored in this browser. Passwords are not shown.', ['Name', 'Account', 'Safety', 'Created', 'Status'], rows, 'This list is the accounts on this browser, not a server directory.'];
  }
  if (key === 'markets') {
    const { gold, tehran } = marketRows();
    const brokers = await brokerRows();
    return ['Live gold, broker books, and the busiest Tehran stocks.', ['Feed', 'Source', 'Last', 'Detail', 'Status'], [...gold, ...brokers, ...tehran], 'Gold detail is the quote age. Tehran detail is today’s volume.'];
  }
  if (key === 'charts') {
    const rows = storedList(['forge.tv.charts', 'forge.dev.forge.tv.charts']).map(chart => [
      chart.name || 'Untitled',
      String(chart.symbol || '—'),
      String(chart.resolution || '—'),
      chart.timestamp ? ago(chart.timestamp) : '—',
      chart.name ? 'Saved' : 'Empty',
    ]);
    return ['Layouts saved in this browser.', ['Layout', 'Symbol', 'Interval', 'Saved', 'Status'], rows, 'A layout appears here after it is saved on this browser.'];
  }
  if (key === 'alerts') {
    const rows = storedList(['forge.alerts.v1', 'forge.dev.forge.alerts.v1']).map(alert => [
      `${alert.ticker || '—'} ${alert.condition || ''} ${alert.price ?? ''}`.trim(),
      alert.ticker || '—',
      alert.condition || '—',
      alert.createdAt ? ago(alert.createdAt / 1000) : '—',
      alert.status === 'triggered' ? 'Triggered' : 'Active',
    ]);
    return ['Price alerts stored in this browser.', ['Rule', 'Symbol', 'Condition', 'Created', 'Status'], rows, 'Alerts fire in the chart on this browser. There is no separate delivery log.'];
  }
  if (key === 'billing') {
    const choice = readJson('forge.billing.choice.v1') || readJson('forge.dev.forge.billing.choice.v1');
    const rows = choice && choice.plan ? [[
      choice.plan === 'year' ? 'Year' : 'Month',
      session()?.username || 'This browser',
      choice.currency || '—',
      choice.chosenAt ? tehran(choice.chosenAt / 1000) : '—',
      'Saved',
    ]] : [];
    return ['The plan chosen in this browser.', ['Plan', 'Account', 'Currency', 'Chosen', 'Status'], rows, 'No invoice service is connected. This is the saved plan choice only.'];
  }
  if (key === 'support') {
    return ['Support tickets.', ['Ticket', 'Subject', 'Queue', 'Updated', 'Status'], [], 'Forge does not store a support queue yet.'];
  }
  if (key === 'content') {
    return ['Pages that are published on this site.', ['Page', 'Address', 'Locale', 'Updated', 'Status'], [
      ['Landing', '/team/landing/', 'EN / FA', 'Live', 'Published'],
      ['Admin', '/team/landing/admin/#overview', 'EN', 'Live', 'Published'],
      ['Charts', '/charts/', 'EN / FA', 'Live', 'Published'],
    ], 'These are the pages being served, not editorial drafts.'];
  }
  if (key === 'security') {
    const current = session();
    const rows = current ? [[
      'Signed in',
      current.displayName || current.username,
      current.safetyComplete ? 'Safety complete' : 'Safety incomplete',
      current.createdAt ? tehran(current.createdAt / 1000) : '—',
      'Signed',
    ]] : [];
    return ['The session in this browser. Tokens are not shown.', ['Event', 'Account', 'Scope', 'Since', 'Status'], rows, 'There is no server audit log on this page.'];
  }
  const probes = await Promise.all([
    cache.quote || timed('Gold quote', '/iran-gold/quote'),
    cache.catalog || timed('Tehran board', '/iran-gold/tsetmc/catalog'),
    timed('EURUSD', '/tv-history?symbol=FXCM:EURUSD&resolution=1&count=2'),
    timed('XAUUSD', '/tv-history?symbol=FOREXCOM:XAUUSD&resolution=1&count=2'),
    timed('BTCUSDT', '/tv-history?symbol=BINANCE:BTCUSDT&resolution=1&count=2'),
  ]);
  cache.probes = probes;
  return ['Round trip from this browser to each live service.', ['Service', 'Check', 'Latency', 'Result', 'Status'], probes.map(probe => [
    probe.name,
    probe.ok ? 'JSON' : 'Request',
    `${probe.ms} ms`,
    probe.ok ? 'Answered' : `HTTP ${probe.status || 'failed'}`,
    probe.ok ? (probe.ms > 2500 ? 'Delayed' : 'Healthy') : 'Down',
  ]), 'Latency is measured in this browser, not inside the market service.'];
}

async function render() {
  const requested = location.hash.slice(1);
  const key = Object.hasOwn(routes, requested) ? requested : 'overview';
  nav.querySelectorAll('a').forEach(link => {
    if (link.hash === '#' + key) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  setMenu(false);
  main.innerHTML = heading(routes[key], 'Loading live data…');
  if (key === 'overview' || key === 'markets' || key === 'system') await loadCore();
  if (key === 'overview') showOverview(await loadSeries());
  else {
    const [description, headers, rows, note] = await pageRows(key);
    showTable(key, description, headers, rows, note);
  }
  document.title = routes[key] + ' | Forge Admin';
}
window.addEventListener('hashchange', () => {
  render();
  main.focus({ preventScroll: true });
});
render();
