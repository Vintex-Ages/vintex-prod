// Referências de issue em PRs do vintex-prod.
//
// O trabalho de front-end e back-end continua sendo planejado nas issues dos
// repositórios de origem. O PR pode fechar uma issue do próprio repositório
// (`Closes #12`) ou de um repositório permitido em
// config/governance/pr-automation.json (`Closes Vintex-Ages/front-end#426`).

const KEYWORD = String.raw`(?:Closes|Fixes|Resolves)`;
const REFERENCE = new RegExp(
  String.raw`\b${KEYWORD}\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)`,
  "gi",
);

export const refKey = ({ owner, repo, number }) =>
  `${owner}/${repo}#${number}`.toLowerCase();

export const formatRef = (ref, current) =>
  ref.owner.toLowerCase() === current.owner.toLowerCase() &&
  ref.repo.toLowerCase() === current.repo.toLowerCase()
    ? `#${ref.number}`
    : `${ref.owner}/${ref.repo}#${ref.number}`;

// Devolve as issues citadas com Closes/Fixes/Resolves, na ordem do corpo e sem
// duplicatas. `current` é o repositório do workflow ({ owner, repo }).
export function parseClosingRefs(body, current) {
  const seen = new Set();
  const refs = [];
  for (const match of (body || "").matchAll(REFERENCE)) {
    const [owner, repo] = match[1] ? match[1].split("/") : [current.owner, current.repo];
    const ref = { owner, repo, number: Number(match[2]) };
    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

// Repositórios cujas issues o PR pode citar: o próprio e os configurados.
export function allowedRepositories(config, current) {
  const own = `${current.owner}/${current.repo}`;
  const configured = config.issueRepositories || [];
  return new Set([own, ...configured].map((name) => name.toLowerCase()));
}

export const isAllowed = (ref, allowed) =>
  allowed.has(`${ref.owner}/${ref.repo}`.toLowerCase());

export const isLocal = (ref, current) =>
  ref.owner.toLowerCase() === current.owner.toLowerCase() &&
  ref.repo.toLowerCase() === current.repo.toLowerCase();
