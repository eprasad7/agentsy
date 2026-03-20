# Phase 3.5: Design Tokens & Retroactive UI — Implementation Brief

**Goal**: Establish the design system, wire up the dashboard to real APIs, and backfill the UI pages that should have shipped with Phases 1–3.
**Duration**: 3–4 days
**Dependencies**: Phase 3 complete (streaming, client SDK, sessions)
**Unlocks**: All subsequent phases can include UI slices using the design system

---

## What Gets Built

By the end of Phase 3.5:
1. Tailwind config wired to the existing OKLCH design tokens (light + dark mode)
2. Sidebar navigation with theme toggle
3. Internal API client (`apps/web/src/lib/api.ts`) for all dashboard data fetching
4. Settings pages connected to real APIs (general, environments, api-keys, secrets, members)
5. Agent pages (list, create, overview, config editor) connected to real APIs
6. Run pages (list with filters, detail with trace viewer) connected to real APIs
7. Every page uses design tokens — zero hardcoded colors or spacing

---

## What Already Exists

The design system foundation is **already built** from earlier work:

**`packages/ui/src/tokens/`** (complete):
- `colors.ts` — OKLCH semantic palette (primary, neutral, success, warning, error) with light + dark mode
- `spacing.ts` — 8pt grid, border radius, shadows, z-index, transitions
- `typography.ts` — Inter + JetBrains Mono, type styles (hero, h1-h3, body, caption, label)

**`packages/ui/src/primitives/`** (complete):
- Box, Stack, Text, Button (4 variants, 3 sizes), Badge, Card, Input

**`packages/ui/src/components/`** (complete):
- MetricCard, DataTable, StatusBadge, SparklineCell, TagPill, EmptyState

**`apps/web/src/app/`** (stubs, not connected to APIs):
- layout.tsx, page.tsx, login, signup, settings (api-keys, secrets, members)

---

## Steps

### 3.5.1 — Tailwind Config & Global Styles

Wire the existing design tokens into Tailwind so all pages use `text-primary-600`, `bg-surface-card`, `p-4`, etc.

```
apps/web/
  tailwind.config.ts    → Import tokens from @agentsy/ui, extend Tailwind theme
  postcss.config.js     → Tailwind + autoprefixer
  src/app/globals.css   → Inject CSS custom properties from tokens (light + dark)
```

**Tailwind config pattern**:
```typescript
import { colors, spacing, typography } from "@agentsy/ui/tokens";

export default {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { 50: "var(--color-primary-50)", /* ... */ 950: "var(--color-primary-950)" },
        surface: { page: "var(--color-bg-page)", card: "var(--color-bg-card)", hover: "var(--color-bg-hover)" },
        // ... neutral, success, warning, error, text, border tokens
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "monospace"] },
    },
  },
};
```

**globals.css**: Generate CSS custom properties using `getColorCSSProperties("light")` and `getColorCSSProperties("dark")` from the existing token system. Apply under `:root` and `[data-theme="dark"]`.

**Done when**: `bg-surface-card text-primary-600 p-4 rounded-lg` renders correctly in both light and dark mode.

---

### 3.5.2 — Theme Provider & Layout Refactor

```
apps/web/src/
  lib/
    theme-provider.tsx  → React context for dark mode (reads/writes data-theme on <html>)
  app/
    layout.tsx          → Refactor: wrap with ThemeProvider, add <Sidebar/> + <main> grid
```

**Layout structure**:
```tsx
<html data-theme={theme}>
  <body>
    <ThemeProvider>
      <div className="flex h-screen">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-6 bg-surface-page">
          {children}
        </main>
      </div>
    </ThemeProvider>
  </body>
</html>
```

Theme persists in `localStorage`. No hydration mismatch (use `suppressHydrationWarning` or `next-themes`).

**Done when**: Dark mode toggles without reload. No console warnings.

---

### 3.5.3 — Sidebar Navigation

```
apps/web/src/components/
  Sidebar.tsx           → Persistent left nav with sections and links
  ThemeToggle.tsx       → Dark/light mode toggle button
```

**Navigation structure** (per PRD section 8):
```
[Agentsy Logo]

MAIN
  Dashboard       → /
  Agents          → /agents
  Runs            → /runs
  Evals           → /evals

SETTINGS
  Settings        → /settings
  Usage           → /usage

[Theme Toggle]
[User Avatar / Logout]
```

Use `lucide-react` for icons. Active link highlighted with `bg-surface-hover text-primary-600`. Mobile: hamburger menu at < 768px.

**Done when**: All nav links render, active state works, mobile collapse works, theme toggle works.

---

### 3.5.4 — Internal API Client

```
apps/web/src/lib/
  api.ts            → Typed fetch wrapper with auth header, error handling
```

```typescript
class ApiClient {
  private baseUrl: string;
  private getToken: () => string | null;

  async get<T>(path: string, params?: Record<string, string>): Promise<T>;
  async post<T>(path: string, body?: unknown): Promise<T>;
  async patch<T>(path: string, body: unknown): Promise<T>;
  async delete(path: string): Promise<void>;

  // Resource namespaces
  agents: { list, get, create, update, delete, versions, createVersion };
  runs: { list, get, steps, cancel, approve, deny };
  sessions: { list, create, messages, delete };
  organization: { get, update, members, invite, removeMember, updateRole };
  apiKeys: { list, create, revoke };
  secrets: { list, create, delete };
  environments: { list, update };
}
```

Auth: reads token from cookie or localStorage (set by Better Auth session). Falls back to API key if configured.

Error handling: parse RFC 7807 responses, throw typed errors.

**Done when**: `apiClient.agents.list()` returns typed `Agent[]` from the real API.

---

### 3.5.5 — Settings Pages (Phase 1 Backfill)

Refactor existing stubs + add missing pages. All connected to real APIs.

```
apps/web/src/app/settings/
  page.tsx                  → General: org name, billing email (GET/PATCH /v1/organization)
  environments/page.tsx     → NEW: Environment tool policies (GET/PATCH /v1/environments)
  api-keys/page.tsx         → REFACTOR: Full CRUD, "show once" modal (GET/POST/DELETE /v1/api-keys)
  secrets/page.tsx          → REFACTOR: Create form, list (names only), delete (GET/POST/DELETE /v1/secrets)
  members/page.tsx          → REFACTOR: Invite modal, role dropdown, remove (GET/POST/PATCH/DELETE /v1/organization/members)
```

**Key UX patterns**:
- API key creation: modal shows full key with copy button + warning "You won't see this again"
- Secrets: value field is write-only, list shows `••••••••` placeholder
- Environments: collapsible cards for dev/staging/prod, each with tool allow/deny lists
- Members: invite sends email, pending invites shown with "Resend" option

**Done when**: All settings pages load data from API, forms submit correctly, errors display inline.

---

### 3.5.6 — Agent Pages (Phase 2 Backfill)

```
apps/web/src/app/agents/
  page.tsx                  → Agent list table (GET /v1/agents)
  create/page.tsx           → Create agent form (POST /v1/agents)
  [id]/
    page.tsx                → Agent overview with tabs (GET /v1/agents/:id)
    layout.tsx              → Agent detail layout with tab navigation
    config/page.tsx         → Config editor: prompt, model, guardrails (GET/POST versions)
```

**Agent list** — DataTable with columns: Name, Slug, Version, Created. Click row → `/agents/[id]`.

**Create agent** — Form: name, slug (auto-generated), description. On submit → redirect to `/agents/[id]`.

**Agent overview** — Shows name, description, current version, created/updated. Tab navigation bar:
- Overview (this page)
- Config → `/agents/[id]/config`
- Runs → `/agents/[id]/runs` (placeholder, links to `/runs?agent_id=[id]`)
- (Evals, KB, Tools, Deployments tabs render as "Coming in Phase X" placeholders)

**Config editor** — Load latest version. Display:
- System prompt (textarea, monospace font)
- Model: capability class dropdown + provider dropdown
- Guardrails: max iterations, max tokens, max cost, timeout (number inputs)
- "Save New Version" button → `POST /v1/agents/:id/versions`

**Done when**: Create agent from browser → see in list → click → view config → edit prompt → save new version → version number increments.

---

### 3.5.7 — Run Pages & Trace Viewer (Phase 3 Backfill)

```
apps/web/src/app/runs/
  page.tsx                  → Run list with filters (GET /v1/runs)
  [id]/page.tsx             → Run detail + trace viewer (GET /v1/runs/:id + GET /v1/runs/:id/steps)

apps/web/src/components/
  trace-viewer.tsx          → Trace timeline component
  trace-step.tsx            → Individual step renderer (LLM call, tool call, approval, error)
```

**Run list** — DataTable with columns: Status (badge), Agent, Input (truncated), Cost, Duration, Created. Filters: status dropdown, agent dropdown, date range. Cursor pagination.

**Run detail** — Two sections:
- **Top**: Run metadata (status badge, agent name, version, model, cost, duration, timestamps)
- **Bottom**: Trace viewer

**Trace viewer** — Ordered list of steps from `GET /v1/runs/:id/steps`:
```
┌─ Step 1: LLM Call (claude-sonnet-4)          1.2s  $0.008
│  Thinking: "I need to look up the order..."
│  Tokens: 340 in / 89 out
│
├─ Step 2: Tool Call: get_order                0.1s  $0.000
│  Input: { orderId: "ORD-12345" }
│  Output: { status: "shipped", total: 89.99 }
│
├─ Step 3: LLM Call (claude-sonnet-4)          0.8s  $0.005
│  Response: "Your order ORD-12345 has been shipped..."
│  Tokens: 450 in / 120 out
│
└─ Total: 3 steps | $0.013 | 2.1s
```

**Step types** with distinct rendering:
- `llm_call` → Thinking bubble + token/cost summary
- `tool_call` → Tool name badge + collapsible input/output JSON
- `approval_request` → Warning badge + approve/deny status
- `guardrail` → Shield badge + pass/fail
- Error steps → Red badge + error message

Each step is collapsible (collapsed by default, show summary line).

**Done when**: Run list loads with filters. Click run → trace viewer shows all steps with correct data. Tool call JSON is collapsible.

---

### 3.5.8 — Package Dependencies

Update `apps/web/package.json`:
```
@agentsy/ui: workspace:*
@agentsy/shared: workspace:*
lucide-react
@tanstack/react-query
next-themes
tailwindcss + postcss + autoprefixer (devDeps)
```

Add `.env.example`:
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

**Done when**: `pnpm install && pnpm build` succeeds for `apps/web`.

---

## Tests

| Type | What |
|------|------|
| Visual | All pages render in light + dark mode without hardcoded colors |
| Visual | WCAG contrast: 4.5:1 body text, 3:1 UI elements (both themes) |
| Visual | Responsive: mobile (375px), tablet (768px), desktop (1920px) |
| Functional | Settings: edit org name → save → reload → name persisted |
| Functional | API keys: create → copy → use in curl → works |
| Functional | Agents: create → list → edit config → save new version |
| Functional | Runs: list with filters → click run → trace renders all steps |
| Functional | Theme toggle persists across page navigation |
| Integration | All API calls use `ApiClient`, errors display inline |

---

## Acceptance Criteria

| Check | Evidence |
|-------|----------|
| Tokens wired | Every color/spacing/font traces to a CSS custom property |
| Dark mode | Toggle works, no flash, persists in localStorage |
| Sidebar | All nav links render, active state visible, mobile collapse |
| Settings pages | All 5 settings pages load + submit to real APIs |
| Agent CRUD | Create → list → detail → edit config → save version works |
| Run list | Filters (status, agent, date) work, pagination works |
| Trace viewer | Steps render in order, collapsible, correct step types |
| No hardcoded values | Zero hex colors or pixel values in component styles |
| No console errors | Clean console in both themes |
| CI passes | `turbo build && turbo lint && turbo typecheck` |

---

## What NOT To Do in Phase 3.5

- Do not build sparkline charts on agent overview (Phase 8)
- Do not build usage dashboard (Phase 8)
- Do not build eval pages (Phase 4 UI slice)
- Do not build KB upload page (Phase 5 UI slice)
- Do not build connector catalog (Phase 6b UI slice)
- Do not build deployment history (Phase 7 UI slice)
- Do not build alert/notification system (Phase 8)
- Do not add SSE streaming to the dashboard (Phase 8 — for now, run detail shows completed runs only)
