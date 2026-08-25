import fs from "node:fs";

const event = JSON.parse(
  fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
);
const pr = event.pull_request;
const token = process.env.GITHUB_TOKEN;
const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");
const errors = [];
const base = pr.base.ref;
const head = pr.head.ref;
const promotionMatch = head.match(
  /^promote\/(front-end|back-end)-([0-9a-f]{7})$/,
);
const workBranch =
  /^(feature|bugfix|hotfix|refactor|docs|chore)\/[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
    head,
  );

if (base === "main" && head !== "develop")
  errors.push("main aceita somente Pull Requests de develop.");
if (base === "develop" && !promotionMatch && !workBranch)
  errors.push(
    `Branch ${head} não é uma promoção nem uma branch de trabalho válida.`,
  );
if (!["main", "develop"].includes(base))
  errors.push(`Base ${base} não é permitida.`);

const api = async (path) => {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok)
    throw new Error(`GET ${path}: ${response.status} ${await response.text()}`);
  return response.json();
};

if (promotionMatch) {
  const component = promotionMatch[1];
  const files = await api(
    `/repos/${owner}/${repo}/pulls/${pr.number}/files?per_page=100`,
  );
  const expected = `components/${component}/release.yml`;
  const changed = files.map((file) => file.filename);
  if (changed.length !== 1 || changed[0] !== expected)
    errors.push(`A promoção deve alterar exclusivamente ${expected}.`);

  const response = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(head)}/${expected}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) errors.push(`Não foi possível ler ${expected}.`);
  else {
    const manifest = Object.fromEntries(
      (await response.text())
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split(/:\s+/, 2)),
    );
    const expectedRepo = `Vintex-Ages/${component}`;
    if (manifest.component !== component)
      errors.push("component não corresponde à branch.");
    if (manifest.source_repository !== expectedRepo)
      errors.push(`source_repository deve ser ${expectedRepo}.`);
    if (manifest.source_branch !== "deploy")
      errors.push("source_branch deve ser deploy.");
    if (!/^[0-9a-f]{40}$/.test(manifest.source_sha || ""))
      errors.push("source_sha deve ser um SHA completo.");
    if (/^[0-9a-f]{40}$/.test(manifest.source_sha || "")) {
      const commitResponse = await fetch(
        `https://api.github.com/repos/${expectedRepo}/commits/${manifest.source_sha}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
          },
        },
      );
      if (!commitResponse.ok)
        errors.push("source_sha não existe no repositório de origem.");
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}

console.log(`Fluxo GitOps válido: ${head} -> ${base}`);
