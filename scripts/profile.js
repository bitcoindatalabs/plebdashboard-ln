import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

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
                onComplete: (result) => {
                    const columns = this.getProfileColumns();
                    if (Array.isArray(result) && result.length > 0) {
                        // Log the first raw row as read from Parquet
                        console.log('First raw row from Parquet:', result[0]);
                        // Map each row array to an object using columns
                        const parsedData = result.map(row => {
                            const obj = {};
                            columns.forEach((col, i) => {
                                obj[col] = row[i];
                            });
                            return obj;
                        });
                        // Log all columns and the first row for debugging
                        console.log('Profile columns:', columns);
                        console.log('First mapped row:', parsedData[0]);
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
                                columns.forEach(col => {
                                    console.log(`  ${col}:`, found[col]);
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

    getProfileColumns() {
        return [
            'pub_key', 'alias', 'address_1', 'address_2', 'last_seen', 'source', 'snapshot_date', 'update_dt', 
            'closed_channels_count', 'node_type', 'entity', 'role', 'birth_tx', 
            'birth_chan', 'birth_tx_active', 'birth_chan_active', 'first_seen_week', 'in_latest_gossip', 
            'total_channels', 'channel_segment', 'category_counts', 'total_capacity', 
            'node_cap_tier', 'capacity_segment', 'avg_chnl_size', 'med_chnl_size', 'mode_chnl_size', 'min_chnl_size', 'max_chnl_size', 
            'betweenness_centrality_rank', 'eigenvector_centrality_rank', 'custom_pagerank_rank', 'capacity_weighted_degree_rank', 
            'total_channels_rank', 'total_capacity_rank', 'pleb_rank', 'ftotal_capacity', 
            'avg_base_fee', 'med_base_fee', 'max_base_fee', 'min_base_fee', 
            'avg_fee_rate', 'med_fee_rate', 'max_fee_rate', 'min_fee_rate'
        ];
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
        if (nodeTypeBadgeEl) {
            nodeTypeBadgeEl.innerHTML = this.renderNodeTypePills(node.node_type);
        } else {
            safeSet('nodeType', node.node_type || 'Unknown');
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

        const viewAllChannelsBtn = document.getElementById('viewAllChannelsBtn');
        if (viewAllChannelsBtn && node.pub_key) {
            viewAllChannelsBtn.href = `explorer.html?tab=channels&node1=${encodeURIComponent(node.pub_key)}`;
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
        safeSet('totalCapacity', node.ftotal_capacity || 'Unknown');
        safeSet('channelCount', this.formatNumber(node.total_channels));
        safeSet('medianChannelSize', this.formatCapacity(node.med_chnl_size));

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
        safeSet('connectAddress', this.connectAddress || '-');
        safeSet('nodeCapTier', node.node_cap_tier || '-');

        // Copy buttons visibility under Network Diagnostics
        const copyAddr1 = document.getElementById('copyAddress1Btn');
        if (copyAddr1) copyAddr1.style.display = (node.address_1 && node.address_1 !== '-') ? 'inline-flex' : 'none';

        const copyAddr2 = document.getElementById('copyAddress2Btn');
        if (copyAddr2) copyAddr2.style.display = (node.address_2 && node.address_2 !== '-') ? 'inline-flex' : 'none';

        const copyConn = document.getElementById('copyConnectAddrBtn');
        if (copyConn) copyConn.style.display = this.connectAddress ? 'inline-flex' : 'none';

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
                const freeway = catObj['Freeway'] || 0;
                const highway = catObj['Highway'] || 0;
                const myway = catObj['My Way'] || catObj['MyWay'] || 0;

                categoryCountsEl.innerHTML = `
                    <div class="category-badges-group">
                        <span class="cat-badge cat-freeway" title="Freeway: > 1 BTC capacity"><i class="fas fa-road"></i> Freeway: <strong>${Number(freeway).toLocaleString()}</strong></span>
                        <span class="cat-badge cat-highway" title="Highway: 1M - 100M sats"><i class="fas fa-car-side"></i> Highway: <strong>${Number(highway).toLocaleString()}</strong></span>
                        <span class="cat-badge cat-myway" title="My Way: < 1M sats"><i class="fas fa-bicycle"></i> My Way: <strong>${Number(myway).toLocaleString()}</strong></span>
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

    renderTopologicalRadar(node) {
        const svg = document.getElementById('radarSvg');
        const tooltip = document.getElementById('radarTooltip');
        if (!svg) return;

        const cx = 160;
        const cy = 125;
        const radius = 80;

        // 4 concentric polygon rings
        let gridHtml = '';
        [0.25, 0.5, 0.75, 1.0].forEach(factor => {
            const pts = [];
            for (let i = 0; i < 6; i++) {
                const angle = -Math.PI / 2 + (i * Math.PI / 3);
                const x = cx + radius * factor * Math.cos(angle);
                const y = cy + radius * factor * Math.sin(angle);
                pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
            }
            gridHtml += `<polygon points="${pts.join(' ')}" class="radar-grid-polygon" />`;
        });

        // 6 spokes
        let spokesHtml = '';
        for (let i = 0; i < 6; i++) {
            const angle = -Math.PI / 2 + (i * Math.PI / 3);
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            spokesHtml += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" class="radar-spoke" />`;
        }

        // Labels
        const labelsData = [
            { text: 'PlebRank', ox: 0, oy: -12 },
            { text: 'Capacity', ox: 14, oy: -4 },
            { text: 'Channels', ox: 14, oy: 12 },
            { text: 'Betweenness', ox: 0, oy: 18 },
            { text: 'W-Degree', ox: -14, oy: 12 },
            { text: 'Eigenvector', ox: -14, oy: -4 }
        ];

        let labelsHtml = '';
        labelsData.forEach((lbl, i) => {
            const angle = -Math.PI / 2 + (i * Math.PI / 3);
            const lx = cx + (radius + 14) * Math.cos(angle) + lbl.ox;
            const ly = cy + (radius + 14) * Math.sin(angle) + lbl.oy;
            labelsHtml += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" class="radar-label">${lbl.text}</text>`;
        });

        // Data Polygon & Dots
        const axes = [
            { name: 'PlebRank Power', rank: node.pleb_rank },
            { name: 'Capacity Weight', rank: node.total_capacity_rank },
            { name: 'Active Channels', rank: node.total_channels_rank },
            { name: 'Betweenness Routing', rank: node.betweenness_centrality_rank },
            { name: 'Weighted Degree', rank: node.capacity_weighted_degree_rank },
            { name: 'Eigenvector Hub Authority', rank: node.eigenvector_centrality_rank }
        ];

        const dataPts = [];
        const dots = [];

        axes.forEach((axis, i) => {
            const angle = -Math.PI / 2 + (i * Math.PI / 3);
            let score = 0.08;
            const rankNum = Number(axis.rank);
            if (axis.rank && !isNaN(rankNum) && rankNum > 0) {
                // Rank 1 -> 0.98, Rank 10000 -> 0.08
                score = Math.max(0.08, Math.min(0.98, 1 - (rankNum - 1) / 10000));
            }
            const px = cx + radius * score * Math.cos(angle);
            const py = cy + radius * score * Math.sin(angle);
            dataPts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
            const rankStr = axis.rank ? `#${Number(axis.rank).toLocaleString()}` : 'Unranked';
            const pctStr = axis.rank ? `Top ${Math.max(0.1, (rankNum / 100)).toFixed(1)}%` : 'N/A';
            dots.push(`
                <circle class="radar-dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4.5"
                    data-metric="${axis.name}" data-rank="${rankStr}" data-pct="${pctStr}">
                </circle>
            `);
        });

        svg.innerHTML = `
            ${gridHtml}
            ${spokesHtml}
            <polygon points="${dataPts.join(' ')}" class="radar-polygon" />
            ${dots.join('')}
            ${labelsHtml}
        `;

        // Tooltip interaction
        if (tooltip) {
            const container = document.getElementById('topologicalRadarContainer');
            svg.querySelectorAll('.radar-dot').forEach(dot => {
                dot.addEventListener('mouseenter', () => {
                    const metric = dot.getAttribute('data-metric');
                    const rank = dot.getAttribute('data-rank');
                    const pct = dot.getAttribute('data-pct');
                    tooltip.innerHTML = `<strong>${metric}</strong>: ${rank} (${pct})`;
                    tooltip.style.opacity = '1';

                    if (container) {
                        const rect = container.getBoundingClientRect();
                        const dotRect = dot.getBoundingClientRect();
                        const left = dotRect.left - rect.left + dotRect.width / 2;
                        const top = dotRect.top - rect.top;
                        tooltip.style.left = `${left}px`;
                        tooltip.style.top = `${top}px`;
                    }
                });

                dot.addEventListener('mouseleave', () => {
                    tooltip.style.opacity = '0';
                });
            });
        }
    }

    renderCentralityProgress(node) {
        const container = document.getElementById('centralityProgressList');
        if (!container) return;

        const dimensions = [
            { label: 'PlebRank Power', rank: node.pleb_rank, icon: 'fa-trophy' },
            { label: 'Capacity Weight', rank: node.total_capacity_rank, icon: 'fa-coins' },
            { label: 'Active Channels', rank: node.total_channels_rank, icon: 'fa-network-wired' },
            { label: 'Betweenness Routing', rank: node.betweenness_centrality_rank, icon: 'fa-project-diagram' },
            { label: 'Weighted Degree', rank: node.capacity_weighted_degree_rank, icon: 'fa-share-alt' },
            { label: 'Eigenvector Hub Authority', rank: node.eigenvector_centrality_rank, icon: 'fa-star' }
        ];

        container.innerHTML = dimensions.map(d => {
            const rankNum = Number(d.rank);
            const hasRank = d.rank && !isNaN(rankNum) && rankNum > 0;
            const rankStr = hasRank ? `#${rankNum.toLocaleString()}` : 'N/A';
            
            let pctLabel = 'Standard';
            let pctClass = 'pct-standard';
            let fillWidth = 5;

            if (hasRank) {
                const pct = Math.max(0.1, (rankNum / 100)).toFixed(1);
                fillWidth = Math.max(5, Math.min(100, 100 - (rankNum / 100)));
                if (rankNum <= 100) {
                    pctLabel = `Elite Top ${pct}%`;
                    pctClass = 'pct-elite';
                } else if (rankNum <= 500) {
                    pctLabel = `Top ${pct}%`;
                    pctClass = 'pct-top';
                } else if (rankNum <= 2000) {
                    pctLabel = `Core Top ${pct}%`;
                    pctClass = 'pct-core';
                } else {
                    pctLabel = `Pleb Tier (${pct}%)`;
                    pctClass = 'pct-standard';
                }
            }

            return `
                <div class="centrality-progress-row">
                    <div class="progress-label-row">
                        <span class="metric-name"><i class="fas ${d.icon}"></i> ${d.label}</span>
                        <div class="metric-rank-group">
                            <span class="metric-rank-val">${rankStr}</span>
                            <span class="metric-pct-pill ${pctClass}">${pctLabel}</span>
                        </div>
                    </div>
                    <div class="progress-track">
                        <div class="progress-fill" style="width: ${fillWidth}%;"></div>
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

        let title = 'Sovereign Pleb Router';
        let desc = 'Autonomous node operator strengthening network decentralization and alternative peer routing path resilience.';
        let badgeText = '🧑‍🚀 Pleb Router';

        if (betwRank <= 150 && capRank <= 150) {
            title = '⚡ Tier-1 Routing Backbone';
            desc = 'Critical liquidity artery and short-path transit bridge with exceptional betweenness and capital weight across the global Lightning graph.';
            badgeText = '⚡ Tier-1 Backbone';
        } else if (betwRank <= 250) {
            title = '🌉 Centrality Bridge';
            desc = 'High betweenness routing hub facilitating cross-cluster multi-hop payment routing between disparate sub-networks.';
            badgeText = '🌉 Centrality Bridge';
        } else if (capRank <= 200) {
            title = '🐋 Liquidity Reservoir';
            desc = 'Massive capital sink providing high-volume channel depth and absorption capacity for large-value payments.';
            badgeText = '🐋 Liquidity Whale';
        } else if (nodeType.includes('lsp')) {
            title = '⚡ Lightning Service Provider (LSP)';
            desc = 'Specialized client onboarding provider optimizing just-in-time inbound liquidity and end-user routing channels.';
            badgeText = '⚡ LSP Gateway';
        } else if (nodeType.includes('exchange')) {
            title = '🏦 Institutional Gateway';
            desc = 'High-throughput custodial terminal connecting exchange deposit/withdrawal liquidity to public routing channels.';
            badgeText = '🏦 Exchange Gateway';
        } else if (plebRank <= 500) {
            title = '⭐ Core Network Router';
            desc = 'High-reliability routing node with balanced liquidity distribution and consistent gossip presence.';
            badgeText = '⭐ Core Router';
        }

        const personaTitleEl = document.getElementById('personaTitle');
        const personaDescEl = document.getElementById('personaDesc');
        const personaBadgeEl = document.getElementById('nodePersonaBadge');

        if (personaTitleEl) personaTitleEl.textContent = title;
        if (personaDescEl) personaDescEl.textContent = desc;
        if (personaBadgeEl) {
            personaBadgeEl.textContent = badgeText;
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
            if (baseFeeEl) baseFeeEl.textContent = `${(baseFee || 0).toLocaleString()} msat`;

            if (feePillEl) {
                if (medFee < 150) {
                    feePillEl.className = 'fee-benchmark-pill fee-low';
                    feePillEl.textContent = 'Low Fee Router';
                } else if (medFee <= 500) {
                    feePillEl.className = 'fee-benchmark-pill fee-comp';
                    feePillEl.textContent = 'Competitive Policy';
                } else {
                    feePillEl.className = 'fee-benchmark-pill fee-high';
                    feePillEl.textContent = 'Premium Fee Margin';
                }
            }
        } else {
            if (medFeeRateEl) medFeeRateEl.textContent = 'N/A';
            if (baseFeeEl) baseFeeEl.textContent = 'N/A';
            if (feePillEl) {
                feePillEl.className = 'fee-benchmark-pill fee-comp';
                feePillEl.textContent = 'Standard Policy';
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
            const { default: ChannelsTableManager } = await import('./profile-channels-table.js');
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