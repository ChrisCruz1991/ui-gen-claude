# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

UIGen is a Next.js 15 (App Router) app that uses Claude to generate React components from chat prompts, with a live in-browser preview. Components are compiled with Babel Standalone and rendered inside a sandboxed iframe — nothing is written to disk.

## Commands

- `npm run setup` — one-time bootstrap: installs deps, generates Prisma client, runs migrations.
- `npm run dev` — dev server with Turbopack at http://localhost:3000.
- `npm run dev:daemon` — same, but backgrounded with output piped to `logs.txt` (use this when you need to start the server and keep working).
- `npm run build` / `npm run start` — production build / run.
- `npm run lint` — `next lint`.
- `npm test` — runs Vitest (jsdom env). A single file: `npx vitest run src/lib/__tests__/file-system.test.ts`. A single test: add `-t "<name pattern>"`.
- `npm run db:reset` — wipes and re-migrates the SQLite dev DB.

All `next` commands are wrapped with `NODE_OPTIONS='--require ./node-compat.cjs'`. `node-compat.cjs` strips the Node 25+ experimental global `localStorage`/`sessionStorage` on the server so SSR guard checks (`typeof localStorage === "undefined"`) work. Don't remove this shim unless you've also removed Node 25 support.

## Environment

- `ANTHROPIC_API_KEY` in `.env` is **optional**. Without it, [src/lib/provider.ts](src/lib/provider.ts) returns a `MockLanguageModel` that streams a canned counter/form/card flow — handy for working on UI without spending tokens, but it means "AI generation works in dev" is not proof the real model path works.
- Real model id lives in [provider.ts:8](src/lib/provider.ts#L8) (`MODEL` constant).
- `JWT_SECRET` signs the auth cookie; defaults to a dev value when unset.

## Architecture

### The two-sided virtual file system

The central abstraction is [VirtualFileSystem](src/lib/file-system.ts) — an in-memory tree of `FileNode`s. **There are two live instances of it per chat turn, and they must stay in sync:**

1. **Server-side** — [src/app/api/chat/route.ts](src/app/api/chat/route.ts) receives the serialized FS in the request body, rebuilds a `VirtualFileSystem`, and binds it to the `str_replace_editor` and `file_manager` tools ([src/lib/tools/](src/lib/tools/)). Tool calls mutate this instance; `onFinish` serializes it back to Prisma.
2. **Client-side** — [FileSystemProvider](src/lib/contexts/file-system-context.tsx) holds a parallel instance. When the AI SDK streams a `tool-call`, [chat-context.tsx](src/lib/contexts/chat-context.tsx) forwards it to `handleToolCall`, which replays the same operation locally so the FileTree, CodeEditor, and PreviewFrame update in real time.

If you add a new tool that mutates files, you must wire it into **both** the server tool definition and the client `handleToolCall` switch, otherwise client and server will drift.

### Preview rendering

[PreviewFrame](src/components/preview/PreviewFrame.tsx) → [jsx-transformer.ts](src/lib/transform/jsx-transformer.ts):
- Every file is Babel-transformed in-browser (`@babel/standalone`) and turned into a blob URL.
- An import map wires `react`, `react-dom`, etc. to esm.sh, and wires local `@/...` imports to the blob URLs.
- The generated HTML is written to an `<iframe srcdoc>` with `sandbox="allow-scripts allow-same-origin allow-forms"` (both flags are required — import maps with blob URLs need same-origin).
- Entry point resolution order: `/App.jsx`, `/App.tsx`, `/index.jsx`, `/index.tsx`, `/src/App.*`, else first `.jsx`/`.tsx` found.
- The [generation prompt](src/lib/prompts/generation.tsx) tells the model these rules: always create `/App.jsx`, use Tailwind, use `@/` import alias, no HTML files.

### Persistence model

- Prisma + SQLite ([prisma/schema.prisma](prisma/schema.prisma)). Projects store `messages` and `data` as **JSON strings** — not relations. `data` is the serialized virtual FS.
- Only authenticated users get persistence. Anonymous users' work is kept in `sessionStorage` via [anon-work-tracker.ts](src/lib/anon-work-tracker.ts); after sign-up the client promotes it into a new Project.
- Auth is JWT in an `httpOnly` cookie ([src/lib/auth.ts](src/lib/auth.ts)); [src/middleware.ts](src/middleware.ts) gates `/api/projects` and `/api/filesystem`.

### Routing

- `/` ([app/page.tsx](src/app/page.tsx)) — for authenticated users, redirects to their most recent project, or creates+redirects to a new one. Anonymous users see `<MainContent>` with no project.
- `/[projectId]` — loads a specific project; redirects unauthenticated users to `/`.
- Both render the same [MainContent](src/app/main-content.tsx) with a three-panel layout (chat / preview|code).

## Testing notes

- Vitest with `jsdom`, `@testing-library/react`, paths resolved via `vite-tsconfig-paths`. Test files live in `__tests__/` folders next to the code they cover.
- The file-system test ([src/lib/__tests__/file-system.test.ts](src/lib/__tests__/file-system.test.ts)) is the authoritative spec for `VirtualFileSystem` behavior — consult it when changing that class.

## Conventions

- Use comments sparingly. Only comment complex code.
- Path alias `@/*` → `src/*` (tsconfig + shadcn `components.json`).
- shadcn/ui (New York, neutral base) lives in [src/components/ui/](src/components/ui/). Icons: `lucide-react`.
- Tailwind v4 via `@tailwindcss/postcss`; global styles in [src/app/globals.css](src/app/globals.css).
- Prisma client is generated to [src/generated/prisma/](src/generated/prisma/) (non-standard output path — import from `@/lib/prisma`, never from `@prisma/client` directly).
