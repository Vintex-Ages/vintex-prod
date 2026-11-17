import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProbe, parseProbeOutput } from "./llm-gateway.mjs";

test("parseProbeOutput lê os códigos HTTP da saída da EC2", () => {
  assert.deepEqual(parseProbeOutput("ping=200 models=200\n"), { ping: 200, models: 200 });
  assert.deepEqual(parseProbeOutput("ruído\nping=200 models=401"), { ping: 200, models: 401 });
  assert.deepEqual(parseProbeOutput("ping=000 models=000"), { ping: 0, models: 0 });
});

test("parseProbeOutput devolve null quando a saída não tem o formato esperado", () => {
  assert.equal(parseProbeOutput(""), null);
  assert.equal(parseProbeOutput("ping=200"), null);
  assert.equal(parseProbeOutput("models=200"), null);
});

test("chave aceita e gateway saudável passa", () => {
  const result = evaluateProbe({ ping: 200, models: 200 });
  assert.equal(result.level, "pass");
  assert.ok(result.ok);
});

test("chave rejeitada (401/403) reprova", () => {
  for (const models of [401, 403]) {
    const result = evaluateProbe({ ping: 200, models });
    assert.equal(result.level, "fail");
    assert.ok(!result.ok);
  }
});

test("gateway fora do ar reprova mesmo sem olhar a chave", () => {
  for (const ping of [0, 500, 502]) {
    const result = evaluateProbe({ ping, models: 200 });
    assert.equal(result.level, "fail");
  }
});

test("/v1/models ausente é inconclusivo e não finge validar a chave", () => {
  const result = evaluateProbe({ ping: 200, models: 404 });
  assert.equal(result.level, "inconclusive");
  assert.ok(result.ok);
  assert.match(result.messages.join(" "), /NÃO validada/);
});

test("resposta inesperada reprova", () => {
  assert.equal(evaluateProbe({ ping: 200, models: 500 }).level, "fail");
});

test("sonda ausente reprova", () => {
  assert.equal(evaluateProbe(null).level, "fail");
});
