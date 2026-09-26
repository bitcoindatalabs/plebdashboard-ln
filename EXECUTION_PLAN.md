# Plebdashboard-LN Execution Plan
### `lightning.bitcoindatalabs.org` — The Unified Lightning Intelligence Platform

**Created:** Sep 26, 2026
**Status:** Phase 0 ready for execution

---

## Context & Strategic Decisions

| Decision | Resolution |
|---|---|
| **Domain** | `lightning.bitcoindatalabs.org` (CNAME in plebdashboard-ln repo) |
| **Org ownership** | `bitcoindatalabs` GitHub org owns both `plebdashboard-ln` and `ln-graph-viz` |
| **Graph Viz** | Replicate frontend into `plebdashboard-ln/graph.html`. Keep `ln-graph-viz` repo alive (widely shared URLs). |
| **Reports page** | Stays as-is (used for automated LinkedIn/X screenshot pipeline). Not added to nav — accessed via automation. |
| **Data separation** | Create `lightning-data` repo (mirrors `orange-dev-data` pattern) to serve data to plebdashboard-ln |
| **LightningDS** | Python analysis library — stays as-is, powers data generation pipelines |

---

## Repo Architecture (Target State)

```
bitcoindatalabs/
├── plebdashboard-ln/          ← Frontend (GitHub Pages → lightning.bitcoindatalabs.org)
│   ├── index.html             ← Homepage with Network Pulse
│   ├── prank.html             ← Rankings
│   ├── node-explorer.html     ← Node Explorer
│   ├── channel-explorer.html  ← Channel Explorer
│   ├── node-comparison.html   ← Node Comparison
│   ├── profile.html           ← Node Profile
│   ├── graph.html             ← Graph Viz (replicated from ln-graph-viz)
│   ├── reports.html           ← Weekly Wrap (for automation screenshots)
│   ├── CNAME                  ← lightning.bitcoindatalabs.org
│   ├── data/                  ← Lightweight data (featured_node.json, etc.)
│   ├── scripts/
│   └── styles/
│
├── lightning-data/             ← Data repo (like orange-dev-data)
│   ├── data/
│   │   ├── node_rank.parquet
│   │   ├── node_profile.parquet
│   │   ├── channel_profile.parquet
│   │   ├── node_feature.parquet
│   │   ├── ln_node_types.json
│   │   ├── graph/             ← Graph viz datasets
│   │   │   ├── gall.json
│   │   │   ├── ghigh.json
│   │   │   └── gfree.json
│   │   └── weekly_snapshots/
│   │       ├── latest.json
│   │       └── weekly_YYYYMMDD.json
│   ├── scripts/               ← Data generation / ETL scripts
│   └── metadata/
│
├── ln-graph-viz/               ← Kept alive (legacy URLs still work)
│   └── (no changes — existing URLs continue to resolve)
│
└── LightningDS/                ← Python library (analysis engine)
```

---

## Phase 0: Foundation (Day 1)
**Goal:** Set up CNAME, create lightning-data repo structure, verify domain.

### 0.1 — Add CNAME to plebdashboard-ln
```
lightning.bitcoindatalabs.org
```
- Create `CNAME` file in repo root
- Configure DNS: Add CNAME record `lightning` → `bitcoindatalabs.github.io`
- Enable HTTPS in GitHub Pages settings

### 0.2 — Create lightning-data repo
- Create `bitcoindatalabs/lightning-data` repo on GitHub
- Structure:
  ```
  lightning-data/
  ├── README.md
  ├── data/
  │   ├── node_rank.parquet
  │   ├── node_profile.parquet
  │   ├── channel_profile.parquet
  │   ├── node_feature.parquet
  │   ├── ln_node_types.json
  │   ├── featured_node.json
  │   ├── graph/
  │   │   ├── gall.json
  │   │   ├── ghigh.json
  │   │   └── gfree.json
  │   └── weekly_snapshots/
  │       ├── latest.json
  │       └── weekly_YYYYMMDD.json
  ├── scripts/           ← ETL/generation scripts (moved from automation jobs)
  └── metadata/
  ```
- Move current `plebdashboard-ln/data/` contents into lightning-data
- Move `ln-graph-viz/data/` (gall.json, ghigh.json, gfree.json) into lightning-data/data/graph/

### 0.3 — Update data paths in plebdashboard-ln
- Decision: **Option A** — Fetch data from lightning-data GitHub Pages (cross-repo)
  - lightning-data gets its own GitHub Pages deployment
  - plebdashboard-ln fetches from `https://bitcoindatalabs.github.io/lightning-data/data/...`
- Decision: **Option B** — Keep data in plebdashboard-ln/data/ and use lightning-data as the source-of-truth that syncs into plebdashboard-ln via GitHub Actions
  - Simpler for now (no CORS issues)
  - Automation pushes data to both repos

> **Recommendation:** Start with Option B (sync via automation) — simpler, no CORS, and the current automation already writes to plebdashboard-ln/data/. Migrate to Option A later when you want to decouple.

### 0.4 — Update app-config.js for new domain and nav
```javascript
BitcoinLabsApp.init({
    isApp: true,
    appName: "plebdashboard-ln",
    appHomeUrl: "https://lightning.bitcoindatalabs.org/",
    navLinks: [
        { name: 'Home', url: 'index.html' },
        { name: 'Node Rankings', url: 'prank.html' },
        { name: 'Node Explorer', url: 'node-explorer.html' },
        { name: 'Channel Explorer', url: 'channel-explorer.html' },
        { name: 'Comparison', url: 'node-comparison.html' },
        { name: 'Graph Viz', url: 'graph.html' }
    ]
});
```

---

## Phase 1: Graph Viz Integration (Day 2-3)
**Goal:** Bring the graph viz into plebdashboard-ln as `graph.html`.

### 1.1 — Create graph.html
- Copy `ln-graph-viz/index.html` → `plebdashboard-ln/graph.html`
- Adapt to use plebdashboard-ln's shared header/footer pattern (app-config.js + BDL components)
- Update data paths: `data/gfree.json` → `data/graph/gfree.json` (or wherever the graph data lives)

### 1.2 — Copy graph viz assets
- Copy `ln-graph-viz/visualization.js` → `plebdashboard-ln/scripts/graph-viz.js`
- Copy `ln-graph-viz/styles.css` → `plebdashboard-ln/styles/graph-viz.css`
- Copy graph data files into `plebdashboard-ln/data/graph/` (or configure to fetch from lightning-data)

### 1.3 — Cross-link integration
- Graph Viz sidebar node click → links to `profile.html?node={pubkey}`
- Homepage "Lightning Graph Viz" feature link → now points to `graph.html` (internal) instead of external ln-graph-viz URL
- Profile page → add "View in Graph" button that opens `graph.html?highlight={pubkey}`

### 1.4 — Keep ln-graph-viz alive
- No changes to ln-graph-viz repo
- Existing shared URLs (`bitcoindatalabs.github.io/ln-graph-viz/`) continue to work
- Optionally add a banner: "Now part of lightning.bitcoindatalabs.org"

---

## Phase 2: Homepage Network Pulse (Day 3-4)
**Goal:** Homepage shows "what's happening on Lightning right now."

### 2.1 — Add network KPI cards above search
- Fetch `weekly_snapshots/latest.json` on page load
- Display 4 metric cards:
  - Active Nodes: `10,063` (+74 this week)
  - Active Channels: `42,900` (+215)
  - Network Capacity: `4,888 BTC` (+24.8 BTC)
  - Median Channel: `2.1M sats`
- Use delta indicators with green/red arrows

### 2.2 — Enrich featured node cards
- Already joined with nodeData in homepage.js — render rank, capacity, channel count
- Add node type badge

### 2.3 — Fix dead code
- Either add `<div id="trendingNodes">` to index.html or remove `loadTrendingNodes()` from homepage.js

### 2.4 — Update homepage H1 copy
- From: "Find Lightning Network Nodes"
- To: "Lightning Network Intelligence"
- Update subtitle to emphasize differentiation

---

## Phase 3: Quick Wins from Review (Day 4-6)
**Goal:** Ship the easy-but-high-impact improvements from the review.

### 3.1 — Enable Node Explorer Quick Filters
- Wire up 5 preset buttons:
  - Top Routing Nodes → `pleb_rank_max: 100`
  - Emerging Nodes → `birth_tx: recent, total_channels_min: 5`
  - High Capacity → `total_capacity_min: 100000000`
  - Well Connected → `total_channels_min: 50`
  - Low Fees → `avg_fee_rate_max: 100`
- Remove `disabled` attributes and "(Coming soon)" text

### 3.2 — Add node type badges to PRank table
- Color-coded: Exchange (orange), LSP (green), Routing (blue), Wallet (purple), Pleb (gray)
- Use ln_node_types.json for entity/role data

### 3.3 — Update page copy across all pages
- PRank: "PRank — Lightning Node Power Rankings"
- Node Explorer: "Find your next channel partner..."
- Comparison: "Node Comparison — Head-to-Head Performance Analysis"

### 3.4 — Profile page contextual nav
- Add "Compare this node" button → pre-fills node-comparison.html
- Add "View all channels" → links to channel-explorer.html filtered by this node

### 3.5 — Shareable comparison URLs
- Update URL params on comparison: `?nodes=ACINQ,Boltz,LNBiG`
- Parse URL params on page load to pre-fill

---

## Phase 4: Medium Features (Week 2)
**Goal:** Deeper storytelling and richer data presentation.

### 4.1 — Percentile bars on Rankings
- Replace raw rank numbers with visual indicators
- `PRank #47  Top 0.5%`

### 4.2 — Node Health Score on Profile
- Composite 0-100 score:
  - PRank percentile (40%)
  - Channel diversity (20%)
  - Fee competitiveness (20%)
  - Activity recency (20%)
- Display as a prominent gauge/ring at top of profile

### 4.3 — Channel Explorer aggregate stats
- When searching for a node's channels, show summary:
  - Total channels, total capacity, median capacity, avg fee rate
- Add sort dropdown to UI

### 4.4 — Report archive browser
- Add date selector to reports.html (dropdown of available weekly_YYYYMMDD.json files)
- Load selected snapshot dynamically

### 4.5 — Network Dashboard page (dashboard.html)
- Network capacity trend (line chart from weekly snapshots)
- Channel open/close velocity (bar chart)
- Tor vs Clearnet distribution (donut)
- Node type distribution (stacked bar)
- Top 10 weekly movers (table)

---

## Phase 5: Big Moves (Week 3-4)
**Goal:** Strategic features that differentiate from all competitors.

### 5.1 — "Find a Channel Partner" wizard
- Guided flow: What do you want? → Your capacity? → Fee range?
- Returns recommended nodes ranked by complementary centrality

### 5.2 — Node reputation timeline
- Track rank/capacity/channels across weekly snapshots
- Display sparkline on profile page
- "This node has been Top 50 for 12 consecutive weeks"

### 5.3 — Social sharing for Reports
- "Download as image" button per slide
- html2canvas or dom-to-image rendering
- Pre-formatted for Twitter/LinkedIn aspect ratios (already 1200x675)

### 5.4 — Embeddable PRank badge
- SVG badge endpoint: `lightning.bitcoindatalabs.org/badge/{pubkey}.svg`
- Node operators embed on their sites → growth flywheel

### 5.5 — PRank Methodology page
- Dedicated page explaining the algorithm, weights, and philosophy
- Builds trust and SEO authority

---

## Data Pipeline Architecture (lightning-data)

```

lightning-data/scripts/
    | outputs
lightning-data/data/
    ├── node_rank.parquet      ← Weekly refresh
    ├── node_profile.parquet   ← Weekly refresh
    ├── channel_profile.parquet ← Weekly refresh
    ├── node_feature.parquet   ← Weekly refresh
    ├── ln_node_types.json     ← Manual curation + auto-discovery
    ├── featured_node.json     ← Curated (automation + manual)
    ├── graph/                 ← Weekly refresh
    │   ├── gall.json
    │   ├── ghigh.json
    │   └── gfree.json
    └── weekly_snapshots/      ← Weekly append
        ├── latest.json        ← Overwritten weekly
        └── weekly_YYYYMMDD.json ← Appended weekly
    | synced via automation (GitHub Actions or batch job)
plebdashboard-ln/data/
    └── (mirror of lightning-data/data/)
```

### Automation sync pattern (same as orange-dev-data → orange-dev-tracker)
- Batch job or GitHub Action copies parquet/JSON from lightning-data to plebdashboard-ln/data/
- Runs on schedule (weekly or daily)
- Existing automation in `python/automation/jobs/lightning/` already writes to plebdashboard-ln/data/

---

## Execution Checklist

### Phase 0 — Foundation
- [x] Create CNAME file: `lightning.bitcoindatalabs.org`
- [x] Configure DNS CNAME record (Cloudflare CNAME added)
- [ ] Enable HTTPS on GitHub Pages (Settings -> Pages once DNS propagates)
- [x] Create `bitcoindatalabs/lightning-data` repo (Local structure, datasets, scripts, metadata initialized)
- [x] Move data files from plebdashboard-ln/data/ into lightning-data (Copied datasets, Option B preserves plebdashboard-ln/data)
- [x] Set up data sync (automation writes to both repos, sync script `sync_to_dashboard.py` created)
- [x] Update app-config.js (domain URL, add Graph Viz to nav)

### Phase 1 — Graph Viz Integration
- [x] Copy graph viz files into plebdashboard-ln (graph.html, scripts/graph-viz.js, styles/graph-viz.css)
- [x] Adapt to shared BDL header/footer pattern (app-components.js + app-config.js)
- [x] Update data paths for graph datasets (data/graph/gfree.json, ghigh.json, gall.json)
- [x] Cross-link: Graph node click → profile, profile → graph (?highlight= & ?node= supported)
- [x] Update homepage feature link to internal graph.html
- [x] Verify ln-graph-viz still works independently (with announcement badge to lightning.bitcoindatalabs.org)

### Phase 2 — Homepage Network Pulse
- [ ] Fetch latest.json and display network KPI cards
- [ ] Enrich featured node cards with rank/capacity/channels
- [ ] Fix dead trending code
- [ ] Update H1 copy and subtitle

### Phase 3 — Quick Wins
- [ ] Enable 5 Node Explorer quick filter presets
- [ ] Add node type badges to PRank table
- [ ] Update page copy across all pages
- [ ] Add contextual nav to Profile (Compare, View Channels)
- [ ] Implement shareable comparison URLs

### Phase 4 — Medium Features
- [ ] Percentile bars on Rankings
- [ ] Node Health Score on Profile
- [ ] Channel Explorer aggregate stats and sorting
- [ ] Report archive browser
- [ ] Network Dashboard page

### Phase 5 — Big Moves
- [ ] Channel Partner wizard
- [ ] Node reputation timeline
- [ ] Social sharing for Reports
- [ ] Embeddable PRank badge
- [ ] PRank Methodology page

---

> **Note:** Each phase can be executed in a separate thread/conversation.
> Reference this plan as `EXECUTION_PLAN.md` in the plebdashboard-ln repo root.
