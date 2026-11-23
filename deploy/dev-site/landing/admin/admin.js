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
const records = {
  users: ['Find accounts, access roles, and sign-in activity.',
    ['Account','Role','Plan','Last active','Status'], [
      ['demo-014','Member','Pro','4 min ago','Active'],
      ['demo-028','Member','Free','17 min ago','Active'],
      ['demo-041','Support','Internal','1 hr ago','MFA enabled'],
      ['demo-063','Member','Free','Yesterday','Restricted'],
      ['demo-087','Member','Pro','Yesterday','Pending'],
    ], 'Account detail groups identity, plan, session history, and access status.'],
  markets: ['Track provider health, quote freshness, and ingestion latency.',
    ['Feed','Provider','Last update','Latency','Status'], [
      ['XAUUSD','Metals feed A','2 sec ago','128 ms','Healthy'],
      ['BTCUSDT','Crypto feed A','1 sec ago','94 ms','Healthy'],
      ['EURUSD','FX feed B','4 sec ago','180 ms','Healthy'],
      ['ETHUSDT','Crypto feed B','42 sec ago','820 ms','Delayed'],
    ], 'A production view would add provider failover, data gaps, and exchange calendar checks.'],
  charts: ['Review chart sessions, saved layouts, and synchronization.',
    ['Workspace','Owner','Symbol','Saved layouts','Status'], [
      ['Metals desk','demo-014','XAUUSD','4','Synced'],
      ['Crypto watch','demo-028','BTCUSDT','1','Synced'],
      ['London session','demo-087','EURUSD','3','Retrying'],
      ['Default workspace','demo-063','ETHUSDT','1','Synced'],
    ], 'Use this page to diagnose layout saves, drawing synchronization, and chart errors.'],
  alerts: ['Inspect alert rules and delivery outcomes.',
    ['Rule','Owner','Channel','Last result','Status'], [
      ['XAUUSD crosses 3,890','demo-014','Push','2 min ago','Delivered'],
      ['BTCUSDT crosses 97,000','demo-028','Email','Awaiting trigger','Active'],
      ['EURUSD falls below 1.15','demo-087','Push','8 min ago','Retrying'],
      ['ETHUSDT crosses 3,200','demo-063','Email','30 min ago','Failed'],
    ], 'Alert details show the rule, delivery channel, and most recent outcome.'],
  billing: ['Review plan assignments and payment states.',
    ['Subscription','Account','Plan','Renewal','Status'], [
      ['sub-demo-001','demo-014','Pro','01 Dec','Active'],
      ['sub-demo-002','demo-087','Pro','03 Dec','Past due'],
      ['sub-demo-003','demo-028','Free','—','Active'],
    ], 'Billing records are illustrative. Plans, invoices, and entitlements require backend integration.'],
  support: ['Triage issues reported by Forge users.',
    ['Ticket','Subject','Queue','Updated','Status'], [
      ['FG-104','Drawings missing after reload','Charting','8 min ago','Open'],
      ['FG-103','Push notification delayed','Alerts','22 min ago','In review'],
      ['FG-102','Plan access question','Billing','1 hr ago','Resolved'],
      ['FG-101','Sign-in feedback','Accounts','3 hr ago','Resolved'],
    ], 'Support detail brings the issue, queue, and status together.'],
  content: ['Track landing copy, help guides, and release notices.',
    ['Title','Surface','Locale','Updated','Status'], [
      ['Forge landing','Website','EN / FA','Today','In review'],
      ['Getting started','Help','EN / FA','Yesterday','Published'],
      ['Market feed maintenance','Announcement','EN','Yesterday','Draft'],
    ], 'Editorial status helps staff review changes before publication.'],
  security: ['Review sign-in events, access changes, and suspicious activity.',
    ['Event','Actor','Scope','Time','Status'], [
      ['MFA challenge passed','demo-staff','Admin sign-in','09:32 UTC','Recorded'],
      ['Repeated failed sign-ins','Unknown','Authentication','09:21 UTC','Needs review'],
      ['Support role updated','demo-owner','Permissions','08:49 UTC','Recorded'],
      ['Session revoked','demo-owner','User access','08:14 UTC','Recorded'],
    ], 'Production access should be enforced server-side with role checks, MFA, and audit logging.'],
  system: ['Track service availability and job processing.',
    ['Service','Subsystem','Response','Checked','Status'], [
      ['Chart API','Edge','118 ms','2 sec ago','Healthy'],
      ['WebSocket gateway','Streaming','94 ms','2 sec ago','Healthy'],
      ['Alert worker','Queue','680 ms','9 sec ago','Delayed'],
      ['Workspace storage','Persistence','141 ms','3 sec ago','Healthy'],
    ], 'System detail identifies the affected component and its last observed state.'],
};
const nav = document.querySelector('#nav');
const main = document.querySelector('#main');
const dialog = document.querySelector('#detail');
const menu = document.querySelector('#menu');
const routes = Object.fromEntries(sections.flatMap(([, links]) => links.map(([key,title]) => [key,title])));
const statusColors = {
  Active:'ok', Healthy:'ok', Synced:'ok', Delivered:'ok', Published:'ok',
  Resolved:'ok', 'MFA enabled':'ok', Delayed:'warn', Pending:'warn',
  Retrying:'warn', 'In review':'warn', 'Needs review':'warn', 'Past due':'warn',
  Failed:'bad', Restricted:'bad',
};
const chip = status => `<span class="status ${statusColors[status] || ''}">${status}</span>`;
nav.innerHTML = sections.map(([group, links]) => `<label>${group}</label>${links.map(([key,title,icon]) =>
  `<a href="#${key}"><span class="nav-icon" aria-hidden="true">${icon}</span>${title}</a>`).join('')}`).join('');
function setMenu(open) {
  document.querySelector('#sidebar').classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  menu.setAttribute('aria-expanded', String(open));
}
menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
document.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });
function heading(title, sub, control = '') {
  return `<div class="page-head"><div><h1>${title}</h1><p>${sub}</p></div><div class="controls"><span class="badge">DEMO DATA</span>${control}</div></div>`;
}
const periods = {
  '24h': { metrics: ['482','163','186 ms','98.2%'], points: [130,146,111,120,92,103,68,81,48,67,29,39], labels: ['00:00','06:00','12:00','18:00','Now'] },
  '7d': { metrics: ['1,284','316','184 ms','98.7%'], points: [145,131,137,108,115,94,102,65,78,49,56,22], labels: ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] },
  '30d': { metrics: ['3,842','721','192 ms','98.1%'], points: [151,141,146,120,108,98,108,76,85,49,52,34], labels: ['Week 1','Week 2','Week 3','Week 4'] },
};
let activePeriod = '7d';
function showOverview() {
  const data = periods[activePeriod];
  const options = Object.keys(periods).map(period => `<option ${period === activePeriod ? 'selected' : ''}>${period}</option>`).join('');
  const cards = ['Active users','Peak chart sessions','API p95 latency','Alert delivery'].map((label,index) =>
    `<div class="card"><label>${label}</label><strong>${data.metrics[index]}</strong><small>${['Unique accounts','Concurrent sessions','95th percentile','Successful deliveries'][index]}</small></div>`).join('');
  const path = data.points.map((y,index) => `${index === 0 ? 'M' : 'L'}${index * 50 + 12},${y}`).join(' ');
  const services = [['Chart API','Healthy'],['WebSocket gateway','Healthy'],['Alert worker','Delayed'],['Workspace storage','Healthy']];
  main.innerHTML = heading('Platform overview','Monitor accounts, chart traffic, feeds, and alerts from one place.', `<select id="period" aria-label="Overview period">${options}</select>`) +
    `<div class="cards">${cards}</div><div class="split"><section class="panel"><div class="panel-head"><h2>Chart activity</h2><span class="subtle">Sessions · ${activePeriod}</span></div>
    <svg class="chart" viewBox="0 0 575 175" role="img" aria-label="Illustrative chart session activity">
      <defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#dcaa5d" stop-opacity=".35"/><stop offset="1" stop-color="#dcaa5d" stop-opacity="0"/></linearGradient></defs>
      <path d="M0 32H575 M0 72H575 M0 112H575 M0 152H575" stroke="#393129"/>
      <path d="${path} L562,174 L12,174 Z" fill="url(#fill)"/>
      <path d="${path}" fill="none" stroke="#edbf76" stroke-width="2.5" stroke-linejoin="round"/>
    </svg><div class="axis">${data.labels.map(label => `<span>${label}</span>`).join('')}</div></section>
    <section class="panel"><div class="panel-head"><h2>Service health</h2><a href="#system">All services →</a></div><div class="feed-links">${services.map(([title,status]) => `<a href="#system">${title}${chip(status)}</a>`).join('')}</div></section></div>
    <section class="panel"><div class="panel-head"><h2>Needs attention</h2></div><div class="feed-links">
      <a href="#markets">ETHUSDT secondary feed is delayed ${chip('Delayed')}</a>
      <a href="#alerts">Alert deliveries waiting for retry ${chip('Retrying')}</a>
      <a href="#security">Repeated failed sign-ins ${chip('Needs review')}</a>
    </div></section>`;
  document.querySelector('#period').addEventListener('change', event => {
    activePeriod = event.target.value;
    showOverview();
    document.querySelector('#period').focus();
  });
}
function showList(key) {
  const [description, headers, rows, note] = records[key];
  const options = [...new Set(rows.map(row => row.at(-1)))];
  main.innerHTML = heading(routes[key],description) + `<section class="panel">
    <div class="panel-head"><h2>Records</h2><div class="table-controls">
    <input type="search" id="filtered-search" placeholder="Search records" aria-label="Search records">
    <select id="filtered-status" aria-label="Filter by status"><option value="">All statuses</option>${options.map(status => `<option>${status}</option>`).join('')}</select></div></div>
    <div class="table-scroll" tabindex="0" role="region" aria-label="Records table">
    <table><thead><tr>${headers.map(label => `<th scope="col">${label}</th>`).join('')}<th scope="col">Details</th></tr></thead><tbody id="records"></tbody></table></div>
    <p class="section-note">${note}</p></section>`;
  const search = document.querySelector('#filtered-search');
  const filter = document.querySelector('#filtered-status');
  const body = document.querySelector('#records');
  function updateRows() {
    const query = search.value.trim().toLowerCase();
    body.innerHTML = rows.map((row,index) => {
      if ((filter.value && row.at(-1) !== filter.value) || !row.join(' ').toLowerCase().includes(query)) return '';
      return `<tr>${row.slice(0,-1).map(value => `<td>${value}</td>`).join('')}<td>${chip(row.at(-1))}</td><td><button data-record="${index}" aria-label="View ${row[0]}">View</button></td></tr>`;
    }).join('') || `<tr><td colspan="${headers.length + 1}">No matching records</td></tr>`;
  }
  search.addEventListener('input', updateRows);
  filter.addEventListener('change', updateRows);
  body.addEventListener('click', event => {
    const button = event.target.closest('[data-record]');
    if (!button) return;
    const row = rows[Number(button.dataset.record)];
    document.querySelector('#detail-body').innerHTML = `<h2 id="detail-title">${row[0]}</h2><p class="subtle">Demo record</p>
    <dl class="detail-list">${headers.map((label,index) => `<dt>${label}</dt><dd>${row[index]}</dd>`).join('')}</dl>`;
    dialog.setAttribute('aria-labelledby','detail-title');
    dialog.showModal();
  });
  updateRows();
}
function render() {
  const requested = location.hash.slice(1);
  const key = Object.hasOwn(routes,requested) ? requested : 'overview';
  nav.querySelectorAll('a').forEach(link => {
    if (link.hash === '#' + key) link.setAttribute('aria-current','page');
    else link.removeAttribute('aria-current');
  });
  setMenu(false);
  if (key === 'overview') showOverview();
  else showList(key);
  document.title = routes[key] + ' | Forge Admin';
}
window.addEventListener('hashchange', () => {
  render();
  main.focus({preventScroll: true});
});
render();
