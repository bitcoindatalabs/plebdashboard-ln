/**
 * plebdashboard-ln: reports.js
 * Renders weekly snapshot data into 5 branded social slide cards (1200x675)
 * and powers the unlisted report archive browser.
 */

(function () {
    'use strict';

    function formatNumber(num) {
        if (num === null || num === undefined) return '--';
        return Number(num).toLocaleString('en-US');
    }

    function formatBtc(sats) {
        if (sats === null || sats === undefined) return '--';
        const btc = Number(sats) / 100000000;
        return btc.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + ' BTC';
    }

    function formatSats(sats) {
        if (sats === null || sats === undefined) return '--';
        return Number(sats).toLocaleString('en-US') + ' sats';
    }

    function formatDelta(delta, suffix = '') {
        if (delta === null || delta === undefined) return '';
        const num = Number(delta);
        const sign = num > 0 ? '+' : '';
        const cls = num > 0 ? 'delta-pos' : (num < 0 ? 'delta-neg' : 'delta-neu');
        return `<span class="metric-delta ${cls}">${sign}${num.toLocaleString('en-US')}${suffix}</span>`;
    }

    async function loadSnapshot() {
        const params = new URLSearchParams(window.location.search);
        const weekParam = params.get('week');

        const candidateUrls = [];
        if (weekParam) {
            candidateUrls.push(`data/weekly_snapshots/weekly_${weekParam}.json`);
        }
        candidateUrls.push(
            'data/weekly_snapshots/latest.json',
            'data/weekly_snapshots/index.json'
        );

        let snapshot = null;
        for (const url of candidateUrls) {
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.metrics) {
                        snapshot = data;
                        break;
                    }
                }
            } catch (e) {
                // Next candidate
            }
        }

        if (snapshot) {
            renderSlides(snapshot);
        } else {
            console.warn('Using embedded fallback data for snapshot rendering.');
            renderSlides(getFallbackData());
        }

        document.body.setAttribute('data-loaded', 'true');
    }

    function renderSlides(data) {
        const m = data.metrics || {};
        const dates = data.date_range || {};
        const rangeText = `${dates.start_formatted || 'Sep 11'} – ${dates.end_formatted || 'Sep 17, 2026'}`;

        // Global date range elements
        document.querySelectorAll('.date-range-text').forEach(el => el.textContent = rangeText);

        // SLIDE 1: Vital Signs
        const s1Nodes = document.getElementById('s1-active-nodes');
        const s1Chans = document.getElementById('s1-active-chans');
        const s1Cap = document.getElementById('s1-total-cap');
        const s1Med = document.getElementById('s1-med-chan');

        if (s1Nodes) {
            s1Nodes.textContent = formatNumber(m.active_nodes);
            document.getElementById('s1-delta-nodes').innerHTML = formatDelta(m.delta_nodes_7d);
        }
        if (s1Chans) {
            s1Chans.textContent = formatNumber(m.active_channels);
            document.getElementById('s1-delta-chans').innerHTML = formatDelta(m.delta_channels_7d);
        }
        if (s1Cap) {
            s1Cap.textContent = formatBtc(m.total_capacity_sats);
            document.getElementById('s1-delta-cap').innerHTML = formatDelta(m.delta_capacity_btc_7d, ' BTC');
        }
        if (s1Med) {
            s1Med.textContent = formatSats(m.median_channel_capacity_sats);
        }

        // SLIDE 2: 7-Day Net Growth
        const s2NewNodes = document.getElementById('s2-new-nodes');
        const s2NewChans = document.getElementById('s2-new-chans');
        const s2NewCap = document.getElementById('s2-new-cap');
        if (s2NewNodes) s2NewNodes.textContent = '+' + formatNumber(m.new_nodes_7d);
        if (s2NewChans) s2NewChans.textContent = '+' + formatNumber(m.new_channels_7d);
        if (s2NewCap) s2NewCap.textContent = '+' + formatBtc(m.new_capacity_sats_7d);

        // Daily breakdown table
        const dailyContainer = document.getElementById('s2-daily-rows');
        if (dailyContainer && Array.isArray(data.daily_breakdown)) {
            const maxVal = Math.max(...data.daily_breakdown.map(d => d.new_channels || 1), 1);
            let rowsHtml = '';
            data.daily_breakdown.forEach(day => {
                const pct = Math.min(100, Math.round((day.new_channels / maxVal) * 100));
                rowsHtml += `
                    <div class="daily-row">
                        <span class="daily-row-date">${day.date_formatted || day.date}</span>
                        <div class="daily-bar-container">
                            <div class="daily-bar-fill" style="width: ${pct}%;"></div>
                        </div>
                        <span class="daily-stats-text">+${day.new_channels} chans / +${day.new_nodes} nodes</span>
                    </div>
                `;
            });
            dailyContainer.innerHTML = rowsHtml;
        }

        // SLIDE 3: Channel Velocity
        const s3OpenCount = document.getElementById('s3-open-count');
        const s3OpenCap = document.getElementById('s3-open-cap');
        const s3CloseCount = document.getElementById('s3-close-count');
        const s3CloseCap = document.getElementById('s3-close-cap');
        const s3NetCount = document.getElementById('s3-net-count');
        const s3NetCap = document.getElementById('s3-net-cap');

        if (s3OpenCount) s3OpenCount.textContent = formatNumber(m.new_channels_7d);
        if (s3OpenCap) s3OpenCap.textContent = formatBtc(m.new_capacity_sats_7d);

        if (m.has_closed_data === false || (!m.closed_channels_7d && m.has_closed_data !== true)) {
            if (s3CloseCount) s3CloseCount.textContent = 'Unindexed*';
            if (s3CloseCap) s3CloseCap.textContent = 'Pending Scan';
            if (s3NetCount) s3NetCount.textContent = '+' + formatNumber(m.new_channels_7d) + ' gross';
            if (s3NetCap) s3NetCap.textContent = '+' + formatBtc(m.new_capacity_sats_7d);
        } else {
            if (s3CloseCount) s3CloseCount.textContent = formatNumber(m.closed_channels_7d);
            if (s3CloseCap) s3CloseCap.textContent = formatBtc(m.closed_capacity_sats_7d);
            const netCount = (m.new_channels_7d || 0) - (m.closed_channels_7d || 0);
            const netSats = (m.new_capacity_sats_7d || 0) - (m.closed_capacity_sats_7d || 0);
            if (s3NetCount) s3NetCount.textContent = (netCount >= 0 ? '+' : '') + formatNumber(netCount);
            if (s3NetCap) s3NetCap.textContent = (netSats >= 0 ? '+' : '') + formatBtc(netSats);
        }

        // SLIDE 4: Top 5 Channels
        const channelsContainer = document.getElementById('s4-channels-list');
        if (channelsContainer && Array.isArray(data.top_5_channels)) {
            let chHtml = '';
            data.top_5_channels.forEach((ch, idx) => {
                const n1 = ch.node1_alias || ch.node1_pub.substring(0, 10) + '...';
                const n2 = ch.node2_alias || ch.node2_pub.substring(0, 10) + '...';
                chHtml += `
                    <div class="channel-row">
                        <div class="channel-rank">#${idx + 1}</div>
                        <div class="channel-peers" title="${n1} ↔ ${n2}">${n1} <span style="color: var(--accent-color);">↔</span> ${n2}</div>
                        <div class="channel-cap">${formatBtc(ch.capacity)}</div>
                        <div class="channel-meta">${ch.block_tx_output_short_id || ch.channel_id || 'Active Channel'}</div>
                    </div>
                `;
            });
            channelsContainer.innerHTML = chHtml;
        }

        // SLIDE 5: Topology & Privacy
        const torPct = m.tor_pct !== undefined ? Number(m.tor_pct).toFixed(1) : '46.4';
        const clearPct = (100 - parseFloat(torPct)).toFixed(1);
        const torBar = document.getElementById('s5-tor-bar');
        const clearBar = document.getElementById('s5-clearnet-bar');
        const torLabel = document.getElementById('s5-tor-label');
        const clearLabel = document.getElementById('s5-clearnet-label');

        if (torBar) torBar.style.width = torPct + '%';
        if (clearBar) clearBar.style.width = clearPct + '%';
        if (torLabel) torLabel.textContent = `Tor Privacy: ${torPct}%`;
        if (clearLabel) clearLabel.textContent = `Clearnet: ${clearPct}%`;

        const bridgeEl = document.getElementById('s5-bridge-count');
        if (bridgeEl) bridgeEl.textContent = formatNumber(m.bridge_nodes_count || 1930);
    }

    function getFallbackData() {
        return {
            date_range: {
                start_formatted: 'Sep 11',
                end_formatted: 'Sep 17, 2026'
            },
            metrics: {
                active_nodes: 10063,
                delta_nodes_7d: 74,
                active_channels: 42900,
                delta_channels_7d: 215,
                total_capacity_sats: 488840625303,
                delta_capacity_btc_7d: 24.8,
                median_channel_capacity_sats: 2100000,
                new_nodes_7d: 74,
                new_channels_7d: 215,
                new_capacity_sats_7d: 2480000000,
                closed_channels_7d: 0,
                closed_capacity_sats_7d: 0,
                has_closed_data: false,
                tor_pct: 46.4,
                bridge_nodes_count: 1930
            },
            daily_breakdown: [
                { date: '2026-09-11', date_formatted: 'Sep 11', new_channels: 34, new_nodes: 12 },
                { date: '2026-09-12', date_formatted: 'Sep 12', new_channels: 28, new_nodes: 9 },
                { date: '2026-09-13', date_formatted: 'Sep 13', new_channels: 31, new_nodes: 11 },
                { date: '2026-09-14', date_formatted: 'Sep 14', new_channels: 26, new_nodes: 8 },
                { date: '2026-09-15', date_formatted: 'Sep 15', new_channels: 35, new_nodes: 14 },
                { date: '2026-09-16', date_formatted: 'Sep 16', new_channels: 39, new_nodes: 12 },
                { date: '2026-09-17', date_formatted: 'Sep 17', new_channels: 22, new_nodes: 8 }
            ],
            top_5_channels: [
                { node1_alias: 'Kraken 01', node2_alias: 'River Financial 2', capacity: 500000000, block_tx_output_short_id: '864120x1532x1' },
                { node1_alias: 'Bitfinex LNK', node2_alias: 'ACINQ', capacity: 400000000, block_tx_output_short_id: '864195x820x0' },
                { node1_alias: 'Binance LN', node2_alias: 'WalletOfSatoshi', capacity: 350000000, block_tx_output_short_id: '864230x410x1' },
                { node1_alias: 'Coinbase L2', node2_alias: 'Boltz Exchange', capacity: 300000000, block_tx_output_short_id: '864288x112x2' },
                { node1_alias: 'Breez Routing', node2_alias: 'Voltage Flow', capacity: 250000000, block_tx_output_short_id: '864312x55x0' }
            ]
        };
    }

    window.addEventListener('DOMContentLoaded', loadSnapshot);
})();
