# Storytelly

Manage **worlds**, **characters**, **locations**, and **stories** that will later drive AI-generated music videos.

> Status: scaffold complete — CRUD over the four entities works end-to-end. AI generation is on the roadmap; nothing is wired up yet.

## Quickstart

Prerequisites: **Node 20+**, **pnpm 10+**, and a running **Docker** daemon.

```bash
cp .env.example .env       # local-only credentials, no real secrets
docker compose up -d       # postgres on :5432, minio on :9000 (api) / :9001 (console)
pnpm install
pnpm db:migrate            # apply the committed schema
pnpm dev                   # http://localhost:3000
```

The first `docker compose up` also runs a one-shot `minio-init` job that creates the `storytelly` bucket. MinIO console: <http://localhost:9001> · login `storytelly` / `storytelly-secret`.

## What's in here

```
src/
  app/             Next.js App Router pages + API routes
  db/              Drizzle schema, client, generated migrations
  lib/             validation (zod), storage (S3 SDK), api helpers
  components/      ui primitives, forms, ImageUploader
docker-compose.yml  postgres + minio + bucket bootstrap
```

Key files: [src/db/schema.ts](src/db/schema.ts), [src/lib/storage.ts](src/lib/storage.ts), [src/lib/validation.ts](src/lib/validation.ts), [src/app/globals.css](src/app/globals.css).

## Tech stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript**
- **Tailwind v4** — CSS-first `@theme`, dark theme with magenta accent
- **Drizzle ORM** + **Postgres 16**
- **S3-compatible storage** via `@aws-sdk/client-s3` (MinIO locally → AWS S3 in prod)
- **TanStack Query**, **react-hook-form**, **zod**

## Common tasks

| | |
|---|---|
| Run app | `pnpm dev` |
| Generate a migration after editing `src/db/schema.ts` | `pnpm db:generate` |
| Apply migrations | `pnpm db:migrate` |
| Browse the DB | `pnpm db:studio` |
| Type-check | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Production build | `pnpm build` |

## Switching to AWS S3

The app talks to S3 through the AWS SDK; MinIO just mimics S3 locally. To deploy against AWS, change the env and redeploy — no code changes:

```env
S3_ENDPOINT=                 # leave empty for AWS
S3_FORCE_PATH_STYLE=false
S3_REGION=eu-central-1
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=...
```

## Roadmap

- AI music generation from a world's context
- Scene generation for stories (text + reference images)
- Video clip generation from scene + character refs
- Per-world AI model selection
- Cost tracking per world and per story
- Likely provider: OpenRouter

See [AGENTS.md](AGENTS.md) for conventions and constraints when contributing.
