import { describe, expect, test } from "bun:test";
import { dockerPinnedEnvironment, isPinnedDockerArgv } from "../../src/services/optimisation-registry/docker-pinned-runner";

describe("Docker context process isolation", () => {
  test("removes every ambient Docker override without changing the source environment", () => {
    const source = {
      HOME: "/sandbox/home", DOCKER_HOST: "tcp://wrong", DOCKER_CONTEXT: "wrong",
      DOCKER_CONFIG: "/sandbox/other", DOCKER_TLS_VERIFY: "1", PATH: "/bin",
    };
    expect(dockerPinnedEnvironment(source)).toEqual({ HOME: "/sandbox/home", PATH: "/bin" });
    expect(source.DOCKER_HOST).toBe("tcp://wrong");
  });

  test("allows only a named context handshake or commands pinned to that context", () => {
    expect(isPinnedDockerArgv(["docker", "context", "inspect", "sandbox"], "sandbox")).toBe(true);
    expect(isPinnedDockerArgv(["docker", "--context", "sandbox", "network", "ls"], "sandbox")).toBe(true);
    expect(isPinnedDockerArgv(["docker", "--context", "other", "network", "ls"], "sandbox")).toBe(false);
    expect(isPinnedDockerArgv(["docker", "context", "use", "sandbox"], "sandbox")).toBe(false);
    expect(isPinnedDockerArgv(["docker", "--context", "sandbox", "network", "ls\nrm"], "sandbox")).toBe(false);
  });
});
