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

From the repository directory, install dependencies and build the executable. For a ZIP download, use `HUSKY=0 bun install --frozen-lockfile` for the first command to skip Git-only development hooks.

```bash
bun install --frozen-lockfile
bun run build:release --outfile dist/kundol
./dist/kundol --version
./dist/kundol --help
./dist/kundol tools available
```

The release build requires macOS with Apple's Command Line Tools (`lipo` and `codesign`). It produces one executable for both Apple Silicon and Intel Macs, with Bun included. The source on `main` may be newer than the latest release.

You can also run directly from the checkout without compiling an executable:

```bash
bun run dev -- --help
bun run dev -- tools available
```

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

This manual uses `kundol` for brevity. Until you place the executable in a directory on your `PATH`, substitute the command for your chosen method:

| Your setup | Example |
| --- | --- |
| Built from source, in the repository directory | `./dist/kundol tools available` |
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

Replace example paths and context names with your own. `all` requires both scopes explicitly. `repos` does not require Git. Docker currently has no published resource cleanup rule; beta opt-in adds protected network and volume inventory only.

## Find supported tools

```bash
kundol tools available
kundol tools search "pnpm"
kundol tools list --status beta
```

Catalogue commands do not run cleanup. Continue with [safety and selection](./safety.md), the [command reference](./reference/cli.md), or the [rule catalogue](./reference/rules.md).
