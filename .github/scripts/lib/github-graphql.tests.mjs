import assert from "node:assert/strict";
import test from "node:test";
import { createGraphqlClient } from "./github-graphql.mjs";

const response = (status, data, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name] ?? null },
  json: async () => data,
});

test("returns GraphQL data and logs the rate budget", async () => {
  const lines = [];
  const graphql = createGraphqlClient("test", {
    fetch: async () => response(200, { data: { viewer: { login: "vintex" } } }, {
      "x-ratelimit-remaining": "4999",
      "x-ratelimit-used": "1",
      "x-ratelimit-reset": "1790000000",
    }),
    log: (line) => lines.push(line),
  });
  assert.deepEqual(await graphql("query { viewer { login } }"), {
    viewer: { login: "vintex" },
  });
  assert.match(lines[0], /remaining=4999 used=1/);
});

test("does not retry when the installation has exhausted its primary budget", async () => {
  let calls = 0;
  const graphql = createGraphqlClient("test", {
    fetch: async () => {
      calls += 1;
      return response(200, { errors: [{ message: "graphql_rate_limit" }] }, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "1790000000",
      });
    },
    log: () => {},
  });
  await assert.rejects(graphql("query { viewer { login } }"), /primary rate limit exhausted/);
  assert.equal(calls, 1);
});

test("respects Retry-After once for a read query", async () => {
  let calls = 0;
  const delays = [];
  const graphql = createGraphqlClient("test", {
    fetch: async () => {
      calls += 1;
      return calls === 1
        ? response(429, { errors: [{ message: "secondary rate limit" }] }, { "retry-after": "2" })
        : response(200, { data: { ok: true } });
    },
    delay: async (ms) => delays.push(ms),
    log: () => {},
  });
  assert.deepEqual(await graphql("query { viewer { login } }"), { ok: true });
  assert.deepEqual(delays, [2000]);
});

test("never retries a rate limited mutation", async () => {
  let calls = 0;
  const graphql = createGraphqlClient("test", {
    fetch: async () => {
      calls += 1;
      return response(429, { errors: [{ message: "secondary rate limit" }] }, {
        "retry-after": "2",
      });
    },
    log: () => {},
  });
  await assert.rejects(graphql("mutation { updateProjectV2ItemFieldValue(input: {}) { projectV2Item { id } } }"), /secondary rate limit/);
  assert.equal(calls, 1);
});
