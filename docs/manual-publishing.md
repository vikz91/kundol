# Help manual and GitHub Pages

Created: 2026-09-17 11:00:00 IST
Last updated: 2026-09-17 11:00:00 IST
Related tasks: `KUN-105`

The public manual is built with VitePress at [vikz91.github.io/kundol](https://vikz91.github.io/kundol/).

## Author and preview

- Edit introductory guides in `website/` and shared implementation guides in `docs/`.
- `scripts/generate-manual.ts` copies selected shared guides, translates source links to GitHub, exports Commander help without executing actions, and generates the rule catalogue from registry JSON. Generated pages are ignored by Git.
- `bun run docs:dev` regenerates references and starts the local site. Rerun after editing shared docs, command definitions, or the registry; handwritten `website/` pages reload live.
- `bun run docs:build` generates references and validates the production build and internal page links. `bun run docs:preview` serves that build at `/kundol/`.
- Local search needs no external account. The theme lazy-loads Mermaid on diagram pages, including light/dark rendering. The CLI does not depend on the website runtime.

## Automatic publication

- `.github/workflows/docs.yml` builds every PR to `main`; PRs cannot deploy.
- Pushes to `main`, including merged PRs, build the manual, upload the Pages artifact, update the generated `gh-pages` branch, and deploy that same artifact using GitHub's Pages action.
- Repository **Settings → Pages → Source** must be **GitHub Actions**. The `gh-pages` branch is a generated copy of the published output; edit source pages on a normal development branch.
- Deployment uses the workflow's `GITHUB_TOKEN` with scoped contents/Pages/OIDC permissions; no personal access token is needed. An explicit deploy is necessary because a token-authored push to `gh-pages` does not trigger another Pages build.
- The workflow can be rerun or manually dispatched on `main`. Deployments are serialized; a failed build prevents publication. The `github-pages` environment records the live URL and deployment history.
- The VitePress base is `/kundol/`. Changing the repository name or introducing a custom domain requires updating base, sitemap, favicon, and public links together.

See [VitePress deployment](https://vitepress.dev/guide/deploy) and [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
