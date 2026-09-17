import { describe, expect, test } from "bun:test";
import { homedir } from "node:os";
import { discoverDockerContexts, parseDockerContextNames } from "../../src/services/optimisation-registry/docker-context-discovery";

function output(text: string, truncated = false) { return { text, truncated }; }

describe("Docker context discovery", () => {
  test("parses bounded JSON lines in their original order", () => {
    expect(parseDockerContextNames(output('"desktop-linux"\r\n"default"\r\n"remote_1.test"\n')))
      .toEqual(["desktop-linux", "default", "remote_1.test"]);
    expect(parseDockerContextNames(output(""))).toEqual([]);
    expect(parseDockerContextNames(output(Array.from({ length: 256 }, (_, index) => JSON.stringify(`context-${index}`)).join("\n"))))
      .toHaveLength(256);
  });

  test("rejects incomplete, excessive, malformed and unsafe inventories", () => {
    const invalid = [
      output('"default"', true), output(" ".repeat(65_537)),
      output(Array.from({ length: 257 }, (_, index) => JSON.stringify(`context-${index}`)).join("\n")),
      ...['default', '{}', 'null', '123', '[]', '"default"\n"default"', '"default"\n\n"other"',
        '""', '"-option"', '"has space"', '"../escape"', '"line\\nbreak"', JSON.stringify("a".repeat(129))].map((text) => output(text)),
    ];
    for (const entry of invalid) expect(() => parseDockerContextNames(entry)).toThrow();
  });

  test("runs only local context listing from home with Docker overrides stripped", async () => {
    let calls = 0;
    const names = await discoverDockerContexts({ runner: async (argv, options) => {
      calls++;
      expect(argv).toEqual(["docker", "context", "ls", "--format", "{{json .Name}}"]);
      expect(options.cwd).toBe(homedir());
      expect(Object.keys(options.env).some((key) => key.startsWith("DOCKER_"))).toBe(false);
      expect(options.env.PATH).toBe(process.env.PATH);
      return { exitCode: 0, stdout: output('"default"\n"desktop-linux"\n') };
    } });
    expect(calls).toBe(1);
    expect(names).toEqual(["default", "desktop-linux"]);
  });

  test("returns empty only for successful empty inventory", async () => {
    expect(await discoverDockerContexts({ runner: async () => ({ exitCode: 0, stdout: output("") }) })).toEqual([]);
    for (const exitCode of [1, 124]) {
      await expect(discoverDockerContexts({ runner: async () => ({ exitCode, stdout: output('"default"') }) }))
        .rejects.toThrow("Docker context discovery failed");
    }
    await expect(discoverDockerContexts({ runner: async () => { throw new Error("secret endpoint credential"); } }))
      .rejects.toThrow(/^Docker context discovery is unavailable$/);
    await expect(discoverDockerContexts({ runner: async () => ({ exitCode: 0, stdout: output('"default"', true) }) }))
      .rejects.toThrow("output limit");
  });
});
