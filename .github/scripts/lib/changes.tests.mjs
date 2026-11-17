import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classify, globToRegExp, matchesAny, resolveMode } from "./changes.mjs";

const config = JSON.parse(readFileSync(".github/config/ci-paths.json", "utf8"));
const everythingExists = () => true;
const prToDevelop = { eventName: "pull_request", baseRef: "develop" };

test("globToRegExp trata ** como qualquer profundidade e * dentro de um nível", () => {
  assert.ok(globToRegExp("front-end/**").test("front-end/src/App.tsx"));
  assert.ok(globToRegExp("front-end/**").test("front-end/package.json"));
  assert.ok(!globToRegExp("front-end/**").test("back-end/front-end/x"));
  assert.ok(globToRegExp("back-end/*.ini").test("back-end/alembic.ini"));
  assert.ok(!globToRegExp("back-end/*.ini").test("back-end/sub/alembic.ini"));
  assert.ok(globToRegExp("a.b").test("a.b"));
  assert.ok(!globToRegExp("a.b").test("axb"));
});

test("matchesAny aceita qualquer um dos globs", () => {
  assert.ok(matchesAny(".github/workflows/ci.yml", [".github/workflows/**"]));
  assert.ok(!matchesAny("README.md", [".github/workflows/**", "front-end/**"]));
});

test("resolveMode: PR para develop valida só o que mudou", () => {
  assert.equal(resolveMode({ eventName: "pull_request", baseRef: "develop" }, config), "changed");
});

test("resolveMode: PR para qa, main e deploy valida tudo", () => {
  for (const baseRef of ["qa", "main", "deploy"]) {
    assert.equal(resolveMode({ eventName: "pull_request", baseRef }, config), "all");
  }
});

test("resolveMode: push, agenda e execução manual validam tudo", () => {
  for (const eventName of ["push", "schedule", "workflow_dispatch"]) {
    assert.equal(resolveMode({ eventName, baseRef: "" }, config), "all");
  }
});

test("classify: só front-end alterado liga apenas o front-end", () => {
  const { flags } = classify({
    files: ["front-end/src/App.tsx"],
    mode: "changed",
    config,
    exists: everythingExists,
    ...prToDevelop,
  });
  assert.deepEqual(flags, {
    "front-end": true,
    "back-end": false,
    infra: false,
    automation: false,
    docs: false,
  });
});

test("classify: só documentação não liga nenhum job de aplicação", () => {
  const { flags } = classify({
    files: ["documentation/docs/intro.md"],
    mode: "changed",
    config,
    exists: everythingExists,
  });
  assert.equal(flags["front-end"], false);
  assert.equal(flags["back-end"], false);
  assert.equal(flags.infra, false);
  assert.equal(flags.docs, true);
});

test("classify: scripts de automação ligam só os testes de automação", () => {
  const { flags } = classify({
    files: [".github/scripts/lib/changes.mjs"],
    mode: "changed",
    config,
    exists: everythingExists,
  });
  assert.equal(flags.automation, true);
  assert.equal(flags["front-end"], false);
});

test("classify: mudar workflow ou mapa de caminhos força validar tudo", () => {
  for (const file of [".github/workflows/ci.yml", ".github/config/ci-paths.json"]) {
    const { flags, forceAll } = classify({
      files: [file],
      mode: "changed",
      config,
      exists: everythingExists,
      ...prToDevelop,
    });
    assert.ok(forceAll);
    // infra é a exceção: nunca liga fora de PR para qa, nem forçando tudo.
    const { infra, ...others } = flags;
    assert.equal(infra, false, file);
    assert.ok(Object.values(others).every(Boolean), file);
  }
});

test("classify: modo all em PR para qa liga todos os componentes presentes, inclusive infra", () => {
  const { flags } = classify({
    files: [],
    mode: "all",
    config,
    exists: everythingExists,
    eventName: "pull_request",
    baseRef: "qa",
  });
  assert.ok(Object.values(flags).every(Boolean));
});

test("classify: componente cujo arquivo exigido não existe fica desligado em qualquer modo", () => {
  const exists = (path) => !path.startsWith("back-end/");
  const all = classify({ files: [], mode: "all", config, exists, eventName: "pull_request", baseRef: "qa" });
  assert.equal(all.flags["back-end"], false);
  assert.equal(all.flags.infra, false);
  assert.equal(all.flags["front-end"], true);

  const changed = classify({
    files: ["back-end/app/main.py"],
    mode: "changed",
    config,
    exists,
    ...prToDevelop,
  });
  assert.equal(changed.flags["back-end"], false);
});

test("classify: arquivos fora de qualquer componente não ligam nada", () => {
  const { flags } = classify({
    files: ["README.md", "CONTRIBUTING.md"],
    mode: "changed",
    config,
    exists: everythingExists,
    ...prToDevelop,
  });
  assert.ok(Object.values(flags).every((value) => value === false));
});

test("classify: qualquer arquivo dentro de back-end/ liga todo o back-end, mesmo sem padrão específico", () => {
  for (const file of [
    "back-end/app/main.py",
    "back-end/scripts/backfill_embeddings.py",
    "back-end/Dockerfile",
    "back-end/config/qualquer-coisa.yml",
  ]) {
    const { flags } = classify({
      files: [file],
      mode: "changed",
      config,
      exists: everythingExists,
      ...prToDevelop,
    });
    assert.equal(flags["back-end"], true, file);
    assert.equal(flags["front-end"], false, file);
  }
});

test("classify: qualquer arquivo dentro de front-end/ liga todo o front-end", () => {
  const { flags } = classify({
    files: ["front-end/tests/braces-security.test.cjs"],
    mode: "changed",
    config,
    exists: everythingExists,
    ...prToDevelop,
  });
  assert.equal(flags["front-end"], true);
  assert.equal(flags["back-end"], false);
});

test("classify: scripts e config ligam a automação; CODEOWNERS e template não", () => {
  const ligado = (file) =>
    classify({ files: [file], mode: "changed", config, exists: everythingExists, ...prToDevelop })
      .flags.automation;
  assert.equal(ligado(".github/scripts/validate-pr.mjs"), true);
  assert.equal(ligado("config/governance/pr-automation.json"), true);
  assert.equal(ligado(".github/CODEOWNERS"), false);
  assert.equal(ligado(".github/pull_request_template.md"), false);
});

test("classify: infra só liga em PR para qa", () => {
  const ligado = (ctx, files = ["back-end/infra/terraform/main.tf"]) =>
    classify({
      files,
      mode: resolveMode(ctx, config),
      config,
      exists: everythingExists,
      ...ctx,
    }).flags.infra;

  assert.equal(ligado({ eventName: "pull_request", baseRef: "qa" }), true);
  assert.equal(ligado({ eventName: "pull_request", baseRef: "develop" }), false);
  assert.equal(ligado({ eventName: "pull_request", baseRef: "main" }), false);
  assert.equal(ligado({ eventName: "pull_request", baseRef: "deploy" }), false);
  assert.equal(ligado({ eventName: "push", baseRef: "" }), false);
  assert.equal(ligado({ eventName: "schedule", baseRef: "" }), false);
  assert.equal(ligado({ eventName: "workflow_dispatch", baseRef: "" }), false);
});

test("classify: infra em PR para qa depende de back-end/Makefile existir", () => {
  const exists = (path) => path !== "back-end/Makefile";
  const { flags } = classify({
    files: [],
    mode: "all",
    config,
    exists,
    eventName: "pull_request",
    baseRef: "qa",
  });
  assert.equal(flags.infra, false);
  assert.equal(flags["back-end"], true);
});

const flagsFor = (files, ctx = prToDevelop) =>
  classify({
    files,
    mode: resolveMode(ctx, config),
    config,
    exists: everythingExists,
    ...ctx,
  });
const todosDesligados = (flags) =>
  Object.entries(flags)
    .filter(([name]) => name !== "docs")
    .every(([, value]) => value === false);

test("classify: PR só de documentação não liga nenhum job de teste", () => {
  for (const file of [
    "README.md",
    "CONTRIBUTING.md",
    "docs/pipeline-ci-cd.md",
    "documentation/docs/intro.md",
    "back-end/documentation/docs/infraestrutura/aws-staging.md",
    "back-end/README.md",
    "front-end/CONTEXT.md",
    "front-end/docs/guia.mdx",
    "front-end/src/components/README.md",
    ".github/pull_request_template.md",
  ]) {
    const { flags, frontEndScope } = flagsFor([file]);
    assert.ok(todosDesligados(flags), file);
    assert.equal(frontEndScope, "all", file); // sem front-end ligado, o escopo é irrelevante
  }
});

test("classify: regressão do PR #72 (só back-end/documentation/**, inclusive .json e .css) não liga nenhum job", () => {
  const files = [
    "back-end/documentation/README.md",
    "back-end/documentation/docs/arquitetura/migrations.md",
    "back-end/documentation/docs/arquitetura/provedor-ia.md",
    "back-end/documentation/docs/dominio/brechos.md",
    "back-end/documentation/docs/dominio/busca-por-semelhanca.md",
    "back-end/documentation/docs/dominio/loja-do-vendedor.md",
    "back-end/documentation/docs/dominio/painel-da-administradora.md",
    "back-end/documentation/docs/dominio/pedidos-do-comprador.md",
    "back-end/documentation/docs/dominio/situacoes-da-peca.md",
    "back-end/documentation/docs/infraestrutura/aws-staging.md",
    "back-end/documentation/docs/intro.md",
    "back-end/documentation/path-map.json",
    "back-end/documentation/src/css/custom.css",
  ];
  const { flags } = flagsFor(files);
  assert.ok(todosDesligados(flags), JSON.stringify(flags));
});

test("classify: documentação junto com código liga só o componente do código", () => {
  const { flags } = flagsFor(["README.md", "docs/a.md", "back-end/app/main.py"]);
  assert.equal(flags["back-end"], true);
  assert.equal(flags["front-end"], false);
  assert.equal(flags.automation, false);
});

test("classify: o filtro de documentação não vale para PR para qa nem para push", () => {
  const qa = flagsFor(["README.md"], { eventName: "pull_request", baseRef: "qa" });
  assert.equal(qa.flags["front-end"], true);
  assert.equal(qa.flags["back-end"], true);
  const push = flagsFor(["README.md"], { eventName: "push", baseRef: "" });
  assert.equal(push.flags["front-end"], true);
});

test("frontEndScope: só arquivos de src/ permitem rodar apenas os testes afetados", () => {
  const scope = (files, ctx) => flagsFor(files, ctx).frontEndScope;
  assert.equal(scope(["front-end/src/components/Foo.tsx"]), "changed");
  assert.equal(scope(["front-end/src/a.ts", "front-end/src/b/c.test.tsx", "README.md"]), "changed");
});

test("frontEndScope: arquivo sem teste identificável vale a suíte completa", () => {
  const scope = (files, ctx) => flagsFor(files, ctx).frontEndScope;
  for (const file of [
    "front-end/package.json",
    "front-end/pnpm-lock.yaml",
    "front-end/vite.config.ts",
    "front-end/tsconfig.json",
    "front-end/tailwind.config.ts",
    "front-end/index.html",
    "front-end/tests/braces-security.test.cjs",
    "front-end/src/test/setup.ts",
  ]) {
    assert.equal(scope([file]), "all", file);
    assert.equal(scope(["front-end/src/a.ts", file]), "all", `src + ${file}`);
  }
});

test("frontEndScope: PR para qa, push e mudança de workflow valem a suíte completa", () => {
  const file = ["front-end/src/components/Foo.tsx"];
  assert.equal(flagsFor(file, { eventName: "pull_request", baseRef: "qa" }).frontEndScope, "all");
  assert.equal(flagsFor(file, { eventName: "pull_request", baseRef: "main" }).frontEndScope, "all");
  assert.equal(flagsFor(file, { eventName: "push", baseRef: "" }).frontEndScope, "all");
  assert.equal(flagsFor([...file, ".github/workflows/ci.yml"]).frontEndScope, "all");
});

test("frontEndScope: mudança só no back-end não depende do escopo do front-end", () => {
  const { flags, frontEndScope } = flagsFor(["back-end/app/main.py"]);
  assert.equal(flags["front-end"], false);
  assert.equal(frontEndScope, "all");
});
