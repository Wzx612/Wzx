# Atlas — AI Multi-Agent Real Estate Advisor

多智能体房产顾问平台 · An enterprise-grade, bilingual (中文 / EN), dark-glassmorphism
AI agent SaaS platform for real-estate decision-making in the China market.

Built as a pixel-faithful React implementation of the Claude Design handoff bundle.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | React 18 + TypeScript (strict) |
| Build | Vite 5 |
| Styling | TailwindCSS 3 + design-token CSS variables |
| Animation | Framer Motion 11 |
| Charts | Recharts 2 |
| Icons | Lucide React |
| State | Zustand 5 |
| Network | Axios |
| Routing | React Router 6 |
| Backend (reference) | FastAPI + LangGraph + OpenAI-compatible API |
| Database (reference) | PostgreSQL |
| Map | Mapbox-ready GIS layer (stylized SVG fallback included) |

The frontend runs **fully on bundled mock data** out of the box. Set
`VITE_API_BASE` to point the service layer at a live FastAPI + LangGraph backend.

---

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check (tsc -b) + production build
npm run preview    # preview the production build
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

Copy `.env.example` to `.env` and set `VITE_API_BASE` to use a live backend
(leave empty for mock mode).

---

## Architecture

```
src/
  components/
    layout/      AppShell, Sidebar, Topbar, ParticleField
    agents/      AgentCard, MetricCard, AgentWorkflow, CollaborationGraph, StatusBadge
    charts/      PriceTrendChart, RoiChart, RiskRadar, DistributionCharts (Recharts)
    property/    PropertyCard
    report/      ReportPanel
    ui/          AnimatedCounter, Sparkline, Skeleton, Headings
  pages/         Dashboard, Search, Analysis, Investment, Mortgage, Report,
                 Chat, Workflow, Knowledge, Tools, Intelligence, Analytics,
                 Permissions, Monitoring, Settings
  services/      api.ts (Axios client), agentService.ts (agent orchestration)
  store/         uiStore.ts (lang/theme), agentStore.ts (pipeline status)
  types/         index.ts (full domain model)
  i18n/          dict.ts (bilingual dictionary)
  lib/           format, icons, useT
  mock/          agents, properties, analytics
  styles/        index.css (design system + Tailwind)
```

## Agent architecture

Five core advisory agents run as a sequential LangGraph-style pipeline:

```
Search Agent → Market Agent → Investment Agent → Mortgage Agent → Coordinator Agent
```

| Agent | Responsibility |
| --- | --- |
| **Search** | Listing search, recommendation, filtering |
| **Market** | District analysis, price-trend analysis, heat forecasting |
| **Investment** | ROI analysis, return calculation, risk analysis |
| **Mortgage** | Mortgage calculation, down-payment analysis, bank-plan recommendation |
| **Coordinator** | Aggregates all agent results → final report + purchase advice |

The dashboard surfaces **10** specialised agents (the five above plus School District,
Legal Risk, Transportation, Policy Analysis, Web Search).

### Status lifecycle

Each agent transitions through:

```
idle → thinking → running → completed
idle → running → error            (error branch)
```

driven by `useAgentStore.startRun()`, animated with Framer Motion on the **AI Report**
page (`/report`) and visualised in `AgentWorkflow`.

## Pages

1. **Dashboard** — hero (particle network + orbit), realtime metrics, agent center, collaboration graph
2. **Property Search** — 20 mock listings, skeleton loading, favorites, tag filters
3. **Market Analysis** — price-trend line chart, district heat, distribution pie, breakdown table
4. **Investment** — ROI projection (composed chart) + risk radar + dimension bars
5. **Mortgage** — interactive affordability calculator + ranked bank plans
6. **AI Report** — live agent workflow runner + Coordinator report (score, recommendation, advice, risks)
7. **AI Chat** — ChatGPT-style multi-agent streaming with tool-trace, sources, agent panel
8. **Workflow Builder** — node canvas with pan/zoom, drag-drop palette, inspector, run animation
9. **Knowledge Base** — RAG pipeline: stats, dropzone, doc list, chunk/test/graph tabs
10. **MCP Tools** — tool marketplace with category filter + connect toggle
11. **Estate Intelligence** — GIS district map with toggleable layers + analysis panel
12. **Data Visualization** — large-screen dashboard of live charts
13. **Permissions** — RBAC matrix, members, departments
14. **Monitoring** — live token/API charts, latency gauge, log feed, websocket grid
15. **Settings** — profile, appearance (theme/lang), security, SSO/OAuth, billing, notifications

## Charts (Recharts)

Price-trend (area), ROI (composed bar+area), risk radar, district-heat (bar),
listing distribution (pie), plus hand-built SVG live charts on Monitoring/Analytics.

## Theming & i18n

- Dark / light theme via `data-theme` on `<html>`, persisted to `localStorage`.
- Bilingual content via a central dictionary + `data`-driven `Bi { en; zh }` pairs;
  switch language from the topbar or Settings. Persisted to `localStorage`.

## Notes on the backend

`services/agentService.ts` is written against a FastAPI + LangGraph contract
(`POST /agents/:id/run`, `GET /properties`, `GET /report`). With no `VITE_API_BASE`
configured it resolves the same shapes from `mock/` with realistic latency, so the
entire UI — including the agent status pipeline — is functional offline.
