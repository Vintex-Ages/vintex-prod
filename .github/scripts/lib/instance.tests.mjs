import assert from "node:assert/strict";
import test from "node:test";
import { ensureRunning, stopInstance } from "./instance.mjs";

const ID = "i-0f4d2b7ed67661d09";
const REGION = "us-east-2";

// AWS falsa: cada chamada consome o próximo estado da instância.
function fakeAws({ states, statusOk = [true], online = [true] }) {
  const calls = [];
  const queue = { states: [...states], statusOk: [...statusOk], online: [...online] };
  const next = (list) => (list.length > 1 ? list.shift() : list[0]);
  const exec = (cmd, args) => {
    calls.push(args.slice(0, 2).join(" "));
    const op = args[1];
    if (op === "describe-instances") {
      return JSON.stringify({ Reservations: [{ Instances: [{ State: { Name: next(queue.states) } }] }] });
    }
    if (op === "describe-instance-status") {
      const ok = next(queue.statusOk) ? "ok" : "initializing";
      return JSON.stringify({ InstanceStatuses: [{ InstanceStatus: { Status: ok }, SystemStatus: { Status: ok } }] });
    }
    if (op === "describe-instance-information") {
      return JSON.stringify({ InstanceInformationList: [{ PingStatus: next(queue.online) ? "Online" : "ConnectionLost" }] });
    }
    return "{}";
  };
  return { exec, calls };
}

const fast = { sleep: async () => {}, pollSeconds: 0, maxPolls: 5 };

test("instância ligada não é reiniciada nem desligada depois", async () => {
  const { exec, calls } = fakeAws({ states: ["running"] });
  const result = await ensureRunning({ instanceId: ID, region: REGION, exec, ...fast });
  assert.deepEqual(result, { wasStopped: false });
  assert.ok(!calls.includes("ec2 start-instances"));
});

test("instância parada é ligada e espera status ok e SSM Online", async () => {
  const { exec, calls } = fakeAws({
    states: ["stopped", "pending", "running"],
    statusOk: [false, true],
    online: [false, true],
  });
  const result = await ensureRunning({ instanceId: ID, region: REGION, exec, ...fast });
  assert.deepEqual(result, { wasStopped: true });
  assert.equal(calls.filter((c) => c === "ec2 start-instances").length, 1);
  assert.ok(calls.lastIndexOf("ec2 describe-instance-status") > calls.indexOf("ec2 start-instances"));
  assert.equal(calls.at(-1), "ssm describe-instance-information");
});

test("desligando pelo Scheduler: espera parar e liga de novo", async () => {
  const { exec, calls } = fakeAws({ states: ["stopping", "stopping", "stopped", "running"] });
  const result = await ensureRunning({ instanceId: ID, region: REGION, exec, ...fast });
  assert.equal(result.wasStopped, true);
  assert.ok(calls.includes("ec2 start-instances"));
});

test("estado inesperado falha sem ligar", async () => {
  const { exec, calls } = fakeAws({ states: ["terminated"] });
  await assert.rejects(
    ensureRunning({ instanceId: ID, region: REGION, exec, ...fast }),
    /estado inesperado: terminated/,
  );
  assert.ok(!calls.includes("ec2 start-instances"));
});

test("SSM que nunca fica Online esgota o tempo", async () => {
  const { exec } = fakeAws({ states: ["running"], online: [false] });
  await assert.rejects(
    ensureRunning({ instanceId: ID, region: REGION, exec, ...fast }),
    /agente SSM/,
  );
});

test("instância e região inválidas são recusadas antes de chamar a AWS", async () => {
  const { exec, calls } = fakeAws({ states: ["running"] });
  await assert.rejects(ensureRunning({ instanceId: "x", region: REGION, exec, ...fast }));
  assert.throws(() => stopInstance({ instanceId: ID, region: "Ohio", exec }));
  assert.equal(calls.length, 0);
});

test("stop chama só stop-instances", () => {
  const { exec, calls } = fakeAws({ states: ["running"] });
  stopInstance({ instanceId: ID, region: REGION, exec });
  assert.deepEqual(calls, ["ec2 stop-instances"]);
});
