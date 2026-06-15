# kundol Launch Supply Chain

Created: 2026-06-13  
Last updated: 2026-06-13 07:35:11 IST  
Related tasks: `KUN-001`, `KUN-003`, `KUN-049`, `KUN-050`, `KUN-051`, `KUN-052`, `KUN-053`, `KUN-054`, `KUN-055`

See also: [`viral-launch.md`](viral-launch.md) for research-backed launch patterns and the lowest-cost viral launch playbook.

## Summary

Launch `kundol` as a free, open-source, local-first terminal tool for developers with many local repositories.

The launch should optimize for trust before scale:

- Developers understand what the tool does within 30 seconds.
- The first install, index, dashboard, and dry run are easy.
- Safety is visible: dry-run-first cleanup, protected paths, explicit confirmation, and local SQLite storage.
- GitHub is the center of gravity for feedback, issues, runtime support, and contributors.
- Content shows real terminal workflows, not abstract product claims.
- Future paid cloud services are framed as optional remote/team visibility, not the reason the local tool exists.

## Positioning

`kundol` is a terminal-first project lifecycle manager for developers with many local repos.

Primary promise:

> Keep your local projects visible, healthy, and clean.

Sharper category:

- Local developer environment hygiene.
- Project lifecycle visibility.
- Safe cleanup and archive workflow for local workspaces.

Core audience:

- Developers with many side projects, experiments, forks, stale repos, and client workspaces.
- Freelancers and agency developers moving across many stacks.
- Engineering leads who may later want team/cloud visibility for remote servers or shared dev environments.

Avoid positioning it as a generic project manager, SaaS dashboard, one-click cleanup tool, or AI product unless AI-backed features actually exist.

## Naming Direction

Recommendation:

- OSS CLI: `kundol`
- Future paid service: `kundol Cloud`
- Keep `DevShelf` only as a possible future buyer-facing layer if clarity becomes necessary.

`kundol` is distinctive, searchable, and strong as a command. Its risk is that the meaning is not immediately obvious, so early docs and launch assets need a clear tagline.

Launch copy can explain `kundol` simply as a local shelf for dev projects.

## Trust And Safety Message

Trust is the launch wedge. Developers will only run cleanup/archive tooling if they believe it will not harm real work.

Trust pillars:

- Local-first: project registry and scan data live locally by default.
- Dry-run-first: cleanup workflows preview actions before execution.
- Protected paths: `.git`, `.env`, `.env.*`, databases, uploads, media, assets, and migrations are never removed automatically.
- Explicit confirmation: risky operations require clear approval.
- Open source: safety rules are inspectable and testable.
- Recoverable where possible: archive before delete and preserve useful metadata.

Suggested launch copy:

> kundol is built for careful cleanup. It separates safe generated artifacts from protected project data, defaults cleanup workflows to dry run, and keeps local project metadata on your machine.

Avoid copy like:

- Clean your machine in one click.
- Delete junk automatically.
- Let kundol decide what to remove.

## GitHub Launch

GitHub should be the launch home and the primary community surface.

Repository readiness:

- Resolve final CLI/package identity before publishing package metadata.
- Provide a working install path: `bun install`, `bun run build`, and a smoke command such as `bun run kundol -- --help`.
- Add CI checks for typecheck, lint/format, `bun test`, and CLI help smoke test.
- Add repo metadata and topics: `bun`, `typescript`, `cli`, `terminal`, `tui`, `sqlite`, `developer-tools`, `cleanup`, `open-source`.
- Include screenshots or terminal recordings for `index`, `list`, `dashboard`, `scan <project>`, `clean`, and `runtimes`.

README requirements:

- One-sentence pitch.
- Terminal screenshot or short recording above the fold.
- Quick explanation of the local repo chaos problem.
- Safety promise visible early.
- Quickstart commands.
- MVP command table.
- Example outputs.
- Data and privacy section.
- Roadmap.
- Contributing links.

Minimum launch files:

- `README.md`
- `LICENSE`
- `CONTRIBUTING.md`
- `CODE_OF_CONDUCT.md`
- `SECURITY.md`
- `CHANGELOG.md`
- `docs/safety.md`
- `docs/release.md`
- `docs/privacy.md` or a strong README data section
- `docs/commands.md`
- `.github/ISSUE_TEMPLATE/*`
- `.github/pull_request_template.md`

Recommended license:

- MIT for maximum adoption and simple commercial compatibility.
- Apache-2.0 if explicit patent language matters.
- Avoid custom source-available terms because the launch promise is fully open source and free.

## GitHub Community Setup

Enable Discussions with categories:

- Announcements
- Q&A
- Ideas
- Show and tell
- Runtime support
- Safety and cleanup policy

Seed before launch:

- Welcome and launch post.
- Public roadmap.
- Safety model explainer.
- Runtime support request thread.
- Show-and-tell prompt for anonymized dashboard/project-scan output.

Labels:

- `bug`
- `docs`
- `good first issue`
- `help wanted`
- `safety`
- `runtime support`
- `cleanup-analysis`
- `tui`
- `cli`
- `database`
- `release`

Starter contributor issues:

- Add fixture coverage for a Python project with `.venv` and `__pycache__`.
- Add generated-file detection docs for Rust `target/`.
- Improve narrow terminal table output.
- Add `docs/privacy.md`.
- Add shell completion research.
- Add runtime support notes for Java Gradle/Maven projects.

Community principle:

> kundol should help developers understand their local projects before taking action. We prefer explainable recommendations, conservative cleanup rules, and respectful defaults over clever automation.

## Issue And PR Templates

Issue templates should cover:

- Bug report: OS, shell, terminal app, Bun version, kundol version/commit, command run, expected behavior, actual behavior, redacted output, whether real files were modified.
- Feature request: problem, proposed workflow, alternatives, and safety impact.
- Runtime support: ecosystem, marker files, generated files, protected files, version commands, cleanup caveats.
- Docs feedback.
- Safety report for cleanup/archive false positives, protected path misses, or dry-run problems.

PR template should ask for linked issue, behavior changed, tests run, CLI/TUI screenshots or output where relevant, safety impact, and docs updated.

## Release Cadence

Early release rhythm:

- `0.1.0`: MVP public launch.
- Weekly patch releases for the first month if needed.
- Minor releases every 2-4 weeks while the product is young.
- GitHub Releases for every tag.
- Stable `main` and short-lived feature branches.

Release notes should include highlights, new commands/flags, safety changes, migration notes, known limitations, and contributors.

Treat destructive workflow behavior as stability-sensitive even before 1.0.

## Content Supply Chain

Content should make the product immediately understandable through real terminal demos.

Primary content promise:

> kundol helps you see, search, audit, clean, and safely archive your local projects from the terminal.

Tone:

- Practical.
- Developer-native.
- Plain-spoken.
- Honest terminal output.

Avoid overproduced startup polish. The terminal demo is the product.

Content pillars:

- Local repo chaos: messy folders become dashboard/list/search visibility.
- Safe cleanup: dry-run, protected paths, explicit confirmation.
- Runtime awareness: Node, Bun, Python, Go, Rust, Java, .NET, and other tooling.
- Terminal-first workflow: fast commands and readable output.
- Open-source build-in-public: safety decisions, edge cases, runtime detectors, TUI polish.
- Future cloud later: only mention team visibility and remote server monitoring as optional future work.

Short-form formats:

- Terminal before/after: messy `~/Projects` to `kundol dashboard`.
- One command, one pain: `list --search`, `list --status stale`, `scan <project>`, `clean`.
- Safety proof: show `.env`, `.git`, and databases marked protected.
- Runtime audit: show missing or outdated tooling.
- Build-in-public micro devlog: explain why knowing what not to delete is the product.
- Founder/developer POV: screen plus voiceover, face cam optional.

Long-form video ideas:

- Launch demo: Cleaning up 100 local repos safely.
- Technical deep dive: How kundol decides what is safe to clean.
- Workflow demo: My terminal project inventory setup.
- Monthly maintainer devlog: roadmap, runtime audit, archive restore, duplicate detection, health score, and cloud/service validation.

Weekly production workflow:

- Capture real terminal sessions in a seeded demo workspace.
- Use a consistent high-contrast terminal theme and large readable font.
- Clip 3-5 shorts from one demo session.
- Narrate directly: what the command does and why it is safe.
- Add captions and first-frame titles.
- Publish to YouTube Shorts, Instagram Reels, and YouTube long-form.
- Measure retention, link clicks, stars, install attempts, and discussions.

## Launch Week Content Schedule

Day -3:

- Short: I found 42GB of cleanup candidates across old repos.
- Short: What `kundol index` finds in workspace folders.

Day -2:

- Short: Cleanup tools are scary. Here is what kundol refuses to delete.
- Devlog: safety model and dry-run default.

Day -1:

- Short: Search every local repo from the terminal.
- Teaser: dashboard reveal.

Launch day:

- Long YouTube demo: Cleaning Up Local Dev Projects Safely With kundol.
- Short: 20-second product overview.
- Short: `index` to `dashboard` to `scan <project>` to `clean`.
- CTA: GitHub repo, star, try, contribute runtime rules.

Day +1:

- Short: The most important feature is what kundol will not delete.
- Short: runtime audit demo.

Day +2:

- Short: Archive an inactive repo without losing the trail.
- Community prompt: What generated folders should kundol detect for your stack?

Day +3:

- Short: Top 5 stale repos on my machine.
- Clip: early feedback and roadmap.

Day +7:

- Recap: installs, stars, contributor asks.
- Video: What we learned from launch week.

## Content Assets

Prepare before launch:

- Seeded demo workspace with realistic repos.
- Terminal theme with high contrast and large font.
- Wordmark or simple logo.
- Command recordings for `index`, `dashboard`, `list --search`, `scan <project>`, `runtimes`, and `clean`.
- Horizontal demo video template.
- Vertical short-form template.
- First-frame title cards.
- Captions style.
- GitHub repo URL or short URL.
- Simple install snippet.
- Safety model graphic or terminal frame.
- Contributor prompt list for runtime detectors, cleanup candidates, protected paths, and terminal UI feedback.

## Future Business Model

The launch product is completely open source and free.

Future paid cloud services should be optional extensions, not the destination of the product.

Principles:

- The local OSS tool remains useful without an account.
- No hidden telemetry.
- No cloud sync unless explicitly configured.
- Safety-critical local cleanup is not paywalled.
- Paid features focus on collaboration, remote visibility, monitoring, and hosted infrastructure.
- Use open formats or export paths where practical.

Potential paid services:

- `kundol Cloud` for remote status.
- Team/project visibility across developer machines or workspaces.
- Cluster or fleet health views.
- Cloud server monitoring.
- Remote agents for project/runtime status.
- Alerts for stale projects, runtime drift, disk pressure, and server health.
- Historical trends and shared dashboards.

Suggested framing:

> kundol starts local and stays useful locally. Future cloud services will add team and remote visibility without changing the open-source tool's local-first foundation.

Avoid requiring login for normal CLI usage, locking local registry/search/dashboard behind cloud, moving safety policy to closed-source services, or surprise sync/analytics.

## Metrics

Track weekly for the first 90 days.

Repository metrics:

- Stars.
- Forks.
- Watchers.
- Unique visitors.
- Clones.
- Release downloads.
- Package downloads.
- Discussion posts.
- Issues opened/closed.
- PRs opened/merged.
- First-time contributors.

Product quality metrics:

- Install failure issues.
- Safety-related issues.
- Docs confusion issues.
- Command crash reports.
- False positive cleanup reports.
- Time from issue opened to first response.
- Time from PR opened to review.

Content metrics:

- YouTube retention at 30 seconds and 50%.
- Shorts/Reels 3-second hold rate.
- Average view duration on terminal-heavy clips.
- Profile and link clicks.
- GitHub stars from social launch window.
- GitHub traffic source attribution.
- Issues/discussions opened by new users.

North-star open-source metric for the first 90 days:

> Number of developers who successfully run `index`, `dashboard`, and `clean` and give feedback through GitHub issues or discussions.

## 30/60/90 Day Plan

### First 30 Days

Focus: trust, install success, safety confidence.

- Ship `v0.1.0`.
- Fix installation and smoke-test failures quickly.
- Improve README based on repeated questions.
- Expand safety docs.
- Add generated-file fixtures.
- Merge first small external contributions.
- Publish weekly patch releases if needed.
- Keep roadmap narrow and visible.

### Days 31-60

Focus: ecosystem coverage and contributor growth.

- Ship `v0.2.0` with polish and runtime coverage improvements.
- Add docs for common ecosystems.
- Improve issue triage labels and milestones.
- Add more examples and terminal screenshots.
- Turn common runtime support requests into contributor tasks.
- Track which cloud features users actually ask for.

### Days 61-90

Focus: retention, roadmap clarity, and future paid-service validation.

- Ship `v0.3.0` with one meaningful product expansion, such as git insights, restore workflow, or duplicate detection.
- Publish a public roadmap update.
- Summarize learnings from safety reports and runtime requests.
- Draft design notes for optional cloud services.
- Identify maintainership needs around triage, docs, fixtures, and release help.

## Launch Checklist

Pre-launch:

- Resolve final package/CLI name.
- Confirm README quickstart works on a clean machine.
- Run typecheck, lint, tests, and smoke commands.
- Verify dry-run examples do not mutate files.
- Add safety and privacy documentation.
- Add issue templates and PR template.
- Add license, code of conduct, and security policy.
- Add screenshots or terminal recordings.
- Open 5-10 starter issues.
- Create `v0.1.0` milestone.
- Prepare release notes.
- Pin launch discussion and roadmap.

Launch day:

- Publish GitHub release.
- Publish package if ready.
- Pin README demo.
- Open GitHub Discussion for dashboard/project-scan results.
- Ask early users to file runtime support gaps.
- Respond quickly to install failures and safety concerns.
- Keep a visible known issues list.

Post-launch week:

- Triage issues daily.
- Ship patch releases for install, docs, and safety bugs.
- Thank first contributors in release notes.
- Convert repeated questions into docs.
- Keep starter issues fresh.
