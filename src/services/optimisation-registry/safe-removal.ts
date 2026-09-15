import path from "node:path";
import type { RegistryPathTarget } from "./types";

// Node/Bun do not expose descriptor-relative unlinkat/openat. This isolated
// helper uses Python's os.*(dir_fd=...) APIs and refuses to delete if the
// system interpreter or those APIs are unavailable. All path components are
// opened from / with O_NOFOLLOW, so a swapped ancestor cannot redirect a
// recursive removal through a symlink.
const PYTHON_CODE = String.raw`
import json
import os
import stat
import sys

def fail(message):
    raise RuntimeError(message)

required_dir_fd = (os.open, os.stat, os.unlink, os.rmdir)
if not all(function in os.supports_dir_fd for function in required_dir_fd):
    fail("descriptor-relative filesystem operations are unavailable")
if os.listdir not in os.supports_fd:
    fail("descriptor-based directory enumeration is unavailable")
if not hasattr(os, "O_DIRECTORY") or not hasattr(os, "O_NOFOLLOW"):
    fail("no-follow directory opens are unavailable")

payload = json.loads(sys.argv[1])
scope = payload["scopeRoot"]
target = payload["absolutePath"]
kind = payload["fileKind"]
if not isinstance(scope, str) or not isinstance(target, str) or kind not in ("file", "directory"):
    fail("invalid generated target")
if "\x00" in scope or "\x00" in target or not os.path.isabs(scope) or not os.path.isabs(target):
    fail("generated target paths must be absolute and contain no NUL")
if scope != os.path.normpath(scope) or target != os.path.normpath(target) or scope == os.sep:
    fail("generated target paths are not normalized or scope is filesystem root")
relative = os.path.relpath(target, scope)
if relative == "." or relative == ".." or relative.startswith(".." + os.sep):
    fail("generated target escapes its scope root")
segments = [entry for entry in relative.split(os.sep) if entry]
if not segments or any(entry in (".", "..") for entry in segments):
    fail("invalid generated target segment")

directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
file_flags = os.O_RDONLY | os.O_NOFOLLOW
expected_device = payload["device"]
expected_inode = payload["inode"]
if not isinstance(expected_device, int) or not isinstance(expected_inode, int):
    fail("invalid reviewed inode identity")

def open_component(parent_fd, name):
    return os.open(name, directory_flags, dir_fd=parent_fd)

def remove_contents(directory_fd, reviewed_device):
    for name in os.listdir(directory_fd):
        if name in (".", "..") or os.sep in name or "\x00" in name:
            fail("unsafe directory entry")
        # A directory entry can change after this stat. Opening with
        # O_NOFOLLOW prevents a replacement symlink from being traversed.
        info = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        if stat.S_ISDIR(info.st_mode):
            child_fd = open_component(directory_fd, name)
            try:
                child_info = os.fstat(child_fd)
                if child_info.st_dev != reviewed_device or child_info.st_ino != info.st_ino:
                    fail("generated child directory changed or crosses a filesystem")
                remove_contents(child_fd, reviewed_device)
            finally:
                os.close(child_fd)
            os.rmdir(name, dir_fd=directory_fd)
        elif stat.S_ISREG(info.st_mode):
            child_fd = os.open(name, file_flags, dir_fd=directory_fd)
            try:
                child_info = os.fstat(child_fd)
                if child_info.st_dev != reviewed_device or child_info.st_ino != info.st_ino:
                    fail("generated child file changed or crosses a filesystem")
            finally:
                os.close(child_fd)
            os.unlink(name, dir_fd=directory_fd)
        elif stat.S_ISLNK(info.st_mode):
            # Remove the link itself; never traverse its destination.
            os.unlink(name, dir_fd=directory_fd)
        else:
            fail("generated target contains a special file")

current_fd = os.open(os.sep, directory_flags)
try:
    for component in [entry for entry in scope.split(os.sep) if entry] + segments[:-1]:
        next_fd = open_component(current_fd, component)
        os.close(current_fd)
        current_fd = next_fd
    name = segments[-1]
    if kind == "directory":
        target_fd = open_component(current_fd, name)
        try:
            info = os.fstat(target_fd)
            if info.st_dev != expected_device or info.st_ino != expected_inode:
                fail("generated directory changed since review")
            remove_contents(target_fd, expected_device)
        finally:
            os.close(target_fd)
        os.rmdir(name, dir_fd=current_fd)
    else:
        target_fd = os.open(name, file_flags, dir_fd=current_fd)
        try:
            info = os.fstat(target_fd)
            if info.st_dev != expected_device or info.st_ino != expected_inode:
                fail("generated file changed since review")
        finally:
            os.close(target_fd)
        os.unlink(name, dir_fd=current_fd)
except Exception as error:
    print(type(error).__name__ + ": " + str(error), file=sys.stderr)
    sys.exit(1)
finally:
    os.close(current_fd)
`;

export interface SafeRemovalOptions {
  /** Tests can inject an absent interpreter to verify fail-closed behavior. */
  pythonExecutable?: string;
}

function reviewedCanonicalPaths(target: RegistryPathTarget): { absolutePath: string; scopeRoot: string } {
  if (!path.isAbsolute(target.absolutePath) || !path.isAbsolute(target.scopeRoot) || !path.isAbsolute(target.realPath) ||
    target.absolutePath !== path.resolve(target.absolutePath) || target.scopeRoot !== path.resolve(target.scopeRoot) ||
    target.realPath !== path.resolve(target.realPath)) {
    throw new Error("reviewed generated paths must be normalized absolute paths");
  }
  const relative = path.relative(target.scopeRoot, target.absolutePath);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("reviewed generated target escapes its scope root");
  }
  // `realPath` was captured during probe/review. Derive its matching root by
  // removing the same relative suffix instead of resolving a live pathname
  // here. This admits macOS's stable /var -> /private/var system alias while
  // leaving a subsequent ancestor swap to the Python O_NOFOLLOW walk.
  let canonicalScopeRoot = target.realPath;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    if (segment === "." || segment === "..") throw new Error("unsafe reviewed generated target segment");
    canonicalScopeRoot = path.dirname(canonicalScopeRoot);
  }
  if (path.resolve(canonicalScopeRoot, relative) !== target.realPath || canonicalScopeRoot === path.parse(canonicalScopeRoot).root) {
    throw new Error("reviewed real path does not match generated target scope");
  }
  return { absolutePath: target.realPath, scopeRoot: canonicalScopeRoot };
}

export async function removeGeneratedPathSafely(
  target: RegistryPathTarget,
  options: SafeRemovalOptions = {},
): Promise<void> {
  const executable = options.pythonExecutable ?? "/usr/bin/python3";
  if (!path.isAbsolute(executable)) throw new Error("secure removal interpreter must be an absolute path");
  const canonical = reviewedCanonicalPaths(target);
  const payload = JSON.stringify({
    absolutePath: canonical.absolutePath,
    scopeRoot: canonical.scopeRoot,
    fileKind: target.fileKind,
    device: target.device,
    inode: target.inode,
  });
  let process: ReturnType<typeof Bun.spawn>;
  try {
    process = Bun.spawn([executable, "-I", "-S", "-c", PYTHON_CODE, payload], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "pipe",
    });
  } catch (error) {
    throw new Error(`secure removal unavailable: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const stderrStream = process.stderr;
  if (!(stderrStream instanceof ReadableStream)) throw new Error("secure removal interpreter did not provide an error stream");
  const [exitCode, stderr] = await Promise.all([process.exited, new Response(stderrStream).text()]);
  if (exitCode !== 0) throw new Error(`secure removal refused target: ${stderr.trim() || `interpreter exited ${exitCode}`}`);
}
