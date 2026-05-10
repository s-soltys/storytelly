<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Storytelly — agent guide

App for managing **worlds**, **characters**, **locations**, and **stories** that will later drive AI-generated music videos. AI generation, model selection, and cost tracking are deliberately out of scope today; the schema must keep them easy to add.

## Stack — what to reach for

| Concern | Tool |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript |
| Data fetching | **Client-side via TanStack Query** — pages are `"use client"`. No SSR for data. |
| Styling | **Tailwind v4 only** (`@theme` in [src/app/globals.css](src/app/globals.css)). No `tailwind.config.ts`, no shadcn CLI. |
| Forms | `react-hook-form` + `zod`; validators in [src/lib/validation.ts](src/lib/validation.ts) reused on client and server. |
| DB | Postgres 16 + Drizzle ORM. Schema is a single file: [src/db/schema.ts](src/db/schema.ts). |
| Storage | `@aws-sdk/client-s3` against MinIO locally; identical code path for AWS S3 in prod. Wrapper: [src/lib/storage.ts](src/lib/storage.ts). |
| Package manager | **pnpm** — never `npm`/`yarn`. |

`@/*` resolves to `src/*`.

## Project shape

```
src/
  app/              Pages and API routes
    api/            All server endpoints — REST under /api/worlds/...
    worlds/         User-facing pages (all client components)
  db/
    schema.ts       Single source of truth for tables/types
    client.ts       Drizzle singleton (HMR-safe)
    migrations/     Generated SQL — committed, never hand-edited
  lib/
    validation.ts   zod schemas (client + server)
    storage.ts      S3/MinIO wrapper
    server.ts       API helpers (loadImages, jsonError, isUniqueViolation)
    api.ts          Typed client fetch wrapper + DTOs
    utils.ts        cn() class merger
  components/
    ui/             Hand-written primitives (Button, Card, Input, Label)
    forms/          Reused form components (NamedEntityForms, StoryForm)
    ImageUploader.tsx, QueryProvider.tsx
```

## Conventions — read before changing code

### Data flow
- Server reads/writes go through `db` from `@/db/client`. Don't open new postgres clients.
- API routes return JSON. Use `jsonError(status, msg, details?)` from `@/lib/server` for errors.
- Image responses must include **presigned GET URLs** (1h TTL) — the bucket is private. Use `loadImages(ownerKind, ownerId)`.
- Client always goes through the `api` helper in `@/lib/api` so error parsing is consistent.

### Schema changes
1. Edit `src/db/schema.ts`.
2. `pnpm db:generate` — produces a new file in `src/db/migrations/`. **Commit it.**
3. Apply with `pnpm db:migrate` (prod-style) or `pnpm db:push` (dev-only, prompts).
4. **Never edit a migration that was already applied** anywhere. Add a new one.
5. Update [src/lib/validation.ts](src/lib/validation.ts) and [src/lib/api.ts](src/lib/api.ts) DTOs to match.

### Images
- Store metadata in the polymorphic `images` table; bytes go to S3/MinIO under deterministic keys.
- Owner kinds: `world_mood`, `character`, `location`, `story_mood`.
- Use plain `<img src={presignedUrl}>` — **don't use `next/image` for presigned URLs**, the cache outlives the signature.
- Owners must exist before uploading: forms create the entity first, then route to a page that mounts `<ImageUploader>`.

### Naming rules (business)
- Character and location `name` is **immutable after creation** and **unique per world**. PATCH zod schemas omit `name` deliberately — keep it that way.
- Story length: integer seconds, multiple of 15, between 30 and 180 inclusive. Enforced by Postgres CHECK constraint *and* zod.

### Styling
- Use the CSS variables defined in [src/app/globals.css](src/app/globals.css): `--color-bg`, `--color-surface`, `--color-fg`, `--color-accent` (magenta), etc. Don't introduce new colors casually.
- Headings use `font-mono` + `uppercase tracking-widest` — that's the look.
- Keep dark-only. No theme switcher.

## Scripts — what to run when

| Want to… | Run |
|---|---|
| Start everything | `docker compose up -d && pnpm dev` |
| Apply schema | `pnpm db:migrate` (or `pnpm db:push` in dev) |
| Generate migration | `pnpm db:generate` |
| Inspect DB | `pnpm db:studio` |
| Type-check | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Production build | `pnpm build` |

Verify your change builds before reporting done: `pnpm typecheck && pnpm build`.

## Don't

- Don't add SSR for the entity pages — they're meant to be client-rendered.
- Don't store binary data in Postgres.
- Don't reach for external UI kits (shadcn, Mantine, MUI). The `components/ui/*` primitives are intentionally hand-rolled.
- Don't add features for *future* AI work without a current need; the plan is to land them in their own iteration.
- Don't hardcode S3 hosts/keys; everything goes through env vars in [src/lib/storage.ts](src/lib/storage.ts).
- Don't commit `.env`. `.env.example` is the contract.

## Future scope (don't build yet, but design with it in mind)

- AI music / scene / video generation, likely via OpenRouter.
- Per-world model selection.
- Cost tracking per world and per story (will need an `ai_calls` table joined on `worlds`/`stories`).
