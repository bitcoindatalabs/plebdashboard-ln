import * as echarts from 'https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.esm.min.js';

class ChannelsTreemapManager {
    constructor() {
        this.chartInstance = null;
    }

    async fetchParquet(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        return arrayBuffer;
    }

    getChannelCategory(capacity) {
        if (capacity > 100_000_000) return 'Freeway';
        if (capacity > 5_000_000) return 'Highway';
        return 'My Way';
    }

    formatCapacityShort(capacity) {
        if (capacity >= 1_000_000_000) return (capacity / 1_000_000_000).toFixed(1) + 'B sats';
        if (capacity >= 1_000_000) return (capacity / 1_000_000).toFixed(0) + 'M sats';
        if (capacity >= 1_000) return (capacity / 1_000).toFixed(0) + 'K sats';
        return capacity + ' sats';
    }

    async loadAndRenderChannelsTreemap(nodePubKey) {
        // Dispose of any existing chart first
        this.dispose();

        // Lazy load hyparquet only if needed
        const { parquetRead } = await import('https://cdn.jsdelivr.net/npm/hyparquet@1.17.1/+esm');
        const arrayBuffer = await this.fetchParquet('data/channel_profile.parquet');
        
        return new Promise((resolve, reject) => {
            parquetRead({
                file: arrayBuffer,
                rowFormat: 'object',
                onComplete: (result) => {
                    try {
                        // Filter channels for this node
                        const nodeChannels = result.filter(
                            ch => ch.node1_pub === nodePubKey || ch.node2_pub === nodePubKey
                        );
                        
                        // Group by category
                        const parents = { Freeway: [], Highway: [], 'My Way': [] };
                        nodeChannels.forEach(ch => {
                            const cap = Number(ch.capacity) || 0;
                            const cat = this.getChannelCategory(cap);
                            parents[cat].push({
                                name: `${ch.alias_1 || ''} ↔ ${ch.alias_2 || ''}`.trim() || ch.node1_pub.slice(0,6)+ '...',
                                value: cap,
                                capacity: cap,
                                node1_pub: ch.node1_pub,
                                node2_pub: ch.node2_pub,
                                alias_1: ch.alias_1,
                                alias_2: ch.alias_2
                            });
                        });
                        
                        // Build treemap data in fixed order
                        const treemapData = [
                            { name: 'Freeway', children: parents.Freeway.length ? parents.Freeway : [{ name: 'None', value: 0 }] },
                            { name: 'Highway', children: parents.Highway.length ? parents.Highway : [{ name: 'None', value: 0 }] },
                            { name: 'My Way', children: parents['My Way'].length ? parents['My Way'] : [{ name: 'None', value: 0 }] }
                        ];
                        
                        this.renderTreemap(treemapData, nodePubKey);
                        resolve();
                    } catch (error) {
                        reject(error);
                    }
                },
                onError: (err) => reject(err)
            });
        });
    }

    renderTreemap(data, nodePubKey) {
        const chartDom = document.getElementById('channelsTreemap');
        if (!chartDom) {
            console.error('Chart container not found');
            return;
        }

        // Dispose any existing chart instance
        this.dispose();

        // Initialize new chart
        this.chartInstance = echarts.init(chartDom);
        
        const option = {
            tooltip: {
                formatter: (info) => {
                    const d = info.data;
                    if (!d.capacity) return d.name;
                    let aliasStr = d.alias_1 && d.alias_2 ? `${d.alias_1} ↔ ${d.alias_2}` : (d.alias_1 || d.alias_2 || '');
                    return `<b>${aliasStr}</b><br/>Capacity: ${this.formatCapacityShort(d.capacity)}`;
                }
            },
            series: [{
                type: 'treemap',
                data: data,
                label: {
                    show: true,
                    formatter: (params) => {
                        const d = params.data;
                        if (d.node1_pub === nodePubKey) return d.alias_2 || '';
                        if (d.node2_pub === nodePubKey) return d.alias_1 || '';
                        return d.alias_1 || d.alias_2 || '';
                    }
                },
                upperLabel: {
                    show: true,
                    height: 24,
                    color: '#fff',
                    fontWeight: 'bold',
                    backgroundColor: 'transparent'
                },
                breadcrumb: { show: false },
                roam: false,
                nodeClick: false,
                levels: [
                    {
                        itemStyle: { borderColor: '#fff', borderWidth: 2 },
                        color: ['#2E7559', '#9A6715', '#2C5672'], // Freeway (Sage), Highway (Amber), My Way (River Slate) base colors
                    },
                    {
                        colorSaturation: [0.35, 0.85],
                        itemStyle: {
                            borderColorSaturation: 0.7,
                            gapWidth: 2,
                            borderWidth: 1
                        }
                    }
                ]
            }]
        };
        
        this.chartInstance.setOption(option);
        
        // Set up resize listener
        this.setupResizeListener();
    }

    setupResizeListener() {
        if (!this.chartInstance) return;
        
        // Remove any existing resize listener
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        
        // Create new resize handler
        this.resizeHandler = () => {
            if (this.chartInstance) {
                this.chartInstance.resize();
            }
        };
        
        window.addEventListener('resize', this.resizeHandler);
    }

    dispose() {
        // Remove resize listener
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }
        
        // Dispose chart instance
        if (this.chartInstance) {
            this.chartInstance.dispose();
            this.chartInstance = null;
        }
    }

    resize() {
        if (this.chartInstance) {
            this.chartInstance.resize();
        }
    }
}

// Export the manager class
export default ChannelsTreemapManager;

// Also export individual functions for backward compatibility
export { ChannelsTreemapManager };