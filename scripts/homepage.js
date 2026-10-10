import { parquetRead } from 'https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm';

class HomepageManager {
    constructor() {
        this.nodeData = [];
        this.searchIndex = new Map(); // For faster searching
        this.debounceTimer = null;
        this.selectedSuggestionIndex = -1;
        this.spotlightNodes = [];
        this.activeSpotlightIndex = 0;
        this.weeklyData = null;
        this.init();
    }

    async init() {
        this.loadNetworkPulse();
        this.loadWeeklyVelocity();
        this.loadDailySpotlight();
        await this.loadNodeData();
        this.buildSearchIndex();
        this.renderLeaderboardPreview('all');
        this.setupEventListeners();
    }

    async loadNodeData() {
        try {
            const response = await fetch('data/node_rank.parquet');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const arrayBuffer = await response.arrayBuffer();
            
            await parquetRead({
                file: arrayBuffer,
                rowFormat: 'object',
                onComplete: (result) => {
                    if (Array.isArray(result) && result.length > 0) {
                        this.nodeData = result.filter(node => node.pub_key && String(node.pub_key).length > 20); // Only include valid pubkeys
                    }
                },
                onError: (error) => console.error('Error loading node data:', error)
            });
        } catch (error) {
            console.error('Failed to load node data:', error);
        }
    }

    // Build search index for faster lookups
    buildSearchIndex() {
        this.searchIndex.clear();
        this.nodeData.forEach(node => {
            // Index by alias (if exists)
            if (node.alias) {
                const aliasKey = String(node.alias).toLowerCase();
                if (!this.searchIndex.has(aliasKey)) {
                    this.searchIndex.set(aliasKey, []);
                }
                this.searchIndex.get(aliasKey).push(node);
                
                // Also index partial alias matches for better search
                for (let i = 1; i <= aliasKey.length; i++) {
                    const partial = aliasKey.substring(0, i);
                    if (!this.searchIndex.has(partial)) {
                        this.searchIndex.set(partial, []);
                    }
                    this.searchIndex.get(partial).push(node);
                }
            }
            
            // Index by entity (if exists)
            if (node.entity) {
                const entityKey = String(node.entity).toLowerCase();
                if (!this.searchIndex.has(entityKey)) {
                    this.searchIndex.set(entityKey, []);
                }
                this.searchIndex.get(entityKey).push(node);
                
                // Also index partial entity matches for better search
                for (let i = 2; i <= entityKey.length; i++) {
                    const partial = entityKey.substring(0, i);
                    if (!this.searchIndex.has(partial)) {
                        this.searchIndex.set(partial, []);
                    }
                    this.searchIndex.get(partial).push(node);
                }
            }
            
            // Index by pubkey
            if (node.pub_key) {
                const pubkeyKey = String(node.pub_key).toLowerCase();
                if (!this.searchIndex.has(pubkeyKey)) {
                    this.searchIndex.set(pubkeyKey, []);
                }
                this.searchIndex.get(pubkeyKey).push(node);
                
                // Index partial pubkey matches (first 8, 16, 32 characters)
                [8, 16, 32, 48].forEach(len => {
                    if (pubkeyKey.length >= len) {
                        const partial = pubkeyKey.substring(0, len);
                        if (!this.searchIndex.has(partial)) {
                            this.searchIndex.set(partial, []);
                        }
                        this.searchIndex.get(partial).push(node);
                    }
                });
            }
        });
    }

    setupEventListeners() {
        const searchInput = document.getElementById('nodeSearchInput');
        const searchButton = document.getElementById('searchButton');
        const suggestionsContainer = document.getElementById('searchSuggestions');

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.selectedSuggestionIndex = -1;
                this.handleSearchInput(e.target.value);
            });

            searchInput.addEventListener('keydown', (e) => {
                this.handleKeyNavigation(e);
            });

            searchInput.addEventListener('focus', (e) => {
                if (e.target.value.trim()) {
                    this.handleSearchInput(e.target.value);
                }
            });

            // Hide suggestions when clicking outside
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !suggestionsContainer?.contains(e.target)) {
                    this.hideSuggestions();
                }
            });
        }

        if (searchButton) {
            searchButton.addEventListener('click', () => {
                this.performSearch(searchInput.value);
            });
        }

        // Setup Quick Jump Tags
        document.querySelectorAll('.quick-tag-chip').forEach(chip => {
            chip.addEventListener('click', (e) => {
                const alias = e.currentTarget.getAttribute('data-alias');
                const pubkey = e.currentTarget.getAttribute('data-pubkey');
                if (searchInput && alias) {
                    searchInput.value = alias;
                }
                if (pubkey) {
                    this.navigateToProfile(pubkey);
                } else if (alias) {
                    this.performSearch(alias);
                }
            });
        });

        // Setup Leaderboard Preview Category Tabs
        document.querySelectorAll('.lead-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.lead-tab-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                const filter = e.currentTarget.getAttribute('data-filter') || 'all';
                this.renderLeaderboardPreview(filter);
            });
        });

        // Global shortcut '/' to focus search
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && document.activeElement !== searchInput && 
                document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                e.preventDefault();
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
            }
        });
    }

    handleKeyNavigation(e) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        const suggestions = suggestionsContainer?.querySelectorAll('.suggestion-item');
        
        if (!suggestions || suggestions.length === 0) {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.performSearch(e.target.value);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedSuggestionIndex = Math.min(this.selectedSuggestionIndex + 1, suggestions.length - 1);
                this.updateSuggestionHighlight(suggestions);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedSuggestionIndex = Math.max(this.selectedSuggestionIndex - 1, -1);
                this.updateSuggestionHighlight(suggestions);
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedSuggestionIndex >= 0 && suggestions[this.selectedSuggestionIndex]) {
                    const pubkey = suggestions[this.selectedSuggestionIndex].dataset.pubkey;
                    this.selectSuggestion(pubkey);
                } else {
                    this.performSearch(e.target.value);
                }
                break;
            case 'Escape':
                this.hideSuggestions();
                e.target.blur();
                break;
        }
    }

    updateSuggestionHighlight(suggestions) {
        suggestions.forEach((suggestion, index) => {
            suggestion.classList.toggle('highlighted', index === this.selectedSuggestionIndex);
        });
    }

    handleSearchInput(searchTerm) {
        clearTimeout(this.debounceTimer);
        
        if (!searchTerm.trim()) {
            this.hideSuggestions();
            return;
        }

        // Reduce debounce time for better responsiveness
        this.debounceTimer = setTimeout(() => {
            this.showSuggestions(searchTerm);
        }, 150);
    }

    showSuggestions(searchTerm) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (!suggestionsContainer || !this.nodeData.length) return;

        const searchLower = searchTerm.toLowerCase().trim();
        
        // Use search index for faster lookups
        let matches = new Set();
        
        // Direct index matches
        if (this.searchIndex.has(searchLower)) {
            this.searchIndex.get(searchLower).forEach(node => matches.add(node));
        }
        
        // Fallback to partial matching if no direct matches
        if (matches.size === 0) {
            this.searchIndex.forEach((nodes, key) => {
                if (key.includes(searchLower) && matches.size < 8) {
                    nodes.forEach(node => matches.add(node));
                }
            });
        }

        // Convert Set to Array and limit results
        const matchesArray = Array.from(matches).slice(0, 6);

        if (matchesArray.length === 0) {
            this.hideSuggestions();
            return;
        }

        // Sort matches by relevance (exact alias matches first, then by rank)
        matchesArray.sort((a, b) => {
            const aAliasExact = (a.alias || '').toLowerCase() === searchLower;
            const bAliasExact = (b.alias || '').toLowerCase() === searchLower;
            
            if (aAliasExact && !bAliasExact) return -1;
            if (!aAliasExact && bAliasExact) return 1;
            
            // Sort by pleb_rank if available
            const aRank = Number(a.pleb_rank) || 999999;
            const bRank = Number(b.pleb_rank) || 999999;
            return aRank - bRank;
        });

        suggestionsContainer.innerHTML = matchesArray.map((node, index) => {
            const alias = node.alias || 'Unknown';
            const pubkey = node.pub_key || '';
            const rank = node.pleb_rank ? `#${node.pleb_rank}` : '';
            
            // Highlight matching text
            const aliasHighlighted = this.highlightMatch(alias, searchTerm);
            const pubkeyDisplay = pubkey.substring(0, 16) + '...';
            
            return `
                <div class="suggestion-item" data-pubkey="${pubkey}" onclick="homepageManager.selectSuggestion('${pubkey}')">
                    <div class="suggestion-main">
                        <span class="suggestion-alias">${aliasHighlighted}</span>
                        ${rank ? `<span class="suggestion-rank">${rank}</span>` : ''}
                    </div>
                    <span class="suggestion-pubkey">${pubkeyDisplay}</span>
                </div>
            `;
        }).join('');

        // Position the dropdown correctly using JavaScript
        this.positionDropdown();
        suggestionsContainer.style.display = 'block';
        this.selectedSuggestionIndex = -1;
    }

    positionDropdown() {
        // CSS now handles positioning correctly with relative/absolute positioning
        // No need for JavaScript positioning calculations
        return;
    }

    highlightMatch(text, searchTerm) {
        if (!searchTerm || !text) return text;
        
        const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    hideSuggestions() {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        if (suggestionsContainer) {
            suggestionsContainer.style.display = 'none';
        }
    }

    selectSuggestion(pubkey) {
        this.hideSuggestions();
        this.navigateToProfile(pubkey);
    }

    performSearch(searchTerm) {
        if (!searchTerm || !searchTerm.trim()) return;

        const searchLower = searchTerm.toLowerCase().trim();
        const searchNorm = searchLower.replace(/[\s\-_.]/g, '');
        
        // 1. Try exact matches first on alias, entity, or pubkey
        let matches = this.nodeData.filter(node => {
            const alias = (node.alias || '').toLowerCase();
            const entity = (node.entity || '').toLowerCase();
            const pubkey = (node.pub_key || '').toLowerCase();
            return alias === searchLower || entity === searchLower || pubkey === searchLower;
        });

        // 2. Normalized match (ignores spaces, hyphens, periods)
        if (matches.length === 0 && searchNorm.length > 0) {
            matches = this.nodeData.filter(node => {
                const aliasNorm = (node.alias || '').toLowerCase().replace(/[\s\-_.]/g, '');
                const entityNorm = (node.entity || '').toLowerCase().replace(/[\s\-_.]/g, '');
                return aliasNorm === searchNorm || entityNorm === searchNorm;
            });
        }

        // 3. Substring match on alias, entity, or pubkey start
        if (matches.length === 0) {
            matches = this.nodeData.filter(node => {
                const alias = (node.alias || '').toLowerCase();
                const entity = (node.entity || '').toLowerCase();
                const pubkey = (node.pub_key || '').toLowerCase();
                return alias.includes(searchLower) || entity.includes(searchLower) || pubkey.startsWith(searchLower);
            });
        }

        // 4. Normalized substring match (e.g. "walletofsatoshi" in "walletofsatoshicom")
        if (matches.length === 0 && searchNorm.length >= 3) {
            matches = this.nodeData.filter(node => {
                const aliasNorm = (node.alias || '').toLowerCase().replace(/[\s\-_.]/g, '');
                const entityNorm = (node.entity || '').toLowerCase().replace(/[\s\-_.]/g, '');
                return aliasNorm.includes(searchNorm) || entityNorm.includes(searchNorm);
            });
        }

        if (matches.length > 0) {
            // Prefer lower pleb_rank (more authoritative / primary node)
            matches.sort((a, b) => (Number(a.pleb_rank) || 999999) - (Number(b.pleb_rank) || 999999));
            this.navigateToProfile(matches[0].pub_key);
        } else {
            this.showSearchError(searchTerm);
        }
    }

    showSearchError(searchTerm) {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'search-error-toast';
        errorMsg.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            No node found for "${searchTerm}". Try a different alias or public key.
        `;
        
        document.body.appendChild(errorMsg);
        
        setTimeout(() => {
            errorMsg.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            errorMsg.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(errorMsg);
            }, 300);
        }, 3000);
    }

    navigateToProfile(pubkey) {
        if (pubkey) {
            window.location.href = `profile.html?node=${encodeURIComponent(pubkey)}`;
        }
    }

    renderLeaderboardPreview(filter = 'all') {
        const tbody = document.getElementById('homeLeaderboardBody');
        if (!tbody) return;

        if (!this.nodeData || !this.nodeData.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="lead-table-loading">
                        <i class="fas fa-spinner fa-spin"></i> Loading PlebRank leaders...
                    </td>
                </tr>
            `;
            return;
        }

        let nodes = [];
        const f = (filter || 'all').toLowerCase();
        if (f === 'lsp') {
            nodes = this.nodeData.filter(n => 
                (n.node_type && n.node_type.toLowerCase().includes('lsp')) || 
                (n.role && n.role.toLowerCase().includes('lsp')) ||
                (n.entity && n.entity.toLowerCase().includes('lsp'))
            );
        } else if (f === 'exchange') {
            nodes = this.nodeData.filter(n => 
                (n.node_type && n.node_type.toLowerCase().includes('exchange')) || 
                (n.role && n.role.toLowerCase().includes('exchange')) ||
                (n.entity && n.entity.toLowerCase().includes('exchange'))
            );
        } else if (f === 'routing') {
            nodes = this.nodeData.filter(n => 
                (n.node_type && n.node_type.toLowerCase().includes('routing')) || 
                (n.role && n.role.toLowerCase().includes('routing')) ||
                (Number(n.total_channels) >= 300)
            );
        } else {
            nodes = this.nodeData;
        }

        // Sort by pleb_rank ascending
        nodes = nodes.slice().sort((a, b) => (Number(a.pleb_rank) || 999999) - (Number(b.pleb_rank) || 999999));
        const topNodes = nodes.slice(0, 8);

        if (topNodes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="lead-table-loading">
                        No nodes found in this category.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = topNodes.map(node => {
            const rankNum = Number(node.pleb_rank) || '-';
            let rankClass = 'lead-rank-badge';
            if (rankNum === 1) rankClass += ' lead-rank-1';
            else if (rankNum === 2) rankClass += ' lead-rank-2';
            else if (rankNum === 3) rankClass += ' lead-rank-3';

            const alias = this.escapeHtml(node.alias || (node.pub_key ? node.pub_key.substring(0, 16) + '...' : 'Unknown'));
            const entityHtml = node.entity ? `<span class="lead-entity-chip"><i class="fas fa-building"></i> ${this.escapeHtml(node.entity)}</span>` : '';

            let primaryType = 'Router';
            if (node.node_type) {
                const types = String(node.node_type).split(',');
                primaryType = types[0].trim();
            }
            const typeHtml = primaryType ? `<span class="lead-type-chip">${this.escapeHtml(primaryType)}</span>` : '';

            let capStr = node.ftotal_capacity || '';
            if (!capStr && node.total_capacity) {
                capStr = `${(Number(node.total_capacity) / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 })} BTC`;
            }
            if (!capStr) capStr = '-';

            const chCount = (node.total_channels !== undefined && node.total_channels !== null)
                ? Number(node.total_channels).toLocaleString()
                : '-';

            return `
                <tr class="home-leaderboard-row" data-pubkey="${this.escapeHtml(node.pub_key || '')}">
                    <td><span class="${rankClass}">#${rankNum}</span></td>
                    <td>
                        <div class="lead-node-info">
                            <a href="profile.html?node=${encodeURIComponent(node.pub_key || '')}" class="lead-node-alias" onclick="event.stopPropagation();">
                                ${alias}
                            </a>
                            <div class="lead-badges-row">
                                ${entityHtml}
                                ${typeHtml}
                            </div>
                        </div>
                    </td>
                    <td class="lead-cap-val">${capStr}</td>
                    <td class="lead-chan-val">${chCount}</td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.home-leaderboard-row').forEach(row => {
            row.addEventListener('click', () => {
                const pk = row.getAttribute('data-pubkey');
                if (pk) this.navigateToProfile(pk);
            });
        });
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async loadNetworkPulse() {
        const pulseContainer = document.getElementById('networkPulse');
        if (!pulseContainer) return;

        try {
            const response = await fetch('data/weekly_snapshots/latest.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const metrics = data.metrics || {};

            // 1. Active Nodes (Nodes with Confirmed Open Channels)
            const activeNodes = metrics.active_nodes ? metrics.active_nodes.toLocaleString() : '12,534';
            const deltaNodes = metrics.delta_nodes_7d !== undefined ? metrics.delta_nodes_7d : 0;
            const nodesDeltaStr = deltaNodes >= 0 ? `+${deltaNodes.toLocaleString()} (7d)` : `${deltaNodes.toLocaleString()} (7d)`;
            const nodesClass = deltaNodes >= 0 ? 'positive' : 'negative';

            // 2. Active Channels (Verified On-Chain Open Channels)
            const activeChannels = metrics.active_channels ? metrics.active_channels.toLocaleString() : '33,561';
            const deltaChannels = metrics.delta_channels_7d !== undefined ? metrics.delta_channels_7d : (metrics.new_channels_7d || 0);
            const channelsDeltaStr = deltaChannels >= 0 ? `+${deltaChannels.toLocaleString()} (7d)` : `${deltaChannels.toLocaleString()} (7d)`;
            const channelsClass = deltaChannels >= 0 ? 'positive' : 'negative';

            // 3. Network Capacity
            const capBtc = metrics.total_capacity_sats
                ? Math.round(metrics.total_capacity_sats / 1e8).toLocaleString()
                : '3,721';
            const deltaCapBtc = metrics.delta_capacity_btc_7d !== undefined ? metrics.delta_capacity_btc_7d : 0;
            const capDeltaStr = deltaCapBtc >= 0
                ? `+${Math.round(deltaCapBtc).toLocaleString()} BTC (7d)`
                : `${Math.round(deltaCapBtc).toLocaleString()} BTC (7d)`;
            const capClass = deltaCapBtc >= 0 ? 'positive' : 'negative';

            // 4. Median Channel Capacity
            let medianSatsStr = '2.0M sats';
            if (metrics.median_channel_capacity_sats) {
                const med = metrics.median_channel_capacity_sats;
                medianSatsStr = med >= 1e6 ? `${(med / 1e6).toFixed(1)}M sats` : `${(med / 1e3).toFixed(0)}K sats`;
            }

            // Render compact network telemetry ribbon
            pulseContainer.innerHTML = `
                <div class="pulse-live-badge">
                    <span class="pulse-live-dot"></span> LIVE NETWORK
                </div>
                <div class="pulse-stat-group">
                    <div class="pulse-stat-item">
                        <span class="pulse-stat-num">${activeNodes}</span>
                        <span class="pulse-stat-label">Nodes</span>
                        <span class="pulse-stat-delta ${nodesClass}">${nodesDeltaStr}</span>
                    </div>
                    <span class="pulse-divider">|</span>
                    <div class="pulse-stat-item">
                        <span class="pulse-stat-num">${activeChannels}</span>
                        <span class="pulse-stat-label">Channels</span>
                        <span class="pulse-stat-delta ${channelsClass}" title="Net channel change over trailing 7 days (${(metrics.new_channels_7d || 0).toLocaleString()} opened - ${(metrics.closed_channels_7d || 0).toLocaleString()} closed)">${channelsDeltaStr}</span>
                    </div>
                    <span class="pulse-divider">|</span>
                    <div class="pulse-stat-item">
                        <span class="pulse-stat-num">${capBtc} BTC</span>
                        <span class="pulse-stat-label">Capacity</span>
                        <span class="pulse-stat-delta ${capClass}" title="Net capacity change over trailing 7 days accounting for closed channels: ${deltaCapBtc >= 0 ? '+' : ''}${deltaCapBtc.toFixed(1)} BTC (+${((metrics.new_capacity_sats_7d || 0) / 1e8).toFixed(1)} BTC opened, -${((metrics.closed_capacity_sats_7d || 0) / 1e8).toFixed(1)} BTC closed)">${capDeltaStr}</span>
                    </div>
                    <span class="pulse-divider">|</span>
                    <div class="pulse-stat-item">
                        <span class="pulse-stat-num">${medianSatsStr}</span>
                        <span class="pulse-stat-label">Median Chan</span>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Failed to load network pulse:', error);
            pulseContainer.style.display = 'none';
        }
    }

    async loadWeeklyVelocity() {
        try {
            const response = await fetch('data/weekly_snapshots/latest.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.weeklyData = data;
            const metrics = data.metrics || {};

            // 1. Update 3 Top Stats
            const newChannelsEl = document.getElementById('velNewChannels');
            if (newChannelsEl) {
                const deltaChans = metrics.delta_channels_7d !== undefined ? metrics.delta_channels_7d : (metrics.new_channels_7d || 994);
                newChannelsEl.textContent = `+${deltaChans.toLocaleString()}`;
            }

            const newCapEl = document.getElementById('velNewCapacity');
            if (newCapEl) {
                const deltaCap = metrics.delta_capacity_btc_7d !== undefined ? Math.round(metrics.delta_capacity_btc_7d) : 412;
                newCapEl.textContent = `+${deltaCap.toLocaleString()} BTC`;
            }

            const medCapEl = document.getElementById('velMedianCap');
            if (medCapEl) {
                if (metrics.median_channel_capacity_sats) {
                    const med = metrics.median_channel_capacity_sats;
                    medCapEl.textContent = med >= 1e6 ? `${(med / 1e6).toFixed(1)}M sats` : `${(med / 1e3).toFixed(0)}K sats`;
                }
            }

            // 2. Render Interactive SVG Velocity Chart
            this.renderVelocityChart(data.daily_breakdown || []);

            // 3. Render Corridor Highlight
            const corridorContent = document.getElementById('corridorContent');
            if (corridorContent && data.top_5_channels && data.top_5_channels.length > 0) {
                const topChan = data.top_5_channels[0];
                const capBtc = topChan.capacity ? (topChan.capacity / 1e8).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '5.0';
                corridorContent.innerHTML = `
                    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.4rem;">
                        <div>
                            <strong>${this.escapeHtml(topChan.node1_alias || 'Node 1')}</strong> ↔ <strong>${this.escapeHtml(topChan.node2_alias || 'Node 2')}</strong>
                            <span class="cap-pill">${capBtc} BTC</span>
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-secondary);">
                            Block ${this.escapeHtml(topChan.block_tx_output_short_id ? topChan.block_tx_output_short_id.split('x')[0] : 'Confirmed')}
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Failed to load weekly velocity data:', error);
        }
    }

    renderVelocityChart(days) {
        const container = document.getElementById('velocitySvgChart');
        if (!container || !days || days.length === 0) return;

        const width = 500;
        const height = 110;
        const padLeft = 25;
        const padRight = 25;
        const padBottom = 22;
        const padTop = 15;
        const chartW = width - padLeft - padRight;
        const chartH = height - padTop - padBottom;

        const maxChannels = Math.max(...days.map(d => d.new_channels || 0), 200);
        const maxBtc = Math.max(...days.map(d => d.capacity_added_btc || 0), 100);

        const barWidth = 28;
        const step = chartW / (days.length - 1 || 1);

        let barsSvg = '';
        let dotsSvg = '';
        let points = [];

        days.forEach((day, i) => {
            const cx = padLeft + (i * step);
            const ch = day.new_channels || 0;
            const btc = day.capacity_added_btc || 0;

            const barH = (ch / maxChannels) * chartH;
            const barY = padTop + chartH - barH;
            const barX = cx - (barWidth / 2);

            // Capacity line point
            const dotY = padTop + chartH - ((btc / maxBtc) * chartH);
            points.push(`${cx},${dotY}`);

            const closedCh = day.closed_channels || 0;
            const netBtc = day.net_capacity_btc !== undefined ? day.net_capacity_btc : btc;

            barsSvg += `
                <rect class="velocity-bar" 
                      x="${barX}" y="${barY}" width="${barWidth}" height="${barH}" 
                      data-date="${day.date_formatted}" data-channels="${ch}" data-btc="${btc.toFixed(1)}"
                      data-closed="${closedCh}" data-netbtc="${netBtc}" />
                <text class="velocity-axis-text" x="${cx}" y="${height - 4}">${day.date_formatted}</text>
            `;

            dotsSvg += `
                <circle class="velocity-dot" cx="${cx}" cy="${dotY}" r="4" 
                        data-date="${day.date_formatted}" data-channels="${ch}" data-btc="${btc.toFixed(1)}"
                        data-closed="${closedCh}" data-netbtc="${netBtc}" />
            `;
        });

        const lineSvg = `<polyline class="velocity-line" points="${points.join(' ')}" />`;

        container.innerHTML = `
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
                ${barsSvg}
                ${lineSvg}
                ${dotsSvg}
            </svg>
        `;

        // Tooltip interaction
        const tooltip = document.getElementById('velocityTooltip');
        if (tooltip) {
            const items = container.querySelectorAll('.velocity-bar, .velocity-dot');
            items.forEach(item => {
                item.addEventListener('mouseenter', () => {
                    const date = item.getAttribute('data-date');
                    const ch = item.getAttribute('data-channels');
                    const btc = item.getAttribute('data-btc');
                    const closed = item.getAttribute('data-closed');
                    const netBtc = item.getAttribute('data-netbtc');

                    let tip = `<strong>${date}</strong>: +${ch} opened`;
                    if (closed && Number(closed) > 0) {
                        tip += ` (${closed} closed)`;
                    }
                    tip += ` • +${btc} BTC added`;
                    if (netBtc && netBtc !== btc) {
                        const netNum = Number(netBtc);
                        tip += ` (net: ${netNum >= 0 ? '+' : ''}${netNum.toFixed(1)} BTC)`;
                    }
                    tooltip.innerHTML = tip;
                    tooltip.style.display = 'block';

                    const rect = container.getBoundingClientRect();
                    const itemRect = item.getBoundingClientRect();
                    const left = itemRect.left - rect.left + (itemRect.width / 2);
                    const top = itemRect.top - rect.top;
                    tooltip.style.left = `${left}px`;
                    tooltip.style.top = `${top}px`;
                });

                item.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });
            });
        }
    }

    async loadDailySpotlight() {
        try {
            const response = await fetch('data/spotlight_nodes.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.spotlightNodes = await response.json();
            this.activeSpotlightIndex = 0;
            this.renderActiveSpotlight();
        } catch (error) {
            console.error('Failed to load spotlight nodes:', error);
            const loading = document.getElementById('spotlightLoading');
            if (loading) loading.innerHTML = '<p style="color: var(--text-secondary); font-size: 0.85rem;">Spotlight updates daily at 10:00 AM UTC.</p>';
        }
    }

    renderActiveSpotlight() {
        if (!this.spotlightNodes || this.spotlightNodes.length === 0) return;
        const node = this.spotlightNodes[this.activeSpotlightIndex];
        if (!node) return;

        const loading = document.getElementById('spotlightLoading');
        const body = document.getElementById('spotlightNodeBody');
        const titleEl = document.getElementById('spotlightCriterionTitle');
        const datePill = document.getElementById('spotlightDatePill');

        if (titleEl) titleEl.textContent = `${node.day}: ${node.criterion}`;
        if (datePill) datePill.textContent = node.date;

        // Format capacity
        let capStr = 'N/A';
        if (node.total_capacity_sats) {
            const sats = Number(node.total_capacity_sats);
            if (sats >= 1e8) {
                capStr = `${(sats / 1e8).toFixed(2)} BTC`;
            } else {
                capStr = `${(sats / 1e6).toFixed(1)}M sats`;
            }
        }

        const alias = node.alias || 'Lightning Node';
        const plebRank = node.pleb_rank ? `#${Number(node.pleb_rank).toLocaleString()}` : 'Top Node';
        const channels = node.total_channels ? `${Number(node.total_channels).toLocaleString()} ch` : 'Active';

        if (body) {
            body.innerHTML = `
                <div class="spotlight-node-header">
                    <div class="spotlight-alias-group">
                        <a href="profile.html?node=${encodeURIComponent(node.pub_key)}" class="spotlight-alias">${this.escapeHtml(alias)}</a>
                        <div class="spotlight-tags">
                            ${node.entity ? `<span class="spotlight-entity-tag"><i class="fas fa-building"></i> ${this.escapeHtml(node.entity)}</span>` : ''}
                            <span class="spotlight-type-tag"><i class="fas fa-server"></i> ${this.escapeHtml(node.node_type || 'Routing Hub')}</span>
                        </div>
                    </div>
                    <div class="spotlight-rank-badge">
                        <span>PlebRank</span>
                        ${plebRank}
                    </div>
                </div>

                <div class="spotlight-rationale-quote">
                    "${this.escapeHtml(node.rationale || '')}"
                </div>

                <div class="spotlight-stats-grid">
                    <div class="spotlight-stat-item">
                        <div class="spotlight-stat-val">${capStr}</div>
                        <div class="spotlight-stat-lbl">Capacity</div>
                    </div>
                    <div class="spotlight-stat-item">
                        <div class="spotlight-stat-val">${channels}</div>
                        <div class="spotlight-stat-lbl">Channels</div>
                    </div>
                    <div class="spotlight-stat-item">
                        <div class="spotlight-stat-val">${this.escapeHtml(node.criterion)}</div>
                        <div class="spotlight-stat-lbl">Role Tier</div>
                    </div>
                </div>

                <div class="spotlight-actions-row">
                    <a href="profile.html?node=${encodeURIComponent(node.pub_key)}" class="spotlight-btn-primary">
                        <i class="fas fa-id-badge"></i> Inspect Profile
                    </a>
                    <a href="graph.html?highlight=${encodeURIComponent(node.pub_key)}" target="_blank" class="spotlight-btn-secondary" title="View node in graph visualization">
                        <i class="fas fa-project-diagram"></i> In Graph
                    </a>
                </div>
            `;
            if (loading) loading.style.display = 'none';
            body.style.display = 'flex';
        }

        // Render Recent History Chips
        const chipsContainer = document.getElementById('recentSpotlightsChips');
        if (chipsContainer) {
            chipsContainer.innerHTML = this.spotlightNodes.slice(0, 7).map((item, idx) => `
                <button type="button" class="spotlight-chip ${idx === this.activeSpotlightIndex ? 'active' : ''}" data-idx="${idx}">
                    <span class="spotlight-chip-day">${item.day.slice(0, 3)}:</span> ${this.escapeHtml(item.alias)}
                </button>
            `).join('');

            chipsContainer.querySelectorAll('.spotlight-chip').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.getAttribute('data-idx'), 10);
                    if (!isNaN(idx)) {
                        this.activeSpotlightIndex = idx;
                        this.renderActiveSpotlight();
                    }
                });
            });
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.homepageManager = new HomepageManager();
});