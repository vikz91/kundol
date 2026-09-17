# Getting started

## Choose an installation method

| Method | Best for | Availability |
| --- | --- | --- |
| [Clone or download the source](#build-and-run-from-source) | Building locally or contributing | Available |
| [Download a release executable](#download-a-release-executable) | Running on macOS without installing Bun | Available for Apple Silicon and Intel Macs |
| [Install with Homebrew](#homebrew-coming-soon) | Package-manager installation and updates | Coming soon |

## Build and run from source

Install [Bun](https://bun.sh/docs/installation) 1.2 or newer. Get the code in either of these ways:

- **Clone the repository:**

```bash
git clone https://github.com/vikz91/kundol.git
cd kundol
```

- **Download the code:** download the [source ZIP](https://github.com/vikz91/kundol/archive/refs/heads/main.zip), extract it, and open a terminal in the extracted `kundol-main` directory.

From the repository directory, build and install the CLI:

```bash
bun run register:cli
export PATH="$HOME/.local/bin:$PATH"
kundol --help
kundol tools available
```

Every `register:cli` run reinstalls dependencies, builds a fresh universal macOS executable, and overwrites `~/.local/bin/kundol`. The installed command runs independently of Bun and this checkout. Run `bun run register:cli` again after updating the source to rebuild and replace the installed version.

Building requires macOS and Apple's Command Line Tools (`lipo` and `codesign`). The executable supports Apple Silicon and Intel Macs. The source on `main` may be newer than the latest release.

The installer prints PATH guidance but does not edit shell files. The `export` above applies to the current shell; add that same line to `~/.zshrc` (or your shell's configuration file) to keep it in future sessions.

For development, you can run directly from the checkout:

```bash
bun run dev -- --help
```

To build an executable without installing it, run `bun run build:release --outfile dist/kundol`, then `./dist/kundol --help`.

## Download a release executable

Open the [latest release](https://github.com/vikz91/kundol/releases/latest) and download **`kundol-macos-universal`** from **Assets**. This single file supports Apple Silicon and Intel Macs; Bun is bundled, so you do not need to install it separately.

Alternatively, download it from your terminal into a directory of your choice:

```bash
curl --fail --location \
  https://github.com/vikz91/kundol/releases/latest/download/kundol-macos-universal \
  --output kundol
chmod +x kundol
./kundol --version
./kundol --help
./kundol tools available
```

If you downloaded through your browser, rename `kundol-macos-universal` to `kundol` and run the commands starting with `chmod` from that download directory. The executable has an ad hoc signature, not Apple notarization, so macOS may show a download warning. Published executables are currently macOS-only.

## Homebrew coming soon

Homebrew installation is planned but is not available yet. Use the source or release-executable option above for now. The installation command will be added here when the tap and formula are ready.

## Run manual examples

The source installer makes `kundol` available once `~/.local/bin` is on your `PATH`. For other setups, substitute the command for your chosen method:

| Your setup | Example |
| --- | --- |
| Manually built from source, in the repository directory | `./dist/kundol tools available` |
| Downloaded release, in its download directory | `./kundol tools available` |
| Running source through Bun, in the repository directory | `bun run dev -- tools available` |

Generated-file deletion requires `/usr/bin/python3` with descriptor-based filesystem support. Owner-tool cache rules also require their corresponding tool, such as npm or pnpm.

## Try disposable projects

The sandbox requires a source checkout or extracted source ZIP, even if you normally use the release executable. With Docker running, build it from the repository root:

```bash
docker build -t kundol-demo:local .
docker run --rm -it --network none --cap-drop ALL --security-opt no-new-privileges kundol-demo:local
```

Inside the container:

```bash
kundol optimise projects /sandbox/projects
```

- Read the printed targets, actions, and safety tiers.
- Press Enter with a blank answer to cancel, enter `y` for safe suggestions, or enter displayed target numbers for explicit selection.
- Exit the container when finished. Starting a new container restores the disposable fixtures.

The example mounts no host projects or Docker socket. Building it leaves a Docker image on your machine.

## Choose a scope

| Goal | Command |
| --- | --- |
| Review owner-tool caches | `kundol optimise storage` |
| Review generated files under a workdir | `kundol optimise projects ~/Projects` |
| Use the equivalent repos route | `kundol optimise repos ~/Projects` |
| Inspect a named Docker context | `kundol optimise docker my-context` |
| Combine all scopes in one plan | `kundol optimise all --workdir ~/Projects --docker-context my-context` |

Replace example paths and context names with your own. `repos` does not require Git. Docker currently has no published resource cleanup rule; beta opt-in adds protected network and volume inventory only.

## Reuse your scopes

The first valid project directory is saved as an absolute canonical path in `~/.kundol/kundol.db`. Subsequent project or all-scope runs can omit it:

```bash
kundol optimise projects ~/Projects
kundol optimise projects
kundol optimise repos
```

For the first Docker or all-scope run, omit the context to discover installed Docker contexts. A sole context is selected automatically; if several exist, choose one from the numbered prompt. The context is saved only after its daemon identity validates. Later runs reuse it:

```bash
kundol optimise docker
kundol optimise all
```

Once defaults exist, explicit paths and contexts override them for that run only. To replace a default deliberately:

```bash
kundol optimise projects ~/Work --save-defaults
kundol optimise docker my-context --save-defaults
kundol optimise all --workdir ~/Work --docker-context my-context --save-defaults
```

Saved defaults are validated each run. A missing directory or unavailable Docker context fails clearly; Kundol does not silently select another. No installed/reachable Docker context means the Docker command fails before scanning and saves no Docker default. For non-interactive runs with several contexts and no default, supply `--docker-context` to `all` or the context argument to `docker`; `-f` does not choose a context.

Storage and project commands do not require Docker. Help and catalogue commands remain read-only.

## Find supported tools

```bash
kundol tools available
kundol tools search "pnpm"
kundol tools list --status beta
```

Catalogue commands do not run cleanup. Continue with [safety and selection](./safety.md), the [command reference](./reference/cli.md), or the [rule catalogue](./reference/rules.md).
