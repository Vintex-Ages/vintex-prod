import fs from "node:fs";
import { evaluateProbe, parseProbeOutput } from "./lib/llm-gateway.mjs";
import { assertInstanceAndRegion, runShell } from "./lib/ssm.mjs";

// Valida o gateway de IA (FreeLLMAPI) e a chave da staging. O gateway só escuta em
// 127.0.0.1 da EC2, então a sonda roda lá via SSM Run Command. A chave é lida na própria
// EC2 (role da instância) e nunca chega ao runner nem aos logs: só saem códigos HTTP.

const region = process.env.AWS_REGION || "us-east-2";
const instanceId = process.env.STAGING_INSTANCE_ID;
const parameter = process.env.LLM_KEY_PARAMETER || "/vintex/staging/llm_api_key";
const probeCompletion = process.env.LLM_PROBE_COMPLETION === "true";

assertInstanceAndRegion({ instanceId, region });
if (!/^\/[A-Za-z0-9_./-]+$/.test(parameter)) {
  throw new Error("LLM_KEY_PARAMETER inválido.");
}

const script = [
  "set -eu",
  `TOKEN=$(aws ssm get-parameter --region ${region} --name ${parameter} --with-decryption --query Parameter.Value --output text)`,
  "BASE=http://127.0.0.1:3001",
  `PING=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$BASE/api/ping" || true)`,
  `MODELS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -H "Authorization: Bearer $TOKEN" "$BASE/v1/models" || true)`,
  ...(probeCompletion
    ? [
        `COMP=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"model":"auto","max_tokens":1,"messages":[{"role":"user","content":"ping"}]}' "$BASE/v1/chat/completions" || true)`,
        `if [ "$MODELS" = 404 ] || [ "$MODELS" = 405 ]; then MODELS=$COMP; fi`,
      ]
    : []),
  `echo "ping=$PING models=$MODELS"`,
].join("\n");

const { invocation } = await runShell({
  instanceId,
  region,
  script,
  comment: "vintex llm gateway check",
});

if (!invocation || invocation.Status !== "Success") {
  console.error(
    `::error::Sonda SSM terminou com status ${invocation?.Status ?? "desconhecido"}.`,
  );
  process.exit(1);
}

const result = evaluateProbe(parseProbeOutput(invocation.StandardOutputContent || ""));
for (const message of result.messages) console.log(message);

const summary = `### LLM key check\n\nResultado: **${result.level}**\n\n${result.messages
  .map((message) => `- ${message}`)
  .join("\n")}\n`;
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);

if (result.level === "inconclusive") console.log(`::warning::${result.messages.at(-1)}`);
if (!result.ok) {
  console.error(`::error::${result.messages.at(-1)}`);
  process.exit(1);
}
