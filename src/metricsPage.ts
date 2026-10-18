export function metricsPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Globe metrics</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>
      :root { color: #e7f5ef; background: #081216; font-family: 'Space Grotesk', sans-serif; }
      * { box-sizing: border-box; } body { margin: 0; min-width: 320px; background: radial-gradient(circle at 80% -10%, rgba(43, 145, 124, .18), transparent 34rem), #081216; }
      main { width: min(1120px, calc(100% - 40px)); margin: 0 auto; padding: 58px 0 80px; }
      header { display: flex; align-items: end; justify-content: space-between; gap: 24px; padding-bottom: 30px; border-bottom: 1px solid rgba(151, 222, 199, .14); }
      .eyebrow { color: #79d3b7; font: 10px 'DM Mono', monospace; letter-spacing: .16em; } h1 { margin: 14px 0 0; font-size: clamp(38px, 5vw, 58px); line-height: .96; letter-spacing: -.065em; font-weight: 500; }
      .range { display: flex; border: 1px solid rgba(151, 222, 199, .16); border-radius: 6px; overflow: hidden; } .range button { border: 0; border-right: 1px solid rgba(151, 222, 199, .16); padding: 10px 13px; color: #8ba8a0; background: transparent; cursor: pointer; font: 10px 'DM Mono', monospace; } .range button:last-child { border-right: 0; }.range button.is-active { color: #0b2521; background: #9be7cb; }
      .notice { margin: 24px 0; padding: 12px 14px; border: 1px solid rgba(151, 222, 199, .12); border-radius: 6px; color: #7f9a92; background: rgba(23, 53, 54, .4); font: 11px 'DM Mono', monospace; line-height: 1.55; }
      .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 26px 0 32px; }.card, .panel { border: 1px solid rgba(151, 222, 199, .13); border-radius: 8px; background: rgba(16, 34, 39, .84); }.card { padding: 18px; min-height: 120px; }.card span { display: block; color: #78968e; font: 9px 'DM Mono', monospace; letter-spacing: .11em; text-transform: uppercase; }.card strong { display: block; margin-top: 18px; font: 500 31px 'Space Grotesk', sans-serif; letter-spacing: -.055em; color: #dff7ed; }.card small { display: block; color: #5f7d76; font: 9px 'DM Mono', monospace; margin-top: 7px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }.panel { min-height: 250px; padding: 22px; }.panel.wide { grid-column: 1 / -1; }.panel h2 { margin: 0 0 18px; font-size: 18px; letter-spacing: -.035em; font-weight: 500; }.panel p { color: #74918a; font: 10px 'DM Mono', monospace; line-height: 1.6; }
      table { width: 100%; border-collapse: collapse; } th { color: #5e7b74; font: 9px 'DM Mono', monospace; text-align: left; text-transform: uppercase; letter-spacing: .1em; padding: 0 0 10px; } td { border-top: 1px solid rgba(151, 222, 199, .1); color: #cfe5dc; font-size: 12px; padding: 11px 0; } td:last-child, th:last-child { text-align: right; font-family: 'DM Mono', monospace; color: #8ee1c4; }.empty { color: #608078; font: 11px 'DM Mono', monospace; padding: 30px 0; }.error { color: #f1b1a1; }
      footer { margin-top: 16px; color: #58756e; font: 9px 'DM Mono', monospace; line-height: 1.6; }
      @media (max-width: 760px) { main { width: min(100% - 28px, 600px); padding-top: 30px; } header { align-items: start; flex-direction: column; }.cards, .grid { grid-template-columns: 1fr 1fr; }.panel.wide { grid-column: auto; } }
      @media (max-width: 460px) { .cards, .grid { grid-template-columns: 1fr; }.panel.wide { grid-column: auto; } }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div><div class="eyebrow">GLOBE / PRIVATE OBSERVABILITY</div><h1>What people are<br />doing with geography.</h1></div>
        <div class="range" role="group" aria-label="Metrics period"><button data-days="7">7D</button><button class="is-active" data-days="30">30D</button><button data-days="90">90D</button></div>
      </header>
      <div class="notice" id="notice">Loading the selected period…</div>
      <section class="cards" aria-live="polite">
        <article class="card"><span>Page views</span><strong id="page-views">—</strong><small id="period-copy">Selected period</small></article>
        <article class="card"><span>Unique today</span><strong id="unique-today">—</strong><small>Daily anonymous visitors</small></article>
        <article class="card"><span>Downloads</span><strong id="downloads">—</strong><small>Exports initiated</small></article>
        <article class="card"><span>Download rate</span><strong id="conversion">—</strong><small>Downloads ÷ page views</small></article>
      </section>
      <section class="grid">
        <article class="panel"><h2>Most explored countries</h2><div id="countries"></div></article>
        <article class="panel"><h2>Most selected boundaries</h2><div id="selections"></div></article>
        <article class="panel"><h2>Most downloaded boundaries</h2><div id="boundaries"></div></article>
        <article class="panel"><h2>Traffic sources</h2><div id="sources"></div></article>
        <article class="panel"><h2>Activity by day</h2><div id="activity"></div></article>
      </section>
      <footer>Events exclude browsers that send Do Not Track. Visitor IDs are daily hashed; this dashboard stores no IP addresses or coordinates.</footer>
    </main>
    <script>
      const formatNumber = new Intl.NumberFormat('en-US');
      let days = 30;
      const text = (value) => value == null || value === '' ? '—' : String(value);
      const table = (target, columns, rows, values) => {
        const root = document.getElementById(target); root.replaceChildren();
        if (!rows.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = 'No activity yet.'; root.append(empty); return; }
        const element = document.createElement('table'); const head = document.createElement('thead'); const headRow = document.createElement('tr');
        columns.forEach((column) => { const cell = document.createElement('th'); cell.textContent = column; headRow.append(cell); }); head.append(headRow); element.append(head);
        const body = document.createElement('tbody'); rows.forEach((row) => { const tr = document.createElement('tr'); values(row).forEach((value) => { const td = document.createElement('td'); td.textContent = text(value); tr.append(td); }); body.append(tr); }); element.append(body); root.append(element);
      };
      const load = async () => {
        const notice = document.getElementById('notice'); notice.textContent = 'Loading the selected period…'; notice.className = 'notice';
        try {
          const response = await fetch('/__globe/metrics/summary?days=' + days, { cache: 'no-store' });
          if (!response.ok) throw new Error('The dashboard could not load its metrics.');
          const data = await response.json();
          document.getElementById('page-views').textContent = formatNumber.format(data.summary.pageViews);
          document.getElementById('unique-today').textContent = formatNumber.format(data.summary.uniqueToday);
          document.getElementById('downloads').textContent = formatNumber.format(data.summary.downloads);
          document.getElementById('conversion').textContent = data.summary.downloadRate + '%';
          document.getElementById('period-copy').textContent = 'Last ' + data.days + ' days';
          notice.textContent = 'Last updated just now · ' + data.days + '-day view';
          table('countries', ['Country', 'Clicks'], data.topCountries, (row) => [row.country, formatNumber.format(row.count)]);
          table('selections', ['Boundary', 'Selections'], data.topSelections, (row) => [row.label, formatNumber.format(row.count)]);
          table('boundaries', ['Boundary', 'Downloads'], data.topBoundaries, (row) => [row.label, formatNumber.format(row.count)]);
          table('sources', ['Source', 'Views'], data.sources, (row) => [row.source, formatNumber.format(row.count)]);
          table('activity', ['Day', 'Views', 'Downloads'], data.activity, (row) => [row.day, formatNumber.format(row.views), formatNumber.format(row.downloads)]);
        } catch (error) { notice.textContent = error instanceof Error ? error.message : 'The dashboard could not load its metrics.'; notice.className = 'notice error'; }
      };
      document.querySelectorAll('[data-days]').forEach((button) => button.addEventListener('click', () => { days = Number(button.dataset.days); document.querySelectorAll('[data-days]').forEach((item) => item.classList.toggle('is-active', item === button)); load(); }));
      load();
    </script>
  </body>
</html>`
}
