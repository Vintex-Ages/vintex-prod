import assert from "node:assert/strict";
import test from "node:test";
import {
  allowedRepositories,
  formatRef,
  isAllowed,
  isLocal,
  parseClosingRefs,
} from "./issue-refs.mjs";

const current = { owner: "Vintex-Ages", repo: "vintex-prod" };

test("Closes #N aponta para o repositório atual", () => {
  assert.deepEqual(parseClosingRefs("Closes #12", current), [
    { owner: "Vintex-Ages", repo: "vintex-prod", number: 12 },
  ]);
});

test("Closes owner/repo#N aponta para outro repositório", () => {
  assert.deepEqual(
    parseClosingRefs("Closes Vintex-Ages/front-end#426", current),
    [{ owner: "Vintex-Ages", repo: "front-end", number: 426 }],
  );
});

test("aceita Fixes e Resolves, sem diferenciar maiúsculas", () => {
  const refs = parseClosingRefs(
    "fixes Vintex-Ages/back-end#269\nRESOLVES #3",
    current,
  );
  assert.deepEqual(
    refs.map((ref) => `${ref.repo}#${ref.number}`),
    ["back-end#269", "vintex-prod#3"],
  );
});

test("a ordem do corpo é preservada e a primeira é a primária", () => {
  const refs = parseClosingRefs(
    "Closes Vintex-Ages/front-end#431\nCloses #7\nCloses Vintex-Ages/back-end#269",
    current,
  );
  assert.deepEqual(
    refs.map((ref) => ref.number),
    [431, 7, 269],
  );
});

test("o mesmo número em repositórios diferentes não é duplicata", () => {
  const refs = parseClosingRefs(
    "Closes Vintex-Ages/front-end#269\nCloses Vintex-Ages/back-end#269",
    current,
  );
  assert.equal(refs.length, 2);
});

test("a mesma issue citada duas vezes conta uma vez, mesmo com grafia diferente", () => {
  const refs = parseClosingRefs(
    "Closes #5\nCloses vintex-ages/vintex-prod#5",
    current,
  );
  assert.equal(refs.length, 1);
});

test("placeholder do template e corpo vazio não geram referência", () => {
  assert.deepEqual(
    parseClosingRefs("Closes #<!-- issue, quando aplicável -->", current),
    [],
  );
  assert.deepEqual(parseClosingRefs("", current), []);
  assert.deepEqual(parseClosingRefs(null, current), []);
});

test("menção sem keyword não fecha issue", () => {
  assert.deepEqual(
    parseClosingRefs("Relacionado a Vintex-Ages/front-end#426 e #7", current),
    [],
  );
});

test("só o próprio repositório e os configurados são permitidos", () => {
  const allowed = allowedRepositories(
    { issueRepositories: ["Vintex-Ages/front-end", "Vintex-Ages/back-end"] },
    current,
  );
  const ref = (repo) => ({ owner: "Vintex-Ages", repo, number: 1 });
  assert.ok(isAllowed(ref("vintex-prod"), allowed));
  assert.ok(isAllowed(ref("front-end"), allowed));
  assert.ok(isAllowed(ref("Back-End"), allowed));
  assert.ok(!isAllowed(ref("outro-repo"), allowed));
  assert.ok(!isAllowed({ owner: "outra-org", repo: "front-end", number: 1 }, allowed));
});

test("sem issueRepositories, só o próprio repositório é permitido", () => {
  const allowed = allowedRepositories({}, current);
  assert.ok(isAllowed({ owner: "Vintex-Ages", repo: "vintex-prod", number: 1 }, allowed));
  assert.ok(!isAllowed({ owner: "Vintex-Ages", repo: "front-end", number: 1 }, allowed));
});

test("formatRef e isLocal distinguem o repositório atual", () => {
  const local = { owner: "Vintex-Ages", repo: "vintex-prod", number: 4 };
  const remote = { owner: "Vintex-Ages", repo: "front-end", number: 426 };
  assert.equal(formatRef(local, current), "#4");
  assert.equal(formatRef(remote, current), "Vintex-Ages/front-end#426");
  assert.ok(isLocal(local, current));
  assert.ok(!isLocal(remote, current));
});
