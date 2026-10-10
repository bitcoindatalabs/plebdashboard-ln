// Lightning Reports page (reports.html): LN Weekly + LN Monthly, latest report and archive.
// Reads data/reports/manifest.json + data/reports/{weekly,monthly}/<id>.json; drawing is in ln-report-render.js.
// No fallback data: a load failure shows an error. body[data-loaded] / [data-report-id] mark what rendered.
import { esc, renderWeekly, renderMonthly, mountCharts, disposeCharts, resizeCharts } from './ln-report-render.js?v=1';

const BASE = 'data/reports/';
const TYPES = ['weekly', 'monthly'];

async function loadJSON(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
}

function requested(manifest) {
    const q = new URLSearchParams(window.location.search);
    for (const type of TYPES) {
        if (q.has(type)) return { type, id: q.get(type) || (manifest[type][0] && manifest[type][0].id) };
    }
    const type = manifest.weekly.length || !manifest.monthly.length ? 'weekly' : 'monthly';
    return { type, id: manifest[type][0] && manifest[type][0].id };
}

function renderArchive(manifest, type, id) {
    document.getElementById('archiveTitle').textContent = type === 'weekly' ? 'Weekly reports' : 'Monthly reports';
    const list = document.getElementById('archiveList');
    list.innerHTML = manifest[type].map((e) => `<li class="${e.id === id ? 'active' : ''}">
        <a href="?${type}=${encodeURIComponent(e.id)}" data-type="${type}" data-id="${esc(e.id)}">
            <span class="rpt-archive-label">${esc(e.label)}</span>
            ${e.headline ? `<span class="rpt-archive-headline">${esc(e.headline)}</span>` : ''}</a>
        ${e.pdf ? `<a class="rpt-archive-pdf" href="${esc(e.pdf)}" target="_blank" rel="noopener" title="PDF"><i class="fas fa-file-pdf"></i></a>` : ''}</li>`).join('')
        || '<li class="rpt-muted">No reports yet.</li>';
    document.querySelectorAll('.rpt-tab').forEach((b) => {
        const on = b.dataset.type === type;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on);
    });
    for (const t of TYPES) document.querySelector(`[data-count="${t}"]`).textContent = manifest[t].length || '';
}

let manifest = null;

async function show({ type, id }) {
    const report = document.getElementById('report');
    document.body.dataset.loaded = 'false';
    disposeCharts();
    renderArchive(manifest, type, id);
    if (!id) {
        report.innerHTML = `<div class="home-card rpt-empty"><p>No ${type} reports have been published yet.</p></div>`;
        document.body.dataset.reportId = '';
        document.body.dataset.loaded = 'true';
        return;
    }
    const entry = manifest[type].find((e) => e.id === id);
    if (!entry) throw new Error(`No ${type} report "${id}" in the archive`);
    const snap = await loadJSON(entry.path);
    if (snap.type !== type || snap.id !== id) throw new Error(`${entry.path} holds ${snap.type} ${snap.id}, expected ${type} ${id}`);
    report.innerHTML = type === 'weekly' ? renderWeekly(snap) : renderMonthly(snap);
    mountCharts();
    document.title = `${type === 'weekly' ? 'LN Weekly' : 'LN Monthly'} ${snap.label} | Lightning Reports`;
    document.body.dataset.reportId = `${type}-${id}`;
    document.body.dataset.loaded = 'true';
}

function fail(err) {
    console.error(err);
    document.getElementById('report').innerHTML = `<div class="home-card rpt-error"><p><i class="fas fa-circle-exclamation"></i>
        This report could not be loaded. Please try again later.</p><p class="rpt-muted">${esc(err.message)}</p></div>`;
    document.body.dataset.loaded = 'error';
}

async function init() {
    try {
        const res = await fetch(`${BASE}manifest.json`, { cache: 'no-cache' });
        // No manifest yet = nothing published yet (an empty archive, not an error); any other failure is an error
        if (res.status === 404) manifest = { schema: 1, weekly: [], monthly: [] };
        else if (!res.ok) throw new Error(`${BASE}manifest.json: HTTP ${res.status}`);
        else manifest = await res.json();
        if (!manifest || manifest.schema !== 1) throw new Error('Unsupported report manifest');
        await show(requested(manifest));
    } catch (e) {
        fail(e);
        return;
    }
    document.addEventListener('click', (ev) => {
        const tab = ev.target.closest('.rpt-tab');
        const link = ev.target.closest('.rpt-archive-list a[data-id]');
        if (!tab && !link) return;
        ev.preventDefault();
        const type = tab ? tab.dataset.type : link.dataset.type;
        const id = tab ? (manifest[type][0] && manifest[type][0].id) : link.dataset.id;
        history.pushState(null, '', id ? `?${type}=${encodeURIComponent(id)}` : `?${type}`);
        show({ type, id }).catch(fail);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.addEventListener('popstate', () => show(requested(manifest)).catch(fail));
    window.addEventListener('resize', resizeCharts);
}

init();
