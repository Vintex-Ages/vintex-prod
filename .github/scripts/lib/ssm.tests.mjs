import assert from "node:assert/strict";
import test from "node:test";
import { exportLines, runShell } from "./ssm.mjs";

const base = { instanceId: "i-0123456789abcdef0", region: "us-east-2", script: "echo ok" };

function fakeExec(statuses) {
  const calls = [];
  let poll = 0;
  const exec = (command, args) => {
    calls.push(args);
    if (args[1] === "send-command") return JSON.stringify({ Command: { CommandId: "cmd-1" } });
    const status = statuses[Math.min(poll, statuses.length - 1)];
    poll += 1;
    if (status === "throw") throw new Error("InvocationDoesNotExist");
    return JSON.stringify({ Status: status, StandardOutputContent: "ping=200 models=200\n" });
  };
  return { exec, calls };
}

test("runShell espera a invocação sair de Pending/InProgress", async () => {
  const { exec, calls } = fakeExec(["throw", "Pending", "InProgress", "Success"]);
  const { commandId, invocation } = await runShell({ ...base, exec, sleep: async () => {} });
  assert.equal(commandId, "cmd-1");
  assert.equal(invocation.Status, "Success");
  assert.equal(calls.filter((args) => args[1] === "get-command-invocation").length, 4);
});

test("runShell devolve o status de falha sem lançar", async () => {
  const { exec } = fakeExec(["Failed"]);
  const { invocation } = await runShell({ ...base, exec, sleep: async () => {} });
  assert.equal(invocation.Status, "Failed");
});

test("runShell passa o script como um único comando e a região correta", async () => {
  const { exec, calls } = fakeExec(["Success"]);
  await runShell({ ...base, script: "echo a\necho b", exec, sleep: async () => {} });
  const send = calls[0];
  const parameters = JSON.parse(send[send.indexOf("--parameters") + 1]);
  assert.deepEqual(parameters.commands, ["echo a\necho b"]);
  assert.equal(send[send.indexOf("--region") + 1], "us-east-2");
});

test("runShell recusa instância ou região inválidas antes de chamar a AWS", async () => {
  const { exec, calls } = fakeExec(["Success"]);
  await assert.rejects(runShell({ ...base, instanceId: "i-xyz; rm -rf /", exec }), /inválido/);
  await assert.rejects(runShell({ ...base, region: "us-east-2; id", exec }), /inválida/);
  assert.equal(calls.length, 0);
});

test("exportLines só aceita nomes e valores simples", () => {
  assert.equal(exportLines({ SHA: "abc123", BUCKET: "vintex-releases" }), "export SHA='abc123'\nexport BUCKET='vintex-releases'");
  assert.throws(() => exportLines({ "bad name": "x" }), /Nome de variável inválido/);
  assert.throws(() => exportLines({ SHA: "x'; rm -rf /; '" }), /Valor inválido/);
  assert.throws(() => exportLines({ SHA: "$(id)" }), /Valor inválido/);
});
