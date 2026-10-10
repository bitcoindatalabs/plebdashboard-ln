// Shared renderer for LN Weekly / LN Monthly snapshots (data/reports/{weekly,monthly}/<id>.json, written by
// python/automation/shared/lightning/report_snapshots.py). Used by reports.html (scripts/ln-reports.js) and the
// screenshot canvas report-card.html (scripts/ln-report-card.js), so the website and the social images are one design.
// Node names link to profile.html?node=<pubkey>; a channel links to the channel explorer filtered by its two nodes.

// ---------------------------------------------------------------------------
// Formatting (mirrors python/automation/shared/formatters.py)
// ---------------------------------------------------------------------------
const nf = (v, d) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = {
    int: (n) => Number(n).toLocaleString('en-US'),
    sint: (n) => (n < 0 ? '-' : '+') + Number(Math.abs(n)).toLocaleString('en-US'),
    sats: (s) => `${Number(Math.round(s)).toLocaleString('en-US')} sats`,
    btc(v, d = 2) {                       // below 0.01 BTC show sats so it never reads 0.00
        const a = Math.abs(v);
        return a && a < 0.01 ? fmt.sats(a * 1e8) : `${nf(a, d)} BTC`;
    },
    sbtc: (v, d = 2) => (Number(v) < 0 ? '-' : '+') + fmt.btc(v, d),
    satsOrBtc: (s) => (s >= 1e8 ? fmt.btc(s / 1e8) : s >= 1e6 ? `${nf(s / 1e6, s % 1e6 ? 1 : 0)}M sats` : fmt.sats(s)),
    pct: (v, d = 1) => `${nf(v, d)}%`,
    date: (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const nodeLink = (node) => `<a class="rpt-node" href="profile.html?node=${encodeURIComponent(node.pub)}" title="Open node profile">${esc(node.name)}</a>`;

function channelLinks(ch) {
    if (!ch) return '<p class="rpt-muted">No channels opened.</p>';
    const explorer = `channel-explorer.html?node1=${encodeURIComponent(ch.node1.pub)}&node2=${encodeURIComponent(ch.node2.pub)}`;
    return `<p class="rpt-channel">${nodeLink(ch.node1)} <span class="rpt-arrow">↔</span> ${nodeLink(ch.node2)}</p>
        <p class="rpt-channel-meta"><strong>${fmt.satsOrBtc(ch.capacity_sats)}</strong>
        ${ch.short_channel_id ? ` • channel ${esc(ch.short_channel_id)}` : ''}<span class="rpt-web-only">
        • <a href="${explorer}">Channels between them <i class="fas fa-arrow-right"></i></a></span></p>`;
}

// "+5" / "-3" / "0": a zero never gets a sign (avoids "-0.00 BTC")
const pm = (v, sign, f = fmt.int) => (Number(v) === 0 ? '0' : sign + f(v));

const signClass = (v) => (Number(v) < 0 ? 'rpt-neg' : 'rpt-pos');

function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const COLORS = () => ({
    open: cssVar('--ghibli-slate') || '#2C5672',
    close: cssVar('--ghibli-madder') || '#A93E3B',
    pos: cssVar('--ghibli-sage') || '#2E7559',
    neg: cssVar('--ghibli-madder') || '#A93E3B',
    accent: cssVar('--primary') || '#D47355',
    grid: cssVar('--border') || '#E5DFD5',
    text: cssVar('--text-secondary') || '#5E6977',
    freeway: cssVar('--cat-freeway') || '#2E7559',
    highway: cssVar('--cat-highway') || '#9A6715',
    my_way: cssVar('--cat-myway') || '#2C5672',
});

// ---------------------------------------------------------------------------
// Charts (ECharts); every chart is mounted after the HTML is in the DOM
// ---------------------------------------------------------------------------
const charts = [];
const mounts = [];

/** Mounts every chart queued by the last render (call after the HTML is in the DOM). */
export function mountCharts() {
    mounts.splice(0).forEach((m) => m());
}

/** Disposes mounted charts before a re-render. */
export function disposeCharts() {
    charts.splice(0).forEach((c) => c.dispose());
    mounts.length = 0;
}

export function resizeCharts() {
    charts.forEach((c) => c.resize());
}

function mount(id, optionFn) {
    mounts.push(() => {
        const el = document.getElementById(id);
        if (!el || typeof echarts === 'undefined') return;
        const c = echarts.init(el, null, { renderer: 'svg' });
        c.setOption({ animation: false, ...optionFn(COLORS()) });
        charts.push(c);
    });
    return `<div class="rpt-chart" id="${id}"></div>`;
}

function sparkline(id, values, color, zeroLine = false) {
    mounts.push(() => {
        const el = document.getElementById(id);
        if (!el || typeof echarts === 'undefined') return;
        const c = echarts.init(el, null, { renderer: 'svg' });
        const C = COLORS();
        c.setOption({
            animation: false,
            grid: { left: 2, right: 6, top: 6, bottom: 4 },
            xAxis: { type: 'category', show: false, data: values.map((_, i) => i) },
            yAxis: { type: 'value', show: false, scale: !zeroLine },
            series: [{
                type: 'line', data: values, symbol: 'none', lineStyle: { width: 2, color: C[color] || color },
                markLine: zeroLine ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: C.grid, type: 'solid' }, data: [{ yAxis: 0 }] } : undefined,
                markPoint: { symbol: 'circle', symbolSize: 7, label: { show: false }, itemStyle: { color: C[color] || color }, data: [{ coord: [values.length - 1, values[values.length - 1]] }] },
            }],
        });
        charts.push(c);
    });
    return `<div class="rpt-spark" id="${id}"></div>`;
}

function barsOption(labels, series, C, { stackSign = false } = {}) {
    return {
        animation: false,
        grid: { left: 40, right: 12, top: 30, bottom: 28 },
        legend: series.length > 1 ? { top: 0, right: 0, textStyle: { color: C.text, fontSize: 11 } } : undefined,
        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLabel: { color: C.text, fontSize: 11 }, axisLine: { lineStyle: { color: C.grid } } },
        yAxis: { type: 'value', axisLabel: { color: C.text, fontSize: 10 }, splitLine: { lineStyle: { color: C.grid } } },
        series: series.map((s) => ({
            type: 'bar', name: s.name, data: stackSign ? s.data.map((v) => ({ value: v, itemStyle: { color: v < 0 ? C.neg : C.pos } })) : s.data,
            itemStyle: { color: s.color }, barMaxWidth: 26,
            label: s.labels ? { show: true, position: 'top', fontSize: 10, color: C.text, formatter: s.labels } : undefined,
        })),
    };
}

/** Paired bars on two y-axes (net BTC left, net channels right) with both zero lines at the same height. */
function tierNetOption(labels, btc, chans, C) {
    const extent = (v) => { const lo = Math.min(0, ...v), hi = Math.max(0, ...v), pad = (hi - lo || 1) * 0.25; return [lo - pad, hi + pad]; };
    let [l1, h1] = extent(btc), [l2, h2] = extent(chans);
    const below = Math.max(-l1 / (h1 - l1), -l2 / (h2 - l2));
    const fit = (lo, hi) => { const h = Math.max(below > 0 ? -lo / below : 0, below < 1 ? hi / (1 - below) : 0); return [-below * h, (1 - below) * h]; };
    [l1, h1] = fit(l1, h1); [l2, h2] = fit(l2, h2);
    const lab = (f) => ({ show: true, fontSize: 10, color: C.text, formatter: (p) => f(p.value), position: 'top' });
    return {
        grid: { left: 8, right: 8, top: 30, bottom: 40 },
        legend: { top: 0, right: 0, textStyle: { color: C.text, fontSize: 11 } },
        xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLabel: { color: C.text, fontSize: 10, lineHeight: 13 }, axisLine: { lineStyle: { color: C.grid } } },
        yAxis: [{ type: 'value', min: l1, max: h1, show: false }, { type: 'value', min: l2, max: h2, show: false }],
        series: [
            { type: 'bar', name: 'Net BTC', yAxisIndex: 0, barMaxWidth: 34, itemStyle: { color: C.accent },
              data: btc.map((v) => ({ value: v, label: { ...lab((x) => fmt.sbtc(x, 1).replace(' BTC', '')), position: v < 0 ? 'bottom' : 'top' } })) },
            { type: 'bar', name: 'Net channels', yAxisIndex: 1, barMaxWidth: 34, itemStyle: { color: C.text },
              data: chans.map((v) => ({ value: v, label: { ...lab((x) => (x === 0 ? '0' : fmt.sint(x))), position: v < 0 ? 'bottom' : 'top' } })) },
        ],
    };
}

/** Paired percentage bars: share of capacity vs share of nodes per tier. */
function pairedPctOption(labels, capPct, nodePct, C) {
    const lab = { show: true, position: 'top', fontSize: 10, color: C.text, formatter: (p) => `${nf(p.value, 1)}%` };
    return {
        grid: { left: 8, right: 8, top: 30, bottom: 40 },
        legend: { top: 0, right: 0, textStyle: { color: C.text, fontSize: 11 } },
        xAxis: { type: 'category', data: labels, axisTick: { show: false }, axisLabel: { color: C.text, fontSize: 10, lineHeight: 13 }, axisLine: { lineStyle: { color: C.grid } } },
        yAxis: { type: 'value', max: 118, show: false },
        series: [
            { type: 'bar', name: '% of capacity', data: capPct, barMaxWidth: 34, itemStyle: { color: C.accent }, label: lab },
            { type: 'bar', name: '% of nodes', data: nodePct, barMaxWidth: 34, itemStyle: { color: C.text }, label: lab },
        ],
    };
}

// ---------------------------------------------------------------------------
// Shared blocks
// ---------------------------------------------------------------------------
const card = (eyebrow, title, body, extra = '') => `
    <section class="home-card rpt-card ${extra}">
        <div class="card-section-header"><div class="section-title-wrap">
            <span class="card-eyebrow">${eyebrow}</span><h2>${title}</h2>
        </div></div>${body}</section>`;

function tile(label, value, sub, median, spark, valueClass = '') {
    return `<div class="rpt-tile">
        <span class="rpt-tile-label">${label}</span>
        <span class="rpt-tile-value ${valueClass}">${value}</span>
        <span class="rpt-tile-sub">${sub}</span>
        ${median ? `<span class="rpt-tile-median">${median}</span>` : ''}
        ${spark || ''}</div>`;
}

function closeTypes(ct, extraRows = '') {
    if (!ct.available) return '<p class="rpt-muted">Close types unavailable for this period.</p>';
    return `<div class="rpt-split" role="img" aria-label="${ct.mutual_pct}% mutual, ${ct.force_pct}% force">
            <span class="rpt-split-mutual" style="width:${ct.mutual_pct}%"></span><span class="rpt-split-force" style="width:${ct.force_pct}%"></span></div>
        <div class="rpt-split-legend"><span class="rpt-pos">Mutual ${ct.mutual_pct}% (${fmt.int(ct.mutual)})</span>
            <span class="rpt-neg">Force ${ct.force_pct}% (${fmt.int(ct.force)})</span></div>
        <dl class="rpt-facts">
            <dt>Splices</dt><dd>${fmt.int(ct.splice)} <span class="rpt-muted">(counted as a close plus a reopen)</span></dd>
            <dt>Penalty transactions</dt><dd>${ct.breach ? `${fmt.int(ct.breach)} justice transaction${ct.breach === 1 ? '' : 's'} confirmed` : 'None confirmed'}</dd>
            ${extraRows}
        </dl>`;
}

function reportHeader(snap, eyebrow, headline) {
    const pdf = snap.assets && snap.assets.pdf
        ? `<a class="card-action-link" href="${esc(snap.assets.pdf)}" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i> PDF</a>` : '';
    return `<header class="rpt-head">
        <div><span class="card-eyebrow">${eyebrow}</span>
        <h2 class="rpt-headline">${esc(headline)}</h2>
        <p class="rpt-muted">Published ${fmt.date(snap.generated_at)} • Opens dated by funding block, closes by on-chain close transaction (UTC)</p></div>
        ${pdf}</header>`;
}

// ---------------------------------------------------------------------------
// LN Weekly
// ---------------------------------------------------------------------------
export function weeklySections(s) {
    const k = s.kpis, t = s.totals, n = s.node_of_week, bw = s.baseline_weeks;
    const series = s.series;
    const med = (key, f) => (k[key].median === null ? '' : `${bw}-week median ${f(k[key].median)}`);

    const tiles = `<div class="rpt-tiles">
        ${tile('Net flow', fmt.sbtc(t.net_btc), `${fmt.sint(t.net_channels)} channels net`, med('net_btc', fmt.sbtc), sparkline('spNet', series.map((w) => w.net_btc), 'accent', true), signClass(t.net_btc))}
        ${tile('Opened', fmt.int(t.opened), `+${fmt.btc(t.opened_btc)}`, med('opens', (v) => fmt.int(Math.round(v))), sparkline('spOpen', series.map((w) => w.opens), 'open'))}
        ${tile('Closed', fmt.int(t.closed), `-${fmt.btc(t.closed_btc)}`, med('closes', (v) => fmt.int(Math.round(v))), sparkline('spClose', series.map((w) => w.closes), 'close'))}
        ${tile('Force-close share', fmt.pct(k.force_pct.value), 'of mutual + force closes', med('force_pct', (v) => fmt.pct(v)), sparkline('spForce', series.map((w) => w.force_pct), 'close'))}
    </div><p class="rpt-note">Trend lines: last ${series.length} weeks, this week marked.</p>`;

    const daily = card('<i class="fas fa-chart-column"></i> By day', 'Channels opened vs closed',
        mount('chDaily', (C) => barsOption(s.daily.labels, [
            { name: 'Opened', data: s.daily.opened, color: C.open, labels: '{c}' },
            { name: 'Closed', data: s.daily.closed, color: C.close, labels: '{c}' }], C)));

    const closes = card('<i class="fas fa-link-slash"></i> Closures', 'How channels closed',
        closeTypes(s.close_types, `<dt>Lifespan of closed channels</dt><dd>${t.median_lifespan_days === null ? 'Unavailable'
            : `Median ${fmt.int(t.median_lifespan_days)} days from funding to close`}</dd>`));

    const moverRows = (rows, sign) => rows.length ? `<div class="rpt-table-wrap"><table class="rpt-table rpt-movers"><thead><tr><th>#</th><th>Node</th><th class="num">Net</th><th class="num">Channels opened / closed</th></tr></thead><tbody>
        ${rows.map((m, i) => `<tr><td>${i + 1}</td><td class="rpt-name">${nodeLink(m)}</td><td class="num ${sign}"><strong>${fmt.sbtc(m.net_btc)}</strong></td>
            <td class="num">${pm(m.opened_n, '+')} / ${pm(m.closed_n, '-')}${m.force_closed_n ? ` <span class="rpt-muted">(${fmt.int(m.force_closed_n)} force)</span>` : ''}
            <span class="rpt-sub-btc"><br><span class="rpt-muted">${pm(m.opened_btc, '+', fmt.btc)} / ${pm(m.closed_btc, '-', fmt.btc)}</span></span></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="rpt-muted">No node had a net change in this direction.</p>';
    const movers = `<div class="rpt-grid-2">
        ${card('<i class="fas fa-arrow-trend-up"></i> Movers', 'Adding capacity', moverRows(s.movers.adders, 'rpt-pos'))}
        ${card('<i class="fas fa-arrow-trend-down"></i> Movers', 'Pulling capacity', moverRows(s.movers.reducers, 'rpt-neg'))}
    </div><p class="rpt-note">Per node: BTC in channels opened minus channels closed this week. A channel counts for both of its nodes.</p>`;

    const events = s.mass_close_events.length
        ? `<ul class="rpt-list">${s.mass_close_events.map((e) => `<li>${fmt.date(e.date)}: ${nodeLink(e)}, <strong>${fmt.int(e.force_closes)}</strong> force closes (${fmt.btc(e.btc)})</li>`).join('')}</ul>`
        : '<p class="rpt-pos"><strong>None this week</strong></p>';
    const notables = `<div class="rpt-grid-2">
        ${card('<i class="fas fa-bolt"></i> Notable', 'Largest channel opened', channelLinks(s.largest_channel))}
        ${card('<i class="fas fa-triangle-exclamation"></i> Notable', 'Mass force-close events', `${events}<p class="rpt-note">One node party to 20+ force closes in a UTC day.</p>`)}
    </div>`;

    const top = s.movers.adders[0] || s.movers.reducers[0];
    return {
        eyebrow: `<i class="fas fa-calendar-week"></i> LN Weekly • ${esc(s.label)} (UTC)`,
        headline: s.headline,
        moversHeadline: top ? `${top.name} ${s.movers.adders.length ? 'added' : 'pulled'} the most capacity: ${fmt.sbtc(top.net_btc)} net` : 'Movers',
        baseline: baselineLine(s.baseline, 'at week end'), tiles, daily, closes, movers, notables, notw: renderNodeOfWeek(n),
    };
}

export function renderWeekly(s) {
    const x = weeklySections(s);
    return reportHeader(s, x.eyebrow, x.headline) + x.baseline + x.tiles
        + `<div class="rpt-grid-2 rpt-grid-wide">${x.daily}${x.closes}</div>` + x.movers + x.notables + x.notw;
}

function renderNodeOfWeek(n) {
    const rank = n.capacity_rank, prev = n.capacity_rank_week_ago;
    const rankSub = rank === null ? 'rank unavailable' : prev === null ? 'new to the ranking'
        : prev === rank ? 'unchanged from a week earlier' : `${rank < prev ? 'up' : 'down'} from #${prev} a week earlier`;
    const skipped = n.passed_over.filter((p) => p.reason === 'featured in the last 12 weeks');
    const skipNote = skipped.length ? `<p class="rpt-note">${skipped.map((p) => `${nodeLink(p)} added more (${fmt.sbtc(p.net_btc)}) but was node of the week in the last 12 weeks.`).join(' ')}</p>` : '';
    const capTotal = ['freeway', 'highway', 'my_way'].reduce((a, k) => a + n.tiers[k].btc, 0) || 1;
    const tierNames = { freeway: 'Freeway (> 1 BTC)', highway: 'Highway (> 5M sats to 1 BTC)', my_way: 'My Way (≤ 5M sats)' };
    const tiers = `<div class="rpt-tierbar">${['freeway', 'highway', 'my_way'].map((k) => `<span class="rpt-tier-${k}" style="width:${(n.tiers[k].btc / capTotal * 100).toFixed(1)}%"></span>`).join('')}</div>
        <ul class="rpt-tier-list">${['freeway', 'highway', 'my_way'].map((k) => `<li><span class="rpt-swatch rpt-tier-${k}"></span><strong>${tierNames[k]}</strong>
            <span class="rpt-muted">${fmt.int(n.tiers[k].count)} channels • ${fmt.btc(n.tiers[k].btc)} (${Math.round(n.tiers[k].btc / capTotal * 100)}% of capacity)</span></li>`).join('')}</ul>`;
    const peers = n.top_new_peers.length ? `<ol class="rpt-peers">${n.top_new_peers.map((p) => `<li>${nodeLink(p)} <span class="rpt-muted">${fmt.btc(p.btc)} across ${fmt.int(p.channels)} channel${p.channels === 1 ? '' : 's'}</span></li>`).join('')}</ol>` : '<p class="rpt-muted">No new channels.</p>';

    const body = `<p class="rpt-notw-name">${nodeLink(n)}</p>
        <p class="rpt-muted">${esc(n.rule)}.</p>${skipNote}
        <div class="rpt-tiles">
            ${tile('Net capacity added', fmt.sbtc(n.net_btc), `${fmt.sint(n.net_n)} channels net`, '', '', signClass(n.net_btc))}
            ${tile('Channels opened', fmt.int(n.opened_n), fmt.btc(n.opened_btc), '', '')}
            ${tile('Channels closed', fmt.int(n.closed_n), `${fmt.btc(n.closed_btc)} • ${n.closed_mutual_n} mutual, ${n.closed_force_n} force`, '', '')}
            ${tile('Capacity rank', rank === null ? 'n/a' : `#${rank}`, rankSub, '', '')}
        </div>
        <div class="rpt-grid-2">
            <div><h3 class="rpt-h3">Channels at week end</h3><p class="rpt-muted">${fmt.int(n.open_channels)} open public channels • ${fmt.btc(n.open_capacity_btc)}</p>${tiers}
                <p class="rpt-muted">Node software: <strong>${n.client ? esc(n.client) : 'not identified'}</strong></p></div>
            <div><h3 class="rpt-h3">Biggest new peers this week</h3>${peers}</div>
        </div>`;
    return card('<i class="fas fa-trophy"></i> Node of the week', 'Largest net capacity added', body, 'rpt-notw');
}

function baselineLine(b, when) {
    return `<p class="rpt-baseline"><i class="fas fa-network-wired"></i> Open public channels ${when}:
        <strong>${fmt.btc(b.capacity_btc)}</strong> across <strong>${fmt.int(b.channels)}</strong> channels and <strong>${fmt.int(b.nodes)}</strong> nodes</p>`;
}

// ---------------------------------------------------------------------------
// LN Monthly
// ---------------------------------------------------------------------------
export function monthlySections(s) {
    const t = s.totals, fc = s.force_closes, lt = s.lifespan, tr = s.taproot;
    const headline = `Net ${fmt.sbtc(t.net_btc)} in ${s.label} (${fmt.sint(t.net_channels)} channels)`;

    const tiles = `<div class="rpt-tiles">
        ${tile('Net flow', fmt.sbtc(t.net_btc), `${fmt.sint(t.net_channels)} channels net`, `Prior month ${fmt.sbtc(s.prior_month.net_btc)} (${fmt.sint(s.prior_month.net_channels)} channels)`, sparkline('spMNet', s.trailing_6m.map((m) => m.net_btc), 'accent', true), signClass(t.net_btc))}
        ${tile('Opened', fmt.int(t.opened), `+${fmt.btc(t.opened_btc)}`, t.median_new_channel_sats ? `Median new channel ${fmt.satsOrBtc(t.median_new_channel_sats)}` : '', '')}
        ${tile('Closed', fmt.int(t.closed), `-${fmt.btc(t.closed_btc)}`, t.closed ? `Avg channel closed ${fmt.satsOrBtc(t.closed_btc * 1e8 / t.closed)}` : '', '')}
        ${tile('Change vs prior month', fmt.sbtc(s.mom_net_shift_btc), 'in net flow', '', '', signClass(s.mom_net_shift_btc))}
    </div>`;

    const df = s.daily_flow;
    const mon = new Date(s.period.start).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const peak = Math.max(...df.closed);
    const peakDay = df.days[df.closed.indexOf(peak)];
    const dailyNote = df.days.length ? `<p class="rpt-note">Daily peak close: <strong>${mon} ${Number(peakDay)}</strong> (-${fmt.int(peak)})
        • Daily mean: +${fmt.int(Math.round(t.opened / df.days.length))} / -${fmt.int(Math.round(t.closed / df.days.length))} channels</p>` : '';
    const flows = `<div class="rpt-grid-2 rpt-grid-wide">
        ${card('<i class="fas fa-chart-column"></i> By day', 'Channels opened vs closed',
            mount('chMDaily', (C) => ({ ...barsOption(df.days, [
                { name: 'Opened', data: df.opened, color: C.open },
                { name: 'Closed', data: df.closed, color: C.close }], C) })) + dailyNote)}
        ${card('<i class="fas fa-chart-simple"></i> Trend', '6-month net flow (BTC)',
            mount('chM6', (C) => barsOption(s.trailing_6m.map((m) => m.label), [
                { name: 'Net BTC', data: s.trailing_6m.map((m) => m.net_btc), labels: (p) => fmt.sbtc(p.value, 1).replace(' BTC', '') }], C, { stackSign: true }))
            + `<p class="rpt-note">6-month cumulative: <strong>${fmt.sbtc(s.trailing_6m.reduce((a, m) => a + m.net_btc, 0), 1)}</strong></p>`)}
    </div>`;

    const dist = lt.distribution || {};
    const distRows = [['gt_180d', '> 180 days'], ['d91_180', '91–180 days'], ['d15_90', '15–90 days'], ['lt_14d', '≤ 14 days']]
        .filter(([k]) => dist[k]).map(([k, l]) => `<li><span>${l}</span><span class="rpt-mini-bar"><span style="width:${dist[k].pct}%"></span></span><span>${fmt.pct(dist[k].pct)}</span></li>`).join('');
    const closures = card('<i class="fas fa-link-slash"></i> Closures', 'How channels closed',
        closeTypes(s.close_types, `<dt>Lifespan of closed channels</dt><dd>${lt.median_days === null ? 'Unavailable'
            : `Median ${fmt.int(lt.median_days)} days from funding to close; ${fmt.pct(lt.more_than_180d_pct)} open more than 180 days`}</dd>`)
        + (distRows ? `<ul class="rpt-dist">${distRows}</ul>` : '')
        + (dist.lt_14d && dist.gt_180d ? `<p class="rpt-life-counts"><span class="rpt-neg">Closed within 14 days of funding: <strong>${fmt.int(dist.lt_14d.count)}</strong> (${fmt.pct(dist.lt_14d.pct)})</span>
            <span class="rpt-pos">Open longer than 180 days: <strong>${fmt.int(dist.gt_180d.count)}</strong> (${fmt.pct(dist.gt_180d.pct)})</span></p>` : ''));

    const fcRows = fc.available ? `<dl class="rpt-facts">
            ${fc.htlc_pct !== null ? `<dt>HTLCs in flight at close</dt><dd>${fmt.pct(fc.htlc_pct)} of force closes</dd>` : ''}
            ${fc.anchor_pct !== null ? `<dt>Anchor outputs</dt><dd>${fmt.pct(fc.anchor_pct)} (fee bumping via CPFP)</dd>` : ''}
            ${fc.median_sweep_blocks !== null ? `<dt>Time to sweep</dt><dd>Closer's balance swept a median ${fmt.int(fc.median_sweep_blocks)} blocks (~${nf(fc.median_sweep_blocks / 144, 1)} days) later</dd>` : ''}
            ${fc.median_fee_force_sats !== null ? `<dt>Median close fee</dt><dd>${fmt.int(fc.median_fee_mutual_sats)} sats mutual vs ${fmt.int(fc.median_fee_force_sats)} sats force</dd>` : ''}
            ${tr.available && tr.active_taproot !== null ? `<dt>Taproot (P2TR)</dt><dd>${fmt.int(tr.active_taproot)} of ${fmt.int(tr.active_checked)} public channels fund to a Taproot output${tr.closes_since ? `; ${fmt.int(tr.taproot_closes_since)} of ${fmt.int(tr.closes_since)} closes since ${fmt.date(tr.since)} spent one` : ''}</dd>` : ''}
        </dl>` : '<p class="rpt-muted">Force-close detail unavailable.</p>';
    const force = card('<i class="fas fa-bolt-lightning"></i> Force closes', 'Share of closes that were unilateral',
        (fc.available && fc.trend.length ? mount('chMForce', (C) => barsOption(fc.trend.map((m) => m.label), [
            { name: 'Force share %', data: fc.trend.map((m) => m.force_pct), color: C.close, labels: (p) => `${Math.round(p.value)}%` }], C)) : '') + fcRows);

    const tierNames = { freeway: ['Freeway', '> 1 BTC'], highway: ['Highway', '> 5M sats to 1 BTC'], my_way: ['My Way', '≤ 5M sats'] };
    const ct = s.channel_tiers;
    const chanTable = `<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Tier</th><th class="num">Open</th><th class="num">% of capacity</th><th class="num">Month net</th></tr></thead><tbody>
        ${['freeway', 'highway', 'my_way'].map((k) => `<tr><td><span class="rpt-swatch rpt-tier-${k}"></span><strong>${tierNames[k][0]}</strong><br><span class="rpt-muted">${tierNames[k][1]}</span></td>
            <td class="num">${fmt.int(ct[k].count)}</td><td class="num">${fmt.pct(ct[k].capacity_pct)}</td>
            <td class="num rpt-wrap ${signClass(ct[k].monthly_net_btc)}"><strong>${fmt.sbtc(ct[k].monthly_net_btc)}</strong>
                <br><span class="rpt-muted">${pm(ct[k].monthly_net_count, ct[k].monthly_net_count > 0 ? '+' : '', fmt.int)} channels net</span>
                <br><span class="rpt-muted">${fmt.int(ct[k].monthly_opened_count)} opened • ${fmt.int(ct[k].monthly_closed_count)} closed</span></td></tr>`).join('')}
        </tbody></table></div>`;
    const nt = s.node_tiers;
    const nodeNames = { powerhouses: ['Powerhouses', '> 5 BTC'], pillars: ['Pillars', '> 0.1 to 5 BTC'], plebs: ['Plebs', '≤ 0.1 BTC'] };
    const nodeTable = `<div class="rpt-table-wrap"><table class="rpt-table"><thead><tr><th>Tier</th><th class="num">Nodes</th><th class="num">% of nodes</th><th class="num">% of capacity</th></tr></thead><tbody>
        ${['powerhouses', 'pillars', 'plebs'].map((k) => `<tr><td><strong>${nodeNames[k][0]}</strong><br><span class="rpt-muted">${nodeNames[k][1]}</span></td><td class="num">${fmt.int(nt[k].count)}</td>
            <td class="num">${fmt.pct(nt[k].count_pct)}</td><td class="num">${fmt.pct(nt[k].capacity_pct)}</td></tr>`).join('')}
        </tbody></table></div><p class="rpt-note">${fmt.int(nt.monthly_new_nodes)} nodes first seen in gossip this month.</p>`;

    // Tier net change (paired: net BTC on the left axis, net channels on the right, zero lines aligned)
    const TK = ['freeway', 'highway', 'my_way'];
    const netBtc = TK.map((k) => ct[k].monthly_net_btc), netCh = TK.map((k) => ct[k].monthly_net_count);
    const small = { btc: ct.highway.monthly_net_btc + ct.my_way.monthly_net_btc, n: ct.highway.monthly_net_count + ct.my_way.monthly_net_count };
    const tierChart = mount('chMTiers', (C) => tierNetOption(TK.map((k) => `${tierNames[k][0]}\n(${tierNames[k][1]})`), netBtc, netCh, C));
    const grew = (v) => (v >= 0 ? 'grew' : 'shrank');
    const tierFlow = `<div class="rpt-chart-sm">${tierChart}</div>
        <dl class="rpt-facts">
            <dt>Freeway channels (&gt; 1 BTC)</dt><dd><strong>${pm(ct.freeway.monthly_net_count, ct.freeway.monthly_net_count > 0 ? '+' : '', fmt.int)} channels net (${fmt.sbtc(ct.freeway.monthly_net_btc, 1)})</strong>
                • ${fmt.int(ct.freeway.count)} open, ${Math.round(ct.freeway.capacity_pct)}% of capacity • opened ${fmt.int(ct.freeway.monthly_opened_count)}, closed ${fmt.int(ct.freeway.monthly_closed_count)}</dd>
            <dt>Smaller channels (1 BTC or less)</dt><dd><strong>${fmt.sint(small.n)} channels net (${fmt.sbtc(small.btc, 1)})</strong>
                • Highway ${fmt.sint(ct.highway.monthly_net_count)} (${fmt.sbtc(ct.highway.monthly_net_btc, 1)}) • My Way ${fmt.sint(ct.my_way.monthly_net_count)} (${fmt.sbtc(ct.my_way.monthly_net_btc, 1)})</dd>
        </dl>
        <div class="rpt-callout"><span class="card-eyebrow">Where capacity moved</span>
            <p>Channels over 1 BTC ${grew(ct.freeway.monthly_net_btc)} by <strong>${fmt.btc(ct.freeway.monthly_net_btc, 1)}</strong> net;
            channels of 1 BTC or less ${grew(small.btc)} by <strong>${fmt.btc(small.btc, 1)}</strong> net.</p></div>`;

    // Node concentration (share of capacity vs share of node count per tier)
    const NK = ['powerhouses', 'pillars', 'plebs'];
    const nodeChart = mount('chMNodes', (C) => pairedPctOption(NK.map((k) => `${nodeNames[k][0]}\n(${nodeNames[k][1]})`),
        NK.map((k) => nt[k].capacity_pct), NK.map((k) => nt[k].count_pct), C));
    const core = { n: nt.powerhouses.count + nt.pillars.count, nPct: nt.powerhouses.count_pct + nt.pillars.count_pct, cap: nt.powerhouses.capacity_pct + nt.pillars.capacity_pct };
    const nodeConc = `<div class="rpt-chart-sm">${nodeChart}</div>
        <dl class="rpt-facts">
            <dt>Powerhouses &amp; Pillars (over 0.1 BTC)</dt><dd><strong>${fmt.int(core.n)} nodes (${fmt.pct(core.nPct)}) hold ${fmt.pct(core.cap)} of capacity</strong>
                • Powerhouses (&gt; 5 BTC): ${fmt.int(nt.powerhouses.count)} nodes, ${fmt.pct(nt.powerhouses.capacity_pct)} • Pillars: ${fmt.int(nt.pillars.count)} nodes, ${fmt.pct(nt.pillars.capacity_pct)}</dd>
            <dt>Plebs (0.1 BTC or less)</dt><dd><strong>${fmt.int(nt.plebs.count)} nodes (${fmt.pct(nt.plebs.count_pct)}) hold ${fmt.pct(nt.plebs.capacity_pct)} of capacity</strong>
                • ${fmt.int(nt.monthly_new_nodes)} nodes first seen in gossip this month (all tiers)</dd>
        </dl>
        <div class="rpt-callout"><span class="card-eyebrow">Concentration</span>
            <p><strong>${fmt.int(nt.powerhouses.count)} nodes (${fmt.pct(nt.powerhouses.count_pct)})</strong> hold <strong>${fmt.pct(nt.powerhouses.capacity_pct)}</strong> of public capacity;
            ${fmt.int(nt.plebs.count)} nodes (${fmt.pct(nt.plebs.count_pct)}) hold ${fmt.pct(nt.plebs.capacity_pct)}.</p></div>`;

    const ct0 = s.close_types;
    return {
        eyebrow: `<i class="fas fa-calendar"></i> LN Monthly • ${esc(s.label)}`, headline,
        baseline: baselineLine(s.baseline, 'now'), tiles, flows,
        closuresSub: `${fmt.int(t.closed)} channels closed in ${esc(s.label)}${ct0.available ? ` • ${ct0.mutual_pct}% mutual` : ''}${lt.median_days !== null ? ` • median lifespan ${fmt.int(lt.median_days)} days` : ''}`,
        closures, force,
        tierFlow: card('<i class="fas fa-road"></i> Channel sizes', 'Channels by size: net change', `<p class="rpt-muted">Opened minus closed this month, by channel capacity tier</p>${tierFlow}`),
        nodeConc: card('<i class="fas fa-server"></i> Node sizes', 'Nodes by size', `<p class="rpt-muted">Share of nodes vs share of public channel capacity</p>${nodeConc}`),
        channelTiers: card('<i class="fas fa-road"></i> Channel sizes', 'Channels by size tier', chanTable),
        nodeTiers: card('<i class="fas fa-server"></i> Node sizes', 'Nodes by capacity tier', nodeTable),
        largest: card('<i class="fas fa-bolt"></i> Notable', 'Largest channel opened', channelLinks(s.largest_channel)),
    };
}

export function renderMonthly(s) {
    const x = monthlySections(s);
    return reportHeader(s, x.eyebrow, x.headline) + x.baseline + x.tiles + x.flows
        + `<div class="rpt-grid-2">${x.closures}${x.force}</div>`
        + `<div class="rpt-grid-2">${x.tierFlow}${x.nodeConc}</div>`
        + `<div class="rpt-grid-2">${x.channelTiers}${x.nodeTiers}</div>` + x.largest;
}

