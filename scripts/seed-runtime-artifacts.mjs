#!/usr/bin/env node

// Generates real owner-tool artifacts only inside the dedicated Docker seed image.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { lstat, mkdir, readdir, readFile, utimes, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = "/sandbox";
const HOME = path.join(ROOT, "home");
const PROJECTS = path.join(ROOT, "projects");
const MANIFEST = path.join(ROOT, "runtime-seed-manifest.json");
const MAX_OUTPUT = 64 * 1024;
const COMMAND_TIMEOUT_MS = 180_000;
const MAX_AGE_ENTRIES = 150_000;
const STALE_DAYS = 8;

const projectArtifacts = {
  "node-npm": ["node_modules/lodash/package.json", "dist/index.mjs", "package-lock.json"],
  "node-pnpm": ["node_modules/.pnpm", "dist/index.js", ".cache/tsconfig.tsbuildinfo", "pnpm-lock.yaml"],
  "java-maven": ["target/classes/seed/App.class", "target/test-classes/seed/AppTest.class"],
  "python-venv": [".venv/pyvenv.cfg", ".venv/lib", "src/__pycache__"],
  "go-module": ["go.sum", "bin/seed-go"],
  "dotnet-console": ["obj", "bin", "obj/project.assets.json"],
};

function requireDisposableContainer() {
  if (process.env.KUNDOL_RUNTIME_SEED_CONTAINER !== "1" || existsSync("/var/run/docker.sock") ||
    process.env.HOME !== HOME || process.env.TMPDIR !== path.join(ROOT, "tmp")) {
    throw new Error("The runtime seed may run only in its no-socket disposable Docker image");
  }
}

function ownerEnvironment() {
  const environment = {
    PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
    HOME,
    TMPDIR: path.join(ROOT, "tmp"),
    USER: "fixture",
    LANG: "C.UTF-8",
    DOTNET_CLI_HOME: HOME,
    DOTNET_CLI_TELEMETRY_OPTOUT: "1",
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1",
    NUGET_PACKAGES: path.join(HOME, ".nuget", "packages"),
    NUGET_HTTP_CACHE_PATH: path.join(HOME, ".nuget", "http-cache"),
    PIP_CACHE_DIR: path.join(HOME, ".cache", "pip"),
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    PIP_NO_INPUT: "1",
    GOPATH: path.join(HOME, "go"),
    GOCACHE: path.join(HOME, ".cache", "go-build"),
    GOPROXY: "https://proxy.golang.org",
    GOSUMDB: "sum.golang.org",
    npm_config_cache: path.join(HOME, ".npm"),
  };
  return environment;
}

async function command(label, argv, cwd, timeoutMs = COMMAND_TIMEOUT_MS) {
  const child = spawn(argv[0], argv.slice(1), {
    cwd,
    env: ownerEnvironment(),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let overflow = false;
  let timedOut = false;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      if (output.length + chunk.length > MAX_OUTPUT) {
        overflow = true;
        child.kill();
      } else output += chunk.toString("utf8");
    });
  }
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
  const exitCode = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  }).finally(() => clearTimeout(timer));
  if (timedOut || overflow || exitCode !== 0) {
    throw new Error(`${label} failed (${timedOut ? "timeout" : overflow ? "output budget" : `exit ${exitCode}`}); no owner output is exposed`);
  }
  return output.trim();
}

async function put(project, relative, content) {
  const destination = path.join(PROJECTS, project, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content);
}

async function seedNodeNpm() {
  const name = "node-npm";
  const cwd = path.join(PROJECTS, name);
  await put(name, "package.json", JSON.stringify({
    name: "seed-node-npm", version: "1.0.0", private: true, type: "module",
    scripts: { build: "node scripts/build.mjs" }, dependencies: { lodash: "4.17.21" },
  }, null, 2) + "\n");
  await put(name, "src/index.mjs", 'import lodash from "lodash";\nexport const name = lodash.camelCase("seed node npm");\n');
  await put(name, "scripts/build.mjs", 'import { copyFile, mkdir } from "node:fs/promises";\nawait mkdir("dist", {recursive:true});\nawait copyFile("src/index.mjs", "dist/index.mjs");\n');
  await put(name, "KEEP.user-data", "This user file must survive generated-artifact cleanup.\n");
  await command("npm dependency restore", ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"], cwd);
  await command("npm project build", ["npm", "run", "build"], cwd);
  await command("npm project dependency smoke", ["node", "-e", 'import("./dist/index.mjs").then(m => { if (m.name !== "seedNodeNpm") process.exit(1) })'], cwd);
}

async function seedNodePnpm() {
  const name = "node-pnpm";
  const cwd = path.join(PROJECTS, name);
  await put(name, "package.json", JSON.stringify({
    name: "seed-node-pnpm", version: "1.0.0", private: true, type: "module",
    scripts: { build: "tsc -p tsconfig.json" },
    dependencies: { zod: "3.24.1" }, devDependencies: { typescript: "5.9.3" },
  }, null, 2) + "\n");
  await put(name, "tsconfig.json", JSON.stringify({
    compilerOptions: { target: "ES2022", module: "ESNext", rootDir: "src", outDir: "dist",
      incremental: true, tsBuildInfoFile: "./.cache/tsconfig.tsbuildinfo", strict: true },
    include: ["src"],
  }, null, 2) + "\n");
  await put(name, "src/index.ts", 'export const seed = "pnpm and TypeScript";\n');
  await put(name, "KEEP.user-data", "This user file must survive generated-artifact cleanup.\n");
  await command("pnpm dependency restore", ["pnpm", "install", "--ignore-scripts", "--no-frozen-lockfile"], cwd);
  await command("pnpm TypeScript build", ["pnpm", "run", "build"], cwd);
}

async function seedJavaMaven() {
  const name = "java-maven";
  const cwd = path.join(PROJECTS, name);
  await put(name, "pom.xml", `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>
  <groupId>example.seed</groupId>
  <artifactId>seed-java-maven</artifactId>
  <version>1.0.0</version>
  <properties>
    <maven.compiler.source>17</maven.compiler.source>
    <maven.compiler.target>17</maven.compiler.target>
  </properties>
  <dependencies>
    <dependency>
      <groupId>junit</groupId><artifactId>junit</artifactId><version>4.13.2</version><scope>test</scope>
    </dependency>
  </dependencies>
</project>
`);
  await put(name, "src/main/java/seed/App.java", 'package seed;\npublic class App { public static String name() { return "seed-java-maven"; } }\n');
  await put(name, "src/test/java/seed/AppTest.java", 'package seed;\nimport org.junit.Test;\nimport static org.junit.Assert.assertEquals;\npublic class AppTest { @Test public void name() { assertEquals("seed-java-maven", App.name()); } }\n');
  await put(name, "KEEP.user-data", "This user file must survive generated-artifact cleanup.\n");
  await command("Maven dependency and class build", ["mvn", "-B", "-q", "-Dmaven.repo.local=/sandbox/home/.m2/repository", "test-compile"], cwd);
}

async function seedPython() {
  const name = "python-venv";
  const cwd = path.join(PROJECTS, name);
  await put(name, "pyproject.toml", '[project]\nname = "seed-python-venv"\nversion = "1.0.0"\n');
  await put(name, "requirements.txt", "requests==2.32.3\n");
  await put(name, "src/app.py", 'import requests\n\ndef version():\n    return requests.__version__\n');
  await put(name, "KEEP.user-data", "This user file must survive generated-artifact cleanup.\n");
  await command("Python virtual environment", ["python3", "-m", "venv", ".venv"], cwd);
  await command("Python dependency restore", [path.join(cwd, ".venv", "bin", "python"), "-m", "pip", "install", "-r", "requirements.txt"], cwd);
  await command("Python bytecode build", [path.join(cwd, ".venv", "bin", "python"), "-m", "compileall", "-q", "src"], cwd);
  await command("Python dependency smoke", [path.join(cwd, ".venv", "bin", "python"), "-c", "import requests; assert requests.__version__ == '2.32.3'"], cwd);
}

async function seedGo() {
  const name = "go-module";
  const cwd = path.join(PROJECTS, name);
  await put(name, "go.mod", "module example.com/seed-go\n\ngo 1.22\n\nrequire github.com/google/uuid v1.6.0\n");
  await put(name, "main.go", 'package main\nimport ("fmt"; "github.com/google/uuid")\nfunc main() { fmt.Println(uuid.NewString()) }\n');
  await put(name, "KEEP.user-data", "This user file must survive generated-artifact cleanup.\n");
  await command("Go module restore", ["go", "mod", "tidy"], cwd);
  await mkdir(path.join(cwd, "bin"));
  await command("Go binary build", ["go", "build", "-o", "bin/seed-go", "."], cwd);
  await command("Go test cache seed", ["go", "test", "./..."], cwd);
}

async function seedDotnet() {
  const name = "dotnet-console";
  const cwd = path.join(PROJECTS, name);
  await put(name, "SeedDotnet.csproj", `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net10.0</TargetFramework></PropertyGroup>
  <ItemGroup><PackageReference Include="Newtonsoft.Json" Version="13.0.3" /></ItemGroup>
</Project>
`);
  await put(name, "Program.cs", 'using System;\nusing Newtonsoft.Json;\nConsole.WriteLine(JsonConvert.SerializeObject(new { seed = "dotnet" }));\n');
  await put(name, "KEEP.user-data", "This user file must survive generated-artifact cleanup.\n");
  await command("NuGet dependency restore", ["dotnet", "restore", "SeedDotnet.csproj"], cwd);
  await command(".NET project build", ["dotnet", "build", "SeedDotnet.csproj", "--no-restore", "--configuration", "Debug"], cwd);
}

async function ageTree(root, date, budget) {
  const info = await lstat(root);
  if (info.isSymbolicLink()) return;
  if (++budget.count > MAX_AGE_ENTRIES) throw new Error("Seed artifact activity aging exceeded its entry bound");
  if (info.isDirectory()) {
    for (const name of await readdir(root)) await ageTree(path.join(root, name), date, budget);
  }
  await utimes(root, date, date);
}

async function verify() {
  requireDisposableContainer();
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  if (manifest.staleDays !== STALE_DAYS || JSON.stringify(manifest.artifacts) !== JSON.stringify(projectArtifacts)) {
    throw new Error("Seed manifest does not match the code-owned artifact plan");
  }
  if (Object.values(manifest.versions ?? {}).length !== 8 ||
    Object.values(manifest.versions).some((version) => typeof version !== "string" || /[\u0000-\u001f\u007f]/.test(version))) {
    throw new Error("Seed runtime versions are incomplete or contain control characters");
  }
  const pnpmStore = manifest.cachePaths?.pnpmStore;
  if (typeof pnpmStore !== "string" || !pnpmStore.startsWith(`${HOME}${path.sep}`) ||
    !(await lstat(pnpmStore)).isDirectory() || (await readdir(pnpmStore)).length === 0) {
    throw new Error("PNPM store is absent or outside the disposable home");
  }
  for (const [project, artifacts] of Object.entries(projectArtifacts)) {
    for (const artifact of artifacts) {
      const absolutePath = path.join(PROJECTS, project, artifact);
      await lstat(absolutePath);
    }
    await lstat(path.join(PROJECTS, project, "KEEP.user-data"));
  }
  for (const cache of [".npm", ".m2/repository", ".cache/pip", ".cache/go-build", "go/pkg/mod", ".nuget/packages", ".nuget/http-cache"]) {
    const info = await lstat(path.join(HOME, cache));
    if (!info.isDirectory() || (await readdir(path.join(HOME, cache))).length === 0) {
      throw new Error(`Expected real owner cache is empty: ${cache}`);
    }
  }
  console.log("Six owner-built runtime projects and their sandboxed caches verified; no cleanup ran.");
}

async function seed() {
  requireDisposableContainer();
  await mkdir(HOME, { recursive: true });
  await mkdir(PROJECTS, { recursive: true });
  if ((await readdir(PROJECTS)).length !== 0) throw new Error("Seed project root must be empty");
  await seedNodeNpm();
  await seedNodePnpm();
  await seedJavaMaven();
  await seedPython();
  await seedGo();
  await seedDotnet();
  const versions = {};
  for (const [name, argv] of Object.entries({
    node: ["node", "--version"], npm: ["npm", "--version"], pnpm: ["pnpm", "--version"],
    java: ["java", "--version"], maven: ["mvn", "--version"], python: ["python3", "--version"],
    go: ["go", "version"], dotnet: ["dotnet", "--version"],
  })) versions[name] = (await command(`${name} version`, argv, ROOT, 15_000)).split("\n")[0]
    .replace(/\u001b\[[0-9;]*m/g, "");
  const pnpmStore = await command("pnpm store path", ["pnpm", "store", "path"], path.join(PROJECTS, "node-pnpm"), 15_000);
  if (!pnpmStore.startsWith(`${HOME}${path.sep}`)) throw new Error("PNPM store path escaped the disposable home");
  await ageTree(PROJECTS, new Date(Date.now() - STALE_DAYS * 86_400_000), { count: 0 });
  await ageTree(HOME, new Date(Date.now() - STALE_DAYS * 86_400_000), { count: 0 });
  const cachePaths = {
    npm: path.join(HOME, ".npm"), pnpmStore,
    maven: path.join(HOME, ".m2", "repository"), pip: path.join(HOME, ".cache", "pip"),
    goBuild: path.join(HOME, ".cache", "go-build"), goModules: path.join(HOME, "go", "pkg", "mod"),
    nugetPackages: path.join(HOME, ".nuget", "packages"), nugetHttp: path.join(HOME, ".nuget", "http-cache"),
  };
  await writeFile(MANIFEST, JSON.stringify({ staleDays: STALE_DAYS, artifacts: projectArtifacts, cachePaths, versions }, null, 2) + "\n");
  await verify();
}

if (process.argv.length !== 3 || !["--seed", "--verify"].includes(process.argv[2])) {
  console.error("Usage: seed-runtime-artifacts.mjs --seed|--verify (Docker seed image only)");
  process.exitCode = 2;
} else if (process.argv[2] === "--seed") await seed();
else await verify();
