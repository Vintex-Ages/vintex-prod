import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { classify, resolveMode } from "./lib/changes.mjs";

const config = JSON.parse(fs.readFileSync(".github/config/ci-paths.json", "utf8"));
const eventName = process.env.EVENT_NAME || "";
const baseRef = process.env.BASE_REF || "";
const baseSha = process.env.BASE_SHA || "";
const headSha = process.env.HEAD_SHA || "HEAD";

const mode = resolveMode({ eventName, baseRef }, config);

let files = [];
let diffFailed = false;
if (mode === "changed") {
  try {
    files = execFileSync("git", ["diff", "--name-only", `${baseSha}...${headSha}`], {
      encoding: "utf8",
    })
      .split("\n")
      .filter(Boolean);
  } catch {
    // Sem base comparável não dá para afirmar o que mudou: validar tudo é o lado seguro.
    diffFailed = true;
  }
}

const { flags, forceAll, frontEndScope } = classify({
  files,
  mode: diffFailed ? "all" : mode,
  config,
  exists: (path) => fs.existsSync(path),
  eventName,
  baseRef,
});

const outputs = {
  mode: diffFailed ? "all" : mode,
  force_all: String(forceAll || diffFailed),
  front_end_scope: diffFailed ? "all" : frontEndScope,
  base_sha: baseSha,
};
for (const [name, value] of Object.entries(flags)) {
  outputs[name.replaceAll("-", "_")] = String(value);
}

console.log(`Evento: ${eventName || "-"} | base: ${baseRef || "-"} | modo: ${outputs.mode}`);
console.log(`Arquivos alterados: ${files.length}${diffFailed ? " (diff indisponível, validando tudo)" : ""}`);
for (const [key, value] of Object.entries(outputs)) console.log(`  ${key}=${value}`);

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
  );
}
