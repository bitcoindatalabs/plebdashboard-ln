// Screenshot canvas for the LN Weekly / LN Monthly social images (report-card.html), captured locally by
// python/automation/shared/lightning/report_cards.py. Three fixed 1200x675 slides per report, drawn by the same
// renderer as reports.html (ln-report-render.js), so the website and the images are one design.
// Requires ?weekly=<week-end> or ?monthly=<YYYY-MM> (never "latest"). body[data-report-id] + data-loaded="true" are
// set only after that exact report rendered and every slide fits; otherwise data-loaded="error". No fallback data.
import { esc, weeklySections, monthlySections, mountCharts } from './ln-report-render.js?v=2';

const slide = (n, body) => `<section class="card-slide card-${n}" data-slide="${n}">
    <div class="card-body">${body}</div>
    <footer class="card-foot"><span>lightning.bitcoindatalabs.org</span><span>Bitcoin Data Labs • ${n} / 3</span></footer>
</section>`;

const head = (eyebrow, title, sub = '') => `<header class="card-head">
    <span class="card-eyebrow">${eyebrow}</span><h1 class="card-title">${esc(title)}</h1>${sub}</header>`;

function weeklyCards(s) {
    const x = weeklySections(s);
    const n = s.node_of_week;
    return slide(1, head(x.eyebrow, x.headline, x.baseline) + x.tiles
            + `<div class="rpt-grid-2 rpt-grid-wide">${x.daily}${x.closes}</div>`)
        + slide(2, head(x.eyebrow, x.moversHeadline) + x.movers + x.notables)
        + slide(3, head(`LN Weekly • Node of the week • ${esc(s.label)} (UTC)`, n.name) + x.notw);
}

function monthlyCards(s) {
    const x = monthlySections(s);
    return slide(1, head(x.eyebrow, x.headline, x.baseline) + x.tiles + x.flows)
        + slide(2, head(x.eyebrow, 'Channel closures on-chain', `<p class="card-sub">${x.closuresSub}</p>`) + `<div class="rpt-grid-2">${x.closures}${x.force}</div>`)
        + slide(3, head(x.eyebrow, 'Channel and node size tiers', x.baseline) + `<div class="rpt-grid-2">${x.tierFlow}${x.nodeConc}</div>`);
}

async function init() {
    const body = document.body;
    try {
        const q = new URLSearchParams(window.location.search);
        const type = ['weekly', 'monthly'].find((t) => q.get(t));
        if (!type) throw new Error('report-card.html needs ?weekly=<id> or ?monthly=<id>');
        const id = q.get(type);
        const path = `data/reports/${type}/${encodeURIComponent(id)}.json`;
        const res = await fetch(path, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
        const snap = await res.json();
        if (snap.type !== type || snap.id !== id) throw new Error(`${path} holds ${snap.type} ${snap.id}, expected ${type} ${id}`);

        const cards = document.getElementById('cards');
        cards.dataset.type = type;
        cards.innerHTML = type === 'weekly' ? weeklyCards(snap) : monthlyCards(snap);
        mountCharts();
        if (document.fonts && document.fonts.ready) await document.fonts.ready;

        // A slide whose content does not fit would be posted cut off: refuse instead
        const over = [...document.querySelectorAll('.card-body')].filter((b) => b.scrollHeight > b.clientHeight + 1)
            .map((b) => `${b.parentElement.dataset.slide} (${b.scrollHeight - b.clientHeight}px over)`);
        if (over.length) throw new Error(`content overflows slide ${over.join(', ')}`);

        body.dataset.reportId = `${type}-${id}`;
        body.dataset.loaded = 'true';
    } catch (e) {
        console.error(`report-card: ${e.message}`);
        body.dataset.error = e.message;
        body.dataset.loaded = 'error';
    }
}

init();
