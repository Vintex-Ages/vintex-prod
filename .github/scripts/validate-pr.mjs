import fs from "node:fs";

const event = JSON.parse(
  fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"),
);
const pr = event.pull_request;
const errors = [];
const base = pr.base.ref;
const head = pr.head.ref;
const body = pr.body || "";
const token = process.env.GITHUB_TOKEN;
const [owner, repo] = process.env.GITHUB_REPOSITORY.split("/");

// Cadeia: feature -> develop -> qa -> main -> deploy.
const PROMOTION_SOURCE = { qa: "develop", main: "qa", deploy: "main" };
// Promoções automáticas do back-end (somente até ele ser importado para este repo).
const componentPromotion = base === "develop"
  ? head.match(/^promote\/back-end-([0-9a-f]{7})$/)
  : null;
const ordinary = base === "develop" && !componentPromotion;
const promotion = PROMOTION_SOURCE[base] === head;

if (!ordinary && !promotion && !componentPromotion) {
  errors.push(
    PROMOTION_SOURCE[base]
      ? `Fluxo inválido: ${base} aceita somente Pull Requests de ${PROMOTION_SOURCE[base]}.`
      : `Fluxo inválido: ${head} não pode abrir Pull Request para ${base}.`,
  );
}

const closingIssues = [
  ...new Set(
    [...body.matchAll(/\b(?:Closes|Fixes|Resolves)\s+#(\d+)/gi)].map(
      (match) => Number(match[1]),
    ),
  ),
];

const getIssue = async (number) => {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${number}`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) return null;
  return response.json();
};

if (ordinary) {
  const legacyBranchIssue =
    head === "hotfix/braces-nesting-depth-guard" ? 347 : null;
  const branchMatch = head.match(
    /^(?:feature|bugfix|hotfix|refactor|docs|chore)\/(\d+)-[a-z0-9]+(?:-[a-z0-9]+)*$/,
  );
  if (!branchMatch && !legacyBranchIssue) {
    errors.push(`Branch inválida: ${head}.`);
  }

  if (!closingIssues.length) {
    errors.push("Inclua Closes #<issue> no corpo do PR.");
  } else {
    if (branchMatch && Number(branchMatch[1]) !== closingIssues[0]) {
      errors.push("A primeira issue vinculada deve coincidir com o número da branch.");
    }
    if (legacyBranchIssue && closingIssues[0] !== legacyBranchIssue) {
      errors.push(`A branch ${head} deve vincular a issue #${legacyBranchIssue}.`);
    }

    const issues = [];
    for (const number of closingIssues) {
      const issue = await getIssue(number);
      if (!issue) {
        errors.push(`A issue #${number} não existe neste repositório.`);
      } else if (issue.pull_request) {
        errors.push(`#${number} é um Pull Request, não uma issue.`);
      } else {
        issues.push(issue);
      }
    }
    const milestones = new Set(
      issues.map((issue) => issue.milestone?.number).filter(Boolean),
    );
    if (milestones.size > 1) {
      errors.push("As issues vinculadas possuem milestones diferentes.");
    }
  }

  const types = ["Feature", "Bugfix", "Hotfix", "Refactor", "Docs", "Chore"];
  const selected = types.filter((type) =>
    new RegExp(`- \\[x\\] ${type}\\b`, "i").test(body),
  );
  if (selected.length !== 1) errors.push("Selecione exatamente um Tipo de mudança.");

  const section = (title) => {
    const match = body.match(
      new RegExp(`## ${title}\\s*([\\s\\S]*?)(?=\\n## |$)`, "i"),
    );
    return (match?.[1] || "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/^[-\s]+$/gm, "")
      .trim();
  };
  if (!section("Descrição")) errors.push("Preencha a seção Descrição.");
  if (!section("O que foi feito")) errors.push("Preencha a seção O que foi feito.");
  if (!section("(Onde foi utilizado IA\\?|Uso de IA)")) {
    errors.push("Declare o uso de IA ou informe que não houve uso.");
  }
}

if (componentPromotion) {
  const component = "back-end";
  const expected = `components/${component}/release.yml`;
  const filesResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${pr.number}/files?per_page=100`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  const changed = filesResponse.ok
    ? (await filesResponse.json()).map((file) => file.filename)
    : [];
  if (changed.length !== 1 || changed[0] !== expected) {
    errors.push(`A promoção deve alterar exclusivamente ${expected}.`);
  }

  const manifestResponse = await fetch(
    `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(head)}/${expected}`,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  );
  if (!manifestResponse.ok) {
    errors.push(`Não foi possível ler ${expected}.`);
  } else {
    const manifest = Object.fromEntries(
      (await manifestResponse.text())
        .split("\n")
        .filter(Boolean)
        .map((line) => line.split(/:\s+/, 2)),
    );
    const expectedRepo = `Vintex-Ages/${component}`;
    if (manifest.component !== component) errors.push("component não corresponde à branch.");
    if (manifest.source_repository !== expectedRepo) {
      errors.push(`source_repository deve ser ${expectedRepo}.`);
    }
    if (manifest.source_branch !== "deploy") errors.push("source_branch deve ser deploy.");
    if (!/^[0-9a-f]{40}$/.test(manifest.source_sha || "")) {
      errors.push("source_sha deve ser um SHA completo.");
    } else {
      const commitResponse = await fetch(
        `https://api.github.com/repos/${expectedRepo}/commits/${manifest.source_sha}`,
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            Accept: "application/vnd.github+json",
          },
        },
      );
      if (!commitResponse.ok) errors.push("source_sha não existe no repositório de origem.");
    }
  }
}

if (errors.length) {
  for (const error of errors) console.error(`::error::${error}`);
  process.exit(1);
}

console.log(`PR válido: ${head} -> ${base}`);
