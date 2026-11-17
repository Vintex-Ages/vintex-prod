import fs from "node:fs";
import { exportLines, runShell } from "./lib/ssm.mjs";

// Dispara o deploy na EC2 via SSM Run Command e espera o resultado. O script do host
// (deploy-host.sh) executa o procedimento do runtime de staging; aqui só se valida a
// entrada e se repassam variáveis simples. Nenhum segredo trafega por este caminho.

const region = process.env.AWS_REGION || "us-east-2";
const sha = process.env.RELEASE_SHA || "";
if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("RELEASE_SHA deve ser um SHA completo.");

if (!process.env.DEPLOY_BUCKET) throw new Error("DEPLOY_BUCKET ausente.");

const exports = exportLines({
  SHA: sha,
  DEPLOY_BUCKET: process.env.DEPLOY_BUCKET || "",
  DEPLOY_REGION: region,
  ...(process.env.DEPLOY_SCRIPT ? { DEPLOY_SCRIPT: process.env.DEPLOY_SCRIPT } : {}),
  ...(process.env.STATE_CONFIG ? { STATE_CONFIG: process.env.STATE_CONFIG } : {}),
});
const script = `${exports}\n${fs.readFileSync(new URL("./deploy-host.sh", import.meta.url), "utf8")}`;

const { invocation } = await runShell({
  instanceId: process.env.INSTANCE_ID,
  region,
  script,
  comment: `vintex deploy ${sha.slice(0, 7)}`,
  timeoutSeconds: 900,
  pollSeconds: 5,
  maxPolls: 190,
});

const status = invocation?.Status ?? "desconhecido";
if (invocation?.StandardOutputContent) console.log(invocation.StandardOutputContent);
if (status !== "Success") {
  if (invocation?.StandardErrorContent) console.error(invocation.StandardErrorContent);
  console.error(`::error::Deploy via SSM terminou com status ${status}.`);
  process.exit(1);
}
console.log(`Deploy ${sha.slice(0, 7)} concluído (SSM ${status}).`);
