---
name: Bug report
about: Report a kundol CLI problem or unsafe cleanup candidate
title: "[Bug] "
labels: bug
assignees: ""
---

### What happened?

Include the command, expected result, and actual result. Redact local paths, usernames, and secrets from terminal output.

### Environment

macOS version, Bun version, kundol version or commit, and terminal/shell:

### Cleanup impact

Did any file or owner-tool cache change? If yes, list the exact affected target, the rule shown in the plan, and whether `-f` was used. Docker cleanup and startup changes are not part of the current CLI.

### Reproduction

Use a disposable workdir or temporary home where possible. Include the smallest steps needed to reproduce.
