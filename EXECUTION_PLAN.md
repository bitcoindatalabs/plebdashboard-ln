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

## Phase 2: Homepage — The Network Intelligence Command Center
**Goal:** When someone lands on `lightning.bitcoindatalabs.org`, they should know in 3 seconds: "This is where I understand Lightning." A true command center.

### 2.1 — Network Pulse KPI Strip (above search)
- Fetch `data/weekly_snapshots/latest.json` on page load
- Display 4 metric cards in a horizontal strip above the search bar:
  - Active Nodes (`10,049`, `+42 (7d)`)
  - Channels (`42,596`, `+1,045 (7d)`)
  - Capacity (`4,896 BTC`, `+386 BTC (7d)`)
  - Median Chan (`2.1M sats`, typical 7d)
- Use delta indicators with positive/negative tags and arrows

### 2.2 — Dynamic Insight Headline
- Below the KPI strip, above search box: single rotating/dynamic insight sentence:
  - *"ACINQ and Binance deployed the week's largest channel at 5 BTC. Network capacity expanded +386 BTC across 1,045 new channels."*
- Generated dynamically by parsing `top_5_channels[0]` and aggregate delta metrics from `latest.json`

### 2.3 — Rewrite Homepage Copy
- `<title>`: "Lightning Network Intelligence — PlebRank, Centrality, & Weekly Reports"
- `<h1>`: "Lightning Network Intelligence"
- Subtitle: "PlebRank scores, graph centrality metrics, and weekly intelligence for 10,000+ nodes."

### 2.4 — Enrich Featured Node Cards
- Add stat pills on each card:
  - Capacity (e.g. `312 BTC cap`)
  - Channels (e.g. `147 ch`)
  - PlebRank (e.g. `PRank #1`)
- Update badge to show `#rank`

### 2.5 — Fix Dead Trending Code
- Remove dead `loadTrendingNodes()` method and call in `homepage.js`

### 2.6 — Update Social Automation Links
- In `daily_stats.py`:
  - `https://lightning.bitcoindatalabs.org/graph.html`
  - `https://lightning.bitcoindatalabs.org/`
- In `weekly_wrap.py`:
  - `https://lightning.bitcoindatalabs.org/`
- In `node_spotlight.py`:
  - `lightning.bitcoindatalabs.org`

---

## Phase 3: Page-by-Page Storytelling Upgrades
**Goal:** Transform individual explorer and ranking pages into rich, contextual leaderboards and research tools.

### 3.1 — PRank Rankings: From Data Table to Leaderboard
- Aggregate header above table: "Ranking 10,049 active Lightning nodes by PlebRank..."
- Percentile tier badges: Elite (#1-10 gold), Top Tier (#11-50 silver), Core Router (#51-100 blue), Established (#101-500 gray)
- Node type colored tags from `ln_node_types.json` (Exchange, LSP, Routing, Wallet, Pleb)
- Tooltip explanations on centrality column headers (Betweenness, Eigenvector, PageRank)
- Copy changes: H1 "PRank — Lightning Node Power Rankings"

### 3.2 — Node Explorer: Enable Discovery
- Enable 5 Quick Filter presets (URL query links):
  - Top Routing Nodes (`?pleb_rank_max=100`)
  - High Capacity (`?total_capacity_min=100000000`)
  - Well Connected (`?total_channels_min=50`)
  - Low Fees (`?avg_fee_rate_max=100`)
  - Emerging Nodes (`?total_channels_min=5&total_capacity_min=1000000`)
- Update copy: H1 "Find Your Next Channel Partner"

### 3.3 — Channel Explorer: Add Aggregate Context
- Summary strip above results (Total channels, total capacity, median, avg fee rate, Freeway count)

### 3.4 — Node Profile: Contextual Actions & Health Signal
- "Compare this node" button -> `node-comparison.html?nodes={alias}`
- "View in Graph" button -> `graph.html?highlight={pubkey}`
- "View all channels" button -> `channel-explorer.html?node1={pubkey}`
- Rank context on Rankings tab (e.g. "#47 out of 10,049 · Top 0.5%" with visual bar)
- Fix Category Counts display: parse JSON object into colored badges (Freeway, Highway, My Way)

### 3.5 — Node Comparison: Verdict and Shareability
- Auto-generated verdict text comparing leaders on each metric
- Shareable URL query params (`?nodes=ACINQ,Boltz,LNBiG`)
- Add fee metrics to comparison radar chart

---

## Phase 4: Weekly Report + Social Publishing Alignment
**Goal:** Align website reporting with automated social media publishing.

### 4.1 — Activate Weekly Wrap Publishing
- Add `weekly_wrap.py` to scheduled automation runs
- Update report URLs to `lightning.bitcoindatalabs.org`

### 4.2 — Report Archive Browser
- Generate `data/weekly_snapshots/index.json`
- Add date-picker dropdown to `reports.html` to browse and load previous weekly snapshots

### 4.3 — Rethink Weekly Report Slides for Social Impact
- Slide 1: Vital Signs 1-line narrative
- Slide 2: Growth chart with "Peak Day" callout
- Slide 3: Channel Velocity narrative for gross additions
- Slide 4: Top Channels "Why this matters" context
- Slide 5: Topology bridge node context

### 4.4 — Daily Pulse Landing Section on Homepage
- "Yesterday's Pulse" lightweight summary card powered by daily automation

---

## Phase 5: Strategic Features — What Makes You the Best
**Goal:** High-leverage features that establish `lightning.bitcoindatalabs.org` as the premier Lightning intelligence platform.

### 5.1 — Node Health Score (0–100)
- Composite score on Profile header:
  - PlebRank percentile (30%)
  - Channel diversity (20%)
  - Peer diversity (15%)
  - Fee competitiveness (15%)
  - Capacity stability (10%)
  - Network age (10%)
- Prominent gauge ring (Green 70+, Yellow 40-69, Red <40)

### 5.2 — PRank Methodology Page (`methodology.html`)
- Comprehensive explanation of PlebRank, underlying centrality metrics, weights, and update schedule

### 5.3 — Channel Partner Finder
- Guided wizard recommending complementary peering partners

### 5.4 — Social Sharing for Report Slides
- "Download as Image" button on slide cards using html2canvas

### 5.5 — Embeddable PRank Badge
- Static SVG badges for node operators to embed on sites

### 5.6 — Historical Trend Sparklines
- Per-node historical sparklines for PRank, capacity, and channel count over time

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

### Phase 2 — Homepage Command Center
- [x] Add `<div id="networkPulse">` section to `index.html` above search
- [x] Add `loadNetworkPulse()` to `homepage.js` fetching `latest.json`
- [x] Add dynamic insight headline from `top_5_channels[0]`
- [x] Update H1, subtitle, and `<title>` tag
- [x] Enrich featured node cards with rank/capacity/channels stats
- [x] Fix dead `loadTrendingNodes()` code
- [x] Update URLs in `daily_stats.py`, `weekly_wrap.py`, `node_spotlight.py` to `lightning.bitcoindatalabs.org`

### Phase 3 — Page Storytelling
- [x] PRank: Add aggregate header with node count + update date
- [x] PRank: Add percentile tier badges (Elite/Top Tier/Core/Established)
- [x] PRank: Add node type colored tags from `ln_node_types.json`
- [x] PRank: Add centrality tooltip explanations
- [x] PRank: Update H1 and subtitle copy
- [x] Node Explorer: Enable 5 Quick Filter presets (just URL links)
- [x] Node Explorer: Update H1 and subtitle copy
- [x] Channel Explorer: Add aggregate summary strip above results
- [x] Profile: Add "Compare" / "View in Graph" / "View Channels" action buttons
- [x] Profile: Add percentile bars on Rankings tab
- [x] Profile: Fix Category Counts display (parse JSON, render badges)
- [ ] Comparison: Add auto-generated verdict text
- [ ] Comparison: Add shareable URL params
- [ ] Comparison: Add fee metrics to radar chart

### Phase 4 — Reports & Social Alignment
- [ ] Add `weekly_wrap.py` to scheduled tasks
- [ ] Update all social post URLs to `lightning.bitcoindatalabs.org`
- [ ] Create `data/weekly_snapshots/index.json` for archive browsing
- [ ] Add date-picker archive browser to `reports.html`
- [ ] Add dynamic narrative sentences to each slide
- [ ] Consider daily pulse JSON for homepage "Yesterday's Pulse"

### Phase 5 — Strategic Features
- [ ] Design and implement Node Health Score (0-100) on Profile
- [ ] Create `methodology.html` — PRank algorithm explanation
- [ ] Build Channel Partner Finder wizard
- [ ] Add "Download as Image" to report slides
- [ ] Build embeddable PRank badge system
- [ ] Add historical trend sparklines to Profile

---

> **Note:** Reference this plan as `EXECUTION_PLAN.md` in the plebdashboard-ln repo root.
