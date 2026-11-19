// Avaliação da checagem do gateway de IA (FreeLLMAPI). Funções puras: o script que
// fala com a AWS fica em validate-llm-gateway.mjs e nunca recebe o valor da chave.

// Saída esperada do comando executado na EC2: "ping=<http> models=<http>".
export function parseProbeOutput(output) {
  const ping = /\bping=(\d{3}|000)\b/.exec(output)?.[1];
  const models = /\bmodels=(\d{3}|000)\b/.exec(output)?.[1];
  if (!ping || !models) return null;
  return { ping: Number(ping), models: Number(models) };
}

// Retorna { ok, level, messages }. `level`: "pass" | "inconclusive" | "fail".
export function evaluateProbe(probe) {
  if (!probe) {
    return {
      ok: false,
      level: "fail",
      messages: ["Saída da sonda inválida: ping/models ausentes."],
    };
  }
  const messages = [];
  if (probe.ping !== 200) {
    messages.push(`Gateway não respondeu em /api/ping (HTTP ${probe.ping}).`);
    return { ok: false, level: "fail", messages };
  }
  messages.push("Gateway saudável (/api/ping = 200).");
  if (probe.models === 200) {
    messages.push("Chave aceita pelo gateway (HTTP 200 na chamada autenticada).");
    return { ok: true, level: "pass", messages };
  }
  if (probe.models === 401 || probe.models === 403) {
    messages.push(`Chave REJEITADA pelo gateway (HTTP ${probe.models} na chamada autenticada).`);
    return { ok: false, level: "fail", messages };
  }
  if (probe.models === 404 || probe.models === 405) {
    messages.push(
      `/v1/models indisponível (HTTP ${probe.models}): chave NÃO validada. ` +
        "Defina LLM_PROBE_COMPLETION=true para validar com uma chamada mínima (consome cota).",
    );
    return { ok: true, level: "inconclusive", messages };
  }
  messages.push(`Resposta inesperada em /v1/models (HTTP ${probe.models}).`);
  return { ok: false, level: "fail", messages };
}
