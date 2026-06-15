import { createReadStream, createWriteStream } from "node:fs";
import { lstat, mkdir, readdir, readlink, stat } from "node:fs/promises";
import { basename, join, relative, resolve } from "node:path";
import { once } from "node:events";
import { createGzip, type Gzip } from "node:zlib";

export interface ProjectArchivePlan {
  eligible: boolean;
  thresholdDays: number;
  ageDays: number;
  lastOpenedAt: string;
}

export interface ProjectArchiveResult extends ProjectArchivePlan {
  archivePath: string;
  archiveSizeBytes: number;
}

const blockSize = 512;

export async function getProjectArchivePlan(
  projectPath: string,
  thresholdDays: number,
  now: Date = new Date(),
): Promise<ProjectArchivePlan> {
  const projectStat = await stat(projectPath);
  const lastOpenedMs = Math.max(projectStat.atimeMs, projectStat.mtimeMs);
  const ageDays = Math.max(0, (now.getTime() - lastOpenedMs) / 86_400_000);
  return {
    eligible: ageDays > thresholdDays,
    thresholdDays,
    ageDays,
    lastOpenedAt: new Date(lastOpenedMs).toISOString(),
  };
}

export async function archiveProjectFolder(input: {
  projectPath: string;
  projectName: string;
  archiveRoot: string;
  thresholdDays: number;
  now?: Date;
}): Promise<ProjectArchiveResult | null> {
  const now = input.now ?? new Date();
  const plan = await getProjectArchivePlan(input.projectPath, input.thresholdDays, now);
  if (!plan.eligible) return null;

  await mkdir(input.archiveRoot, { recursive: true });
  const archivePath = join(
    input.archiveRoot,
    `${safeArchiveName(input.projectName)}-${now.toISOString().replace(/[:.]/g, "-")}.tar.gz`,
  );
  await writeTarGz(input.projectPath, archivePath);
  const archiveStat = await stat(archivePath);

  return {
    ...plan,
    archivePath,
    archiveSizeBytes: archiveStat.size,
  };
}

async function writeTarGz(sourceRoot: string, archivePath: string): Promise<void> {
  const absoluteRoot = resolve(sourceRoot);
  const output = createWriteStream(archivePath, { flags: "wx" });
  const gzip = createGzip();
  gzip.pipe(output);

  try {
    await appendPath(gzip, absoluteRoot, absoluteRoot, basename(absoluteRoot));
    await writeGzip(gzip, Buffer.alloc(blockSize * 2));
    gzip.end();
    await once(output, "finish");
  } catch (error) {
    gzip.destroy();
    output.destroy();
    throw error;
  }
}

async function appendPath(gzip: Gzip, absoluteRoot: string, absolutePath: string, archivePath: string): Promise<void> {
  const entryStat = await lstat(absolutePath);
  const relativeToRoot = relative(absoluteRoot, absolutePath);
  if (relativeToRoot.startsWith("..")) return;

  if (entryStat.isDirectory()) {
    const directoryName = archivePath.endsWith("/") ? archivePath : `${archivePath}/`;
    await writeGzip(gzip, tarHeader({ name: directoryName, mode: 0o755, size: 0, mtime: entryStat.mtime, typeflag: "5" }));
    const entries = await readdir(absolutePath, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      await appendPath(gzip, absoluteRoot, join(absolutePath, entry.name), `${archivePath}/${entry.name}`);
    }
    return;
  }

  if (entryStat.isSymbolicLink()) {
    const target = await readlink(absolutePath);
    await writeGzip(gzip, tarHeader({ name: archivePath, mode: 0o777, size: 0, mtime: entryStat.mtime, typeflag: "2", linkname: target }));
    return;
  }

  if (!entryStat.isFile()) return;

  await writeGzip(gzip, tarHeader({ name: archivePath, mode: 0o644, size: entryStat.size, mtime: entryStat.mtime, typeflag: "0" }));
  for await (const chunk of createReadStream(absolutePath)) {
    await writeGzip(gzip, chunk as Buffer);
  }
  const padding = (blockSize - (entryStat.size % blockSize)) % blockSize;
  if (padding > 0) await writeGzip(gzip, Buffer.alloc(padding));
}

async function writeGzip(gzip: Gzip, chunk: Buffer): Promise<void> {
  if (!gzip.write(chunk)) {
    await once(gzip, "drain");
  }
}

function tarHeader(input: {
  name: string;
  mode: number;
  size: number;
  mtime: Date;
  typeflag: "0" | "2" | "5";
  linkname?: string;
}): Buffer {
  const header = Buffer.alloc(blockSize);
  const { name, prefix } = splitTarName(input.name);
  writeString(header, name, 0, 100);
  writeOctal(header, input.mode, 100, 8);
  writeOctal(header, 0, 108, 8);
  writeOctal(header, 0, 116, 8);
  writeOctal(header, input.size, 124, 12);
  writeOctal(header, Math.floor(input.mtime.getTime() / 1000), 136, 12);
  header.fill(" ", 148, 156);
  writeString(header, input.typeflag, 156, 1);
  writeString(header, input.linkname ?? "", 157, 100);
  writeString(header, "ustar", 257, 6);
  writeString(header, "00", 263, 2);
  writeString(header, prefix, 345, 155);

  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeOctal(header, checksum, 148, 8);
  return header;
}

function splitTarName(value: string): { name: string; prefix: string } {
  const normalized = value.replace(/^\/+/, "");
  if (Buffer.byteLength(normalized) <= 100) return { name: normalized, prefix: "" };

  const parts = normalized.split("/");
  const name = parts.pop() ?? normalized;
  const prefix = parts.join("/");
  if (Buffer.byteLength(name) > 100 || Buffer.byteLength(prefix) > 155) {
    throw new Error(`Archive path is too long for ustar: ${value}`);
  }
  return { name, prefix };
}

function writeString(buffer: Buffer, value: string, offset: number, length: number): void {
  buffer.write(value, offset, length, "utf8");
}

function writeOctal(buffer: Buffer, value: number, offset: number, length: number): void {
  const octal = value.toString(8).padStart(length - 1, "0");
  buffer.write(`${octal}\0`, offset, length, "ascii");
}

function safeArchiveName(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "project";
}
