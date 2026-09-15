interface PackageVersionPolicy {
  engines?: { bun?: unknown };
  devDependencies?: { typescript?: unknown };
}

interface InstalledPackage {
  version?: unknown;
}

export interface VersionRanges {
  bun?: string;
  typescript?: string;
}

export interface ToolVersions {
  bun: string;
  typescript?: string;
}

export function checkToolVersions(versions: ToolVersions, ranges: VersionRanges): string[] {
  const problems: string[] = [];

  if (!ranges.bun) {
    problems.push("package.json engines.bun must declare a version range.");
  } else if (!Bun.semver.satisfies(versions.bun, ranges.bun)) {
    problems.push(`Bun ${versions.bun} does not satisfy engines.bun ${ranges.bun}.`);
  }

  if (!ranges.typescript) {
    problems.push("package.json devDependencies.typescript must declare a version range.");
  }
  if (!versions.typescript) {
    problems.push("Local TypeScript is missing from node_modules; run bun install.");
  } else if (ranges.typescript && !Bun.semver.satisfies(versions.typescript, ranges.typescript)) {
    problems.push(
      `TypeScript ${versions.typescript} does not satisfy devDependencies.typescript ${ranges.typescript}.`,
    );
  }

  return problems;
}

if (import.meta.main) {
  const projectPackage = (await Bun.file(new URL("../package.json", import.meta.url)).json()) as PackageVersionPolicy;
  const installedTypeScript = Bun.file(new URL("../node_modules/typescript/package.json", import.meta.url));
  const typeScriptPackage = (await installedTypeScript.exists())
    ? ((await installedTypeScript.json()) as InstalledPackage)
    : undefined;
  const versions: ToolVersions = {
    bun: Bun.version,
    ...(typeof typeScriptPackage?.version === "string" ? { typescript: typeScriptPackage.version } : {}),
  };
  const ranges: VersionRanges = {
    ...(typeof projectPackage.engines?.bun === "string" ? { bun: projectPackage.engines.bun } : {}),
    ...(typeof projectPackage.devDependencies?.typescript === "string"
      ? { typescript: projectPackage.devDependencies.typescript }
      : {}),
  };
  const problems = checkToolVersions(versions, ranges);

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exitCode = 1;
  } else {
    console.log(
      `Tool versions OK: Bun ${versions.bun} (${ranges.bun}), TypeScript ${versions.typescript} (${ranges.typescript}).`,
    );
  }
}
