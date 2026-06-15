import type { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import type { Clock } from "../../platform/clock";
import { toIsoDateTime } from "../../platform/clock";
import { normalizeConfiguredPath } from "./workspace-repository";

export interface Project {
  id: string;
  name: string;
  path: string;
  primaryRuntime: string | null;
  runtimes: string[];
  status: string;
  sizeBytes: number;
  cleanableBytes: number;
  gitRemoteUrl: string | null;
  gitBranch: string | null;
  gitDirty: boolean;
  notes: string | null;
  lastIndexedAt: string | null;
  lastScannedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertProjectInput {
  path: string;
  name?: string;
  primaryRuntime?: string | null;
  runtimes?: string[];
  status?: string;
  sizeBytes?: number;
  cleanableBytes?: number;
  gitRemoteUrl?: string | null;
  gitBranch?: string | null;
  gitDirty?: boolean;
  notes?: string | null;
  lastIndexedAt?: string | null;
  lastScannedAt?: string | null;
}

interface ProjectRow {
  id: string;
  name: string;
  path: string;
  primary_runtime: string | null;
  runtimes_json: string;
  status: string;
  size_bytes: number;
  cleanable_bytes: number;
  git_remote_url: string | null;
  git_branch: string | null;
  git_dirty: number;
  notes: string | null;
  last_indexed_at: string | null;
  last_scanned_at: string | null;
  created_at: string;
  updated_at: string;
}

export class ProjectRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  upsert(input: UpsertProjectInput): Project {
    const now = toIsoDateTime(this.clock.now());
    const path = normalizeConfiguredPath(input.path);
    const existing = this.db.query<ProjectRow, [string]>("SELECT * FROM projects WHERE path = ?").get(path);
    const name = input.name ?? basename(path);

    if (existing) {
      this.db
        .query(
          `UPDATE projects SET
            name = $name,
            primary_runtime = $primaryRuntime,
            runtimes_json = $runtimesJson,
            status = $status,
            size_bytes = $sizeBytes,
            cleanable_bytes = $cleanableBytes,
            git_remote_url = $gitRemoteUrl,
            git_branch = $gitBranch,
            git_dirty = $gitDirty,
            notes = $notes,
            last_indexed_at = $lastIndexedAt,
            last_scanned_at = $lastScannedAt,
            updated_at = $updatedAt
          WHERE id = $id`,
        )
        .run({
          $id: existing.id,
          $name: name,
          $primaryRuntime: input.primaryRuntime ?? existing.primary_runtime,
          $runtimesJson: JSON.stringify(input.runtimes ?? JSON.parse(existing.runtimes_json)),
          $status: input.status ?? existing.status,
          $sizeBytes: input.sizeBytes ?? existing.size_bytes,
          $cleanableBytes: input.cleanableBytes ?? existing.cleanable_bytes,
          $gitRemoteUrl: input.gitRemoteUrl ?? existing.git_remote_url,
          $gitBranch: input.gitBranch ?? existing.git_branch,
          $gitDirty: (input.gitDirty ?? existing.git_dirty === 1) ? 1 : 0,
          $notes: input.notes ?? existing.notes,
          $lastIndexedAt: input.lastIndexedAt ?? existing.last_indexed_at,
          $lastScannedAt: input.lastScannedAt ?? existing.last_scanned_at,
          $updatedAt: now,
        });
      return this.findById(existing.id)!;
    }

    const id = randomUUID();
    this.db
      .query(
        `INSERT INTO projects (
          id, name, path, primary_runtime, runtimes_json, status, size_bytes,
          cleanable_bytes, git_remote_url, git_branch, git_dirty, notes,
          last_indexed_at, last_scanned_at, created_at, updated_at
        ) VALUES (
          $id, $name, $path, $primaryRuntime, $runtimesJson, $status, $sizeBytes,
          $cleanableBytes, $gitRemoteUrl, $gitBranch, $gitDirty, $notes,
          $lastIndexedAt, $lastScannedAt, $createdAt, $updatedAt
        )`,
      )
      .run({
        $id: id,
        $name: name,
        $path: path,
        $primaryRuntime: input.primaryRuntime ?? null,
        $runtimesJson: JSON.stringify(input.runtimes ?? []),
        $status: input.status ?? "NEW",
        $sizeBytes: input.sizeBytes ?? 0,
        $cleanableBytes: input.cleanableBytes ?? 0,
        $gitRemoteUrl: input.gitRemoteUrl ?? null,
        $gitBranch: input.gitBranch ?? null,
        $gitDirty: input.gitDirty ? 1 : 0,
        $notes: input.notes ?? null,
        $lastIndexedAt: input.lastIndexedAt ?? null,
        $lastScannedAt: input.lastScannedAt ?? null,
        $createdAt: now,
        $updatedAt: now,
      });
    return this.findById(id)!;
  }

  findById(id: string): Project | null {
    const row = this.db.query<ProjectRow, [string]>("SELECT * FROM projects WHERE id = ?").get(id);
    return row ? mapProject(row) : null;
  }

  findByPath(path: string): Project | null {
    const row = this.db
      .query<ProjectRow, [string]>("SELECT * FROM projects WHERE path = ?")
      .get(normalizeConfiguredPath(path));
    return row ? mapProject(row) : null;
  }

  list(): Project[] {
    return this.db.query<ProjectRow, []>("SELECT * FROM projects ORDER BY name").all().map(mapProject);
  }
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    primaryRuntime: row.primary_runtime,
    runtimes: JSON.parse(row.runtimes_json) as string[],
    status: row.status,
    sizeBytes: row.size_bytes,
    cleanableBytes: row.cleanable_bytes,
    gitRemoteUrl: row.git_remote_url,
    gitBranch: row.git_branch,
    gitDirty: row.git_dirty === 1,
    notes: row.notes,
    lastIndexedAt: row.last_indexed_at,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
