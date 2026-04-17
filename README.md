# Kurk AI

Monorepo for a hotel voice request system. The workspace currently contains:

- `apps/api`: Hono + Prisma backend
- `apps/web`: guest-facing Next.js frontend
- `apps/dashboard`: staff-facing Next.js dashboard

## Repo standards

- Use feature branches such as `feature/<description>` or `fix/<description>`.
- Keep `main` deployable.
- Use Conventional Commits in the format `<type>(<scope>): <summary>`.
- Never commit secrets. Local values belong in untracked `.env` files; placeholders belong in `.env.example`.
- Git hooks block direct commits to `main` and reject branch names outside `feature/*` and `fix/*`.

## Useful commands

```bash
pnpm install
pnpm lint
pnpm build
pnpm check
```
