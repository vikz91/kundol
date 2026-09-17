import { describe, expect, test } from "bun:test";
import { resolvePinnedDockerContextIdentity } from "../../src/services/optimisation-registry/docker-context-identity";
import type { DockerPinnedRunner } from "../../src/services/optimisation-registry/docker-stopped-containers";

function runnerFor(endpoint: string, daemonId: string): DockerPinnedRunner {
  return async (argv) => {
    const text = argv[1] === "context"
      ? JSON.stringify([{ Name: "sandbox", Endpoints: { docker: { Host: endpoint } } }])
      : JSON.stringify({ ID: daemonId });
    return { exitCode: 0, stdout: { text, truncated: false }, stderr: "" };
  };
}

describe("explicit Docker daemon identity", () => {
  test("pins endpoint and daemon while hiding local socket paths", async () => {
    const identity = await resolvePinnedDockerContextIdentity("sandbox", runnerFor("unix:///sandbox/private/docker.sock", "daemon-1"));
    expect(identity.ownerId).toMatch(/^docker:[a-f0-9]{64}$/);
    expect(identity.displayEndpoint).not.toContain("private");
    expect(identity.endpoint).toBe("unix:///sandbox/private/docker.sock");
  });

  test("redacts SSH user info and rejects changed context names", async () => {
    const identity = await resolvePinnedDockerContextIdentity("sandbox", runnerFor("ssh://person@host.example", "daemon-1"));
    expect(identity.displayEndpoint).not.toContain("person");
    await expect(resolvePinnedDockerContextIdentity("other", runnerFor("ssh://host.example", "daemon-1"))).rejects.toThrow("name changed");
  });

  test("rejects truncated daemon identity output", async () => {
    const runner: DockerPinnedRunner = async () => ({ exitCode: 0, stdout: { text: "{}", truncated: true }, stderr: "" });
    await expect(resolvePinnedDockerContextIdentity("sandbox", runner)).rejects.toThrow("truncated");
  });
});
