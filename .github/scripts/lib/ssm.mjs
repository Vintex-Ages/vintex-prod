import { execFileSync } from "node:child_process";

const INSTANCE_ID = /^i-[0-9a-f]{8,32}$/;
const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/;
const PENDING = new Set(["Pending", "InProgress", "Delayed"]);

export function assertInstanceAndRegion({ instanceId, region }) {
  if (!instanceId || !INSTANCE_ID.test(instanceId)) {
    throw new Error("STAGING_INSTANCE_ID ausente ou inválido.");
  }
  if (!REGION.test(region)) throw new Error("AWS_REGION inválida.");
}

// Executa um script de shell numa instância via SSM Run Command e espera terminar.
// `exec` e `sleep` são injetáveis para teste. Devolve a invocação do SSM (Status,
// StandardOutputContent, StandardErrorContent), sem lançar para status de falha.
export async function runShell({
  instanceId,
  region,
  script,
  comment = "vintex pipeline",
  timeoutSeconds = 90,
  pollSeconds = 4,
  maxPolls = 30,
  exec = execFileSync,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  assertInstanceAndRegion({ instanceId, region });
  const aws = (args) =>
    JSON.parse(exec("aws", [...args, "--region", region, "--output", "json"], { encoding: "utf8" }));

  const sent = aws([
    "ssm",
    "send-command",
    "--instance-ids",
    instanceId,
    "--document-name",
    "AWS-RunShellScript",
    "--comment",
    comment,
    "--parameters",
    JSON.stringify({ commands: [script], executionTimeout: [String(timeoutSeconds)] }),
    "--timeout-seconds",
    String(Math.max(30, timeoutSeconds)),
  ]);
  const commandId = sent.Command.CommandId;

  let invocation = null;
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    await sleep(pollSeconds * 1000);
    try {
      invocation = aws([
        "ssm",
        "get-command-invocation",
        "--command-id",
        commandId,
        "--instance-id",
        instanceId,
      ]);
    } catch {
      continue; // a invocação pode ainda não existir logo após o envio
    }
    if (!PENDING.has(invocation.Status)) break;
  }
  return { commandId, invocation };
}

// Aceita apenas valores simples para exportar ao script do host (sem aspas nem shell).
export function exportLines(values) {
  return Object.entries(values)
    .map(([key, value]) => {
      if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`Nome de variável inválido: ${key}`);
      if (!/^[A-Za-z0-9_./:@+=-]*$/.test(String(value))) {
        throw new Error(`Valor inválido para ${key}.`);
      }
      return `export ${key}='${value}'`;
    })
    .join("\n");
}
