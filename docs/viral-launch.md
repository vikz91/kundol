# Open-Source Launch Research

Created: 2026-06-13
Last updated: 2026-09-15
Related tasks: `KUN-055`, `KUN-056`, `KUN-092`

This page condenses earlier launch research into decisions useful for the [current kundol CLI](commands.md). The actionable checklist is in [launch.md](launch.md).

## Repeatable pattern

The examples studied—[uv](https://astral.sh/blog/uv), [Bun](https://bun.com/blog/bun-v1.0), [ripgrep](https://burntsushi.net/ripgrep/), and [Homebrew](https://github.com/Homebrew/brew)—support a practical pattern: make one developer pain easy to repeat, show proof in a short demo, simplify first use, then turn feedback into docs and contribution tasks. A maintainer's technical answers and visible fixes matter more than a large one-day attention spike. This is a synthesis of the cited examples, not a forecast of kundol adoption.

For kundol, show a plan for generated files in a chosen workdir, protected project data, and the result after confirmation. The [Docker trial](demo/docker-sandbox.md) lets a curious user try storage, project, and simulated startup flows before running anything against their Mac. Do not lead with removed project-indexing or dashboard flows, unimplemented `--dry-run` flags, or an unsourced reclaimed-space claim.

## Low-cost launch loop

1. Before launch, verify a fresh install and the Docker trial, prepare one readable terminal recording, and publish the [current safety limits](context.md#present-limits-and-documentation-precedence).
2. On launch day, send users to the GitHub README and answer install/safety questions promptly. Use community posts where the discussion fits; do not ask for artificial votes.
3. Over the following weeks, turn recurring questions into concise docs and small tests or fixtures. Reuse the same genuine command demo as a README example, short clip, and technical note.

Useful contributor requests are missing runtime markers, generated-file candidates, and protected-path edge cases. Ask for the exact path, ecosystem, expected classification, and a disposable reproducer.

## Copy boundary

A truthful one-liner is: “kundol plans storage and generated-project cleanup from your terminal and asks before applying it.” Startup disablement applies only to eligible macOS user LaunchAgents; `-f` skips the prompt. Project source and data are excluded from automatic project cleanup, Docker volumes are excluded from storage prune, and [other storage limits](context.md#storage-optimiser) remain material.

Show safety through the plan and tests rather than claiming the CLI can never delete something a user values. Keep any cloud, team, or monitoring pitch separate from the local tool until those capabilities exist.
