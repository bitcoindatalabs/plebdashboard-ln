import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

// Global function to copy pub key to clipboard with visual feedback
function copyPubKey(pubKey, element) {
    if (!pubKey) return;
    
    const handleSuccess = () => {
        const originalContent = element.innerHTML;
        element.innerHTML = '<i class="fas fa-check"></i> Copied!';
        element.classList.add('copied');

        setTimeout(() => {
            element.innerHTML = originalContent;
            element.classList.remove('copied');
        }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(pubKey)
            .then(handleSuccess)
            .catch(() => fallbackCopy(pubKey, handleSuccess));
    } else {
        fallbackCopy(pubKey, handleSuccess);
    }
}

function fallbackCopy(text, callback) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        callback();
    } catch (err) {
        console.error('Fallback copy failed', err);
    }
    document.body.removeChild(textArea);
}

window.copyPubKey = copyPubKey;

// Rich interactive metadata for table headers and centrality metrics
const COLUMN_METADATA = {
    'pleb_rank': {
        short: 'PLEB<br>RANK',
        title: 'PlebRank Power Score',
        desc: 'Unified composite topology metric synthesizing routing betweenness, eigenvector hub influence, channel distribution, and committed capacity. Rank #1 represents the most central backbone node in the network.'
    },
    'alias': {
        short: 'NODE / OPERATOR',
        title: 'Node Alias & Entity',
        desc: 'Public gossip alias along with the verified corporate or community entity operating the infrastructure.'
    },
    'node_type': {
        short: 'TYPE',
        title: 'Ecosystem Classification',
        desc: 'Operational category derived from network telemetry and verified profiles: Exchange, LSP, Routing Hub, Wallet, Payment Provider, or Pleb Node.'
    },
    'total_capacity': {
        short: 'TOTAL<br>CAPACITY',
        title: 'Committed Bitcoin Capacity',
        desc: 'Aggregate Bitcoin committed across all active public channels, shown with network-wide capacity percentile rank.'
    },
    'total_channels': {
        short: 'PUBLIC<br>CHANNELS',
        title: 'Verified Active Channels',
        desc: 'Total count of open public routing channels advertised on the Lightning gossip protocol, with channel count rank.'
    },
    'capacity_weighted_degree_rank': {
        short: 'W-DEG<br>RANK',
        title: 'Capacity-Weighted Degree Rank',
        desc: 'Evaluates connectivity by weighting channel count with actual committed Bitcoin liquidity. Rewards high-capital deployment over empty channel spam.'
    },
    'betweenness_centrality_rank': {
        short: 'BETW<br>RANK',
        title: 'Betweenness Centrality Rank',
        desc: 'Measures how frequently this node sits on the most optimal payment paths between any two random nodes. High betweenness nodes are the indispensable bridge routers of Lightning.'
    },
    'eigenvector_centrality_rank': {
        short: 'EIG<br>RANK',
        title: 'Eigenvector Centrality Rank',
        desc: 'Measures the strategic quality of connections. Nodes connected to well-connected, high-reputation routing hubs score far higher than peripheral nodes.'
    },
    'custom_pagerank_rank': {
        short: 'PAGE<br>RANK',
        title: 'Custom PageRank Rank',
        desc: 'Simulates random payment traversal walks across the channel graph to evaluate structural authority, reliability, and recursive routing importance.'
    },
    'pub_key': {
        short: 'PUBKEY',
        title: 'Public Key',
        desc: 'Compressed 33-byte secp256k1 public key used for node addressing, gossip signatures, and channel establishment.'
    }
};

class DataTableManager {
    visibleColumns = [
        'pleb_rank',
        'alias',
        'node_type',
        'total_capacity',
        'total_channels',
        'capacity_weighted_degree_rank',
        'betweenness_centrality_rank',
        'eigenvector_centrality_rank',
        'custom_pagerank_rank',
        'pub_key'
    ];

    constructor() {
        this.rawData = [];
        this.allNodes = [];
        this.filteredData = [];
        this.nodeTypeMap = new Map();
        
        this.currentPage = 1;
        this.itemsPerPage = 50;
        this.sortColumn = 'pleb_rank';
        this.sortDirection = 'asc';
        this.searchTerm = '';
        this.activeFilter = 'all';

        if (window.location.protocol === 'file:') {
            this.showError('Please use a local web server (e.g. python -m http.server 8090) to view parquet datasets.');
            return;
        }
        
        this.initializeEventListeners();
        this.loadURLState();
        this.loadAllData();
    }

    loadURLState() {
        const params = new URLSearchParams(window.location.search);
        if (params.has('q')) {
            this.searchTerm = params.get('q').trim();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = this.searchTerm;
        }
        if (params.has('filter')) {
            this.activeFilter = params.get('filter').toLowerCase();
        }
        if (params.has('sort')) {
            const rawSort = params.get('sort');
            // Support legacy aliases
            const sortMap = {
                'channels_rank': 'total_channels',
                'capacity_rank': 'total_capacity',
                'weighted_degree_rank': 'capacity_weighted_degree_rank',
                'betweenness_rank': 'betweenness_centrality_rank',
                'eigenvector_rank': 'eigenvector_centrality_rank',
                'pagerank': 'custom_pagerank_rank'
            };
            this.sortColumn = sortMap[rawSort] || rawSort;
        }
        if (params.has('dir')) {
            this.sortDirection = params.get('dir') === 'desc' ? 'desc' : 'asc';
        }
        if (params.has('page')) {
            this.currentPage = parseInt(params.get('page')) || 1;
        }

        this.updateFilterChipsUI();
    }

    syncURLState() {
        const params = new URLSearchParams();
        if (this.searchTerm) params.set('q', this.searchTerm);
        if (this.activeFilter && this.activeFilter !== 'all') params.set('filter', this.activeFilter);
        if (this.sortColumn && this.sortColumn !== 'pleb_rank') params.set('sort', this.sortColumn);
        if (this.sortDirection && this.sortDirection !== 'asc') params.set('dir', this.sortDirection);
        if (this.currentPage && this.currentPage !== 1) params.set('page', this.currentPage);
        
        const queryString = params.toString();
        const newUrl = `${window.location.pathname}${queryString ? '?' + queryString : ''}`;
        window.history.replaceState({}, '', newUrl);
    }

    initializeEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const searchClearBtn = document.getElementById('searchClearBtn');

        if (searchInput) {
            let debounceTimer;
            searchInput.addEventListener('input', (e) => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    this.searchTerm = e.target.value.trim();
                    this.applyFilters(true);
                }, 200);
            });
        }

        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                this.searchTerm = '';
                this.applyFilters(true);
            });
        }

        // Quick filter chips
        const chipsContainer = document.getElementById('quickFilterChips');
        if (chipsContainer) {
            chipsContainer.addEventListener('click', (e) => {
                const chip = e.target.closest('.filter-chip');
                if (!chip) return;
                const filter = chip.dataset.filter;
                if (!filter) return;
                
                this.activeFilter = filter;
                this.updateFilterChipsUI();
                this.currentPage = 1;
                this.applyFilters(true);
            });
        }

        // Pagination buttons
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderTable();
                    this.syncURLState();
                    window.scrollTo({ top: 380, behavior: 'smooth' });
                }
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.renderTable();
                    this.syncURLState();
                    window.scrollTo({ top: 380, behavior: 'smooth' });
                }
            });
        }
    }

    updateFilterChipsUI() {
        document.querySelectorAll('.filter-chip').forEach(chip => {
            if (chip.dataset.filter === this.activeFilter) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
    }

    async loadAllData() {
        try {
            // Load both ln_node_types.json and node_rank.parquet in parallel
            const [typesResponse, parquetResponse] = await Promise.all([
                fetch('data/ln_node_types.json').catch(e => {
                    console.warn('Failed to fetch ln_node_types.json:', e);
                    return null;
                }),
                fetch('data/node_rank.parquet')
            ]);

            if (typesResponse && typesResponse.ok) {
                try {
                    const typesData = await typesResponse.json();
                    if (Array.isArray(typesData)) {
                        typesData.forEach(item => {
                            if (item.pub_key) {
                                this.nodeTypeMap.set(item.pub_key, item);
                            }
                            if (item.alias) {
                                this.nodeTypeMap.set(item.alias.toLowerCase(), item);
                            }
                        });
                    }
                } catch (e) {
                    console.warn('Error parsing ln_node_types.json:', e);
                }
            }

            if (!parquetResponse.ok) {
                throw new Error(`HTTP ${parquetResponse.status} while fetching node_rank.parquet`);
            }

            const arrayBuffer = await parquetResponse.arrayBuffer();

            await parquetRead({
                file: arrayBuffer,
                rowFormat: 'object',
                onComplete: (result) => {
                    if (!Array.isArray(result) || result.length === 0) {
                        this.showError('No rows returned from node_rank.parquet.');
                        return;
                    }

                    this.allNodes = result.map(node => {

                        // Enrich from ln_node_types.json
                        const pubKey = node.pub_key;
                        const alias = node.alias ? node.alias.toLowerCase() : '';
                        const typeInfo = this.nodeTypeMap.get(pubKey) || (alias ? this.nodeTypeMap.get(alias) : null);

                        if (typeInfo) {
                            if (typeInfo.node_type) node.node_type = typeInfo.node_type;
                            if (typeInfo.entity) node.entity = typeInfo.entity;
                            if (typeInfo.role) node.role = typeInfo.role;
                        }

                        // Default to Pleb if no node_type exists
                        if (!node.node_type || String(node.node_type).trim() === '' || node.node_type === 'NaN') {
                            node.node_type = 'Pleb';
                        }

                        // Ensure numeric columns are strictly numbers
                        node.pleb_rank = Number(node.pleb_rank) || 999999;
                        node.total_capacity = Number(node.total_capacity) || 0;
                        node.total_channels = Number(node.total_channels) || 0;
                        node.total_capacity_rank = Number(node.total_capacity_rank) || 999999;
                        node.total_channels_rank = Number(node.total_channels_rank) || 999999;
                        node.capacity_weighted_degree_rank = Number(node.capacity_weighted_degree_rank) || 999999;
                        node.betweenness_centrality_rank = Number(node.betweenness_centrality_rank) || 999999;
                        node.eigenvector_centrality_rank = Number(node.eigenvector_centrality_rank) || 999999;
                        node.custom_pagerank_rank = Number(node.custom_pagerank_rank) || 999999;

                        return node;
                    });

                    // Update aggregate stats summary header
                    this.updateAggregateHeader();

                    // Apply active filters and render
                    this.applyFilters(false);
                    this.sortData(this.sortColumn, false, false);
                    this.renderTable();
                    this.hideLoading();
                },
                onError: (error) => {
                    this.showError('Error parsing parquet data: ' + error.message);
                }
            });

        } catch (error) {
            console.error('loadAllData error:', error);
            this.showError(error.message);
        }
    }

    updateAggregateHeader() {
        const totalNodes = this.allNodes.length;
        const summaryHeaderTitle = document.getElementById('summaryHeaderTitle');
        if (summaryHeaderTitle) {
            summaryHeaderTitle.innerHTML = `Ranking <strong>${totalNodes.toLocaleString()}</strong> active Lightning nodes by PlebRank &mdash; evaluating routing betweenness, eigenvector hub influence, channel distribution, and deployed capital weight.`;
        }
    }

    applyFilters(shouldRender = true) {
        let results = [...this.allNodes];

        // 1. Preset filter chips
        if (this.activeFilter && this.activeFilter !== 'all') {
            switch (this.activeFilter) {
                case 'top100':
                case 'top-100':
                case 'elite':
                case 'top':
                case 'core':
                    results = results.filter(n => n.pleb_rank >= 1 && n.pleb_rank <= 100);
                    break;
                case 'lsp':
                    results = results.filter(n => (n.node_type || '').toLowerCase().includes('lsp'));
                    break;
                case 'gateway':
                case 'gateways':
                case 'exchange':
                case 'wallet':
                    results = results.filter(n => {
                        const t = (n.node_type || '').toLowerCase();
                        return t.includes('exchange') || t.includes('wallet') || t.includes('gateway');
                    });
                    break;
                case 'pleb':
                    results = results.filter(n => (n.node_type || '').toLowerCase().includes('pleb'));
                    break;
                case 'routing':
                    results = results.filter(n => (n.node_type || '').toLowerCase().includes('routing'));
                    break;
                case 'established':
                    results = results.filter(n => n.pleb_rank >= 101 && n.pleb_rank <= 500);
                    break;
            }
        }

        // 2. Free-text search
        if (this.searchTerm) {
            const query = this.searchTerm.toLowerCase();
            results = results.filter(node => {
                return (
                    (node.alias && node.alias.toLowerCase().includes(query)) ||
                    (node.pub_key && node.pub_key.toLowerCase().includes(query)) ||
                    (node.entity && node.entity.toLowerCase().includes(query)) ||
                    (node.role && node.role.toLowerCase().includes(query)) ||
                    (node.node_type && node.node_type.toLowerCase().includes(query))
                );
            });
        }

        this.filteredData = results;

        // Update count badge
        const badge = document.getElementById('filteredCountBadge');
        if (badge) {
            badge.textContent = `${this.filteredData.length.toLocaleString()} nodes`;
        }

        if (shouldRender) {
            this.currentPage = 1;
            this.sortData(this.sortColumn, false, false);
            this.renderTable();
            this.syncURLState();
        }
    }

    sortData(column, toggleDirection = true, shouldRender = true) {
        if (column === 'pub_key') return; // pubkey is not sortable

        if (toggleDirection) {
            if (this.sortColumn === column) {
                this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortColumn = column;
                // For capacity and channels, default first click to descending (highest first)
                if (column === 'total_capacity' || column === 'total_channels') {
                    this.sortDirection = 'desc';
                } else {
                    this.sortDirection = 'asc';
                }
            }
        }

        const multiplier = this.sortDirection === 'asc' ? 1 : -1;

        this.filteredData.sort((a, b) => {
            let aVal = a[column];
            let bVal = b[column];

            if (aVal === null || aVal === undefined) return 1 * multiplier;
            if (bVal === null || bVal === undefined) return -1 * multiplier;

            if (typeof aVal === 'string') {
                return aVal.localeCompare(String(bVal)) * multiplier;
            }

            return (Number(aVal) - Number(bVal)) * multiplier;
        });

        if (shouldRender) {
            this.renderTable();
            this.updateSortIndicators(column);
            this.syncURLState();
        }
    }

    updateSortIndicators(column) {
        document.querySelectorAll('th.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });
        
        const th = document.querySelector(`th[data-column="${column}"]`);
        if (th) {
            th.classList.add(`sort-${this.sortDirection}`);
        }
    }

    getTierInfo(rank) {
        const r = Number(rank);
        if (r >= 1 && r <= 10) {
            return {
                tier: 'elite',
                label: 'Elite',
                icon: 'fa-crown',
                className: 'tier-elite',
                tooltip: 'Elite Tier: Top 10 Backbone Router'
            };
        } else if (r <= 50) {
            return {
                tier: 'top',
                label: 'Top Tier',
                icon: 'fa-star',
                className: 'tier-top',
                tooltip: 'Top Tier: Top 50 High-Volume Router'
            };
        } else if (r <= 100) {
            return {
                tier: 'core',
                label: 'Core',
                icon: 'fa-network-wired',
                className: 'tier-core',
                tooltip: 'Core Router: Top 100 Strategic Hub'
            };
        } else if (r <= 500) {
            return {
                tier: 'established',
                label: 'Established',
                icon: 'fa-shield-halved',
                className: 'tier-established',
                tooltip: 'Established Router: Ranks 101–500'
            };
        } else {
            return {
                tier: 'pleb',
                label: 'Pleb',
                icon: 'fa-user-astronaut',
                className: 'tier-pleb',
                tooltip: 'Active Community Routing Node'
            };
        }
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

    renderTable() {
        const table = document.getElementById('dataTable');
        const thead = document.getElementById('tableHead');
        const tbody = document.getElementById('tableBody');
        
        if (!table || !thead || !tbody) return;

        // Render Head
        thead.innerHTML = '';
        const headerRow = document.createElement('tr');

        this.visibleColumns.forEach(column => {
            const th = document.createElement('th');
            th.dataset.column = column;
            const meta = COLUMN_METADATA[column] || { short: column, title: column, desc: '' };

            const isSortable = column !== 'pub_key';
            if (isSortable) {
                th.classList.add('sortable');
                th.addEventListener('click', (e) => {
                    // Do not sort if info button specifically triggered tooltip popover
                    if (e.target.closest('.tooltip-trigger-btn')) return;
                    this.sortData(column);
                });
            }

            // Interactive Tooltip Header
            th.innerHTML = `
                <div class="th-content">
                    <span class="header-label">${meta.short}</span>
                    ${meta.desc ? `
                        <button type="button" class="tooltip-trigger-btn" aria-label="Details about ${meta.title}" title="${meta.title}">
                            <i class="fas fa-info-circle"></i>
                        </button>
                    ` : ''}
                </div>
                ${meta.desc ? `
                    <div class="interactive-popover" role="tooltip">
                        <div class="popover-header">
                            <i class="fas fa-bolt popover-icon"></i>
                            <strong>${meta.title}</strong>
                        </div>
                        <p class="popover-body">${meta.desc}</p>
                    </div>
                ` : ''}
            `;

            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        this.updateSortIndicators(this.sortColumn);

        // Render Body
        tbody.innerHTML = '';

        if (this.filteredData.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td colspan="${this.visibleColumns.length}" class="no-results-cell">
                    <div class="empty-state-message">
                        <i class="fas fa-search"></i>
                        <p>No nodes found matching your search or filters.</p>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="document.getElementById('searchInput').value=''; document.querySelector('.filter-chip[data-filter=\\'all\\']').click();">Reset Filters</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
            table.style.display = 'table';
            this.updatePaginationControls();
            return;
        }

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageData = this.filteredData.slice(startIndex, endIndex);

        pageData.forEach(node => {
            const tr = document.createElement('tr');
            const tier = this.getTierInfo(node.pleb_rank);
            
            // Add top 3 podium accent row classes
            if (node.pleb_rank === 1) tr.classList.add('row-gold');
            else if (node.pleb_rank === 2) tr.classList.add('row-silver');
            else if (node.pleb_rank === 3) tr.classList.add('row-bronze');

            this.visibleColumns.forEach(col => {
                const td = document.createElement('td');
                const val = node[col];

                switch (col) {
                    case 'pleb_rank': {
                        td.classList.add('rank-cell');
                        let podiumIcon = '';
                        if (node.pleb_rank === 1) podiumIcon = '<span class="podium-icon gold">🥇</span>';
                        else if (node.pleb_rank === 2) podiumIcon = '<span class="podium-icon silver">🥈</span>';
                        else if (node.pleb_rank === 3) podiumIcon = '<span class="podium-icon bronze">🥉</span>';

                        td.innerHTML = `
                            <div class="rank-container">
                                <span class="rank-number-text">${podiumIcon}#${node.pleb_rank.toLocaleString()}</span>
                                <span class="tier-badge ${tier.className}" title="${tier.tooltip}">
                                    <i class="fas ${tier.icon}"></i> ${tier.label}
                                </span>
                            </div>
                        `;
                        break;
                    }

                    case 'alias': {
                        td.classList.add('alias-cell');
                        const aliasText = node.alias || (node.pub_key ? node.pub_key.substring(0, 10) + '...' : 'Unknown');
                        const hasEntity = node.entity && node.entity.trim() !== '' && node.entity.toLowerCase() !== aliasText.toLowerCase();

                        td.innerHTML = `
                            <div class="alias-wrapper">
                                <a href="profile.html?node=${encodeURIComponent(node.pub_key)}" class="alias-link" title="Inspect ${aliasText}">
                                    ${aliasText}
                                </a>
                                ${hasEntity ? `
                                    <span class="entity-sublabel" title="Verified Operator Entity: ${node.entity}">
                                        <i class="fas fa-building"></i> ${node.entity}
                                    </span>
                                ` : ''}
                            </div>
                        `;
                        break;
                    }

                    case 'node_type': {
                        td.classList.add('node-type-cell');
                        td.innerHTML = `<div class="pill-group">${this.renderNodeTypePills(node.node_type)}</div>`;
                        break;
                    }

                    case 'total_capacity': {
                        td.classList.add('capacity-cell');
                        const formattedCap = this.formatCapacity(node.total_capacity);
                        td.innerHTML = `
                            <div class="metric-cell-wrapper">
                                <span class="metric-primary">${formattedCap}</span>
                                <span class="sub-rank-tag" title="Capacity Rank: #${node.total_capacity_rank.toLocaleString()}">
                                    #${node.total_capacity_rank.toLocaleString()}
                                </span>
                            </div>
                        `;
                        break;
                    }

                    case 'total_channels': {
                        td.classList.add('channels-cell');
                        td.innerHTML = `
                            <div class="metric-cell-wrapper">
                                <span class="metric-primary">${Number(node.total_channels).toLocaleString()}</span>
                                <span class="sub-rank-tag" title="Channels Rank: #${node.total_channels_rank.toLocaleString()}">
                                    #${node.total_channels_rank.toLocaleString()}
                                </span>
                            </div>
                        `;
                        break;
                    }

                    case 'capacity_weighted_degree_rank':
                    case 'betweenness_centrality_rank':
                    case 'eigenvector_centrality_rank':
                    case 'custom_pagerank_rank': {
                        td.classList.add('centrality-rank-cell');
                        const rankVal = Number(val);
                        let rankPillClass = 'rank-high';
                        if (rankVal <= 10) rankPillClass = 'rank-elite';
                        else if (rankVal <= 50) rankPillClass = 'rank-top';
                        else if (rankVal <= 100) rankPillClass = 'rank-core';
                        else if (rankVal <= 500) rankPillClass = 'rank-mid';

                        td.innerHTML = `<span class="centrality-num ${rankPillClass}">#${rankVal.toLocaleString()}</span>`;
                        break;
                    }

                    case 'pub_key': {
                        td.classList.add('pubkey-cell');
                        const pk = node.pub_key || '';
                        const shortPk = pk ? `${pk.substring(0, 6)}...${pk.substring(pk.length - 4)}` : '-';
                        td.innerHTML = `
                            <button type="button" class="pubkey-pill" onclick="copyPubKey('${pk}', this)" title="Click to copy pubkey: ${pk}">
                                <span>${shortPk}</span>
                                <i class="far fa-copy copy-icon"></i>
                            </button>
                        `;
                        break;
                    }

                    default: {
                        td.textContent = val !== null && val !== undefined ? String(val) : '-';
                    }
                }

                tr.appendChild(td);
            });

            tbody.appendChild(tr);
        });

        table.style.display = 'table';
        this.updatePaginationControls();
    }

    formatCapacity(sats) {
        if (!sats || Number.isNaN(sats)) return '-';
        const num = Number(sats);

        if (num >= 100_000_000) {
            const btc = num / 100_000_000;
            if (btc >= 100) {
                return `${Math.round(btc).toLocaleString()} BTC`;
            } else if (btc >= 10) {
                return `${btc.toFixed(1)} BTC`;
            } else {
                return `${btc.toFixed(2)} BTC`;
            }
        } else if (num >= 1_000_000) {
            return `${(num / 1_000_000).toFixed(1)}M sats`;
        } else if (num >= 1_000) {
            return `${Math.round(num / 1_000).toLocaleString()}k sats`;
        } else {
            return `${num.toLocaleString()} sats`;
        }
    }

    updatePaginationControls() {
        const totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage) || 1;
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const pageNumbers = document.getElementById('pageNumbers');
        const paginationInfo = document.getElementById('paginationInfo');
        
        if (!prevBtn || !nextBtn || !pageNumbers || !paginationInfo) return;
        
        prevBtn.disabled = this.currentPage <= 1;
        nextBtn.disabled = this.currentPage >= totalPages;
        
        const startItem = this.filteredData.length === 0 ? 0 : (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.filteredData.length);
        paginationInfo.textContent = `Showing ${startItem.toLocaleString()}–${endItem.toLocaleString()} of ${this.filteredData.length.toLocaleString()} nodes`;
        
        pageNumbers.innerHTML = '';
        if (totalPages <= 1) return;
        
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
        
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageLink = document.createElement('a');
            pageLink.href = '#';
            pageLink.textContent = i;
            pageLink.classList.add('page-number');
            if (i === this.currentPage) {
                pageLink.classList.add('active');
            }
            pageLink.addEventListener('click', (e) => {
                e.preventDefault();
                this.currentPage = i;
                this.renderTable();
                this.syncURLState();
                window.scrollTo({ top: 380, behavior: 'smooth' });
            });
            pageNumbers.appendChild(pageLink);
        }
    }

    hideLoading() {
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';
    }

    showError(message) {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.innerHTML = `
                <div class="error-notice">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                </div>
            `;
            loading.style.display = 'flex';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('dataTable')) {
        new DataTableManager();
    }
});