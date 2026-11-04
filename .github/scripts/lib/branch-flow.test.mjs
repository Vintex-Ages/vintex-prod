import assert from "node:assert/strict";
import test from "node:test";
import { flowErrors } from "./branch-flow.mjs";

const ok = (input) => assert.deepEqual(flowErrors(input), []);
const bad = (input, text) =>
  assert.ok(flowErrors(input).some((error) => error.includes(text)), text);

test("sem qa: develop -> main continua válido", () => {
  ok({ base: "main", head: "develop", qaExists: false });
  bad({ base: "main", head: "feature/1-x", qaExists: false }, "develop");
  bad({ base: "qa", head: "develop", qaExists: false }, "não é permitida");
});

test("com qa: develop -> qa -> main", () => {
  ok({ base: "qa", head: "develop", qaExists: true });
  ok({ base: "main", head: "qa", qaExists: true });
  bad({ base: "main", head: "develop", qaExists: true }, "qa");
  bad({ base: "qa", head: "feature/1-x", qaExists: true }, "develop");
});

test("deploy só recebe main; develop aceita qualquer head", () => {
  ok({ base: "deploy", head: "main", qaExists: true });
  bad({ base: "deploy", head: "qa", qaExists: true }, "main");
  ok({ base: "develop", head: "feature/1-x", qaExists: false });
});
