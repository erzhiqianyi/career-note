# Career Note: contributor and Agent instructions

- This is a local-only personal workspace. Keep all services on loopback; do not deploy the web app publicly or register it with a hosting provider. Publishing this repository means publishing source code, not personal data or a running service.
- Store real profiles, application records, reports, materials and imports outside the repository. Preserve source profiles. Use an external `CAREER_DATA_DIR`; tests must use disposable data.
- Read `docs/agent-workflow.md` for research and preparation. Use `node scripts/career-data.mjs` against the running Worker. Do not modify D1 directly or fabricate generation in the frontend.
- Never submit applications, contact employers or alter application status without the user's explicit instruction. Keep source evidence and human review boundaries.
- Preserve unrelated work. Never stop unrelated processes.
- Use `npm ci`, `npm run dev`, `npm test`, `npm run typecheck`, `npm run check:docs`, `npm run build`. See `docs/local-setup.md` for ports and configuration. No Python runtime is required.
- Before public commits run `npm run check:public` against the staged files. Never stage `.env`, `.dev.vars`, database files, real imports, generated personal materials or screenshots of real profiles.
- Keep reusable skills in `.agents/skills/`. After editing skills or their referenced workflow documents run `npm run skills:archive`. This updates the website catalog and appends a content-versioned source archive. Do not put personal information in these inputs.
- `career-job-prep` applies to company research and application/interview drafts, not website development or automatic applications.
