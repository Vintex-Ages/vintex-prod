import fs from "node:fs";
import { ensureRunning, stopInstance } from "./lib/instance.mjs";

// Uso no workflow:
//   node ensure-instance.mjs start   -> liga se preciso; grava was_stopped no GITHUB_OUTPUT
//   node ensure-instance.mjs stop    -> desliga (só chamado quando was_stopped=true)

const instanceId = process.env.INSTANCE_ID;
const region = process.env.AWS_REGION || "us-east-2";
const mode = process.argv[2];

if (mode === "start") {
  const { wasStopped } = await ensureRunning({ instanceId, region, log: console.log });
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `was_stopped=${wasStopped}\n`);
  }
  console.log(wasStopped ? "Instância ligada para o deploy." : "Instância já estava ligada.");
} else if (mode === "stop") {
  stopInstance({ instanceId, region });
  console.log("Instância desligada de novo (estava parada antes do deploy).");
} else {
  console.error("Use: ensure-instance.mjs start|stop");
  process.exit(2);
}
