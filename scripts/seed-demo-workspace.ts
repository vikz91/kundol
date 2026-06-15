#!/usr/bin/env bun

import { mkdir, writeFile, utimes } from "node:fs/promises";
import path from "node:path";

type FileSpec = {
  path: string;
  content?: string;
  bytes?: number;
};

type ProjectSpec = {
  name: string;
  kind: "node" | "python" | "go";
  description: string;
  files: FileSpec[];
  generated: FileSpec[];
  staleDays: number;
  gitRemote: string;
};

const ONE_MIB = 1024 * 1024;

const args = process.argv.slice(2);
const targetArg = args.find((arg) => !arg.startsWith("--"));
const showHelp = args.includes("--help") || args.includes("-h");

if (showHelp || !targetArg) {
  printHelp();
  process.exit(showHelp ? 0 : 1);
}

const targetRoot = path.resolve(targetArg);

const projects: ProjectSpec[] = [
  {
    name: "node-api-orders",
    kind: "node",
    description: "Express-style API with generated dependencies and dist output.",
    staleDays: 7,
    gitRemote: "git@github.com:demo/node-api-orders.git",
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: "node-api-orders",
            version: "0.1.0",
            type: "module",
            scripts: {
              dev: "node src/server.js",
              build: "tsc -p tsconfig.json",
            },
            dependencies: {
              express: "4.18.3",
              zod: "3.24.1",
            },
            devDependencies: {
              typescript: "5.5.4",
            },
          },
          null,
          2,
        ),
      },
      { path: "tsconfig.json", content: JSON.stringify({ compilerOptions: { strict: true } }, null, 2) },
      { path: "src/server.ts", content: "export function start() {\n  return 'orders api ready';\n}\n" },
      { path: ".env", content: "DATABASE_URL=postgres://example.invalid/orders\n" },
      { path: "README.md", content: "# node-api-orders\n\nDemo API project for kundol.\n" },
    ],
    generated: [
      { path: "node_modules/.cache/demo-dependency.bin", bytes: ONE_MIB },
      { path: "dist/server.js", bytes: 160 * 1024 },
      { path: "coverage/lcov.info", bytes: 96 * 1024 },
    ],
  },
  {
    name: "node-react-dashboard",
    kind: "node",
    description: "Frontend app with Vite-style build artifacts.",
    staleDays: 45,
    gitRemote: "git@github.com:demo/node-react-dashboard.git",
    files: [
      {
        path: "package.json",
        content: JSON.stringify(
          {
            name: "node-react-dashboard",
            version: "0.2.0",
            type: "module",
            scripts: {
              dev: "vite",
              build: "vite build",
            },
            dependencies: {
              "@vitejs/plugin-react": "latest",
              vite: "latest",
              react: "latest",
            },
          },
          null,
          2,
        ),
      },
      { path: "index.html", content: "<div id=\"root\"></div><script type=\"module\" src=\"/src/App.tsx\"></script>\n" },
      { path: "src/App.tsx", content: "export default function App() { return <main>Demo dashboard</main>; }\n" },
      { path: "vite.config.ts", content: "export default { server: { port: 5173 } };\n" },
    ],
    generated: [
      { path: "node_modules/.cache/react-demo.bin", bytes: ONE_MIB },
      { path: "dist/assets/index.js", bytes: 220 * 1024 },
      { path: ".vite/deps/chunk.bin", bytes: 128 * 1024 },
    ],
  },
  {
    name: "python-fastapi-service",
    kind: "python",
    description: "Python API with virtualenv and pycache artifacts.",
    staleDays: 120,
    gitRemote: "git@github.com:demo/python-fastapi-service.git",
    files: [
      { path: "pyproject.toml", content: "[project]\nname = \"python-fastapi-service\"\nversion = \"0.1.0\"\n" },
      { path: "requirements.txt", content: "fastapi==0.115.0\nuvicorn==0.30.0\n" },
      { path: "src/main.py", content: "def handler():\n    return {'ok': True}\n" },
      { path: "tests/test_main.py", content: "def test_handler():\n    assert True\n" },
      { path: ".env.local", content: "API_TOKEN=demo-secret\n" },
    ],
    generated: [
      { path: ".venv/lib/python3.12/site-packages/demo_package/payload.bin", bytes: ONE_MIB },
      { path: "src/__pycache__/main.cpython-312.pyc", bytes: 128 * 1024 },
      { path: ".pytest_cache/v/cache/nodeids", bytes: 64 * 1024 },
    ],
  },
  {
    name: "python-data-tools",
    kind: "python",
    description: "Python data utility with build and report artifacts.",
    staleDays: 300,
    gitRemote: "git@github.com:demo/python-data-tools.git",
    files: [
      { path: "requirements.txt", content: "pandas==2.2.2\nclick==8.1.7\n" },
      { path: "tools/report.py", content: "def build_report():\n    return 'report'\n" },
      { path: "README.md", content: "# python-data-tools\n\nDemo data tooling project.\n" },
    ],
    generated: [
      { path: ".venv/lib/python3.12/site-packages/pandas_demo/blob.bin", bytes: ONE_MIB },
      { path: "build/lib/report.py", bytes: 80 * 1024 },
      { path: "reports/monthly-export.csv", bytes: 256 * 1024 },
      { path: "local.sqlite", bytes: 192 * 1024 },
    ],
  },
  {
    name: "go-worker-queue",
    kind: "go",
    description: "Go worker service with generated binary and coverage output.",
    staleDays: 20,
    gitRemote: "git@github.com:demo/go-worker-queue.git",
    files: [
      { path: "go.mod", content: "module example.com/go-worker-queue\n\ngo 1.23\n" },
      { path: "cmd/worker/main.go", content: "package main\n\nfunc main() {\n\tprintln(\"worker ready\")\n}\n" },
      { path: "internal/queue/queue.go", content: "package queue\n\nfunc Name() string { return \"queue\" }\n" },
    ],
    generated: [
      { path: "bin/worker", bytes: ONE_MIB },
      { path: "coverage.out", bytes: 128 * 1024 },
    ],
  },
  {
    name: "go-cli-reporter",
    kind: "go",
    description: "Go CLI project with build artifacts and local output.",
    staleDays: 75,
    gitRemote: "git@github.com:demo/go-cli-reporter.git",
    files: [
      { path: "go.mod", content: "module example.com/go-cli-reporter\n\ngo 1.23\n" },
      { path: "main.go", content: "package main\n\nfunc main() {\n\tprintln(\"report\")\n}\n" },
      { path: "README.md", content: "# go-cli-reporter\n\nDemo CLI project for kundol.\n" },
    ],
    generated: [
      { path: "bin/reporter", bytes: ONE_MIB },
      { path: "tmp/report-cache.bin", bytes: 160 * 1024 },
      { path: "coverage.out", bytes: 64 * 1024 },
    ],
  },
];

await mkdir(targetRoot, { recursive: true });

for (const project of projects) {
  const projectRoot = path.join(targetRoot, project.name);
  await mkdir(projectRoot, { recursive: true });
  await writeProject(projectRoot, project);
}

await writeFile(
  path.join(targetRoot, "README.kundol-demo.md"),
  [
    "# kundol demo workspace",
    "",
    "This folder was generated by `scripts/seed-demo-workspace.ts`.",
    "",
    "Try:",
    "",
    "```bash",
    "kundol init --workspace .",
    "kundol index",
    "kundol dashboard",
    "kundol list",
    "kundol scan node-api-orders",
    "kundol clean node-api-orders",
    "```",
    "",
    "The generated dependency/build artifacts are fake binary files intended for local CLI testing.",
    "",
  ].join("\n"),
);

console.log(`Seeded ${projects.length} demo projects in ${targetRoot}`);
console.log("");
console.log("Try:");
console.log(`  kundol init --workspace ${shellQuote(targetRoot)}`);
console.log("  kundol index");
console.log("  kundol list");
console.log("  kundol scan node-api-orders");

async function writeProject(projectRoot: string, project: ProjectSpec) {
  for (const file of project.files) {
    await writeSpecFile(projectRoot, file);
  }

  for (const file of project.generated) {
    await writeSpecFile(projectRoot, file);
  }

  await writeFakeGitMetadata(projectRoot, project);
  await writeFile(
    path.join(projectRoot, ".kundol-demo.json"),
    JSON.stringify(
      {
        name: project.name,
        kind: project.kind,
        description: project.description,
        sourceBytesApprox: estimateSourceBytes(project.files),
        generatedBytesApprox: estimateGeneratedBytes(project.generated),
        note: "Source files are intentionally under 1MB; generated/dependency artifacts are around 1MB+.",
      },
      null,
      2,
    ),
  );

  const then = new Date(Date.now() - project.staleDays * 24 * 60 * 60 * 1000);
  await touchTree(projectRoot, then);
}

async function writeSpecFile(projectRoot: string, spec: FileSpec) {
  const fullPath = path.join(projectRoot, spec.path);
  await mkdir(path.dirname(fullPath), { recursive: true });

  if (spec.bytes !== undefined) {
    await writeFile(fullPath, makeBlob(spec.bytes, spec.path));
    return;
  }

  await writeFile(fullPath, spec.content ?? "");
}

async function writeFakeGitMetadata(projectRoot: string, project: ProjectSpec) {
  const gitRoot = path.join(projectRoot, ".git");
  await mkdir(path.join(gitRoot, "refs", "heads"), { recursive: true });
  await mkdir(path.join(gitRoot, "logs", "refs", "heads"), { recursive: true });

  const headSha = makeSha(project.name);
  await writeFile(path.join(gitRoot, "HEAD"), "ref: refs/heads/main\n");
  await writeFile(path.join(gitRoot, "refs", "heads", "main"), `${headSha}\n`);
  await writeFile(
    path.join(gitRoot, "config"),
    [
      "[core]",
      "\trepositoryformatversion = 0",
      "\tfilemode = true",
      "\tbare = false",
      "[remote \"origin\"]",
      `\turl = ${project.gitRemote}`,
      "\tfetch = +refs/heads/*:refs/remotes/origin/*",
      "[branch \"main\"]",
      "\tremote = origin",
      "\tmerge = refs/heads/main",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(gitRoot, "logs", "HEAD"), `${headSha} ${headSha} Demo <demo@example.com> 1700000000 +0000\tseed\n`);
  await writeFile(path.join(gitRoot, "logs", "refs", "heads", "main"), `${headSha} ${headSha} Demo <demo@example.com> 1700000000 +0000\tseed\n`);
  await writeFile(path.join(gitRoot, "index"), makeBlob(8 * 1024, `${project.name}-git-index`));
}

function makeBlob(size: number, label: string) {
  const chunk = Buffer.from(`kundol-demo:${label}\n`);
  const buffer = Buffer.alloc(size);
  for (let offset = 0; offset < size; offset += chunk.length) {
    chunk.copy(buffer, offset);
  }
  return buffer;
}

function makeSha(input: string) {
  let hex = "";
  for (let i = 0; i < 40; i += 1) {
    const code = input.charCodeAt(i % input.length) + i;
    hex += (code % 16).toString(16);
  }
  return hex;
}

function estimateSourceBytes(files: FileSpec[]) {
  return files.reduce((sum, file) => sum + Buffer.byteLength(file.content ?? ""), 0);
}

function estimateGeneratedBytes(files: FileSpec[]) {
  return files.reduce((sum, file) => sum + (file.bytes ?? Buffer.byteLength(file.content ?? "")), 0);
}

async function touchTree(root: string, date: Date) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await touchTree(fullPath, date);
    }
    await utimes(fullPath, date, date).catch(() => undefined);
  }

  await utimes(root, date, date).catch(() => undefined);
}

function shellQuote(value: string) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function printHelp() {
  console.log(`
Usage:
  bun run scripts/seed-demo-workspace.ts <target-folder>

Example:
  bun run scripts/seed-demo-workspace.ts /tmp/kundol-demo-workspace

Creates fake Node.js, Python, and Go projects with:
  - source files under 1MB per project
  - fake dependency/build artifacts around 1MB+ per project
  - fake .git metadata
  - runtime markers such as package.json, pyproject.toml, requirements.txt, and go.mod
`);
}
