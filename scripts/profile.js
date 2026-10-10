import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

// The six rank measures on the node page (radar and list, same order). Ranks come from ln_bdl_tables_upsert.py.
const RANK_MEASURES = [
    { key: 'pleb_rank', short: 'Overall', name: 'Overall (PlebRank)', icon: 'fa-trophy',
      desc: 'Combined score of the five measures below plus PageRank' },
    { key: 'total_capacity_rank', short: 'Capacity', name: 'Capacity', icon: 'fa-coins',
      desc: 'Bitcoin locked in public channels' },
    { key: 'total_channels_rank', short: 'Channels', name: 'Channels', icon: 'fa-network-wired',
      desc: 'Number of public channels' },
    { key: 'betweenness_centrality_rank', short: 'Betweenness', name: 'Betweenness', icon: 'fa-project-diagram',
      desc: 'How often the node lies on shortest paths between other nodes' },
    { key: 'capacity_weighted_degree_rank', short: 'Weighted degree', name: 'Weighted degree', icon: 'fa-share-alt',
      desc: 'Connections weighted by channel size' },
    { key: 'eigenvector_centrality_rank', short: 'Eigenvector', name: 'Eigenvector', icon: 'fa-star',
      desc: 'Connected to nodes that are themselves well connected' }
];

class NodeProfileManager {
    constructor() {
        this.nodeData = null;
        this.nodeId = this.getNodeIdFromUrl();
        this.chartManager = null;
        this.channelsTableManager = null;
        this.connectAddress = null;
        this.nodeTypes = [];
        this.channelsTableLoaded = false;
        this.channelsTreemapLoaded = false;
        this.init();
    }

    getNodeIdFromUrl() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('node');
    }

    async init() {
        if (!this.nodeId) {
            this.showError('No node specified in URL');
            return;
        }

        await this.loadNodeData();
        this.setupEventListeners();
        this.setupChannelSwitcher();
    }

    async loadNodeData() {
        try {
            // Load node types first
            await this.loadNodeTypes();
            
            // Only use node_profile.parquet
            const profileResponse = await fetch('data/node_profile.parquet');
            if (!profileResponse.ok) throw new Error(`HTTP ${profileResponse.status}`);
            const profileBuffer = await profileResponse.arrayBuffer();
            await this.parseParquetData(profileBuffer);

            if (this.nodeData) {
                this.populateProfile();
                this.showProfile();
            } else {
                this.showError('Node not found in database');
            }
        } catch (error) {
            console.error('Error loading node data:', error);
            this.showError('Failed to load node data: ' + error.message);
        }
    }

    async loadNodeTypes() {
        try {
            const response = await fetch('data/ln_node_types.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.nodeTypes = await response.json();
        } catch (error) {
            console.warn('Failed to load node types:', error);
            this.nodeTypes = [];
        }
    }

    async parseParquetData(arrayBuffer) {
        return new Promise((resolve) => {
            parquetRead({
                file: arrayBuffer,
                rowFormat: 'object',
                onComplete: (result) => {
                    if (Array.isArray(result) && result.length > 0) {
                        const parsedData = result;
                        this.rankTotal = parsedData.reduce((mx, n) => Math.max(mx, Number(n.pleb_rank) || 0), 0) || 10000;
                        // Debug: Try a few known pub_keys
                        const testPubKeys = [
                            '035e4ff418fc8b5554c5d9eea66396c227bd429a3251c8cbc711002ba215bfc226', // WalletOfSatoshi
                            '034ea80f8b148c750463546bd999bf7321a0e6dfc60aaf84bd0400a2e8d376c0d5',
                            '02f1a8c87607f415c8f22c00593002775941dea48869ce23096af27b0cfdcc0b69',
                            '03864ef025fde8fb587d989186ce6a4a186895ee44a926bfc370e2c366597a3f8f'
                        ];
                        testPubKeys.forEach(pk => {
                            const found = parsedData.find(n => n.pub_key === pk);
                            if (found) {
                                console.log(`Mapped row for pub_key ${pk}:`);
                                Object.entries(found).forEach(([col, val]) => {
                                    console.log(`  ${col}:`, val);
                                });
                            } else {
                                console.log(`pub_key ${pk} not found in mapped data.`);
                            }
                        });
                        this.nodeData = parsedData.find(node =>
                            node.pub_key === this.nodeId ||
                            (node.alias && node.alias.toLowerCase() === this.nodeId.toLowerCase())
                        );
                        if (this.nodeData) {
                            // Override node_type from ln_node_types.json if available
                            const typeEntry = this.nodeTypes.find(t => t.pub_key === this.nodeData.pub_key);
                            if (typeEntry) {
                                this.nodeData.node_type = typeEntry.node_type;
                                if (typeEntry.entity) this.nodeData.entity = typeEntry.entity;
                                if (typeEntry.role) this.nodeData.role = typeEntry.role;
                            }
                        }
                        if (!this.nodeData) {
                            console.warn('No match found for nodeId in pub_key or alias');
                        }
                    } else {
                        console.warn('Result is not a non-empty array:', result);
                    }
                    resolve();
                },
                onError: (error) => {
                    console.error('Error parsing parquet:', error);
                    resolve();
                }
            });
        });
    }

    populateProfile() {
        const node = this.nodeData;
        const TOTAL_NODES = 10000;

        function safeSet(id, value) {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        }

        // Basic info
        safeSet('nodeAlias', node.alias || 'Unknown Node');
        safeSet('nodePubkey', node.pub_key || 'Unknown');
        
        // Node Type Badges
        const nodeTypeBadgeEl = document.getElementById('nodeTypeBadge');
        if (nodeTypeBadgeEl) nodeTypeBadgeEl.innerHTML = this.renderNodeTypePills(node.node_type);

        // First seen (first channel's block date, YYYYMMDD)
        const sinceEl = document.getElementById('nodeSince');
        const fsw = node.first_seen_week ? String(node.first_seen_week) : '';
        if (sinceEl && /^\d{8}$/.test(fsw)) {
            const d = new Date(Date.UTC(+fsw.slice(0, 4), +fsw.slice(4, 6) - 1, 1));
            sinceEl.textContent = `Since ${d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
            sinceEl.style.display = 'inline-flex';
        }

        // Entity badge & Role description (Step 3.4 Requirement)
        const entityBadge = document.getElementById('nodeEntityBadge');
        if (entityBadge) {
            if (node.entity) {
                entityBadge.innerHTML = `<i class="fas fa-building"></i> ${node.entity}`;
                entityBadge.style.display = 'inline-flex';
            } else {
                entityBadge.style.display = 'none';
            }
        }

        // Client badge and software line: published node_client labels, shown as given (no label logic here)
        const clientSlot = document.getElementById('nodeClientBadge');
        if (clientSlot) {
            const badge = window.createClientBadge ? window.createClientBadge(node) : null;
            clientSlot.replaceChildren(...(badge ? [badge] : []));
            clientSlot.style.display = badge ? 'inline-flex' : 'none';
        }

        const softwareLine = document.getElementById('nodeSoftwareLine');
        if (softwareLine) {
            if (node.version_display) {
                safeSet('nodeSoftwareVersion', node.version_display);
                const info = document.getElementById('nodeSoftwareInfo');
                if (info) {
                    info.title = [node.version_basis,
                        "What anyone can read from this node's public announcement. Release line only, never the patch version."]
                        .filter(Boolean).join('\n');
                }
                softwareLine.style.display = 'block';
            } else {
                softwareLine.style.display = 'none';
            }
        }

        const roleDesc = document.getElementById('nodeRoleDesc');
        if (roleDesc) {
            if (node.role) {
                roleDesc.textContent = node.role;
                roleDesc.style.display = 'block';
            } else {
                roleDesc.style.display = 'none';
            }
        }

        // Contextual Action Buttons (Step 3.4 Requirement)
        const compareBtn = document.getElementById('compareNodeBtn');
        if (compareBtn) {
            const compareQuery = node.alias ? encodeURIComponent(node.alias) : encodeURIComponent(node.pub_key);
            compareBtn.href = `node-comparison.html?nodes=${compareQuery}`;
        }

        const viewInGraphBtn = document.getElementById('viewInGraphBtn');
        if (viewInGraphBtn && node.pub_key) {
            viewInGraphBtn.href = `graph.html?highlight=${encodeURIComponent(node.pub_key)}`;
        }

        // Build full connect address: pubkey@host:port
        let connectAddress = null;
        const addr1 = node.address_1;
        const addr2 = node.address_2;
        let rawAddr = addr1 || addr2 || null;
        if (rawAddr && typeof rawAddr === 'string') {
            if (rawAddr.includes('@')) {
                connectAddress = rawAddr;
            } else {
                connectAddress = `${node.pub_key}@${rawAddr}`;
            }
        }
        this.connectAddress = connectAddress;
        const connectAddrEl = document.getElementById('connectAddress');
        if (connectAddrEl) {
            connectAddrEl.textContent = connectAddress || 'N/A';
        }

        // Quick stats
        safeSet('overallRank', this.formatRank(node.pleb_rank));
        if (this.rankTotal) safeSet('overallRankSub', `of ${this.rankTotal.toLocaleString()} public nodes`);
        const gossipStatus = document.getElementById('gossipStatus');
        if (gossipStatus) {
            const seen = node.in_latest_gossip === true || node.in_latest_gossip === 'true';
            safeSet('gossipStatusText', seen ? 'In latest gossip' : 'Not in latest gossip');
            gossipStatus.classList.toggle('is-stale', !seen);
        }
        safeSet('totalCapacity', node.ftotal_capacity || 'Unknown');
        safeSet('channelCount', this.formatNumber(node.total_channels));
        safeSet('medianChannelSize', this.formatCapacity(node.med_chnl_size));
        if (node.avg_chnl_size) safeSet('avgChannelSub', `Average ${this.formatCapacity(node.avg_chnl_size)}`);
        if (node.node_cap_tier) safeSet('capacityTierSub', `${node.node_cap_tier} tier`);

        // Infrastructure & Specs
        const birthTxEl = document.getElementById('birthTx');
        if (birthTxEl) {
            if (node.birth_chan) {
                const chanId = node.birth_chan;
                birthTxEl.innerHTML = `<a href="https://mempool.space/lightning/channel/${chanId}" target="_blank" rel="noopener noreferrer" style="color: inherit; text-decoration: underline;">${node.birth_tx || chanId}</a>`;
            } else {
                birthTxEl.textContent = node.birth_tx || '-';
            }
        }
        safeSet('address1', node.address_1 || '-');
        safeSet('address2', node.address_2 || '-');

        // Copy buttons visibility under Network Diagnostics
        const copyAddr1 = document.getElementById('copyAddress1Btn');
        if (copyAddr1) copyAddr1.style.display = (node.address_1 && node.address_1 !== '-') ? 'inline-flex' : 'none';

        const copyAddr2 = document.getElementById('copyAddress2Btn');
        if (copyAddr2) copyAddr2.style.display = (node.address_2 && node.address_2 !== '-') ? 'inline-flex' : 'none';


        // Category Counts formatting with colored badges
        const categoryCountsEl = document.getElementById('categoryCounts');
        if (categoryCountsEl) {
            let catObj = null;
            if (node.category_counts) {
                if (typeof node.category_counts === 'object') {
                    catObj = node.category_counts;
                } else if (typeof node.category_counts === 'string') {
                    try {
                        catObj = JSON.parse(node.category_counts.replace(/'/g, '"'));
                    } catch (e) {
                        catObj = null;
                    }
                }
            }

            if (catObj && typeof catObj === 'object') {
                const cats = [
                    { cls: 'freeway', name: 'Freeway', range: '≥ 1 BTC', n: Number(catObj['Freeway'] || 0) },
                    { cls: 'highway', name: 'Highway', range: '1M–100M sats', n: Number(catObj['Highway'] || 0) },
                    { cls: 'myway', name: 'My Way', range: '< 1M sats', n: Number(catObj['My Way'] || catObj['MyWay'] || 0) }
                ];
                const total = cats.reduce((s, c) => s + c.n, 0) || 1;
                categoryCountsEl.innerHTML = `
                    <div class="np-sizebar">
                        ${cats.filter(c => c.n > 0).map(c => `<span class="np-seg np-seg-${c.cls}" style="flex: ${c.n}" title="${c.name} (${c.range}): ${c.n.toLocaleString()} channels"></span>`).join('')}
                    </div>
                    <div class="np-size-legend">
                        ${cats.map(c => `<span><i class="np-dot np-seg-${c.cls}"></i>${c.name} <span class="np-muted">${c.range}</span> <strong>${c.n.toLocaleString()}</strong> <span class="np-muted">(${Math.round(c.n / total * 100)}%)</span></span>`).join('')}
                    </div>
                `;
            } else {
                categoryCountsEl.textContent = '-';
            }
        }

        // Render Command Center Visualizations
        this.renderTopologicalRadar(node);
        this.renderCentralityProgress(node);
        this.renderDiagnosticsAndFees(node);
    }

    renderNodeTypePills(nodeTypeString) {
        if (!nodeTypeString || typeof nodeTypeString !== 'string' || !nodeTypeString.trim()) {
            return `<span class="type-pill pill-pleb" title="Community / Pleb routing node"><i class="fas fa-user-astronaut"></i> Pleb</span>`;
        }

        const types = nodeTypeString.split(',').map(s => s.trim()).filter(Boolean);
        if (types.length === 0) {
            return `<span class="type-pill pill-pleb" title="Community / Pleb routing node"><i class="fas fa-user-astronaut"></i> Pleb</span>`;
        }

        return types.map(type => {
            const lower = type.toLowerCase();
            let pillClass = 'pill-pleb';
            let icon = 'fa-user-astronaut';

            if (lower.includes('exchange')) {
                pillClass = 'pill-exchange';
                icon = 'fa-building-columns';
            } else if (lower.includes('lsp')) {
                pillClass = 'pill-lsp';
                icon = 'fa-bolt';
            } else if (lower.includes('routing')) {
                pillClass = 'pill-routing';
                icon = 'fa-route';
            } else if (lower.includes('wallet')) {
                pillClass = 'pill-wallet';
                icon = 'fa-wallet';
            } else if (lower.includes('payment')) {
                pillClass = 'pill-payment';
                icon = 'fa-credit-card';
            } else if (lower.includes('defi')) {
                pillClass = 'pill-defi';
                icon = 'fa-coins';
            }

            return `<span class="type-pill ${pillClass}" title="${type} Node"><i class="fas ${icon}"></i> ${type}</span>`;
        }).join(' ');
    }

    formatRank(rank) {
        if (!rank || rank === null || rank === undefined) return 'N/A';
        return `#${Number(rank).toLocaleString()}`;
    }

    formatCapacity(capacity) {
        if (!capacity || capacity === null || capacity === undefined) return 'N/A';
        const num = Number(capacity);
        if (num >= 100000000) { // 1 BTC
            return `${(num / 100000000).toFixed(1)} BTC`;
        } else if (num >= 1000000) {
            return `${(num / 1000000).toFixed(0)}M sats`;
        } else if (num >= 1000) {
            return `${(num / 1000).toFixed(0)}K sats`;
        }
        return `${num.toLocaleString()} sats`;
    }

    formatNumber(num) {
        if (!num || num === null || num === undefined) return 'N/A';
        return Number(num).toLocaleString();
    }

    formatPagerank(pagerank) {
        if (!pagerank || pagerank === null || pagerank === undefined) return 'N/A';
        return Number(pagerank).toExponential(3);
    }

    setupEventListeners() {
        // Copy pubkey functionality (primary click on icon)
        const copyBtn = document.getElementById('copyPubkeyBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                if (!this.nodeData) return;
                this.copyToClipboard(this.nodeData.pub_key, copyBtn, 'Copy public key');
            });
        }

        // Tooltip actions
        const copyPubkeyAction = document.getElementById('copyPubkeyAction');
        if (copyPubkeyAction) {
            copyPubkeyAction.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.nodeData) return;
                const wrapperBtn = document.getElementById('copyPubkeyBtn');
                this.copyToClipboard(this.nodeData.pub_key, wrapperBtn, 'Copy public key');
            });
        }

        const copyConnectAddressAction = document.getElementById('copyConnectAddressAction');
        if (copyConnectAddressAction) {
            copyConnectAddressAction.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!this.connectAddress) {
                    console.warn('No connect address available for this node');
                    return;
                }
                const wrapperBtn = document.getElementById('copyPubkeyBtn');
                this.copyToClipboard(this.connectAddress, wrapperBtn, 'Copy public key', 'Copy connect address');
            });
        }

        // Network Diagnostics copy buttons
        const copyAddr1Btn = document.getElementById('copyAddress1Btn');
        if (copyAddr1Btn) {
            copyAddr1Btn.addEventListener('click', () => {
                if (this.nodeData && this.nodeData.address_1) {
                    this.copyToClipboard(this.nodeData.address_1, copyAddr1Btn, 'Copy Clearnet address');
                }
            });
        }

        const copyAddr2Btn = document.getElementById('copyAddress2Btn');
        if (copyAddr2Btn) {
            copyAddr2Btn.addEventListener('click', () => {
                if (this.nodeData && this.nodeData.address_2) {
                    this.copyToClipboard(this.nodeData.address_2, copyAddr2Btn, 'Copy Tor address');
                }
            });
        }

        const copyConnectAddrBtn = document.getElementById('copyConnectAddrBtn');
        if (copyConnectAddrBtn) {
            copyConnectAddrBtn.addEventListener('click', () => {
                if (this.connectAddress) {
                    this.copyToClipboard(this.connectAddress, copyConnectAddrBtn, 'Copy connect address');
                }
            });
        }
    }

    copyToClipboard(text, buttonEl, defaultTitle, successTitleOverride) {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            if (!buttonEl) return;
            const icon = buttonEl.querySelector('i');
            const originalClass = icon ? icon.className : null;
            const originalTitle = buttonEl.title || defaultTitle;

            if (icon) icon.className = 'fas fa-check';
            buttonEl.title = successTitleOverride || 'Copied!';

            setTimeout(() => {
                if (icon && originalClass) icon.className = originalClass;
                buttonEl.title = originalTitle;
            }, 1600);
        }).catch(err => {
            console.error('Failed to copy: ', err);
        });
    }

    setupChannelSwitcher() {
        const btnTable = document.getElementById('btnViewTable');
        const btnTreemap = document.getElementById('btnViewTreemap');
        const paneTable = document.getElementById('channelsTablePane');
        const paneTreemap = document.getElementById('channelsTreemapPane');

        if (btnTable && btnTreemap && paneTable && paneTreemap) {
            btnTable.addEventListener('click', () => {
                btnTable.classList.add('active');
                btnTreemap.classList.remove('active');
                paneTable.style.display = 'block';
                paneTreemap.style.display = 'none';
            });

            btnTreemap.addEventListener('click', async () => {
                btnTreemap.classList.add('active');
                btnTable.classList.remove('active');
                paneTable.style.display = 'none';
                paneTreemap.style.display = 'block';
                await this.initializeChannelsTreemap();
            });
        }
    }

    async initializeChannelsTable() {
        const container = document.getElementById('channelsTableContainer');
        if (!container) return;

        if (!this.channelsTableManager) {
            this.channelsTableManager = await this.loadChannelsTableManager();
        }

        if (this.channelsTableManager && this.channelsTableManager.loadAndRenderTable) {
            try {
                const targetKey = this.nodeData ? this.nodeData.pub_key : this.nodeId;
                await this.channelsTableManager.loadAndRenderTable(targetKey);
                const peers = this.channelsTableManager.peerGroupsData ? this.channelsTableManager.peerGroupsData.length : 0;
                const peerEl = document.getElementById('peerCountSub');
                if (peers && peerEl) peerEl.textContent = `with ${peers.toLocaleString()} peers`;
            } catch (error) {
                console.error('Failed to load channels table:', error);
            }
        }
    }

    async initializeChannelsTreemap() {
        const chartContainer = document.getElementById('channelsTreemap');
        if (!chartContainer) return;

        if (!this.chartManager) {
            this.chartManager = await this.loadChannelsManager();
        }

        if (this.chartManager && this.chartManager.loadAndRenderChannelsTreemap) {
            try {
                const targetKey = this.nodeData ? this.nodeData.pub_key : this.nodeId;
                await this.chartManager.loadAndRenderChannelsTreemap(targetKey);
                setTimeout(() => {
                    if (this.chartManager && this.chartManager.chartInstance) {
                        this.chartManager.chartInstance.resize();
                    }
                    if (window.echarts) {
                        const chartInstance = window.echarts.getInstanceByDom(chartContainer);
                        if (chartInstance) chartInstance.resize();
                    }
                }, 80);
            } catch (error) {
                console.error('Failed to load channels treemap:', error);
            }
        }
    }

    // Position on the rank axes: log scale, so #1 / #10 / #100 / #1,000 are evenly spaced.
    // A linear scale puts every top-100 node on the outer ring and hides the differences between measures.
    rankScore(rank) {
        const r = Number(rank);
        if (!r || isNaN(r) || r < 1) return null;
        const n = Math.max(this.rankTotal || 10000, 2);
        return Math.max(0.04, Math.min(1, 1 - Math.log10(r) / Math.log10(n)));
    }

    topPercent(rank) {
        const pct = (Number(rank) / (this.rankTotal || 10000)) * 100;
        return pct < 1 ? `Top ${Math.max(0.1, pct).toFixed(1)}%` : `Top ${Math.ceil(pct)}%`;
    }

    renderTopologicalRadar(node) {
        const svg = document.getElementById('radarSvg');
        const tooltip = document.getElementById('radarTooltip');
        if (!svg) return;

        const cx = 180;
        const cy = 140;
        const radius = 88;
        const n = this.rankTotal || 10000;
        const angleOf = i => -Math.PI / 2 + (i * Math.PI / 3);
        const point = (factor, i) => [cx + radius * factor * Math.cos(angleOf(i)), cy + radius * factor * Math.sin(angleOf(i))];

        // Rings at rank #1,000 / #100 / #10 / #1 (outer); inner rings labelled along the top spoke
        let gridHtml = '';
        [1000, 100, 10, 1].filter(r => r < n).forEach(r => {
            const factor = 1 - Math.log10(r) / Math.log10(n);
            const pts = [0, 1, 2, 3, 4, 5].map(i => point(factor, i).map(v => v.toFixed(1)).join(','));
            gridHtml += `<polygon points="${pts.join(' ')}" class="radar-grid-polygon" />`;
            if (r === 1) return;   // outer ring is #1; its label would sit on the top point
            const [lx, ly] = point(factor, 0);
            gridHtml += `<text x="${(lx + 4).toFixed(1)}" y="${(ly + 10).toFixed(1)}" class="radar-ring-label">#${r.toLocaleString()}</text>`;
        });

        let spokesHtml = '';
        for (let i = 0; i < 6; i++) {
            const [x, y] = point(1, i);
            spokesHtml += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-spoke" />`;
        }

        const dataPts = [];
        const dots = [];
        let labelsHtml = '';
        RANK_MEASURES.forEach((m, i) => {
            const rank = node[m.key];
            const score = this.rankScore(rank) ?? 0.04;
            const [px, py] = point(score, i);
            dataPts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
            const rankStr = this.rankScore(rank) !== null ? `#${Number(rank).toLocaleString()}` : 'Unranked';
            dots.push(`<circle class="radar-dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5" data-idx="${i}"></circle>`);

            // Axis label with the rank underneath
            const [lx, ly] = point(1.17, i);
            const cos = Math.cos(angleOf(i));
            const anchor = Math.abs(cos) < 0.1 ? 'middle' : (cos > 0 ? 'start' : 'end');
            const dy = i === 0 ? -14 : (i === 3 ? 6 : -4);
            labelsHtml += `<text x="${lx.toFixed(1)}" y="${(ly + dy).toFixed(1)}" class="radar-label" text-anchor="${anchor}">` +
                `<tspan x="${lx.toFixed(1)}">${m.short}</tspan>` +
                `<tspan x="${lx.toFixed(1)}" dy="13" class="radar-label-rank">${rankStr}</tspan></text>`;
        });

        svg.innerHTML = `
            ${gridHtml}
            ${spokesHtml}
            <polygon points="${dataPts.join(' ')}" class="radar-polygon" />
            ${dots.join('')}
            ${labelsHtml}
        `;

        if (tooltip) {
            const container = document.getElementById('topologicalRadarContainer');
            svg.querySelectorAll('.radar-dot').forEach(dot => {
                dot.addEventListener('mouseenter', () => {
                    const m = RANK_MEASURES[Number(dot.dataset.idx)];
                    const rank = node[m.key];
                    tooltip.textContent = this.rankScore(rank) !== null
                        ? `${m.name}: #${Number(rank).toLocaleString()} of ${n.toLocaleString()} (${this.topPercent(rank)})`
                        : `${m.name}: unranked`;
                    tooltip.style.opacity = '1';
                    if (container) {
                        const rect = container.getBoundingClientRect();
                        const dotRect = dot.getBoundingClientRect();
                        tooltip.style.left = `${dotRect.left - rect.left + dotRect.width / 2}px`;
                        tooltip.style.top = `${dotRect.top - rect.top}px`;
                    }
                });
                dot.addEventListener('mouseleave', () => { tooltip.style.opacity = '0'; });
            });
        }
    }

    renderCentralityProgress(node) {
        const container = document.getElementById('centralityProgressList');
        if (!container) return;

        container.innerHTML = RANK_MEASURES.map(m => {
            const rank = node[m.key];
            const score = this.rankScore(rank);
            const hasRank = score !== null;
            const pct = hasRank ? (Number(rank) / (this.rankTotal || 10000)) * 100 : null;
            let pctClass = 'pct-standard';
            if (hasRank && pct <= 1) pctClass = 'pct-elite';
            else if (hasRank && pct <= 5) pctClass = 'pct-top';
            else if (hasRank && pct <= 20) pctClass = 'pct-core';

            return `
                <div class="centrality-progress-row">
                    <div class="progress-label-row">
                        <span class="metric-name"><i class="fas ${m.icon}"></i> ${m.name}</span>
                        <div class="metric-rank-group">
                            <span class="metric-rank-val">${hasRank ? `#${Number(rank).toLocaleString()}` : 'Unranked'}</span>
                            ${hasRank ? `<span class="metric-pct-pill ${pctClass}">${this.topPercent(rank)}</span>` : ''}
                        </div>
                    </div>
                    <div class="metric-desc">${m.desc}</div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${hasRank ? Math.round(score * 100) : 0}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderDiagnosticsAndFees(node) {
        const betwRank = Number(node.betweenness_centrality_rank) || 99999;
        const capRank = Number(node.total_capacity_rank) || 99999;
        const plebRank = Number(node.pleb_rank) || 99999;
        const nodeType = (node.node_type || '').toLowerCase();

        let title = 'Independent node';
        let desc = 'Outside the top 500 overall. Most public nodes are in this group.';

        if (betwRank <= 150 && capRank <= 150) {
            title = 'Major routing hub';
            desc = 'Top 150 by both capacity and betweenness: a large share of shortest payment paths can run through this node.';
        } else if (betwRank <= 250) {
            title = 'Routing bridge';
            desc = 'Top 250 by betweenness: sits on many shortest paths between otherwise distant parts of the network.';
        } else if (capRank <= 200) {
            title = 'Large liquidity provider';
            desc = 'Top 200 by capacity: deep channels that can carry large payments.';
        } else if (nodeType.includes('lsp')) {
            title = 'Lightning service provider';
            desc = 'Opens channels to end users and provides inbound liquidity.';
        } else if (nodeType.includes('exchange')) {
            title = 'Exchange node';
            desc = 'Connects an exchange\'s Lightning deposits and withdrawals to the public network.';
        } else if (plebRank <= 500) {
            title = 'Well-connected router';
            desc = 'Top 500 overall on the combined rank.';
        }
        const badgeText = title;

        const personaTitleEl = document.getElementById('personaTitle');
        const personaDescEl = document.getElementById('personaDesc');
        const personaBadgeEl = document.getElementById('nodePersonaBadge');

        if (personaTitleEl) personaTitleEl.textContent = title;
        if (personaDescEl) personaDescEl.textContent = desc;
        if (personaBadgeEl) {
            personaBadgeEl.textContent = badgeText;
            personaBadgeEl.title = desc;
            personaBadgeEl.style.display = 'inline-flex';
        }

        // Fee Policy Benchmark
        const medFeeRateEl = document.getElementById('medFeeRateVal');
        const baseFeeEl = document.getElementById('baseFeeVal');
        const feePillEl = document.getElementById('feeBenchmarkPill');

        const medFee = node.med_fee_rate !== null && node.med_fee_rate !== undefined ? Number(node.med_fee_rate) : null;
        const baseFee = node.med_base_fee !== null && node.med_base_fee !== undefined ? Number(node.med_base_fee) : null;

        if (medFee !== null && !isNaN(medFee)) {
            if (medFeeRateEl) medFeeRateEl.textContent = `${medFee.toLocaleString()} ppm`;
            if (baseFeeEl) baseFeeEl.textContent = `+ ${(baseFee || 0).toLocaleString()} msat base`;

            if (feePillEl) {
                feePillEl.title = 'Low: under 150 ppm · Mid: 150–500 ppm · High: over 500 ppm';
                if (medFee < 150) {
                    feePillEl.className = 'fee-benchmark-pill fee-low';
                    feePillEl.textContent = 'Low';
                } else if (medFee <= 500) {
                    feePillEl.className = 'fee-benchmark-pill fee-comp';
                    feePillEl.textContent = 'Mid';
                } else {
                    feePillEl.className = 'fee-benchmark-pill fee-high';
                    feePillEl.textContent = 'High';
                }
            }
        } else {
            if (medFeeRateEl) medFeeRateEl.textContent = 'N/A';
            if (baseFeeEl) baseFeeEl.textContent = 'N/A';
            if (feePillEl) {
                feePillEl.className = 'fee-benchmark-pill fee-comp';
                feePillEl.textContent = '';
            }
        }
    }

    async loadChannelsManager() {
        try {
            const { default: ChannelsTreemapManager } = await import('./profile-channels.js');
            return new ChannelsTreemapManager();
        } catch (error) {
            console.error('Failed to load channels manager:', error);
            return null;
        }
    }

    async loadChannelsTableManager() {
        try {
            console.log('NodeProfileManager: Importing profile-channels-table.js...');
            const { default: ChannelsTableManager } = await import('./profile-channels-table.js?v=4.0');
            console.log('NodeProfileManager: ChannelsTableManager imported successfully');
            const manager = new ChannelsTableManager();
            console.log('NodeProfileManager: ChannelsTableManager instance created');
            return manager;
        } catch (error) {
            console.error('NodeProfileManager: Failed to load channels table manager:', error);
            return null;
        }
    }

    showProfile() {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('error').style.display = 'none';
        document.getElementById('profileContent').style.display = 'block';
        if (!this.channelsTableLoaded) {
            this.channelsTableLoaded = true;
            this.initializeChannelsTable();
        }
    }

    showError(message) {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('profileContent').style.display = 'none';
        document.getElementById('error').style.display = 'flex';
        document.getElementById('errorMessage').textContent = message;
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new NodeProfileManager();
});