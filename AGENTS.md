<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Storytelly — agent guide

App for managing **worlds**, **characters**, **locations**, **stories**, and MP3 songs/storyboards for AI-generated music videos. Lyrics and song generation are in scope via OpenRouter; broader video generation, per-world model selection, and cost tracking remain future work.

## Stack — what to reach for

| Concern | Tool |
|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript |
| Data fetching | **Client-side via TanStack Query** — pages are `"use client"`. No SSR for data. |
| Styling | **Tailwind v4 only** (`@theme` in [src/app/globals.css](src/app/globals.css)). No `tailwind.config.ts`, no shadcn CLI. |
| Forms | `react-hook-form` + `zod`; validators in [src/lib/validation.ts](src/lib/validation.ts) reused on client and server. |
| DB | Postgres 16 + Drizzle ORM. Schema is a single file: [src/db/schema.ts](src/db/schema.ts). |
| Storage | `@aws-sdk/client-s3` against MinIO locally; identical code path for AWS S3 in prod. Wrapper: [src/lib/storage.ts](src/lib/storage.ts). |
| Package manager | **npm** — never `pnpm`/`yarn`. |

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

### AI Agent Principles
- **Instruction over Correction**: Trust the AI's ability to follow complex instructions. Do NOT use brittle code to "clamp", "fix", or "correct" AI outputs (e.g., hard-coding timeline logic to fix AI duration errors). Instead, refine the prompt and let the model own the output quality. Brittle post-processing code hides prompt weaknesses and complicates maintenance.
- **Structured Data**: Prefer single consolidated JSON objects for complex multi-modal tasks to ensure high reliability across different model tiers.
- **Elision for Logs**: Always elide large binary data (Base64 images/audio) before saving AI prompts to the database logs.
- **Artifact Integrity**: Always maintain `task.md` and `walkthrough.md` for any major functional feature.
- **Run and Maintain Tests**: For any logic, utility, or component modification, verify existing tests pass (`npm run test`) and write corresponding test coverage. Target high coverage for new business rules.

### Schema changes
1. Edit `src/db/schema.ts`.
2. `npm run db:generate` — produces a new file in `src/db/migrations/`. **Commit it.**
3. Apply with `npm run db:migrate` (prod-style) or `npm run db:push` (dev-only, prompts).
4. **Never edit a migration that was already applied** anywhere. Add a new one.
5. Update [src/lib/validation.ts](src/lib/validation.ts) and [src/lib/api.ts](src/lib/api.ts) DTOs to match.

### Images
- Store metadata in the polymorphic `images` table; bytes go to S3/MinIO under deterministic keys.
- Owner kinds: `world_mood`, `character`, `location`, `story_mood`.
- Use plain `<img src={presignedUrl}>` — **don't use `next/image` for presigned URLs**, the cache outlives the signature.
- Owners must exist before uploading: forms create the entity first, then route to a page that mounts `<ImageUploader>`.

### Songs & Storyboards
- Store song metadata in `story_songs`; MP3 bytes go to S3/MinIO under `stories/{storyId}/songs/...`.
- Song responses include presigned GET URLs because the bucket is private. Use a plain HTML `<audio controls>` player.
- Songs are either `generated` by OpenRouter Lyria or `uploaded` by the user. Only MP3 uploads are supported.
- A story may have many songs. Songs can be archived; non-archived songs link to their own storyboard page.

### Architectural Patterns
- **Modular Workspaces**: For complex, feature-heavy pages, break the UI into granular subcomponents (e.g., separate cards, toolbars, and preview panes). This prevents mega-files and isolates React re-renders.
- **Concurrent Async State**: When handling asynchronous tasks for lists of items (e.g., batch generating media), track loading/error states in a local dictionary/map keyed by item ID rather than a single global boolean. This avoids locking up the whole page and prevents massive cascading re-renders.
- **Asset Hierarchy in Exports**: When exporting complex multi-media projects (like ZIP archives with timelines), always prioritize including the highest-fidelity generated assets (e.g., videos over static fallback images).

### Testing Guidelines
- **Testing Behavior, Not Implementation**: For UI components, use `@testing-library/react` to verify what the user sees and interacts with (e.g., `userEvent.click`), rather than asserting on React internal state.
- **Colocate Tests**: Place test files directly next to the code they verify (e.g., `button.test.tsx` next to `button.tsx`).
- **Mocking DB & S3 Dependencies**: When testing pure logic/compilers, mock `@/db/client` and `@/lib/storage` at the top of the test file to prevent connection initialization errors due to missing `DATABASE_URL` or `S3_BUCKET` environment variables.
- **Autosave / Debounce Testing**: Avoid globally calling `vi.useFakeTimers()` in suites with async fetching libraries (it breaks TanStack Query). Instead, use real sleep delays (`await new Promise((res) => setTimeout(res, 800))`) inside specific tests to let debounce cycles run naturally.

### Naming rules (business)
- Character and location `name` is **immutable after creation** and **unique per world**. PATCH zod schemas omit `name` deliberately — keep it that way.
- Song length: optional integer seconds. For generated songs, multiple of 15, between 30 and 180 inclusive. Uploaded songs may have any length. Enforced by Postgres CHECK constraint and zod.
- Stories have editable `name`, `description`, and parameter selections; existing stories autosave these fields inline. Lyrics and length belong to generated songs, not stories.
- Story songs are generated from all parent datapoints: world fields, selected characters/locations, story name/description, chosen song length, optional song lyrics, and available references.

### Styling
- Use the CSS variables defined in [src/app/globals.css](src/app/globals.css): `--color-bg`, `--color-surface`, `--color-fg`, `--color-accent` (magenta), etc. Don't introduce new colors casually.
- Headings use `font-mono` + `uppercase tracking-widest` — that's the look.
- Keep dark-only. No theme switcher.
- **Spacious Design Bias**: The user prefers "spacious" layouts that utilize high-resolution screen real estate effectively. Avoid cramped fixed-width containers (`max-w-6xl` or similar). Favor responsive, wide-container patterns (e.g., `max-w-[1440px]`).
- Treat complex pages as comprehensive workspaces, not document-style forms. Utilize two-column or multi-pane layouts (like sticky preview panes alongside scrollable sections) to distribute density across the screen.
- Inline editable fields should blend into the surrounding layout: use low-contrast backgrounds/borders by default, visible focus/hover states, and compact status text for autosave. Avoid large bordered form cards unless creating a brand-new entity.
- Do not create separate edit views for worlds, characters, locations, or stories when the entity already exists. Display and editing happen in the same view; changes autosave after short debounce where the record already exists.
- Song generation happens on a dedicated song creation page: choose length, optionally generate/edit lyrics for that song, then generate the MP3.
- Song generation creates a new song row and does not replace uploaded/generated songs. Keep song management compact, with generate/upload controls above a list of audio players.
- Keep repeated lists compact. Use small row/card padding, short section headers, and image thumbnails that support scanning instead of dominating the page.
- Preserve immutable-field rules visually. Character/location names are locked after creation; show them as locked/read-only rather than adding name PATCH support.

## Scripts — what to run when

| Want to… | Run |
|---|---|
| Start everything | `docker compose up -d && npm run dev` |
| Apply schema | `npm run db:migrate` (or `npm run db:push` in dev) |
| Generate migration | `npm run db:generate` |
| Inspect DB | `npm run db:studio` |
| Run test suite | `npm run test` |
| Check coverage | `npm run test:coverage` |
| Type-check | `npm run typecheck` |
| Lint | `npm run lint` |
| Production build | `npm run build` |

Verify your change builds and passes tests before reporting done: `npm run typecheck && npm run test && npm run build`.

## Don't

- Don't add SSR for the entity pages — they're meant to be client-rendered.
- Don't store binary data in Postgres.
- Don't reach for external UI kits (shadcn, Mantine, MUI). The `components/ui/*` primitives are intentionally hand-rolled.
- Don't add features for *future* AI work without a current need; the plan is to land them in their own iteration.
- Don't hardcode S3 hosts/keys; everything goes through env vars in [src/lib/storage.ts](src/lib/storage.ts).
- Don't commit `.env`. `.env.example` is the contract.

## Future scope (don't build yet, but design with it in mind)

- Scene / video generation beyond songs, likely via OpenRouter.
- Per-world model selection.
- Cost tracking per world and per story (will need an `ai_calls` table joined on `worlds`/`stories`).
