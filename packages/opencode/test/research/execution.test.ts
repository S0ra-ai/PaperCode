import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { EventEmitter } from "node:events"
import * as childProcess from "node:child_process"
import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import {
  executeContainerExperiment,
  executeHostExperiment,
  loadExperimentProtocol,
  parseExperimentMetrics,
  selectContainerCommand,
} from "@/paper/research/experiments/execution"

const spec = { experiment_id: "baseline-a", role: "baseline", label: "A" }
afterEach(() => mock.restore())

describe("host argv execution", () => {
  test("missing commands produce a blocked execution result instead of an endpoint error", async () => {
    const result = await executeHostExperiment({ argv: [] }, process.cwd(), 1000)
    expect(result.exitCode).toBe(127)
    expect(result.execution).toBeUndefined()
    expect(result.stdout).toBe("")
  })

  test("resolves the Bun CLI rather than spawning a Windows npm command wrapper", async () => {
    const result = await executeHostExperiment(
      { argv: ["bun", "-e", "console.log(JSON.stringify(process.argv.slice(1)))", "argument with spaces", "$literal"] },
      process.cwd(),
      5000,
    )
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual(["argument with spaces", "$literal"])
  })
  test("preserves spaces and shell characters, cwd and explicit environment", async () => {
    await using tmp = await tmpdir()
    const result = await executeHostExperiment(
      {
        argv: [
          process.execPath,
          "-e",
          "console.log(JSON.stringify({args:process.argv.slice(1),cwd:process.cwd(),env:process.env.PAPERCODE_EXECUTION_TEST}))",
          "argument with spaces",
          "$PAPERCODE_EXECUTION_TEST",
        ],
        env: { PAPERCODE_EXECUTION_TEST: "fixture-value" },
      },
      tmp.path,
      5000,
    )
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
      args: ["argument with spaces", "$PAPERCODE_EXECUTION_TEST"],
      cwd: tmp.path,
      env: "fixture-value",
    })
    expect(result.stdoutBytes).toBe(Buffer.byteLength(result.stdout))
    expect(result.outputTruncated).toBe(false)
    expect(result.startedAt).toBeDefined()
    expect(result.finishedAt).toBeDefined()
  })

  test("counts every byte while bounding each output stream", async () => {
    const result = await executeHostExperiment(
      {
        argv: [
          process.execPath,
          "-e",
          "process.stdout.write('x'.repeat(100000)+'\\naccuracy=0.37\\n');process.stderr.write('y'.repeat(90000)+'\\nlast diagnostic\\n')",
        ],
      },
      process.cwd(),
      5000,
    )
    expect(result.exitCode).toBe(0)
    expect(result.stdoutBytes).toBe(100015)
    expect(result.stderrBytes).toBe(90017)
    expect(Buffer.byteLength(result.stdout)).toBe(65536)
    expect(Buffer.byteLength(result.stderr)).toBe(65536)
    expect(result.outputTruncated).toBe(true)
    expect(parseExperimentMetrics(result.stdout, spec, "accuracy")[0]?.value).toBe(0.37)
    expect(result.stderr.endsWith("\nlast diagnostic\n")).toBe(true)
  })
})

describe("explicit workspace experiment protocols", () => {
  test("missing differs from malformed and validates structured commands", async () => {
    await using tmp = await tmpdir()
    expect(await loadExperimentProtocol(tmp.path)).toBeUndefined()
    await mkdir(path.join(tmp.path, "experiments"))
    const filename = path.join(tmp.path, "experiments", "protocol.json")
    await writeFile(filename, "not json")
    await expect(loadExperimentProtocol(tmp.path)).rejects.toThrow("invalid JSON")
    const entry = {
      protocol_id: "baseline-a",
      role: "baseline",
      command: { argv: ["python", "evaluate.py"] },
      expected_metric: "accuracy",
    }
    await writeFile(filename, JSON.stringify({ schema_version: "ExperimentProtocol.v1", entries: [entry] }))
    expect((await loadExperimentProtocol(tmp.path))?.entries[0]?.label).toBe("baseline-a")
    await writeFile(
      filename,
      JSON.stringify({ schema_version: "ExperimentProtocol.v1", entries: [{ ...entry, command: { argv: [] } }] }),
    )
    await expect(loadExperimentProtocol(tmp.path)).rejects.toThrow("invalid command argv")
  })

  test("does not copy an unbound container script across experiments", () => {
    const generic = {
      protocol_id: "reproduce",
      role: "container_reproduction" as const,
      label: "Reproduce",
      rationale: "Explicit",
      expected_metric: "accuracy",
      command: { argv: ["docker", "run", "image"] },
    }
    const protocol = {
      schema_version: "ExperimentProtocol.v1" as const,
      discovered_from: "manifest" as const,
      entries: [generic],
      gaps: [],
    }
    expect(selectContainerCommand(protocol, spec)).toBeUndefined()
    expect(
      selectContainerCommand({ ...protocol, entries: [{ ...generic, target_experiment_id: spec.experiment_id }] }, spec)
        ?.argv,
    ).toEqual(generic.command.argv)
    const templated = { ...generic, command: { argv: ["docker", "run", "image", "--experiment={experiment_id}"] } }
    expect(selectContainerCommand({ ...protocol, entries: [templated] }, spec)?.argv.at(-1)).toBe(
      "--experiment=baseline-a",
    )
    expect(
      selectContainerCommand({ ...protocol, entries: [{ ...generic, target_experiment_id: "baseline-b" }] }, spec),
    ).toBeUndefined()
    expect(() =>
      selectContainerCommand({ ...protocol, entries: [templated, { ...templated, protocol_id: "second" }] }, spec),
    ).toThrow("Ambiguous")
  })
})

describe("observed experiment metrics", () => {
  test("retains scientific values including zero, negative and exponents", () => {
    expect(parseExperimentMetrics('PAPERCODE_METRICS {"accuracy":0}', spec, "accuracy")[0]?.value).toBe(0)
    expect(parseExperimentMetrics("loss=-1.2e-3", spec, "loss")[0]?.value).toBe(-0.0012)
    expect(parseExperimentMetrics('{"metrics":[{"name":"accuracy","value":0.37}]}', spec, "accuracy")[0]?.value).toBe(
      0.37,
    )
    expect(parseExperimentMetrics("process succeeded exit_code=0", spec, "accuracy")).toEqual([])
    expect(
      parseExperimentMetrics('{"experiment_id":"baseline-b","metrics":{"accuracy":0.9}}', spec, "accuracy"),
    ).toEqual([])
  })
})

describe("container execution provenance", () => {
  test("rejects scripts and namespace bypasses before spawning", async () => {
    for (const argv of [
      ["bun", "run", "repro:container"],
      ["docker run image"],
      ["docker", "run", "--privileged", "image"],
      ["docker", "run", "--net=host", "image"],
      ["podman", "run", "--pid", "host", "image"],
      ["docker", "run", "--cidfile", "external", "image"],
    ]) {
      const result = await executeContainerExperiment({ argv }, process.cwd(), 1000)
      expect(result.exitCode).toBe(2)
      expect(result.execution).toBeUndefined()
    }
  })

  test("verifies runtime inspection and removes only the observed container", async () => {
    const id = "a".repeat(64)
    const calls: string[][] = []
    let privileged = false
    const spy = spyOn(childProcess, "spawn").mockImplementation(((
      runtime: string,
      args: string[],
      options: { shell: boolean },
    ) => {
      expect(options.shell).toBe(false)
      calls.push([runtime, ...args])
      const child = new EventEmitter() as any
      child.stdout = new EventEmitter()
      child.stderr = new EventEmitter()
      child.kill = () => true
      queueMicrotask(async () => {
        if (args[0] === "run") {
          await writeFile(args[args.indexOf("--cidfile") + 1]!, id)
          child.stdout.emit("data", Buffer.from("accuracy=0.37\n"))
        }
        if (args[0] === "inspect")
          child.stdout.emit(
            "data",
            Buffer.from(
              JSON.stringify([
                {
                  Id: id,
                  Image: `sha256:${"b".repeat(64)}`,
                  State: { Running: false, ExitCode: 0 },
                  HostConfig: { Privileged: privileged, NetworkMode: "bridge", PidMode: "", IpcMode: "private" },
                },
              ]),
            ),
          )
        child.emit("close", 0)
      })
      return child
    }) as any)
    const result = await executeContainerExperiment(
      { argv: ["docker", "run", "--rm", "example:latest"] },
      process.cwd(),
      1000,
    )
    expect(result.execution?.container.container_id).toBe(id)
    expect(result.execution?.container.isolated).toBe(true)
    expect(calls[0]).not.toContain("--rm")
    expect(calls.at(-1)).toEqual(["docker", "rm", "-f", id])
    privileged = true
    const forged = await executeContainerExperiment({ argv: ["docker", "run", "example:latest"] }, process.cwd(), 1000)
    expect(forged.execution).toBeUndefined()
    spy.mockRestore()
  })
})
