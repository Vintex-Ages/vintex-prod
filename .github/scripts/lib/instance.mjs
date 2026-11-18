import { execFileSync } from "node:child_process";
import { assertInstanceAndRegion } from "./ssm.mjs";

// Liga a EC2 da staging para o deploy e diz se ela estava parada, para o workflow
// desligá-la de novo no fim. Fora do horário (Scheduler) a instância fica parada.
// `exec` e `sleep` são injetáveis para teste, como em ssm.mjs.

const TRANSITIONS = new Set(["pending", "stopping", "shutting-down"]);

function client({ region, exec }) {
  return (args) =>
    JSON.parse(exec("aws", [...args, "--region", region, "--output", "json"], { encoding: "utf8" }));
}

export function instanceState(aws, instanceId) {
  const reply = aws(["ec2", "describe-instances", "--instance-ids", instanceId]);
  return reply.Reservations?.[0]?.Instances?.[0]?.State?.Name ?? "unknown";
}

function statusOk(aws, instanceId) {
  const reply = aws(["ec2", "describe-instance-status", "--instance-ids", instanceId]);
  const status = reply.InstanceStatuses?.[0];
  return status?.InstanceStatus?.Status === "ok" && status?.SystemStatus?.Status === "ok";
}

function ssmOnline(aws, instanceId) {
  const reply = aws([
    "ssm",
    "describe-instance-information",
    "--filters",
    `Key=InstanceIds,Values=${instanceId}`,
  ]);
  return reply.InstanceInformationList?.[0]?.PingStatus === "Online";
}

async function waitFor(check, { what, sleep, pollSeconds, maxPolls }) {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    if (check()) return;
    await sleep(pollSeconds * 1000);
  }
  throw new Error(`Tempo esgotado esperando ${what}.`);
}

export async function ensureRunning({
  instanceId,
  region,
  exec = execFileSync,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollSeconds = 10,
  maxPolls = 60,
  log = () => {},
}) {
  assertInstanceAndRegion({ instanceId, region });
  const aws = client({ region, exec });
  const wait = (check, what) => waitFor(check, { what, sleep, pollSeconds, maxPolls });

  let state = instanceState(aws, instanceId);
  log(`Estado inicial: ${state}.`);
  if (TRANSITIONS.has(state)) {
    // Termina a transição antes de decidir (o Scheduler pode estar desligando).
    await wait(() => {
      state = instanceState(aws, instanceId);
      return !TRANSITIONS.has(state);
    }, "o fim da transição da instância");
  }
  if (state !== "running" && state !== "stopped") {
    throw new Error(`Instância em estado inesperado: ${state}.`);
  }

  const wasStopped = state === "stopped";
  if (wasStopped) {
    log("Ligando a instância para o deploy.");
    aws(["ec2", "start-instances", "--instance-ids", instanceId]);
    await wait(() => instanceState(aws, instanceId) === "running", "a instância ligar");
    await wait(() => statusOk(aws, instanceId), "as verificações de status da EC2");
  }
  await wait(() => ssmOnline(aws, instanceId), "o agente SSM ficar Online");
  return { wasStopped };
}

export function stopInstance({ instanceId, region, exec = execFileSync }) {
  assertInstanceAndRegion({ instanceId, region });
  client({ region, exec })(["ec2", "stop-instances", "--instance-ids", instanceId]);
}
