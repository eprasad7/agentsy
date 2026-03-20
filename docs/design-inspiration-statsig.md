# Agentsy UI: Design Inspiration from Statsig

> Statsig is the closest UI analog for what Agentsy needs. They solved the UX for experimentation, rollouts, and metrics in the feature-flag world. Agentsy needs the same patterns for agents, evals, and prompt deployments.

---

## Concept Mapping: Statsig → Agentsy

| Statsig Concept | Agentsy Equivalent | Notes |
|----------------|-------------------|-------|
| Feature Gates | **Agent Configurations** | Enable/disable agents, A/B test agent versions |
| Experiments | **Eval Experiments** | Compare prompt versions, model routing, agent architectures |
| Metrics Catalog | **Eval Metrics Catalog** | Task completion rate, cost/task, latency, hallucination rate, tool accuracy |
| Events | **Agent Events** | Tool calls, LLM calls, user feedback, errors, escalations |
| Rollout Updates | **Prompt/Agent Deployments** | Canary rollout of prompt changes with auto-rollback |
| Core Metrics (DAU, purchases) | **Core Agent Metrics** | Daily active agents, successful runs, eval scores, cost |
| Daily Checks (sparklines) | **Daily Health Checks** | Per-agent pass rate trend, cost trend, latency trend |
| Recently Seen Users | **Recent Agent Runs** | Last N runs with status, cost, duration, user |
| A/B/n tags | **Experiment Type Tags** | Prompt A/B, model comparison, tool config test |
| SPRT (sequential testing) | **Sequential Eval** | Early-stop eval experiments when significance reached |
| Health Check filter | **Eval Health Check** | Flag agents with degrading scores |
| Target Applications | **Target Environments** | staging, production, per-tenant |

---

## UI Patterns to Adopt

### 1. Dashboard Home (Screenshot 1)

**What Statsig does well:**
- **Three-panel layout**: Recently Visited (personal context) | Rollout Updates (team activity) | Recently Seen Users (live system pulse)
- **Core Metrics section** at the bottom with sparkline charts, percentage deltas, and time range selector
- **Clean, minimal chrome** — no decorative elements, high information density
- **"+ Create" button** prominently placed — action-first design

**Agentsy adaptation:**

```
+---------------------------+---------------------------+---------------------------+
| YOUR AGENTS               | DEPLOYMENT ACTIVITY       | RECENT RUNS               |
|                           |                           |                           |
| [agent-1] Last edited 2h | v2.3 of support-agent     | run_abc: SUCCESS  $0.02   |
| [agent-2] Last edited 1d |   deployed to prod 1h ago | run_def: SUCCESS  $0.05   |
| [agent-3] Last edited 3d |   canary: 10% traffic     | run_ghi: FAILED   $0.01   |
|                           |                           | run_jkl: SUCCESS  $0.03   |
| No recently visited items | v1.8 of sales-agent       |                           |
| (show after first visit)  |   eval score: 0.92 → 0.94| [View all runs →]         |
+---------------------------+---------------------------+---------------------------+

+------------------------------------------------------------------------+
| CORE METRICS                              Last 30 days ▾  ↻ Refresh    |
+------------------------------------------------------------------------+
|                                                                        |
| Successful Runs       | Avg Cost/Run         | Avg Latency            |
| 12.4K yesterday       | $0.034 yesterday     | 2.3s yesterday         |
| ▲ 3.2% from 7d ago   | ▼ 12% from 7d ago   | ▲ 0.8% from 7d ago    |
| [sparkline chart]     | [sparkline chart]    | [sparkline chart]      |
|                                                                        |
| Eval Score (avg)      | Error Rate           | Human Feedback Score   |
| 0.91 yesterday        | 1.2% yesterday       | 4.3/5 yesterday        |
| ▲ 0.5% from 7d ago   | ▼ 0.3% from 7d ago  | ▲ 2.1% from 7d ago    |
| [sparkline chart]     | [sparkline chart]    | [sparkline chart]      |
+------------------------------------------------------------------------+
```

### 2. Experiments Table (Screenshot 3)

**What Statsig does well:**
- **Dense table with smart columns**: Name, Status, Duration, Target, Tags, Daily Checks (sparklines!)
- **Status badges** with color coding (In Progress = green, Testing = gray, Decision Made = green check)
- **Progress bars** under status showing rollout percentage
- **Sparkline column** ("Daily Checks") — tiny charts showing health trend at a glance
- **Tag system** for filtering (Core, A/B/n, SPRT, backend, AI, layer, bayesian)
- **Filter bar**: Health Check, Creator, Add Filter
- **Rows per page** pagination

**Agentsy "Eval Experiments" table:**

```
+------------------------------------------------------------------------+
| Eval Experiments                                                        |
| [+ Create]  [Q Search]  [Health Check] [Creator] [+ Add Filter]   [⚙] |
+------------------------------------------------------------------------+
| Name                    | Status      |📊| Duration | Agent    | Tags        | Trend    |
|-------------------------|-------------|--|----------|----------|-------------|----------|
| Prompt v2.3 vs v2.2     | ✅ Running  |⚠ | 3 days   | support  | prompt, A/B | ▁▂▃▅▇▇▇ |
| Sonnet vs Haiku routing  | ✅ Running  |  | 7 days   | triage   | model, cost | ▁▂▃▄▅▅▅ |
| RAG chunk size 512→1024 | ✅ Running  |⚠ | 5 days   | research | retrieval   | ▃▃▃▄▅▆▅ |
| Tool description rewrite | ⏸ Paused   |  | 12 days  | sales    | tools       | ▅▅▄▃▂▂▁ |
| Guardrail v2 rollout    | ✅ Decision |  | 14 days  | all      | safety      | ▃▄▅▆▇▇▇ |
| Temperature 0.3 vs 0.7  | ○ Not Start |  | -        | creative | params      | ······· |
+------------------------------------------------------------------------+
```

### 3. Login Page (Screenshot 2)

**What Statsig does well:**
- Ultra-minimal — logo, email, password, sign in, Google OAuth, sign up link
- "Optional for SSO" hint on password field — smart for enterprise
- No unnecessary decoration
- Clean card on a light background

**Agentsy login:**
- Same pattern. Logo + email + password + SSO/Google + sign up
- Add: "Sign in with GitHub" (developer audience)
- API key login option for CLI: `agentsy login --api-key sk-...`

---

## Key Design Principles Extracted

### 1. Information Density Over Decoration
Statsig packs a lot of data into every view without feeling cluttered. They achieve this through:
- **Small but readable type** (14px body, 12px secondary)
- **Tight vertical spacing** (32-40px row height in tables)
- **Sparklines instead of full charts** for trend data in tables
- **Color-coded badges** instead of text descriptions for status
- **Progressive disclosure** — summary on the table, detail on click

### 2. Metrics Are First-Class Citizens
The dashboard leads with metrics, not configuration. Users see "how are things doing?" before "what things exist?" This is the right mental model for Agentsy — agents are running in production, the first question is always "are they healthy?"

### 3. Experiment-Driven Workflow
Statsig's core UX loop:
```
Create experiment → Configure variants → Start rollout → Monitor metrics → Make decision
```

Agentsy's equivalent:
```
Create eval experiment → Configure variants (prompt A vs B) → Run against dataset/traffic
→ Monitor scores → Ship winning variant (or rollback)
```

### 4. Status + Trend at a Glance
The sparkline "Daily Checks" column is brilliant — you can scan 15 experiments and immediately see which ones are trending up, flat, or degrading. Agentsy needs this for:
- Per-agent eval score trends
- Per-agent cost trends
- Per-agent error rate trends

### 5. Tags for Cross-Cutting Concerns
Statsig uses tags (Core, A/B/n, SPRT, backend, AI) to let users slice experiments by type. Agentsy should use tags for:
- Agent type (support, sales, research, code)
- Experiment type (prompt, model, tool, retrieval)
- Priority (critical, standard)
- Environment (staging, production)

---

## Agentsy Dashboard Views (Inspired by Statsig)

### View 1: Home Dashboard
```
Top bar: [Agentsy logo] [Project selector ▾] [Search ⌘K] [User avatar]

Three-column hero:
  Left:    Your Agents (recently edited, quick-launch)
  Center:  Deployment Activity (recent deploys, canary status)
  Right:   Recent Runs (live feed with status, cost, duration)

Core Metrics grid (2x3):
  [Successful Runs] [Avg Cost/Run] [Avg Latency]
  [Eval Score]      [Error Rate]   [User Feedback]
  Each: value, delta, sparkline, time range selector
```

### View 2: Agents List
```
Table columns:
  Name | Status (active/paused/draft) | Model | Last Deploy | Runs (24h) |
  Avg Score | Avg Cost | Error Rate | Tags | Trend (sparkline)

Row click → Agent detail page (config, traces, metrics, eval history)
```

### View 3: Eval Experiments
```
Table columns (Statsig-inspired):
  Name | Status | Health | Duration | Agent | Variants | Tags | Daily Score Trend

Status: Running (green), Paused (gray), Decision Made (blue), Not Started (outline)
Health: ⚠ warning if score degrading, ✅ if healthy
Variants: "A/B" badge, "A/B/C" badge, etc.
Daily Score Trend: sparkline showing eval score over experiment duration
```

### View 4: Agent Detail
```
Tabs: Overview | Runs | Eval History | Config | Traces | Metrics

Overview:
  - Current version info (prompt, model, tools)
  - Health summary (score, cost, error rate — each with sparkline)
  - Recent deployments timeline
  - Active experiments on this agent

Runs:
  - Table of recent runs with: timestamp, input preview, status, cost, duration, score
  - Click → full trace view (Statsig doesn't have this — our differentiator)

Eval History:
  - Chart: eval score over time (per dataset)
  - Table: eval runs with version, dataset, score, regressions flagged
```

### View 5: Trace Viewer (No Statsig Equivalent — Our Innovation)
```
This is where Agentsy goes beyond Statsig. A trace viewer for agent runs:

Timeline view:
  [User input] → [LLM call 1: 800ms, $0.005] → [Tool: search, 200ms]
  → [LLM call 2: 1.2s, $0.012] → [Tool: API, 500ms]
  → [LLM call 3: 1.5s, $0.015] → [Response]

Side panel:
  - Full message content at each step
  - Token counts and costs
  - Tool inputs/outputs
  - Model used
  - Eval scores (if scored)
  - User feedback (if received)

Cost bar:
  Total: $0.032 | Tokens: 4,925 | Duration: 4.2s
  [Breakdown: 83% LLM, 17% tools]
  [Hypothetical: $0.004 if routed to Haiku]
```

### View 6: Metrics Catalog (Statsig-Inspired)
```
Searchable catalog of all tracked metrics:

| Metric Name          | Type      | Description                        | Agents Using |
|---------------------|-----------|------------------------------------|-----------  |
| task_completion     | Binary    | Did the agent complete the task?   | 12          |
| cost_per_run        | Currency  | Total LLM + tool cost per run      | All         |
| hallucination_rate  | Percentage| Claims not grounded in context     | 8           |
| tool_accuracy       | Score 0-1 | Correct tool selection rate        | 15          |
| user_satisfaction   | Rating 1-5| User feedback score                | 10          |
| latency_p50         | Duration  | Median response time               | All         |

Click → metric detail with time series, per-agent breakdown, anomaly alerts
```

---

## Color System

Statsig uses a restrained color palette:
- **Blue** for primary actions and selected states
- **Green** for success/healthy/active
- **Yellow/Orange** for warnings
- **Red** for errors (sparingly)
- **Gray scale** for secondary text, borders, backgrounds
- **White cards** on a very light gray (#F8F9FA) background

Agentsy should follow the same restraint. No gratuitous color. Color = signal.

Proposed Agentsy semantic tokens:
```
--color-success:    oklch(0.72 0.15 155)   // green — healthy, passed, active
--color-warning:    oklch(0.75 0.15 65)    // amber — degrading, caution
--color-error:      oklch(0.65 0.20 25)    // red — failed, critical
--color-info:       oklch(0.65 0.15 250)   // blue — informational, links, primary
--color-neutral:    oklch(0.55 0.01 260)   // gray — secondary text, borders

--color-bg-page:    oklch(0.97 0.005 260)  // very light gray background
--color-bg-card:    oklch(1.0 0 0)         // white card surfaces
--color-bg-hover:   oklch(0.96 0.005 260)  // subtle hover state

--color-text-primary:   oklch(0.20 0.01 260)  // near-black for headings
--color-text-secondary: oklch(0.55 0.01 260)  // gray for labels, timestamps
--color-text-tertiary:  oklch(0.70 0.01 260)  // lighter gray for hints

--color-border:     oklch(0.90 0.005 260)  // light gray borders
```

---

## Typography

Statsig uses Inter (or a similar geometric sans-serif). Clean, highly legible, professional.

```
--font-family:      'Inter', -apple-system, BlinkMacSystemFont, sans-serif
--font-size-xs:     12px   // table secondary text, timestamps
--font-size-sm:     13px   // table body, tags
--font-size-base:   14px   // body text, form labels
--font-size-md:     16px   // section headers, card titles
--font-size-lg:     20px   // page titles
--font-size-xl:     24px   // dashboard greeting
--font-size-2xl:    32px   // hero numbers (metric values)

--font-weight-normal:   400
--font-weight-medium:   500  // labels, table headers
--font-weight-semibold: 600  // metric values, emphasis
--font-weight-bold:     700  // page titles

--line-height-tight:    1.2  // headings
--line-height-normal:   1.5  // body text (WCAG)
--line-height-relaxed:  1.6  // paragraphs
```

---

## Spacing (8pt Grid)

```
--space-1:   4px   // tight internal padding
--space-2:   8px   // icon margins, small gaps
--space-3:  12px   // compact padding
--space-4:  16px   // standard padding, card internal
--space-5:  20px   // section gaps
--space-6:  24px   // card padding, column gaps
--space-8:  32px   // section separators
--space-10: 40px   // page margins
--space-12: 48px   // major section breaks
```

---

## Component Inventory (from Statsig screenshots)

Components we need to build:

| Component | Statsig Example | Agentsy Usage |
|-----------|----------------|---------------|
| **MetricCard** | DAU card with value, delta, sparkline | Agent health metrics |
| **DataTable** | Experiments table with sort, filter, pagination | Agents, runs, evals |
| **StatusBadge** | "In Progress", "Decision Made" pills | Agent status, run status |
| **SparklineCell** | Daily Checks column | Score/cost/error trends |
| **ProgressBar** | Under status badges | Canary rollout progress |
| **TagPill** | "Core", "A/B/n", "SPRT" | Agent/experiment tags |
| **SearchBar** | Top search with ⌘K | Global search |
| **FilterBar** | Health Check, Creator, Add Filter | Table filtering |
| **EmptyState** | "No Recently Visited Items" illustration | First-use states |
| **SideNav** | Left icon rail (search, analytics, etc.) | Main navigation |
| **TopBar** | Project selector, user menu | Workspace switching |
| **StatNumber** | "469 yesterday", "3.47K past week" | Dashboard hero numbers |

---

## Mobile / Responsive Notes

Statsig is desktop-first (dashboard tool). Agentsy should be too, but ensure:
- Tables scroll horizontally on narrow screens (not reflow)
- Metric cards stack vertically on mobile
- Trace viewer works on tablet (side panel becomes bottom sheet)
- Login page is fully responsive

---

## What Statsig Does NOT Have (Our Opportunity)

1. **Trace viewer** — Statsig has no concept of a multi-step execution trace. Our trace viewer (timeline + message content + cost breakdown) is a major UX innovation.

2. **Eval comparison view** — Side-by-side diff of two agent outputs for the same input. "Here's what v2.2 said vs v2.3." Statsig compares metrics; we compare actual outputs.

3. **Cost attribution** — Statsig doesn't show per-experiment infrastructure cost. Our per-run cost breakdown with "hypothetical savings" is unique.

4. **Live agent playground** — Interactive testing pane where you can chat with your agent, see the trace in real-time, and score the output immediately. Think "Postman for agents."

5. **Prompt diff viewer** — Git-style diff for prompt changes with annotations showing which eval cases were affected.
