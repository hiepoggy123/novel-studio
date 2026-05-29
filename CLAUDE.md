# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
pnpm dev       # Start dev server (Turbopack)
pnpm build     # Production build
pnpm lint      # ESLint
pnpm test      # Vitest (run once)
pnpm test:watch  # Vitest (watch mode)
```

Vitest (node env, `@` alias configured in `vitest.config.ts`) covers the pure-function core of the writing pipeline (state reducer, schemas, bootstrap, fact/hook selection, length/revise logic, style fingerprint, pipeline loop). UI and Dexie-bound code have no automated tests.

## Architecture

Novel Studio is a local-first creative writing workspace (Vietnamese UI, `lang="vi"`). All data lives in the browser via IndexedDB (Dexie). There is no backend — the only network calls are to user-configured AI provider endpoints and two thin API routes (`api/feedback`, `api/sync`).

### Stack

- **Next.js 16** (App Router) + **React 19** + TypeScript 5 (strict)
- **Tailwind CSS 4** with OKLch color tokens, `@custom-variant dark`
- **shadcn/ui** (radix-nova style, lucide icons) — components in `components/ui/`
- **Dexie 4** + `dexie-react-hooks` for IndexedDB with reactive `useLiveQuery`
- **Vercel AI SDK** (`ai` v6) with provider-specific SDKs (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/groq`, `@ai-sdk/mistral`, `@ai-sdk/xai`, `@ai-sdk/openai-compatible`)
- **Zustand 5** for ephemeral UI state (chat panel, analysis progress, chapter tools, global search, reader panel, name dict panel, scraper, writing pipeline)
- **streamdown** for streaming markdown rendering in chat
- **use-stick-to-bottom** for chat auto-scroll

### Data layer

Single Dexie database `novel-studio` with schema versioning in `lib/db-migrations.ts` (currently v15). Types live in `lib/db.ts`, migrations are separate.

**Content hierarchy:** Novel → Chapter → Scene (hierarchical, `order` field for reordering), Character, Note (all scoped to `novelId`)

**Novel entity includes analysis fields** (genres, tags, synopsis, world-building, factions, locations, analysis status) — these were merged from a former `NovelAnalysis` table in v10.

**AI config:** AIProvider (baseUrl, apiKey, providerType), AIModel (per provider), Conversation → ConversationMessage, ChatSettings (singleton `id: "default"`), AnalysisSettings (singleton)

**QT (Quick Translate) system:** NameEntry (Chinese→Vietnamese name mappings, scoped globally or per-novel), ReplaceRule (regex/literal find-replace), ExcludedName, DictEntry/DictMeta/DictCache (bulk dictionary loaded from text files), ConvertSettings, NameFrequency (detected name tracking with approve/reject workflow)

**Writing pipeline:** PlotArc → PlotPoint (hook fields: `payoffTiming`, `expectedPayoff`, `coreHook`, `lastAdvancedChapter`), ChapterPlan (with `intent`), StoryState (committed story-state snapshot, `id === novelId`: characterStates, worldFacts, openConflicts, knownTruths, knownFacts, chapterHashes, auditHistory, bootstrapComplete), WritingSettings (per-novel, `id === novelId`), WritingSession (with `stateHash`), WritingStepResult. The former `CharacterArc` table was dropped in v13 (migrated into StoryState `knownFacts`); character state now lives solely in the snapshot.

**Other singletons:** TTSSettings (`id: "default"`)

Every entity hook lives in `lib/hooks/use-*.ts` and follows the same pattern: `useLiveQuery` for reads, plain async functions for mutations. All mutations auto-set `createdAt`/`updatedAt` and use `crypto.randomUUID()`. Cascading deletes use Dexie transactions. Dashboard aggregate queries live in `use-dashboard-stats.ts`.

### AI client (`lib/ai/`)

Uses Vercel AI SDK with multi-provider dispatch. `getModel(provider, modelId)` in `lib/ai/provider.ts` maps `ProviderType` to the correct `@ai-sdk/*` SDK. OpenRouter and openai-compatible providers are wrapped with `extractJsonMiddleware` for reliable structured output. WebGPU provider is dynamically imported and is **chat-only** (blocked for API/pipeline inference via `api-inference.ts` guards).

`resolveStep()` in `lib/ai/resolve-step.ts` is the standard way to turn a `StepModelConfig` (providerId + modelId) into a `LanguageModel` — used by analysis and writing pipelines. Returns `undefined` for missing config or WebGPU providers.

Chat tools (`lib/ai/chat-tools.ts`) compose read tools (`novel-read-tools.ts`) and write tools (`novel-write-tools.ts`) scoped to a novelId for autonomous chat workflows.

### Analysis engine (`lib/analysis/`)

Three-phase pipeline: chapter analysis → novel aggregation → character profiling. Supports full re-analysis and incremental (tool-call-based) updates. Token budgeting controls depth/cost tradeoff. All analysis prompts are in Vietnamese. Results write directly to the Novel record via `db.novels.update()`. Each phase can use a different model via `AnalysisSettings` step configs, resolved through `resolve-analysis-models.ts`.

### Writing pipeline (`lib/writing/`)

State-driven multi-agent orchestration. `orchestrator.ts` is a thin re-export of `pipeline/run-pipeline.ts`, a data-driven loop over a step graph in `pipeline/steps.ts`. Eight roles per chapter: `plan → outline → writer → [normalize] → observe → audit → [revise → re-observe] → commit`. Each role has a dedicated agent in `lib/writing/agents/`.

Core idea: the writer output is parsed by a dedicated **observer** agent into a validated `StateDelta`; a pure **reducer** (`state/reducer.ts`) applies it to a single committed `StoryState` snapshot. The next chapter's context is **retrieved** from committed state (`retrieved-context.ts`), not re-derived — this kills long-range drift. The Scene is the single source of truth: `commitChapterState` saves/versions the Scene first, then observes the saved text, reduces, and persists snapshot + chapter + scene + PlotPoint hooks in one Dexie transaction. Edited chapters re-sync lazily via `resyncChapterState` (per-chapter `chapterHashes` diff).

- **State engine** (`lib/writing/state/`): pure reducer, zod v4 schemas, bootstrap, fact/hook selection; Dexie isolated in `state-store.ts`.
- **Planner** merges the former context+direction steps into a state-aware `ChapterIntent` + direction options.
- **Audit** scores 0–10 across ~7 dims against committed state + open hooks; the revise loop re-observes in memory and `commitChapterState` runs exactly once with the final delta.
- **Anti-AI prose** (`lib/writing/style/`): regex-based style fingerprint injected into the writer + a curated VI fatigue/cliché list feeding audit and an optional polish pass.

Pipeline is configurable per-novel via `WritingSettings` (per-step model + prompt). Human mode pauses at the plan and audit gates; "hands-free" (`noAskingMode`) runs the full pipeline without pauses. The pure-function core is unit-tested with Vitest (`pnpm test`).

### QT conversion system (`lib/workers/`)

Chinese-to-Vietnamese quick translation engine running in Web Workers. `qt-engine.worker.ts` handles dictionary-based conversion with configurable priority (name vs phrase, scope, length). `replace-engine.worker.ts` runs regex/literal find-replace rules. Both are accessed through hooks (`use-qt-engine.ts`, `use-replace-engine.ts`). Bulk operations in `lib/chapter-tools/bulk-convert.ts` and `bulk-translate.ts`.

### Routes

```
(landing)/          # Marketing landing page at /
(dashboard)/        # App shell with sidebar + chat panel
  dashboard/        # Home / stats
  library/          # Novel library grid
  import/           # Book import (TXT, EPUB, DOCX, PDF)
  convert/          # Standalone QT convert tool
  scraper/          # Web scraper for novel sites
  settings/         # providers, instructions, data, changelog
  feedback/         # User feedback form
  novels/[id]/      # Novel detail (tabs: chapters, characters, notes, analysis, writing)
    chapters/[chapterId]/  # Chapter editor (scenes, versions, AI tools)
    read/[order?]/         # Reader mode with TTS
    auto-write/            # Writing pipeline UI
api/feedback/       # Feedback submission (Vercel Blob + rate-limited)
api/sync/           # Data sync endpoint
```

### Layout

```
SidebarProvider
├── AppSidebar (left, collapsible offcanvas)
├── SidebarInset
│   ├── header (sidebar trigger + breadcrumb + toolbar: TTS, search, theme, name dict, chat toggle)
│   └── page content (flex-1 overflow-auto)
├── ReaderPanel (TTS-enabled reader overlay)
├── ChatPanel (right, 360px, AI chat with tool use)
├── NameDictPanel (Chinese→Vietnamese name dictionary)
├── DictInitializer (loads QT dictionaries on mount)
└── GlobalSearchDialog (Cmd+K, searches across novels/chapters/scenes/characters/notes)
```

`navConfig` in `app-sidebar.tsx` is the single source of truth for routes — the dashboard layout derives `pageTitles` from it and the homepage derives quick navigation from it.

### Fonts

Loaded via `next/font/google` in root layout as CSS variables:

- `--font-open-sans` (body/sans, with Vietnamese subset)
- `--font-playfair` (headings/serif)
- `--font-jetbrains-mono` (code/mono, with Vietnamese subset)

### Path aliases

`@/*` maps to project root (tsconfig paths). shadcn components import as `@/components/ui/*`.

### Import/Export

Two systems: `lib/novel-io.ts` for single-novel JSON export/import (v2 format, backward-compatible with v1 which had separate analyses), and `lib/db-io.ts` for full database backup/restore with encryption support and conflict resolution modes.

Book import (`lib/import/`) supports TXT, EPUB, DOCX, and PDF with configurable chapter splitting presets.

### Key patterns

- **Zustand stores** (`lib/stores/`) are purely ephemeral UI state — never persisted data. Each store is a single file exporting a `useXxxStore` hook.
- **Dark mode** uses manual `classList.toggle("dark")` + `localStorage.theme`, with a blocking `<script>` in `<head>` to prevent flash.
- **Scraper** (`lib/scraper/`) uses adapter pattern for different novel sites, with a browser extension bridge (`extension-bridge.ts`) for CORS bypass.
- **TTS** (`lib/tts/`) supports multiple providers with audio caching, fluency adjustment, and media session integration.
- **Global search** (`lib/search/global-search.ts`) uses MiniSearch for fuzzy full-text search across all entity types.
