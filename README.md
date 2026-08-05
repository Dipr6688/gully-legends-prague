# Gully Legends Prague

Shared cricket statistics website for ČZU Gully Arena.

## Phase 1

This phase is a local mock-data Next.js application. It uses:

- Next.js App Router
- TypeScript
- Tailwind CSS
- Real responsive React components
- Local typed player data
- A generated Prague open-field cricket background asset at
  `public/backgrounds/prague-gully-arena.png`

Supabase, authentication, role-based authorization, final match workflow, and
shared database writes are intentionally not connected yet.

## Included Mock Data

The first four players are included:

- Aninda
- Arunabha
- Atripan
- Biplab

Every player starts at:

- Level `0`
- XP `0`
- Batting rating `0/100`
- Bowling rating `0/100`
- Fielding rating `0/100`
- Career runs, wickets, and catches all `0`

Monthly awards show `Not decided yet` until finalised matches exist in a later
phase.

## Local Development

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification Commands

```bash
npm run lint
npm run typecheck
npm run build
```
