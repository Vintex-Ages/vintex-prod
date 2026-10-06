import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

async function runWithTarget(optionId) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vintex-project-sync-"));
  const eventPath = path.join(directory, "event.json");
  fs.writeFileSync(eventPath, JSON.stringify({ issue: { node_id: "ISSUE" } }));
  const before = { ...process.env };
  const previousFetch = global.fetch;
  const mutations = [];
  process.env.GITHUB_EVENT_PATH = eventPath;
  process.env.GITHUB_REPOSITORY = "Vintex-Ages/front-end";
  process.env.GH_TOKEN = "test-token";
  process.env.SOURCE_PROJECT_NUMBER = "3";
  process.env.AGGREGATE_PROJECT_NUMBER = "2";
  global.fetch = async (_url, options) => {
    const { query } = JSON.parse(options.body);
    let data;
    if (query.includes("organization(login:")) {
      data = { organization: { projectV2: {
        id: "TARGET",
        fields: { nodes: [{
          id: "FIELD", name: "Status",
          options: [{ id: "done", name: "Done" }, { id: "open", name: "Open" }],
        }] },
      } } };
    } else if (query.includes("node(id:")) {
      data = { node: { projectItems: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          { id: "SOURCE_ITEM", project: { id: "SOURCE", number: 3 },
            fieldValues: { nodes: [{ field: { name: "Status" }, name: "Done", optionId: "source-done" }] } },
          { id: "TARGET_ITEM", project: { id: "TARGET", number: 2 },
            fieldValues: { nodes: [{ field: { name: "Status" }, name: optionId === "done" ? "Done" : "Open", optionId }] } },
        ],
      } } };
    } else {
      mutations.push(JSON.parse(options.body));
      data = { updateProjectV2ItemFieldValue: { projectV2Item: { id: "TARGET_ITEM" } } };
    }
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ data }),
    };
  };
  try {
    await import(`../project-sync.mjs?target=${optionId}`);
  } finally {
    global.fetch = previousFetch;
    process.env = before;
    fs.rmSync(directory, { recursive: true, force: true });
  }
  return mutations;
}

test("does not write a Project field that already matches", async () => {
  assert.equal((await runWithTarget("done")).length, 0);
});

test("writes only the changed Project field", async () => {
  const mutations = await runWithTarget("open");
  assert.equal(mutations.length, 1);
  assert.deepEqual(mutations[0].variables.value, { singleSelectOptionId: "done" });
});
