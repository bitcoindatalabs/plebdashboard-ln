import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

// Global copy pubkey helper
function copyPubKey(pubKey, element) {
    if (!pubKey) return;
    const original = element.innerHTML;
    element.innerHTML = '<i class="fas fa-check"></i> Copied!';
    element.classList.add('copied');

    navigator.clipboard.writeText(pubKey).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = pubKey;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }).finally(() => {
        setTimeout(() => {
            element.innerHTML = original;
            element.classList.remove('copied');
        }, 1500);
    });
}
window.copyPubKey = copyPubKey;

class UnifiedExplorer {
    constructor() {
        this.activeTab = 'nodes'; // 'nodes' or 'channels'
        
        // Nodes state
        this.nodesLoaded = false;
        this.allNodes = [];
        this.filteredNodes = [];
        this.nodeTypeMap = new Map();
        this.nodesCurrentPage = 1;
        this.nodesItemsPerPage = 48;
        this.nodesViewMode = 'grid'; // 'grid' or 'list'
        this.nodeActivePreset = 'all';
        this.nodeSearchQuery = '';
        this.nodeSortOption = 'pleb_rank:asc';

        // Channels state
        this.channelsLoaded = false;
        this.allChannels = [];
        this.filteredChannels = [];
        this.channelsCurrentPage = 1;
        this.channelsItemsPerPage = 50;
        this.channelNode1Query = '';
        this.channelNode2Query = '';
        this.channelCategoryFilter = 'all';

        this.init();
    }

    async init() {
        this.parseURLState();
        this.bindEvents();

        // Switch to the requested tab
        this.switchTab(this.activeTab, false);
    }

    parseURLState() {
        const params = new URLSearchParams(window.location.search);
        
        if (params.has('tab')) {
            const tab = params.get('tab').toLowerCase();
            if (tab === 'channels' || tab === 'nodes') {
                this.activeTab = tab;
            }
        }

        // Nodes params
        if (params.has('q')) this.nodeSearchQuery = params.get('q').trim();
        if (params.has('preset')) this.nodeActivePreset = params.get('preset');
        if (params.has('sort')) this.nodeSortOption = params.get('sort');
        if (params.has('view')) this.nodesViewMode = params.get('view');
        if (params.has('page') && this.activeTab === 'nodes') {
            this.nodesCurrentPage = parseInt(params.get('page')) || 1;
        }

        // Channels params
        if (params.has('node1')) this.channelNode1Query = params.get('node1').trim();
        if (params.has('node2')) this.channelNode2Query = params.get('node2').trim();
        if (params.has('category')) this.channelCategoryFilter = params.get('category').toLowerCase();
        if (params.has('page') && this.activeTab === 'channels') {
            this.channelsCurrentPage = parseInt(params.get('page')) || 1;
        }
    }

    syncURLState() {
        const params = new URLSearchParams();
        params.set('tab', this.activeTab);

        if (this.activeTab === 'nodes') {
            if (this.nodeSearchQuery) params.set('q', this.nodeSearchQuery);
            if (this.nodeActivePreset && this.nodeActivePreset !== 'all') params.set('preset', this.nodeActivePreset);
            if (this.nodeSortOption && this.nodeSortOption !== 'pleb_rank:asc') params.set('sort', this.nodeSortOption);
            if (this.nodesViewMode !== 'grid') params.set('view', this.nodesViewMode);
            if (this.nodesCurrentPage > 1) params.set('page', this.nodesCurrentPage);
        } else {
            if (this.channelNode1Query) params.set('node1', this.channelNode1Query);
            if (this.channelNode2Query) params.set('node2', this.channelNode2Query);
            if (this.channelCategoryFilter && this.channelCategoryFilter !== 'all') params.set('category', this.channelCategoryFilter);
            if (this.channelsCurrentPage > 1) params.set('page', this.channelsCurrentPage);
        }

        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', newUrl);
    }

    bindEvents() {
        // Tab Switcher
        const tabBtnNodes = document.getElementById('tabBtnNodes');
        const tabBtnChannels = document.getElementById('tabBtnChannels');

        if (tabBtnNodes) {
            tabBtnNodes.addEventListener('click', () => this.switchTab('nodes'));
        }
        if (tabBtnChannels) {
            tabBtnChannels.addEventListener('click', () => this.switchTab('channels'));
        }

        // --- Nodes Controls ---
        const nodeSearchInput = document.getElementById('nodeSearchInput');
        const nodeSearchClearBtn = document.getElementById('nodeSearchClearBtn');
        const nodeSortBy = document.getElementById('nodeSortBy');
        const viewBtnGrid = document.getElementById('viewBtnGrid');
        const viewBtnList = document.getElementById('viewBtnList');
        const nodeResetFiltersBtn = document.getElementById('nodeResetFiltersBtn');
        const nodePresetsContainer = document.getElementById('nodePresetsContainer');

        if (nodeSearchInput) {
            if (this.nodeSearchQuery) nodeSearchInput.value = this.nodeSearchQuery;
            let timer;
            nodeSearchInput.addEventListener('input', (e) => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    this.nodeSearchQuery = e.target.value.trim();
                    this.nodesCurrentPage = 1;
                    this.applyNodeFilters();
                }, 200);
            });
        }

        if (nodeSearchClearBtn) {
            nodeSearchClearBtn.addEventListener('click', () => {
                if (nodeSearchInput) nodeSearchInput.value = '';
                this.nodeSearchQuery = '';
                this.nodesCurrentPage = 1;
                this.applyNodeFilters();
            });
        }

        if (nodeSortBy) {
            if (this.nodeSortOption) nodeSortBy.value = this.nodeSortOption;
            nodeSortBy.addEventListener('change', (e) => {
                this.nodeSortOption = e.target.value;
                this.nodesCurrentPage = 1;
                this.sortNodes();
                this.renderNodes();
                this.syncURLState();
            });
        }

        if (viewBtnGrid) {
            viewBtnGrid.addEventListener('click', () => this.setNodeView('grid'));
        }
        if (viewBtnList) {
            viewBtnList.addEventListener('click', () => this.setNodeView('list'));
        }

        if (nodePresetsContainer) {
            nodePresetsContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.filter-preset-btn');
                if (!btn) return;
                const preset = btn.dataset.preset;
                this.setNodePreset(preset);
            });
        }

        if (nodeResetFiltersBtn) {
            nodeResetFiltersBtn.addEventListener('click', () => this.resetNodeFilters());
        }

        // Nodes Pagination
        const nodesPrevBtn = document.getElementById('nodesPrevBtn');
        const nodesNextBtn = document.getElementById('nodesNextBtn');
        if (nodesPrevBtn) {
            nodesPrevBtn.addEventListener('click', () => {
                if (this.nodesCurrentPage > 1) {
                    this.nodesCurrentPage--;
                    this.renderNodes();
                    this.syncURLState();
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                }
            });
        }
        if (nodesNextBtn) {
            nodesNextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredNodes.length / this.nodesItemsPerPage);
                if (this.nodesCurrentPage < totalPages) {
                    this.nodesCurrentPage++;
                    this.renderNodes();
                    this.syncURLState();
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                }
            });
        }

        // --- Channels Controls ---
        const channelNode1Input = document.getElementById('channelNode1Input');
        const channelNode2Input = document.getElementById('channelNode2Input');
        const channelResetBtn = document.getElementById('channelResetBtn');
        const channelCategoryChips = document.getElementById('channelCategoryChips');

        if (channelNode1Input) {
            if (this.channelNode1Query) channelNode1Input.value = this.channelNode1Query;
            let timer1;
            channelNode1Input.addEventListener('input', (e) => {
                clearTimeout(timer1);
                timer1 = setTimeout(() => {
                    this.channelNode1Query = e.target.value.trim();
                    this.channelsCurrentPage = 1;
                    this.applyChannelFilters();
                }, 250);
            });
        }

        if (channelNode2Input) {
            if (this.channelNode2Query) channelNode2Input.value = this.channelNode2Query;
            let timer2;
            channelNode2Input.addEventListener('input', (e) => {
                clearTimeout(timer2);
                timer2 = setTimeout(() => {
                    this.channelNode2Query = e.target.value.trim();
                    this.channelsCurrentPage = 1;
                    this.applyChannelFilters();
                }, 250);
            });
        }

        if (channelResetBtn) {
            channelResetBtn.addEventListener('click', () => {
                if (channelNode1Input) channelNode1Input.value = '';
                if (channelNode2Input) channelNode2Input.value = '';
                this.channelNode1Query = '';
                this.channelNode2Query = '';
                this.channelCategoryFilter = 'all';
                this.updateChannelCategoryChipsUI();
                this.channelsCurrentPage = 1;
                this.applyChannelFilters();
            });
        }

        if (channelCategoryChips) {
            channelCategoryChips.addEventListener('click', (e) => {
                const btn = e.target.closest('.filter-preset-btn');
                if (!btn) return;
                this.channelCategoryFilter = btn.dataset.category || 'all';
                this.updateChannelCategoryChipsUI();
                this.channelsCurrentPage = 1;
                this.applyChannelFilters();
            });
        }

        // Channels Pagination
        const channelsPrevBtn = document.getElementById('channelsPrevBtn');
        const channelsNextBtn = document.getElementById('channelsNextBtn');
        if (channelsPrevBtn) {
            channelsPrevBtn.addEventListener('click', () => {
                if (this.channelsCurrentPage > 1) {
                    this.channelsCurrentPage--;
                    this.renderChannels();
                    this.syncURLState();
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                }
            });
        }
        if (channelsNextBtn) {
            channelsNextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredChannels.length / this.channelsItemsPerPage);
                if (this.channelsCurrentPage < totalPages) {
                    this.channelsCurrentPage++;
                    this.renderChannels();
                    this.syncURLState();
                    window.scrollTo({ top: 120, behavior: 'smooth' });
                }
            });
        }
    }

    switchTab(tabName, shouldSync = true) {
        this.activeTab = tabName;

        const tabBtnNodes = document.getElementById('tabBtnNodes');
        const tabBtnChannels = document.getElementById('tabBtnChannels');
        const nodesSection = document.getElementById('nodesSection');
        const channelsSection = document.getElementById('channelsSection');
        const explorerH1 = document.getElementById('explorerH1');
        const explorerSubtitle = document.getElementById('explorerSubtitle');

        if (tabName === 'nodes') {
            tabBtnNodes.classList.add('active');
            tabBtnNodes.setAttribute('aria-selected', 'true');
            tabBtnChannels.classList.remove('active');
            tabBtnChannels.setAttribute('aria-selected', 'false');

            nodesSection.style.display = 'block';
            channelsSection.style.display = 'none';

            if (explorerH1) explorerH1.textContent = 'Node & Channel Explorer';
            if (explorerSubtitle) {
                explorerSubtitle.textContent = 'Discover high-capacity routing partners to optimize your node connectivity and routing topology';
            }

            if (!this.nodesLoaded) {
                this.loadNodesData();
            }
        } else {
            tabBtnChannels.classList.add('active');
            tabBtnChannels.setAttribute('aria-selected', 'true');
            tabBtnNodes.classList.remove('active');
            tabBtnNodes.setAttribute('aria-selected', 'false');

            nodesSection.style.display = 'none';
            channelsSection.style.display = 'block';

            if (explorerH1) explorerH1.textContent = 'Node & Channel Explorer';
            if (explorerSubtitle) {
                explorerSubtitle.textContent = 'Search, inspect, and audit active Lightning Network payment channels and routing fee policies';
            }

            if (!this.channelsLoaded) {
                this.loadChannelsData();
            }
        }

        if (shouldSync) {
            this.syncURLState();
        }
    }

    // =========================================================================
    // NODES TAB LOGIC
    // =========================================================================

    async loadNodesData() {
        const loading = document.getElementById('nodesLoading');
        if (loading) loading.style.display = 'flex';

        try {
            const [typesResp, parquetResp] = await Promise.all([
                fetch('data/ln_node_types.json').catch(() => null),
                fetch('data/node_profile.parquet')
            ]);

            if (typesResp && typesResp.ok) {
                const types = await typesResp.json();
                types.forEach(t => {
                    if (t.pub_key) this.nodeTypeMap.set(t.pub_key, t);
                    if (t.alias) this.nodeTypeMap.set(t.alias.toLowerCase(), t);
                });
            }

            if (!parquetResp.ok) throw new Error(`HTTP ${parquetResp.status}`);
            const buffer = await parquetResp.arrayBuffer();

            await parquetRead({
                file: buffer,
                rowFormat: 'object',
                onComplete: (rows) => {
                    if (!Array.isArray(rows) || rows.length === 0) {
                        throw new Error('No rows found in node_profile.parquet');
                    }

                    this.allNodes = rows.map(node => {

                        // Enrich from types map
                        const pk = node.pub_key;
                        const aliasLower = node.alias ? node.alias.toLowerCase() : '';
                        const typeInfo = this.nodeTypeMap.get(pk) || (aliasLower ? this.nodeTypeMap.get(aliasLower) : null);

                        if (typeInfo) {
                            if (typeInfo.node_type) node.node_type = typeInfo.node_type;
                            if (typeInfo.entity) node.entity = typeInfo.entity;
                            if (typeInfo.role) node.role = typeInfo.role;
                        }

                        if (!node.node_type || String(node.node_type).trim() === '' || node.node_type === 'NaN') {
                            node.node_type = 'Pleb';
                        }

                        node.pleb_rank = Number(node.pleb_rank) || 999999;
                        node.total_capacity = Number(node.total_capacity) || 0;
                        node.total_channels = Number(node.total_channels) || 0;
                        node.avg_fee_rate = Number(node.avg_fee_rate) || 0;
                        node.betweenness_centrality_rank = Number(node.betweenness_centrality_rank) || 999999;
                        node.eigenvector_centrality_rank = Number(node.eigenvector_centrality_rank) || 999999;
                        node.custom_pagerank_rank = Number(node.custom_pagerank_rank) || 999999;
                        node.total_capacity_rank = Number(node.total_capacity_rank) || 999999;
                        node.total_channels_rank = Number(node.total_channels_rank) || 999999;

                        return node;
                    }).filter(n => n.pub_key && n.alias);

                    this.nodesLoaded = true;
                    if (loading) loading.style.display = 'none';

                    // Update count pill on tab
                    const tabCountNodes = document.getElementById('tabCountNodes');
                    if (tabCountNodes) tabCountNodes.textContent = this.allNodes.length.toLocaleString();

                    // Apply filters & render
                    this.updateNodePresetsUI();
                    this.applyNodeFilters(false);
                    this.sortNodes();
                    this.renderNodes();
                },
                onError: (err) => {
                    throw err;
                }
            });

        } catch (err) {
            console.error('Error loading nodes data:', err);
            if (loading) {
                loading.innerHTML = `<div class="error-notice"><i class="fas fa-exclamation-triangle"></i><p>Failed to load nodes data: ${err.message}</p></div>`;
            }
        }
    }

    setNodePreset(preset) {
        this.nodeActivePreset = preset;
        this.updateNodePresetsUI();
        this.nodesCurrentPage = 1;
        this.applyNodeFilters();
    }

    updateNodePresetsUI() {
        document.querySelectorAll('#nodePresetsContainer .filter-preset-btn').forEach(btn => {
            if (btn.dataset.preset === this.nodeActivePreset) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    setNodeView(view) {
        this.nodesViewMode = view;
        const viewBtnGrid = document.getElementById('viewBtnGrid');
        const viewBtnList = document.getElementById('viewBtnList');
        const container = document.getElementById('nodesContainer');

        if (view === 'grid') {
            if (viewBtnGrid) viewBtnGrid.classList.add('active');
            if (viewBtnList) viewBtnList.classList.remove('active');
            if (container) {
                container.classList.remove('nodes-list');
                container.classList.add('nodes-grid');
            }
        } else {
            if (viewBtnList) viewBtnList.classList.add('active');
            if (viewBtnGrid) viewBtnGrid.classList.remove('active');
            if (container) {
                container.classList.remove('nodes-grid');
                container.classList.add('nodes-list');
            }
        }

        this.renderNodes();
        this.syncURLState();
    }

    resetNodeFilters() {
        this.nodeSearchQuery = '';
        this.nodeActivePreset = 'all';
        this.nodeSortOption = 'pleb_rank:asc';
        this.nodesCurrentPage = 1;

        const input = document.getElementById('nodeSearchInput');
        if (input) input.value = '';
        const sortSelect = document.getElementById('nodeSortBy');
        if (sortSelect) sortSelect.value = 'pleb_rank:asc';

        this.updateNodePresetsUI();
        this.applyNodeFilters();
    }

    applyNodeFilters(shouldRender = true) {
        let results = [...this.allNodes];

        // 1. Quick Filter Presets
        switch (this.nodeActivePreset) {
            case 'top_routing':
                // Top Routing Nodes: PlebRank <= 100, channels >= 50
                results = results.filter(n => n.pleb_rank <= 100 && n.total_channels >= 50);
                break;
            case 'high_capacity':
                // High Capacity: >= 1 BTC (100,000,000 sats)
                results = results.filter(n => n.total_capacity >= 100_000_000);
                break;
            case 'well_connected':
                // Well Connected: >= 50 channels
                results = results.filter(n => n.total_channels >= 50);
                break;
            case 'low_fees':
                // Low Fees: avg fee rate <= 100 ppm
                results = results.filter(n => n.avg_fee_rate > 0 && n.avg_fee_rate <= 100);
                break;
            case 'emerging':
                // Emerging Nodes: PlebRank >= 500, channels >= 5, capacity >= 1M sats
                results = results.filter(n => n.pleb_rank >= 500 && n.total_channels >= 5 && n.total_capacity >= 1_000_000);
                break;
            default:
                break;
        }

        // 2. Search query
        if (this.nodeSearchQuery) {
            const q = this.nodeSearchQuery.toLowerCase();
            results = results.filter(n => 
                (n.alias && n.alias.toLowerCase().includes(q)) ||
                (n.pub_key && n.pub_key.toLowerCase().includes(q)) ||
                (n.entity && n.entity.toLowerCase().includes(q)) ||
                (n.role && n.role.toLowerCase().includes(q))
            );
        }

        this.filteredNodes = results;

        if (shouldRender) {
            this.sortNodes();
            this.renderNodes();
            this.syncURLState();
        }
    }

    sortNodes() {
        const [field, dir] = this.nodeSortOption.split(':');
        const multiplier = dir === 'desc' ? -1 : 1;

        this.filteredNodes.sort((a, b) => {
            const valA = a[field] ?? 0;
            const valB = b[field] ?? 0;
            return (Number(valA) - Number(valB)) * multiplier;
        });
    }

    getTier(rank) {
        const r = Number(rank);
        if (r >= 1 && r <= 10) return { label: 'Elite', class: 'tier-elite', icon: 'fa-crown' };
        if (r <= 50) return { label: 'Top Tier', class: 'tier-top', icon: 'fa-star' };
        if (r <= 100) return { label: 'Core', class: 'tier-core', icon: 'fa-network-wired' };
        if (r <= 500) return { label: 'Established', class: 'tier-established', icon: 'fa-shield-halved' };
        return { label: 'Pleb', class: 'tier-pleb', icon: 'fa-user-astronaut' };
    }

    renderTypePills(typeStr) {
        if (!typeStr || typeStr === 'Pleb') {
            return `<span class="type-pill pill-pleb"><i class="fas fa-user-astronaut"></i> Pleb</span>`;
        }
        return typeStr.split(',').map(t => {
            const clean = t.trim();
            const lower = clean.toLowerCase();
            let c = 'pill-pleb';
            let icon = 'fa-user-astronaut';
            if (lower.includes('exchange')) { c = 'pill-exchange'; icon = 'fa-building-columns'; }
            else if (lower.includes('lsp')) { c = 'pill-lsp'; icon = 'fa-bolt'; }
            else if (lower.includes('routing')) { c = 'pill-routing'; icon = 'fa-route'; }
            else if (lower.includes('wallet')) { c = 'pill-wallet'; icon = 'fa-wallet'; }
            else if (lower.includes('payment')) { c = 'pill-payment'; icon = 'fa-credit-card'; }
            return `<span class="type-pill ${c}"><i class="fas ${icon}"></i> ${clean}</span>`;
        }).join(' ');
    }

    formatCapacity(sats) {
        const num = Number(sats) || 0;
        if (num >= 100_000_000) {
            const btc = num / 100_000_000;
            return `${btc >= 100 ? Math.round(btc) : btc.toFixed(2)} BTC`;
        }
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M sats`;
        if (num >= 1_000) return `${Math.round(num / 1_000)}k sats`;
        return `${num.toLocaleString()} sats`;
    }

    renderNodes() {
        const container = document.getElementById('nodesContainer');
        const pagination = document.getElementById('nodesPagination');
        if (!container) return;

        container.innerHTML = '';

        if (this.filteredNodes.length === 0) {
            container.style.display = 'block';
            container.innerHTML = `
                <div class="empty-state-message" style="padding: 4rem 1rem;">
                    <i class="fas fa-search"></i>
                    <p style="font-size: 1.1rem; font-weight: 600;">No channel partners found matching these filters.</p>
                    <button type="button" class="btn btn-secondary" onclick="window.explorerApp.resetNodeFilters()">Reset All Filters</button>
                </div>
            `;
            if (pagination) pagination.style.display = 'none';
            return;
        }

        const startIdx = (this.nodesCurrentPage - 1) * this.nodesItemsPerPage;
        const endIdx = startIdx + this.nodesItemsPerPage;
        const pageNodes = this.filteredNodes.slice(startIdx, endIdx);

        if (this.nodesViewMode === 'grid') {
            container.classList.remove('nodes-list');
            container.classList.add('nodes-grid');

            pageNodes.forEach(node => {
                const card = document.createElement('div');
                card.className = 'node-card';
                const tier = this.getTier(node.pleb_rank);
                const entityTag = node.entity && node.entity.toLowerCase() !== node.alias.toLowerCase() ? `
                    <span class="node-entity-tag" title="Verified Operator: ${node.entity}">
                        <i class="fas fa-building"></i> ${node.entity}
                    </span>
                ` : '';

                card.innerHTML = `
                    <div class="node-card-header">
                        <div class="node-identity">
                            <a href="profile.html?node=${encodeURIComponent(node.pub_key)}" class="node-alias" title="${node.alias}">
                                ${node.alias}
                            </a>
                            ${entityTag}
                        </div>
                        <div class="node-rank-badge">
                            <span class="rank-pill">#${node.pleb_rank.toLocaleString()}</span>
                            <span class="tier-badge ${tier.class}"><i class="fas ${tier.icon}"></i> ${tier.label}</span>
                        </div>
                    </div>

                    <div class="node-card-metrics">
                        <div class="metric-cell">
                            <span class="label">Capacity</span>
                            <span class="val">${this.formatCapacity(node.total_capacity)}</span>
                            <span class="sub">#${node.total_capacity_rank}</span>
                        </div>
                        <div class="metric-cell">
                            <span class="label">Channels</span>
                            <span class="val">${Number(node.total_channels).toLocaleString()}</span>
                            <span class="sub">#${node.total_channels_rank}</span>
                        </div>
                        <div class="metric-cell">
                            <span class="label">Avg Fee</span>
                            <span class="val">${Math.round(node.avg_fee_rate)} ppm</span>
                            <span class="sub">${Math.round(node.avg_base_fee || 0)} msat</span>
                        </div>
                    </div>

                    <div class="node-card-footer">
                        <div class="node-type-tags">
                            ${this.renderTypePills(node.node_type)}
                        </div>
                        <div class="node-card-actions">
                            <button type="button" class="action-btn-mini" onclick="window.explorerApp.openNodeChannels('${node.pub_key}')" title="Inspect this node's channels">
                                <i class="fas fa-bolt"></i> Channels
                            </button>
                            <a href="node-comparison.html?nodes=${encodeURIComponent(node.alias)}" class="action-btn-mini" title="Compare this node">
                                <i class="fas fa-balance-scale"></i> Compare
                            </a>
                            <a href="profile.html?node=${encodeURIComponent(node.pub_key)}" class="action-btn-mini" title="Full profile">
                                <i class="fas fa-user"></i>
                            </a>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
        } else {
            // List View
            container.classList.remove('nodes-grid');
            container.classList.add('nodes-list');

            pageNodes.forEach(node => {
                const row = document.createElement('div');
                row.className = 'node-list-row';
                const tier = this.getTier(node.pleb_rank);

                row.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 1rem; min-width: 200px;">
                        <span class="rank-pill" style="min-width: 45px;">#${node.pleb_rank}</span>
                        <div>
                            <a href="profile.html?node=${encodeURIComponent(node.pub_key)}" class="node-alias" style="font-size: 0.95rem;">${node.alias}</a>
                            ${node.entity ? `<div class="node-entity-tag" style="font-size: 0.68rem; margin-top: 2px;">${node.entity}</div>` : ''}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 1.5rem;">
                        <span class="tier-badge ${tier.class}"><i class="fas ${tier.icon}"></i> ${tier.label}</span>
                        <div style="min-width: 90px; text-align: right;"><strong>${this.formatCapacity(node.total_capacity)}</strong></div>
                        <div style="min-width: 70px; text-align: right;"><strong>${node.total_channels}</strong> ch</div>
                        <div style="min-width: 80px; text-align: right;">${Math.round(node.avg_fee_rate)} ppm</div>
                        <button type="button" class="action-btn-mini" onclick="window.explorerApp.openNodeChannels('${node.pub_key}')">Channels</button>
                        <a href="profile.html?node=${encodeURIComponent(node.pub_key)}" class="action-btn-mini"><i class="fas fa-chevron-right"></i></a>
                    </div>
                `;
                container.appendChild(row);
            });
        }

        container.style.display = this.nodesViewMode === 'grid' ? 'grid' : 'flex';
        this.updateNodePagination();
    }

    openNodeChannels(pubkey) {
        this.channelNode1Query = pubkey;
        const input = document.getElementById('channelNode1Input');
        if (input) input.value = pubkey;
        this.switchTab('channels');
        this.applyChannelFilters();
    }

    updateNodePagination() {
        const pagination = document.getElementById('nodesPagination');
        const info = document.getElementById('nodesPaginationInfo');
        const pageNumbers = document.getElementById('nodesPageNumbers');
        const prevBtn = document.getElementById('nodesPrevBtn');
        const nextBtn = document.getElementById('nodesNextBtn');

        if (!pagination || !info) return;

        const total = this.filteredNodes.length;
        const totalPages = Math.ceil(total / this.nodesItemsPerPage) || 1;

        if (total === 0) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';
        prevBtn.disabled = this.nodesCurrentPage <= 1;
        nextBtn.disabled = this.nodesCurrentPage >= totalPages;

        const start = (this.nodesCurrentPage - 1) * this.nodesItemsPerPage + 1;
        const end = Math.min(this.nodesCurrentPage * this.nodesItemsPerPage, total);
        info.textContent = `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} nodes`;

        pageNumbers.innerHTML = '';
        const maxPages = 5;
        let startPage = Math.max(1, this.nodesCurrentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(totalPages, startPage + maxPages - 1);
        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const a = document.createElement('a');
            a.href = '#';
            a.className = `page-number ${i === this.nodesCurrentPage ? 'active' : ''}`;
            a.textContent = i;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.nodesCurrentPage = i;
                this.renderNodes();
                this.syncURLState();
                window.scrollTo({ top: 120, behavior: 'smooth' });
            });
            pageNumbers.appendChild(a);
        }
    }

    // =========================================================================
    // CHANNELS TAB LOGIC
    // =========================================================================

    async loadChannelsData() {
        const loading = document.getElementById('channelsLoading');
        if (loading) loading.style.display = 'flex';

        try {
            const resp = await fetch('data/channel_profile.parquet');
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const buffer = await resp.arrayBuffer();

            await parquetRead({
                file: buffer,
                rowFormat: 'object',
                onComplete: (rows) => {
                    if (!Array.isArray(rows) || rows.length === 0) {
                        throw new Error('No rows found in channel_profile.parquet');
                    }

                    this.allChannels = rows.map(chan => {

                        chan.capacity = Number(chan.capacity) || 0;
                        chan.alias_1 = chan.alias_1 || (chan.node1_pub ? `${chan.node1_pub.substring(0, 8)}...` : 'Node 1');
                        chan.alias_2 = chan.alias_2 || (chan.node2_pub ? `${chan.node2_pub.substring(0, 8)}...` : 'Node 2');

                        // Parse policies
                        chan.policy1 = this.parsePolicy(chan.node1_policy);
                        chan.policy2 = this.parsePolicy(chan.node2_policy);

                        // Category
                        if (chan.capacity >= 100_000_000) chan.category = 'Freeway';
                        else if (chan.capacity >= 1_000_000) chan.category = 'Highway';
                        else chan.category = 'My Way';

                        return chan;
                    });

                    this.channelsLoaded = true;
                    if (loading) loading.style.display = 'none';

                    // Update count pill on tab
                    const tabCountChannels = document.getElementById('tabCountChannels');
                    if (tabCountChannels) tabCountChannels.textContent = `${Math.round(this.allChannels.length / 1000)}k+`;

                    // Update Summary Strip & render
                    this.applyChannelFilters(false);
                    this.renderChannels();
                },
                onError: (err) => {
                    throw err;
                }
            });

        } catch (err) {
            console.error('Error loading channels data:', err);
            if (loading) {
                loading.innerHTML = `<div class="error-notice"><i class="fas fa-exclamation-triangle"></i><p>Failed to load channels data: ${err.message}</p></div>`;
            }
        }
    }

    parsePolicy(policyStr) {
        if (!policyStr || typeof policyStr !== 'string' || policyStr === 'null' || policyStr === 'NaN') {
            return { fee_base_msat: 0, fee_rate_ppm: 0, disabled: true };
        }
        try {
            const parsed = JSON.parse(policyStr);
            return {
                fee_base_msat: Number(parsed.fee_base_msat || 0),
                fee_rate_ppm: Number(parsed.fee_rate_milli_msat || 0),
                disabled: !!parsed.disabled
            };
        } catch {
            return { fee_base_msat: 0, fee_rate_ppm: 0, disabled: false };
        }
    }

    updateChannelCategoryChipsUI() {
        document.querySelectorAll('#channelCategoryChips .filter-preset-btn').forEach(btn => {
            if (btn.dataset.category === this.channelCategoryFilter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    applyChannelFilters(shouldRender = true) {
        let results = [...this.allChannels];

        // Category filter
        if (this.channelCategoryFilter && this.channelCategoryFilter !== 'all') {
            const catLower = this.channelCategoryFilter.toLowerCase();
            results = results.filter(c => c.category.toLowerCase().replace(/\s+/g, '') === catLower);
        }

        // Dual-node search
        const n1 = this.channelNode1Query.toLowerCase();
        const n2 = this.channelNode2Query.toLowerCase();

        if (n1 && n2) {
            // Find channels between node 1 AND node 2
            results = results.filter(c => {
                const matchA = (c.node1_pub && c.node1_pub.toLowerCase().includes(n1)) || (c.alias_1 && c.alias_1.toLowerCase().includes(n1));
                const matchB = (c.node2_pub && c.node2_pub.toLowerCase().includes(n2)) || (c.alias_2 && c.alias_2.toLowerCase().includes(n2));
                const matchReverseA = (c.node2_pub && c.node2_pub.toLowerCase().includes(n1)) || (c.alias_2 && c.alias_2.toLowerCase().includes(n1));
                const matchReverseB = (c.node1_pub && c.node1_pub.toLowerCase().includes(n2)) || (c.alias_1 && c.alias_1.toLowerCase().includes(n2));
                return (matchA && matchB) || (matchReverseA && matchReverseB);
            });
        } else if (n1) {
            // Filter by node 1 anywhere
            results = results.filter(c => 
                (c.node1_pub && c.node1_pub.toLowerCase().includes(n1)) ||
                (c.node2_pub && c.node2_pub.toLowerCase().includes(n1)) ||
                (c.alias_1 && c.alias_1.toLowerCase().includes(n1)) ||
                (c.alias_2 && c.alias_2.toLowerCase().includes(n1))
            );
        } else if (n2) {
            // Filter by node 2 anywhere
            results = results.filter(c => 
                (c.node1_pub && c.node1_pub.toLowerCase().includes(n2)) ||
                (c.node2_pub && c.node2_pub.toLowerCase().includes(n2)) ||
                (c.alias_1 && c.alias_1.toLowerCase().includes(n2)) ||
                (c.alias_2 && c.alias_2.toLowerCase().includes(n2))
            );
        }

        this.filteredChannels = results;
        this.updateChannelSummaryStrip();

        if (shouldRender) {
            this.renderChannels();
            this.syncURLState();
        }
    }

    updateChannelSummaryStrip() {
        const totalCount = this.filteredChannels.length;
        let totalCapSats = 0;
        let freewayCount = 0;
        let totalFeePpm = 0;
        let validFees = 0;
        const capacities = [];

        for (let i = 0; i < totalCount; i++) {
            const cap = this.filteredChannels[i].capacity;
            totalCapSats += cap;
            capacities.push(cap);
            if (this.filteredChannels[i].category === 'Freeway') freewayCount++;

            const p1 = this.filteredChannels[i].policy1;
            if (p1 && !p1.disabled && p1.fee_rate_ppm > 0) {
                totalFeePpm += p1.fee_rate_ppm;
                validFees++;
            }
        }

        capacities.sort((a, b) => a - b);
        const medianCap = capacities.length ? capacities[Math.floor(capacities.length / 2)] : 0;
        const avgFee = validFees ? Math.round(totalFeePpm / validFees) : 0;
        const btcCap = (totalCapSats / 100_000_000).toFixed(1);

        const countEl = document.getElementById('chanStatCount');
        const capEl = document.getElementById('chanStatCapacity');
        const medEl = document.getElementById('chanStatMedian');
        const feeEl = document.getElementById('chanStatFee');
        const freeEl = document.getElementById('chanStatFreeways');

        if (countEl) countEl.textContent = totalCount.toLocaleString();
        if (capEl) capEl.textContent = `${Number(btcCap).toLocaleString()} BTC`;
        if (medEl) medEl.textContent = this.formatCapacity(medianCap);
        if (feeEl) feeEl.textContent = `${avgFee.toLocaleString()} ppm`;
        if (freeEl) freeEl.textContent = freewayCount.toLocaleString();
    }

    renderChannels() {
        const tableContainer = document.getElementById('channelsTableContainer');
        const tbody = document.getElementById('channelTbody');
        const pagination = document.getElementById('channelsPagination');
        if (!tbody || !tableContainer) return;

        tbody.innerHTML = '';

        if (this.filteredChannels.length === 0) {
            tableContainer.style.display = 'block';
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 3rem 1rem;">
                        <div class="empty-state-message">
                            <i class="fas fa-search"></i>
                            <p style="font-size: 1.1rem; font-weight: 600;">No channels found matching the query.</p>
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('channelResetBtn').click()">Reset Search</button>
                        </div>
                    </td>
                </tr>
            `;
            if (pagination) pagination.style.display = 'none';
            return;
        }

        const startIdx = (this.channelsCurrentPage - 1) * this.channelsItemsPerPage;
        const endIdx = startIdx + this.channelsItemsPerPage;
        const pageChannels = this.filteredChannels.slice(startIdx, endIdx);

        pageChannels.forEach(c => {
            const tr = document.createElement('tr');
            let catClass = 'cat-myway';
            if (c.category === 'Freeway') catClass = 'cat-freeway';
            else if (c.category === 'Highway') catClass = 'cat-highway';

            const p1 = c.policy1;
            const p2 = c.policy2;

            tr.innerHTML = `
                <td>
                    <strong style="font-size: 0.92rem;">${this.formatCapacity(c.capacity)}</strong>
                    <div style="font-size: 0.72rem; color: var(--text-muted);">${c.capacity.toLocaleString()} sats</div>
                </td>
                <td>
                    <span class="category-badge ${catClass}">
                        <i class="fas ${c.category === 'Freeway' ? 'fa-bolt' : (c.category === 'Highway' ? 'fa-road' : 'fa-bicycle')}"></i>
                        ${c.category}
                    </span>
                </td>
                <td>
                    <a href="profile.html?node=${encodeURIComponent(c.node1_pub)}" class="alias-link" style="font-weight: 700;">${c.alias_1}</a>
                    <div class="policy-box">
                        ${p1.disabled ? '<span class="policy-disabled">Disabled</span>' : `
                            <span class="policy-fee">${p1.fee_rate_ppm} ppm <span class="policy-ppm">(${p1.fee_base_msat} msat base)</span></span>
                        `}
                    </div>
                </td>
                <td style="text-align: center; color: var(--text-muted); font-size: 1.1rem;">
                    ⇄
                </td>
                <td>
                    <a href="profile.html?node=${encodeURIComponent(c.node2_pub)}" class="alias-link" style="font-weight: 700;">${c.alias_2}</a>
                    <div class="policy-box">
                        ${p2.disabled ? '<span class="policy-disabled">Disabled</span>' : `
                            <span class="policy-fee">${p2.fee_rate_ppm} ppm <span class="policy-ppm">(${p2.fee_base_msat} msat base)</span></span>
                        `}
                    </div>
                </td>
                <td>
                    <span class="sub-rank-tag" style="font-family: monospace;">${c.channel_id || '-'}</span>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tableContainer.style.display = 'block';
        this.updateChannelsPagination();
    }

    updateChannelsPagination() {
        const pagination = document.getElementById('channelsPagination');
        const info = document.getElementById('channelsPaginationInfo');
        const pageNumbers = document.getElementById('channelsPageNumbers');
        const prevBtn = document.getElementById('channelsPrevBtn');
        const nextBtn = document.getElementById('channelsNextBtn');

        if (!pagination || !info) return;

        const total = this.filteredChannels.length;
        const totalPages = Math.ceil(total / this.channelsItemsPerPage) || 1;

        if (total === 0) {
            pagination.style.display = 'none';
            return;
        }

        pagination.style.display = 'flex';
        prevBtn.disabled = this.channelsCurrentPage <= 1;
        nextBtn.disabled = this.channelsCurrentPage >= totalPages;

        const start = (this.channelsCurrentPage - 1) * this.channelsItemsPerPage + 1;
        const end = Math.min(this.channelsCurrentPage * this.channelsItemsPerPage, total);
        info.textContent = `Showing ${start.toLocaleString()}–${end.toLocaleString()} of ${total.toLocaleString()} channels`;

        pageNumbers.innerHTML = '';
        const maxPages = 5;
        let startPage = Math.max(1, this.channelsCurrentPage - Math.floor(maxPages / 2));
        let endPage = Math.min(totalPages, startPage + maxPages - 1);
        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            const a = document.createElement('a');
            a.href = '#';
            a.className = `page-number ${i === this.channelsCurrentPage ? 'active' : ''}`;
            a.textContent = i;
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.channelsCurrentPage = i;
                this.renderChannels();
                this.syncURLState();
                window.scrollTo({ top: 120, behavior: 'smooth' });
            });
            pageNumbers.appendChild(a);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.explorerApp = new UnifiedExplorer();
});
