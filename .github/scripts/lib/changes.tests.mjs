import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classify, globToRegExp, matchesAny, resolveMode } from "./changes.mjs";

const config = JSON.parse(readFileSync(".github/config/ci-paths.json", "utf8"));
const everythingExists = () => true;

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
    });
    assert.ok(forceAll);
    assert.ok(Object.values(flags).every(Boolean), file);
  }
});

test("classify: modo all liga todos os componentes presentes", () => {
  const { flags } = classify({ files: [], mode: "all", config, exists: everythingExists });
  assert.ok(Object.values(flags).every(Boolean));
});

test("classify: componente cujo arquivo exigido não existe fica desligado em qualquer modo", () => {
  const exists = (path) => !path.startsWith("back-end/");
  const all = classify({ files: [], mode: "all", config, exists });
  assert.equal(all.flags["back-end"], false);
  assert.equal(all.flags.infra, false);
  assert.equal(all.flags["front-end"], true);

  const changed = classify({ files: ["back-end/app/main.py"], mode: "changed", config, exists });
  assert.equal(changed.flags["back-end"], false);
});

test("classify: arquivos fora de qualquer componente não ligam nada", () => {
  const { flags } = classify({
    files: ["README.md", "CONTRIBUTING.md"],
    mode: "changed",
    config,
    exists: everythingExists,
  });
  assert.ok(Object.values(flags).every((value) => value === false));
});
