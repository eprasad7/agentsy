# Agentsy: User Journeys & Navigation

**Author**: Ishwar Prasad
**Date**: March 2026
**Status**: Draft

---

## Overview

This document describes how developers interact with Agentsy end-to-end, from signup through production monitoring. Each journey shows the concrete steps, screens, and CLI commands a user encounters.

Agentsy has two interaction surfaces:
- **CLI** (`agentsy`) — primary interface for developers writing code
- **Dashboard** (`app.agentsy.com`) — visual interface for monitoring, config, and team management

Both surfaces operate on the same underlying resources. An agent created via CLI appears in the dashboard and vice versa.

---

## Journey 1: Signup & Onboarding

### Goal
New developer signs up, creates an org, connects their LLM provider, and is ready to build.

### Steps

**1.1 — Sign up**
```
Browser → app.agentsy.com/signup
  → Email/password or Google/GitHub OAuth (Better Auth)
  → Create organization (name: "Acme Corp", slug: "acme")
  → Redirected to dashboard home
```

**1.2 — Onboarding wizard (first-time only)**

Dashboard shows a 3-step onboarding checklist:

| Step | What | Screen |
|------|------|--------|
| 1. Connect LLM provider | Paste Anthropic or OpenAI API key | Settings → API Keys → LLM Providers |
| 2. Install CLI | `npm install -g @agentsy/cli` | Shown inline |
| 3. Create first agent | `agentsy init` or "Create Agent" button | Links to Journey 2 |

**1.3 — Connect LLM provider**
```
Dashboard: Settings → Secrets → Add Secret
  Name: "Anthropic API Key"
  Key: ANTHROPIC_API_KEY
  Value: sk-ant-api03-...
  Environment: All
  → Save (value encrypted, never shown again)
```

Or via CLI:
```bash
agentsy login                              # Opens browser, authenticates
agentsy secrets set ANTHROPIC_API_KEY sk-ant-api03-...
# Secret ANTHROPIC_API_KEY set for production
```

> **Local dev vs platform secrets**: `agentsy secrets set` stores the key encrypted on the platform (used in staging/production). For local development, `agentsy dev` reads from a `.env` file in your project directory. The `agentsy init` scaffold creates a `.env` template with `ANTHROPIC_API_KEY=` for you to fill in locally.

**1.4 — Generate API key (for programmatic access)**
```
Dashboard: Settings → API Keys → Create Key
  Name: "Dev laptop"
  → Shows key once: sk-agentsy-acme-a1b2c3...
  → Copy and store securely
```

### Screen: Dashboard Home (empty state)

```
┌─────────────────────────────────────────────────────┐
│  Agentsy          Agents  Runs  Evals  Settings     │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Welcome to Agentsy, Ishwar                         │
│                                                     │
│  ☐ Connect your LLM provider     [Add API Key →]   │
│  ☐ Install the CLI               npm i -g @agentsy/cli │
│  ☐ Create your first agent       [Create Agent →]   │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Quick Start                                        │
│  $ agentsy init my-agent                            │
│  $ cd my-agent && agentsy dev                       │
│  $ agentsy deploy                                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## Journey 2: Create & Define an Agent

### Goal
Developer defines an agent with a system prompt, tools, and guardrails.

### Path A: CLI (code-first)

**2.1 — Scaffold a new agent**
```bash
agentsy init support-agent
# Created support-agent/
#   agentsy.config.ts
#   src/agent.ts
#   src/tools/
#   evals/
#   .env
```

**2.2 — Define the agent**

```typescript
// src/agent.ts
import { defineAgent } from "@agentsy/sdk";
import { getOrder, getRefundPolicy, issueRefund } from "./tools";

export default defineAgent({
  slug: "support-agent",
  name: "Customer Support Agent",
  model: { class: "balanced", provider: "anthropic" },
  systemPrompt: `You are a customer support agent for Acme Corp.
    You help customers with order inquiries and refund requests.
    Always verify the order exists before taking action.
    Never process refunds over $500 without approval.`,
  tools: [getOrder, getRefundPolicy, issueRefund],
  guardrails: {
    maxIterations: 15,
    maxTokens: 50_000,
    maxCostUsd: 0.50,
  },
});
```

**2.3 — Define a tool**

```typescript
// src/tools/get-order.ts
import { defineTool } from "@agentsy/sdk";
import { z } from "zod";

export const getOrder = defineTool({
  name: "get_order",
  description: "Look up an order by ID",
  riskLevel: "read",                    // read | write | admin
  parameters: z.object({
    orderId: z.string().describe("The order ID, e.g. ORD-12345"),
  }),
  execute: async ({ orderId }, ctx) => {
    const order = await ctx.secrets.get("ACME_API_KEY");
    // ... fetch from Acme API
    return { id: orderId, status: "shipped", total: 89.99 };
  },
});
```

```typescript
// src/tools/issue-refund.ts
import { defineTool } from "@agentsy/sdk";
import { z } from "zod";

export const issueRefund = defineTool({
  name: "issue_refund",
  description: "Process a refund for an order",
  riskLevel: "write",                   // requires approval in production
  approvalRequired: true,               // human must approve before execution
  parameters: z.object({
    orderId: z.string(),
    amount: z.number(),
    reason: z.string(),
  }),
  execute: async ({ orderId, amount, reason }, ctx) => {
    // ... call Acme refund API
    return { refundId: "REF-789", status: "processed" };
  },
});
```

### Path B: Dashboard (visual)

**2.4 — Create via dashboard**
```
Dashboard: Agents → Create Agent
  ┌──────────────────────────────────────┐
  │ Create Agent                         │
  │                                      │
  │ Name: [Customer Support Agent     ]  │
  │ Slug: [support-agent              ]  │
  │                                      │
  │ Model:                               │
  │ [Balanced ▾]  [Anthropic ▾]          │
  │                                      │
  │ System Prompt:                       │
  │ ┌──────────────────────────────────┐ │
  │ │ You are a customer support      │ │
  │ │ agent for Acme Corp...          │ │
  │ └──────────────────────────────────┘ │
  │                                      │
  │ Tools:                               │
  │ [+ Add MCP Server]                   │
  │ [+ Connect Integration]             │
  │                                      │
  │ Guardrails:                          │
  │ Max iterations: [15]                 │
  │ Max tokens: [50,000]                 │
  │ Max cost: [$0.50]                    │
  │                                      │
  │           [Cancel]  [Create Agent]   │
  └──────────────────────────────────────┘
```

Both paths produce the same `agent` + `agent_version` in the database.

---

## Journey 3: Local Development & Testing

### Goal
Developer runs the agent locally, has a conversation, iterates on the prompt.

### Steps

**3.1 — Start local dev server**
```bash
agentsy dev
# ✓ Loaded support-agent from src/agent.ts
# ✓ Local server running at http://localhost:4321
# ✓ Using SQLite (local mode)
# ✓ Playground: http://localhost:4321/playground
#
# Type a message to chat, or open the playground in your browser.
```

**3.2 — Chat in terminal**
```
You: I need a refund for order ORD-12345

Agent: Let me look up that order for you.
  [tool] get_order({ orderId: "ORD-12345" })
  → { id: "ORD-12345", status: "shipped", total: 89.99 }

Agent: I found your order ORD-12345. It's currently shipped with a total
of $89.99. Let me check our refund policy.
  [tool] get_refund_policy()
  → { eligible: true, window: "30 days", conditions: "..." }

Agent: Your order is eligible for a refund. I'll process that now.
  [tool] issue_refund({ orderId: "ORD-12345", amount: 89.99, reason: "customer request" })
  ⚠ APPROVAL REQUIRED (write tool)
  Approve? [y/n]: y
  → { refundId: "REF-789", status: "processed" }

Agent: Done! Your refund of $89.99 has been processed (REF-789).
It should appear in your account within 3-5 business days.
```

**3.3 — Playground (browser)**

```
Browser → http://localhost:4321/playground

┌──────────────────────────────────────────────────────┐
│  Agentsy Playground (local)         support-agent    │
├────────────────────────┬─────────────────────────────┤
│                        │  Run Trace                  │
│  Chat                  │                             │
│                        │  Step 1: get_order          │
│  User: I need a refund │    Input: { orderId: "..." }│
│  for order ORD-12345   │    Output: { status: "..." }│
│                        │    Duration: 120ms          │
│  Agent: Let me look    │    Cost: $0.00              │
│  up that order...      │                             │
│                        │  Step 2: get_refund_policy  │
│  Agent: Your order is  │    ...                      │
│  eligible. I'll process│                             │
│  that now.             │  Step 3: issue_refund       │
│                        │    ⚠ Approval: pending      │
│  ⚠ Approve refund?     │    [Approve] [Deny]         │
│  [Approve] [Deny]      │                             │
│                        │  ─────────────────────────  │
│                        │  Total: 3 steps             │
│  [Type a message...]   │  Tokens: 2,340 in / 890 out│
│                        │  Cost: $0.0089              │
│                        │  Duration: 4.2s             │
└────────────────────────┴─────────────────────────────┘
```

**3.4 — Iterate on prompt**

Edit `src/agent.ts` → save → agentsy dev hot-reloads → test again.

---

## Journey 4: Write & Run Evals

### Goal
Developer creates a test dataset, runs experiments, and verifies agent quality before deploying.

### Steps

**4.1 — Create eval dataset**

```typescript
// evals/support-cases.eval.ts
import { defineDataset } from "@agentsy/eval";

export default defineDataset({
  name: "support-basic",
  cases: [
    {
      name: "simple-refund",
      input: { role: "user", content: "Refund order ORD-12345" },
      expectedOutput: /refund.*processed/i,
      expectedToolCalls: ["get_order", "issue_refund"],
      expectedApprovalBehavior: {
        "issue_refund": "requires_approval",
      },
      context: {
        sessionHistory: [],
      },
    },
    {
      name: "order-not-found",
      input: { role: "user", content: "Refund order ORD-99999" },
      expectedOutput: /not found|doesn't exist/i,
      expectedToolCalls: ["get_order"],
      mockedToolResults: {
        get_order: { error: "Order not found" },
      },
    },
    {
      name: "high-value-refund-blocked",
      input: { role: "user", content: "Refund my $2000 order ORD-55555" },
      expectedOutput: /cannot.*automatically|escalat/i,
      expectedToolCalls: ["get_order"],
      mockedToolResults: {
        get_order: { id: "ORD-55555", status: "delivered", total: 2000 },
      },
    },
  ],
});
```

**4.2 — Run eval locally**
```bash
agentsy eval run --dataset evals/support-cases.eval.ts

# Running experiment: support-basic (3 cases)
#
# ┌─────────────────────────┬────────┬──────────┬──────────┐
# │ Case                    │ Result │ Score    │ Cost     │
# ├─────────────────────────┼────────┼──────────┼──────────┤
# │ simple-refund           │ ✓ PASS │ 0.95     │ $0.012   │
# │ order-not-found         │ ✓ PASS │ 1.00     │ $0.008   │
# │ high-value-refund       │ ✗ FAIL │ 0.30     │ $0.010   │
# └─────────────────────────┴────────┴──────────┴──────────┘
#
# Overall: 2/3 passed (66.7%)  |  Avg score: 0.75  |  Total cost: $0.030
# ✗ REGRESSION: high-value-refund-blocked failed
#   Expected: output matching /cannot.*automatically|escalat/i
#   Got: "I'll process your refund of $2000 right away."
```

**4.3 — Fix and re-run**

Developer updates the system prompt to add the $500 guardrail:
```
Never process refunds over $500 without escalating to a human agent.
```

```bash
agentsy eval run --dataset evals/support-cases.eval.ts

# Overall: 3/3 passed (100%)  |  Avg score: 0.93  |  Total cost: $0.031
# ✓ All cases passed. Ready to deploy.
```

**4.4 — Compare experiments**
```bash
agentsy eval compare --baseline last-passing --current latest

# ┌─────────────────────────┬──────────┬──────────┬────────┐
# │ Case                    │ Baseline │ Current  │ Delta  │
# ├─────────────────────────┼──────────┼──────────┼────────┤
# │ simple-refund           │ 0.95     │ 0.95     │  0.00  │
# │ order-not-found         │ 1.00     │ 1.00     │  0.00  │
# │ high-value-refund       │ 0.30     │ 0.92     │ +0.62  │
# └─────────────────────────┴──────────┴──────────┴────────┘
#
# ✓ No regressions. +0.62 improvement on high-value-refund.
```

### Screen: Dashboard Eval View

```
Dashboard: Evals → support-basic → Experiment #3

┌──────────────────────────────────────────────────────┐
│  Experiment #3          vs Baseline (Experiment #1)  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Overall Score: 0.93 (+0.18 vs baseline)             │
│  Pass Rate: 3/3 (100%)                               │
│  Cost: $0.031                                        │
│                                                      │
│  Cases:                                              │
│  ┌──────────────────────┬───────┬───────┬──────────┐ │
│  │ Case                 │ Score │ Delta │ Status   │ │
│  ├──────────────────────┼───────┼───────┼──────────┤ │
│  │ simple-refund        │ 0.95  │  0.00 │ ✓ Pass   │ │
│  │ order-not-found      │ 1.00  │  0.00 │ ✓ Pass   │ │
│  │ high-value-refund    │ 0.92  │ +0.62 │ ✓ Fixed  │ │
│  └──────────────────────┴───────┴───────┴──────────┘ │
│                                                      │
│  [View Traces]  [Set as Baseline]  [Export CSV]      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Journey 5: Deploy to Production

### Goal
Developer deploys a tested agent version to staging, then promotes to production.

### Steps

**5.1 — Deploy to staging**
```bash
agentsy deploy --env staging

# Deploying support-agent v3 to staging...
# ✓ Agent version created: ver_a1b2c3
# ✓ Deployed to staging
# ✓ Endpoint: https://api.agentsy.com/v1/agents/support-agent/run
#   (use staging API key to target staging environment)
```

**5.2 — Test in staging**
```bash
# Call the agent via API
curl -X POST https://api.agentsy.com/v1/agents/support-agent/run \
  -H "Authorization: Bearer sk-agentsy-acme-staging-..." \
  -H "Content-Type: application/json" \
  -d '{"input": {"role": "user", "content": "Refund order ORD-12345"}}'
```

**5.3 — Promote to production**
```bash
agentsy deploy --env production

# Deploying support-agent v3 to production...
# ✓ Deployed to production
# ⚠ Previous version v2 superseded
```

**5.4 — Rollback (if needed)**
```bash
agentsy rollback --env production

# Rolling back production to previous version...
# ✓ Rolled back to support-agent v2
# ⚠ v3 deployment marked as rolled_back
```

### Screen: Dashboard Deploy View

```
Dashboard: Agents → support-agent → Deployments

┌──────────────────────────────────────────────────────┐
│  Deployments                    support-agent        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Production                                          │
│  ┌────────────────────────────────────────────────┐  │
│  │ v3 (ver_a1b2c3)          Active since 2m ago   │  │
│  │ Deployed by: ishwar@acme.com                   │  │
│  │ Changes: Updated refund guardrail              │  │
│  │ Eval: 3/3 passed (0.93 avg)                    │  │
│  │                       [View Diff] [Rollback]   │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Staging                                             │
│  ┌────────────────────────────────────────────────┐  │
│  │ v3 (ver_a1b2c3)          Active since 15m ago  │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  History                                             │
│  v2 — superseded — Mar 18                            │
│  v1 — superseded — Mar 15                            │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Journey 6: Monitor & Debug in Production

### Goal
Developer monitors agent runs, investigates failures, and reviews approval requests.

### Steps

**6.1 — View runs**
```
Dashboard: Runs → (filtered by agent: support-agent, env: production)

┌──────────────────────────────────────────────────────┐
│  Runs                           [Filter ▾] [Search]  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────┬──────────┬────────┬───────┬───────────┐│
│  │ Run ID  │ Status   │ Steps  │ Cost  │ Time      ││
│  ├─────────┼──────────┼────────┼───────┼───────────┤│
│  │ run_x1  │ ✓ Done   │ 4      │$0.012 │ 3.2s      ││
│  │ run_x2  │ ⚠ Paused │ 2      │$0.008 │ waiting   ││
│  │ run_x3  │ ✗ Failed │ 1      │$0.003 │ 0.8s      ││
│  │ run_x4  │ ✓ Done   │ 6      │$0.019 │ 5.1s      ││
│  └─────────┴──────────┴────────┴───────┴───────────┘│
│                                                      │
└──────────────────────────────────────────────────────┘
```

**6.2 — Inspect a run trace**
```
Dashboard: Runs → run_x1

┌──────────────────────────────────────────────────────┐
│  Run run_x1                    ✓ Completed  3.2s     │
├────────────────────────┬─────────────────────────────┤
│                        │                             │
│  Conversation          │  Trace                      │
│                        │                             │
│  User:                 │  1. [thinking] 340 tokens   │
│  "Refund ORD-12345"    │     "I need to look up..."  │
│                        │                             │
│  Agent:                │  2. [tool] get_order         │
│  "Let me look up       │     Input: { orderId: ... } │
│  that order..."        │     Output: { status: ... }  │
│                        │     Duration: 120ms          │
│  Agent:                │                             │
│  "Your refund has      │  3. [tool] issue_refund      │
│  been processed."      │     ⚠ Approval: approved    │
│                        │     Approved by: ishwar      │
│                        │     Wait time: 45s           │
│                        │     Duration: 340ms          │
│                        │                             │
│                        │  4. [response] 89 tokens     │
│                        │     "Your refund has been..."│
│                        │                             │
│                        │  ──────────────────────────  │
│                        │  Tokens: 2,340 in / 890 out │
│                        │  Cost: $0.012                │
│                        │  Model: claude-sonnet-4      │
│                        │  Version: v3                 │
└────────────────────────┴─────────────────────────────┘
```

**6.3 — Handle approval request**

When a run hits a write tool with `approvalRequired: true`, it pauses:

```
Dashboard: notification badge appears on Runs tab

Runs → run_x2 (⚠ Paused)

┌──────────────────────────────────────────────────────┐
│  ⚠ Approval Required                                │
│                                                      │
│  Agent: support-agent (production)                   │
│  Tool: issue_refund                                  │
│  Risk level: write                                   │
│                                                      │
│  Arguments:                                          │
│  {                                                   │
│    "orderId": "ORD-55555",                           │
│    "amount": 499.99,                                 │
│    "reason": "defective product"                     │
│  }                                                   │
│                                                      │
│  Context: Customer reported a defective item.        │
│  Agent verified order exists and is within refund    │
│  window.                                             │
│                                                      │
│  [Approve]  [Deny with reason...]                    │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Approval sends a Temporal signal → workflow resumes → tool executes → run completes.

**6.4 — View logs (CLI)**
```bash
agentsy logs --agent support-agent --env production --tail

# 2026-03-19T14:32:01Z [run_x1] started  input="Refund ORD-12345"
# 2026-03-19T14:32:02Z [run_x1] tool     get_order → 120ms
# 2026-03-19T14:32:02Z [run_x1] tool     issue_refund → awaiting_approval
# 2026-03-19T14:32:47Z [run_x1] approval issue_refund → approved by ishwar
# 2026-03-19T14:32:48Z [run_x1] tool     issue_refund → 340ms
# 2026-03-19T14:32:48Z [run_x1] done     4 steps, $0.012, 3.2s
```

---

## Journey 7: Integrate via API & SDK

### Goal
Developer integrates the deployed agent into their product (a customer support chat widget).

### Steps

**7.1 — Sync call (simple)**
```typescript
import { AgentsyClient } from "@agentsy/client";

const client = new AgentsyClient({ apiKey: "sk-agentsy-acme-..." });

const result = await client.agents.run("support-agent", {
  input: { role: "user", content: "Where is my order?" },
});

console.log(result.output); // "Let me look that up..."
```

**7.2 — Streaming (real-time UI)**
```typescript
const stream = await client.agents.stream("support-agent", {
  input: { role: "user", content: "Refund order ORD-12345" },
});

for await (const event of stream) {
  switch (event.type) {
    case "step.text_delta":
      process.stdout.write(event.delta);    // stream text to UI
      break;
    case "step.tool_call":
      showToolIndicator(event.tool_name);    // show "Looking up order..."
      break;
    case "step.approval_required":
      showApprovalDialog(event);             // prompt user to approve
      break;
    case "run.completed":
      showFinalResponse(event.output);
      break;
  }
}
```

**7.3 — Multi-turn session**
```typescript
// Create a session for persistent conversation
const session = await client.sessions.create({ agentSlug: "support-agent" });

// First message
const r1 = await client.agents.run("support-agent", {
  input: { role: "user", content: "What's the status of ORD-12345?" },
  sessionId: session.id,
});

// Follow-up (agent remembers the conversation)
const r2 = await client.agents.run("support-agent", {
  input: { role: "user", content: "Can you refund that?" },
  sessionId: session.id,
  // Agent knows "that" refers to ORD-12345 from conversation history
});
```

**7.4 — Async (long-running agents)**
```typescript
// Start a long-running agent (e.g., research agent)
const run = await client.agents.runAsync("research-agent", {
  input: { role: "user", content: "Analyze competitor pricing for Q1" },
});

console.log(run.id);      // run_abc123
console.log(run.status);  // "running"

// Poll for completion
const result = await client.runs.poll(run.id, {
  intervalMs: 2000,
  timeoutMs: 300_000, // 5 min
});

console.log(result.output); // Full research report
```

---

## Journey 8: Team Collaboration

### Goal
Team lead invites members, sets up environments, manages access.

### Steps

**8.1 — Invite team members**
```
Dashboard: Settings → Team → Invite Member
  Email: [engineer@acme.com]
  Role: [Member ▾]    (admin | member)
  → Send Invite
```

**8.2 — Environment setup**
```
Dashboard: Settings → Environments

┌──────────────────────────────────────────────────────┐
│  Environments                                        │
├──────────────────────────────────────────────────────┤
│                                                      │
│  development  (default, local)                       │
│  staging      API key: sk-agentsy-acme-staging-...   │
│  production   API key: sk-agentsy-acme-prod-...      │
│                                                      │
│  [+ Create Environment]                              │
│                                                      │
│  Per-environment secrets:                            │
│  ┌────────────────────┬─────────┬──────────────────┐ │
│  │ Secret             │ Staging │ Production       │ │
│  ├────────────────────┼─────────┼──────────────────┤ │
│  │ ANTHROPIC_API_KEY  │ ✓ Set   │ ✓ Set            │ │
│  │ ACME_API_KEY       │ ✓ Set   │ ✓ Set            │ │
│  │ SLACK_WEBHOOK      │ ✗ —     │ ✓ Set            │ │
│  └────────────────────┴─────────┴──────────────────┘ │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**8.3 — View usage**
```
Dashboard: Settings → Usage

┌──────────────────────────────────────────────────────┐
│  Usage — March 2026                                  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Total runs: 1,247                                   │
│  Total tokens: 3.2M in / 890K out                    │
│  Est. LLM cost: $47.30 (billed to your providers)   │
│                                                      │
│  By agent:                                           │
│  ┌────────────────────┬──────┬─────────┬────────┐    │
│  │ Agent              │ Runs │ Tokens  │ Cost   │    │
│  ├────────────────────┼──────┼─────────┼────────┤    │
│  │ support-agent      │ 892  │ 2.1M    │ $31.20 │    │
│  │ research-agent     │ 355  │ 1.1M    │ $16.10 │    │
│  └────────────────────┴──────┴─────────┴────────┘    │
│                                                      │
│  Note: LLM costs are charged by your providers       │
│  (Anthropic/OpenAI). Agentsy platform fee: $X/mo.   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Navigation Map

### Dashboard (app.agentsy.com)

```
├── Home (onboarding checklist / activity feed)
├── Agents
│   ├── Agent List (all agents, status, last deployed)
│   ├── Agent Detail
│   │   ├── Overview (config, current version, deployments)
│   │   ├── Versions (history, diff viewer, prompt changes)
│   │   ├── Deployments (staging/prod status, rollback)
│   │   ├── Runs (filtered to this agent)
│   │   └── Evals (datasets, experiments, baselines)
│   └── Create Agent (form-based config)
├── Runs
│   ├── Run List (all runs, filterable by agent/status/env/date)
│   └── Run Detail (conversation + trace + cost breakdown)
├── Evals
│   ├── Datasets (list, create, edit cases)
│   ├── Experiments (run history, scores, comparisons)
│   └── Baselines (active baselines, promotion history)
├── Settings
│   ├── General (org name, slug)
│   ├── Team (members, invites, roles)
│   ├── API Keys (create, revoke, list)
│   ├── Secrets (LLM keys, tool credentials, per-environment)
│   ├── Environments (dev/staging/prod, custom envs)
│   └── Usage (token counts, cost estimates, by agent)
└── Docs (link to docs.agentsy.com)
```

### CLI (`agentsy`)

```
agentsy init <name>              # Scaffold new agent project
agentsy dev                      # Start local dev server + playground
agentsy deploy [--env <env>]     # Deploy agent to environment
agentsy rollback [--env <env>]   # Rollback to previous version
agentsy eval run [--dataset <f>] # Run eval experiment
agentsy eval compare             # Compare experiment results
agentsy logs [--agent] [--tail]  # Stream production logs
agentsy login                    # Authenticate via browser
agentsy logout                   # Clear credentials
agentsy secrets set <key> <val>  # Set encrypted secret
agentsy secrets list             # List secret keys (no values)
```

---

## Journey 9: Knowledge Base & RAG

### Goal
Developer uploads documents so the agent can answer questions from them.

### Steps

**9.1 — Create knowledge base (CLI)**
```bash
agentsy kb create --agent support-agent --name "Product Docs"
# Created knowledge base kb_mN9vB5kP2wQx for support-agent
```

**9.2 — Upload documents**
```bash
agentsy kb upload --kb "Product Docs" ./docs/refund-policy.pdf ./docs/shipping-faq.md
# Uploading 2 files to "Product Docs"...
# ✓ refund-policy.pdf — 12 chunks (text-embedding-3-small, 1536 dims)
# ✓ shipping-faq.md — 8 chunks
# Total: 20 chunks indexed
```

Or via dashboard:
```
Dashboard: Agents → support-agent → Knowledge Base → Upload
  Drag & drop files or click to browse
  Supported: PDF, Markdown, TXT, HTML, DOCX
  → Files are chunked, embedded, and indexed in pgvector
```

**9.3 — Agent uses retrieval in a run**

When the agent runs, the system prompt includes a `{{knowledge}}` template variable. At runtime, the worker:
1. Embeds the user's input with `text-embedding-3-small`
2. Queries pgvector for the top-K most similar chunks (hybrid: vector + BM25 + RRF)
3. Injects the retrieved chunks into the system prompt

**9.4 — View retrieval in trace**
```
Dashboard: Runs → run_x5 → Trace

  Step 2: [retrieval]
    Query: "What is the refund window?"
    Results: 3 chunks retrieved
    ┌─────────────────────────────────────────┐
    │ 1. refund-policy.pdf (chunk 4)  0.91    │
    │    "Customers may request a full refund  │
    │    within 30 days of purchase..."        │
    │ 2. shipping-faq.md (chunk 2)    0.78    │
    │    "If your order arrives damaged..."    │
    │ 3. refund-policy.pdf (chunk 7)  0.74    │
    │    "Refunds over $500 require..."        │
    └─────────────────────────────────────────┘
    Duration: 45ms
```

---

## Journey 10: Connect MCP Servers

### Goal
Developer connects an external MCP server to give the agent access to third-party tools.

### Steps

**10.1 — Add MCP server via CLI**

```typescript
// src/agent.ts
import { defineAgent } from "@agentsy/sdk";

export default defineAgent({
  slug: "support-agent",
  name: "Customer Support Agent",
  model: { class: "balanced", provider: "anthropic" },
  systemPrompt: "...",
  tools: [
    // Native tools
    getOrder,
    // MCP server — all tools from this server are available to the agent
    {
      type: "mcp",
      url: "https://mcp.acme.com/crm",
      headers: { Authorization: "Bearer ${secret:ACME_CRM_TOKEN}" },
    },
  ],
});
```

**10.2 — Add MCP server via dashboard**
```
Dashboard: Agents → support-agent → Tools → Add MCP Server
  ┌────────────────────────────────────────┐
  │ Add MCP Server                         │
  │                                        │
  │ URL: [https://mcp.acme.com/crm     ]  │
  │ Auth header: [Bearer ${secret:...}  ]  │
  │                                        │
  │ [Discover Tools]                       │
  │                                        │
  │ Available tools from this server:      │
  │ ☑ crm.get_customer                     │
  │ ☑ crm.get_tickets                      │
  │ ☑ crm.create_ticket                    │
  │ ☐ crm.delete_customer (blocked by env) │
  │                                        │
  │              [Cancel]  [Connect]        │
  └────────────────────────────────────────┘
```

**10.3 — Tool discovery**

Clicking "Discover Tools" calls the MCP server's `tools/list` method and shows available tools with their descriptions and schemas. Users can selectively enable/disable tools.

---

## Journey 11: LLM-as-Judge Evals

### Goal
Developer uses an LLM judge to evaluate subjective agent quality, not just regex/exact match.

### Steps

**11.1 — Define LLM judge grader**
```typescript
// evals/quality-check.eval.ts
import { defineDataset } from "@agentsy/eval";

export default defineDataset({
  name: "support-quality",
  graders: [
    {
      type: "llmJudge",
      name: "helpfulness",
      model: { class: "balanced", provider: "anthropic" },
      rubric: `Rate the agent's response on a scale of 1-5:
        5: Fully resolves the customer's issue with clear, empathetic communication
        4: Resolves the issue but communication could be clearer
        3: Partially addresses the issue, misses some details
        2: Response is relevant but does not resolve the issue
        1: Response is off-topic, unhelpful, or harmful`,
      scoreRange: [1, 5],
      passThreshold: 3,
    },
    {
      type: "trajectoryMatch",
      name: "correct_tools",
      mode: "ordered",  // tools must be called in this exact order
    },
  ],
  cases: [
    {
      name: "empathetic-refund",
      input: { role: "user", content: "I'm really frustrated, my order never arrived" },
      expectedTrajectory: ["get_order", "get_shipping_status", "issue_refund"],
      context: {
        sessionHistory: [],
      },
    },
  ],
});
```

**11.2 — Run with LLM judge**
```bash
agentsy eval run --dataset evals/quality-check.eval.ts

# Running experiment: support-quality (1 case, 2 graders)
#
# ┌────────────────────┬────────────┬────────┬──────────┐
# │ Case               │ Grader     │ Score  │ Status   │
# ├────────────────────┼────────────┼────────┼──────────┤
# │ empathetic-refund  │ helpfulness│ 4/5    │ ✓ Pass   │
# │ empathetic-refund  │ correct_tools│ 1.00 │ ✓ Pass   │
# └────────────────────┴────────────┴────────┴──────────┘
#
# LLM judge reasoning (helpfulness):
#   "The agent acknowledged the customer's frustration, looked up the order,
#    checked shipping status, and proactively offered a refund. Communication
#    was clear but could have been more empathetic in the opening response."
#
# Judge cost: $0.004 (1 judge call)
# Total cost: $0.016 (agent run + judge)
```

---

## Journey 12: Add Failing Run to Eval Dataset

### Goal
Developer finds a bad agent response in production and adds it to the eval dataset with one click.

### Steps

**12.1 — Find the bad run**
```
Dashboard: Runs → run_x3 (✗ Failed or poor response)
```

**12.2 — Add to eval dataset**
```
Run Detail → [Add to Eval Dataset]

┌──────────────────────────────────────────────────────┐
│  Add to Eval Dataset                                 │
│                                                      │
│  Dataset: [support-basic ▾]                          │
│                                                      │
│  Input (from run):                                   │
│  "Refund my $2000 order ORD-55555"                   │
│                                                      │
│  Expected output:                                    │
│  [Cannot process automatically, escalate to human ]  │
│                                                      │
│  Expected tool calls:                                │
│  [get_order] (auto-populated from run trace)         │
│                                                      │
│  Graders:                                            │
│  ☑ Output matches regex                              │
│  ☑ Tool call sequence                                │
│  ☐ LLM judge (helpfulness)                           │
│                                                      │
│  Mock tool results:                                  │
│  get_order → { id: "ORD-55555", total: 2000 }       │
│  (auto-populated from actual run trace)              │
│                                                      │
│                   [Cancel]  [Add Case]               │
└──────────────────────────────────────────────────────┘
```

The system auto-populates input, tool calls, and tool results from the run trace. Developer adds the expected output and selects graders. This creates a new eval case in the dataset.

---

## Journey 13: Agent Dashboard Overview

### Goal
Developer views high-level health metrics for an agent.

### Steps

```
Dashboard: Agents → support-agent → Overview

┌──────────────────────────────────────────────────────┐
│  support-agent                    v3 (production)    │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Last 24 hours                                       │
│  ┌────────────┬────────────┬────────────┬──────────┐ │
│  │ Success    │ Avg Cost   │ Avg Latency│ Errors   │ │
│  │   97.2%    │   $0.012   │   3.4s     │   2.8%   │ │
│  │ ▁▂▃▃▄▅▅▆▇ │ ▅▄▃▃▄▅▃▄▃ │ ▃▄▅▃▄▅▆▅▃ │ ▁▁▁▂▁▁▃▁ │ │
│  └────────────┴────────────┴────────────┴──────────┘ │
│                                                      │
│  Top errors (last 24h):                              │
│  • tool_error: salesforce.query timeout (4x)         │
│  • max_iterations: agent looped on refund flow (2x)  │
│                                                      │
│  Recent runs:                                        │
│  ┌─────────┬──────────┬────────┬───────┬──────────┐  │
│  │ Run ID  │ Status   │ Steps  │ Cost  │ Time     │  │
│  ├─────────┼──────────┼────────┼───────┼──────────┤  │
│  │ run_x1  │ ✓ Done   │ 4      │$0.012 │ 3.2s     │  │
│  │ run_x2  │ ⚠ Waiting│ 2      │$0.008 │ paused   │  │
│  │ run_x3  │ ✗ Failed │ 1      │$0.003 │ 0.8s     │  │
│  └─────────┴──────────┴────────┴───────┴──────────┘  │
│                                                      │
│  Eval baseline: 3/3 passed (0.93 avg) — set 2h ago  │
│                                                      │
│  [View All Runs]  [Run Eval]  [Deploy New Version]   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Journey 14: Fallback Model Configuration

### Goal
Developer configures a fallback model so the agent continues working if the primary provider is down.

### Steps

**14.1 — Configure fallback in agent definition**
```typescript
export default defineAgent({
  slug: "support-agent",
  name: "Customer Support Agent",
  model: { class: "balanced", provider: "anthropic" },
  fallbackModel: { class: "balanced", provider: "openai" },
  // ...
});
```

**14.2 — Fallback fires in production**
```
Dashboard: Runs → run_x8

  Trace:
  Step 1: [llm_call]
    Model: claude-sonnet-4 (anthropic)
    Status: ✗ Provider error (503 Service Unavailable)
    → Falling back to openai/balanced

  Step 1 (retry): [llm_call]
    Model: gpt-4o (openai) — FALLBACK
    Status: ✓ Success
    Tokens: 1,200 in / 340 out

  ⚠ Fallback used: anthropic was unavailable, routed to openai.
  Run completed successfully via fallback provider.
```

**14.3 — Fallback appears in logs**
```bash
agentsy logs --agent support-agent --tail
# 2026-03-19T15:01:02Z [run_x8] fallback  anthropic → openai (503)
# 2026-03-19T15:01:03Z [run_x8] llm_call  gpt-4o 1200/340 tokens
# 2026-03-19T15:01:04Z [run_x8] done      3 steps, $0.015, 4.1s (fallback used)
```

---

## Journey 15: CI/CD Integration

### Goal
Developer adds eval checks to their CI pipeline so broken agents can't be deployed.

### Steps

**15.1 — Add eval step to GitHub Actions**
```yaml
# .github/workflows/agent-ci.yml
name: Agent CI
on: [pull_request]

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npx agentsy eval run --dataset evals/support-cases.eval.ts --ci
        env:
          AGENTSY_API_KEY: ${{ secrets.AGENTSY_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

**15.2 — `--ci` mode output**

The `--ci` flag outputs machine-readable results and exits with code 1 on regression:

```
$ npx agentsy eval run --dataset evals/support-cases.eval.ts --ci

{"experiment_id":"exp_abc","passed":3,"failed":0,"total":3,"avg_score":0.93,"regressions":0}

# Exit code 0 — no regressions
```

If regressions are detected:
```
{"experiment_id":"exp_def","passed":2,"failed":1,"total":3,"avg_score":0.75,"regressions":1}
Error: 1 regression detected vs baseline. See details at:
https://app.agentsy.com/evals/exp_def

# Exit code 1 — blocks the PR
```

**15.3 — PR comment (optional)**
```bash
npx agentsy eval run --dataset evals/support-cases.eval.ts --ci --pr-comment
```

Posts a summary comment to the PR:

> **Agentsy Eval Results** — support-basic
> 3/3 passed | Avg score: 0.93 | No regressions vs baseline
> Cost: $0.031 | [View experiment →](https://app.agentsy.com/evals/exp_abc)

---

## Journey 16: Alerting & Notifications

### Goal
Developer gets notified when agent health degrades in production.

### Steps

**16.1 — Configure alerts via dashboard**
```
Dashboard: Settings → Alerts → Create Alert

┌──────────────────────────────────────────────────────┐
│  Create Alert Rule                                   │
│                                                      │
│  Name: [Error rate spike                          ]  │
│  Agent: [All agents ▾]                               │
│  Environment: [Production ▾]                         │
│                                                      │
│  Condition:                                          │
│  When [error_rate] is [above] [5%] for [15 minutes]  │
│                                                      │
│  Notify via:                                         │
│  ☑ Email (team admins)                               │
│  ☑ Webhook (posts to your configured webhook URL)    │
│  ☐ Slack (coming P2)                                 │
│                                                      │
│                  [Cancel]  [Create Alert]             │
└──────────────────────────────────────────────────────┘
```

**16.2 — Alert fires**

```
Email:
  Subject: ⚠ Agentsy Alert: support-agent error rate at 8.2%
  Body:
    Agent: support-agent (production)
    Metric: Error rate
    Current value: 8.2% (threshold: 5%)
    Window: last 15 minutes
    Top errors:
    • tool_error: salesforce.query timeout (12x)

    View dashboard: https://app.agentsy.com/agents/support-agent
```

**16.3 — In-app notification badge**

Dashboard shows a notification bell with unread count:
```
┌──────────────────────────────────────────────────────┐
│  Agentsy      Agents  Runs  Evals  Settings    🔔 2  │
├──────────────────────────────────────────────────────┤
│  Notifications:                                      │
│  • ⚠ Error rate spike on support-agent (8.2%)  2m    │
│  • ⚠ Approval pending on run_x2                15m   │
└──────────────────────────────────────────────────────┘
```

---

## Journey Summary

| Journey | Primary Surface | Key Screens / Commands |
|---------|----------------|----------------------|
| 1. Signup & Onboarding | Dashboard | Home, Settings → Secrets |
| 2. Create Agent | CLI or Dashboard | `agentsy init`, Agents → Create |
| 3. Local Dev & Test | CLI | `agentsy dev`, Playground |
| 4. Write & Run Evals | CLI + Dashboard | `agentsy eval run`, Evals → Experiments |
| 5. Deploy | CLI + Dashboard | `agentsy deploy`, Agents → Deployments |
| 6. Monitor & Debug | Dashboard + CLI | Runs → Detail, `agentsy logs` |
| 7. API Integration | Code | `@agentsy/client` SDK |
| 8. Team Collaboration | Dashboard | Settings → Team, Environments, Usage |
| 9. Knowledge Base & RAG | CLI + Dashboard | `agentsy kb upload`, Agents → Knowledge Base |
| 10. MCP Server Connections | CLI + Dashboard | Agent config, Agents → Tools |
| 11. LLM-as-Judge Evals | CLI + Dashboard | Custom graders, judge rubrics |
| 12. Add Run to Eval Dataset | Dashboard | Run Detail → Add to Eval Dataset |
| 13. Agent Dashboard Overview | Dashboard | Agents → Overview (sparklines) |
| 14. Fallback Model Config | CLI + Dashboard | Agent config, trace viewer |
| 15. CI/CD Integration | CLI + GitHub Actions | `agentsy eval run --ci` |
| 16. Alerting & Notifications | Dashboard | Settings → Alerts, notification bell |
