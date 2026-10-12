import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

let invocation = 0;

async function runWithTarget(optionId, { sourceHasStatus = true, collisions = false, targetExists = true } = {}) {
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
    const { query, variables } = JSON.parse(options.body);
    let data;
    if (query.includes("organization(login:")) {
      data = { organization: { projectV2: {
        id: variables.number === 3 ? "SOURCE" : "TARGET",
        fields: { nodes: variables.number === 3 ? [] : [{
          id: "FIELD", name: "Status",
          options: [{ id: "done", name: "Done" }, { id: "open", name: "Open" }],
        }] },
      } } };
    } else if (query.includes("node(id:")) {
      data = { node: { projectItems: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          ...(collisions ? [
            { id: "FOREIGN_SOURCE", project: { id: "FOREIGN_SOURCE_PROJECT", number: 3 },
              fieldValues: { nodes: [{ field: { name: "Status" }, name: "Open", optionId: "open" }] } },
            { id: "FOREIGN_TARGET", project: { id: "FOREIGN_TARGET_PROJECT", number: 2 },
              fieldValues: { nodes: [{ field: { name: "Status" }, name: "Done", optionId: "done" }] } },
          ] : []),
          { id: "SOURCE_ITEM", project: { id: "SOURCE", number: 3 },
            fieldValues: { nodes: sourceHasStatus
              ? [{ field: { name: "Status" }, name: "Done", optionId: "source-done" }]
              : [] } },
          ...(targetExists ? [{ id: "TARGET_ITEM", project: { id: "TARGET", number: 2 },
            fieldValues: { nodes: [{ field: { name: "Status" }, name: optionId === "done" ? "Done" : "Open", optionId }] } }] : []),
        ],
      } } };
    } else {
      mutations.push(JSON.parse(options.body));
      data = query.includes("addProjectV2ItemById")
        ? { addProjectV2ItemById: { item: { id: "TARGET_ITEM", fieldValues: { nodes: [
          { field: { name: "Status" }, name: "Open", optionId: "open" },
        ] } } } }
        : { updateProjectV2ItemFieldValue: { projectV2Item: { id: "TARGET_ITEM" } } };
    }
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ data }),
    };
  };
  try {
    await import(`../project-sync.mjs?case=${++invocation}`);
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

test("matches Projects by ID when another Project has the same number", async () => {
  const mutations = await runWithTarget("open", { collisions: true });
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].variables.item, "TARGET_ITEM");
  assert.deepEqual(mutations[0].variables.value, { singleSelectOptionId: "done" });
});

test("clears a destination field removed from the source", async () => {
  const mutations = await runWithTarget("open", { sourceHasStatus: false });
  assert.equal(mutations.length, 1);
  assert.match(mutations[0].query, /clearProjectV2ItemFieldValue/);
  assert.equal(mutations[0].variables.field, "FIELD");
});

test("clears a default field assigned when a destination item is created", async () => {
  const mutations = await runWithTarget("open", { sourceHasStatus: false, targetExists: false });
  assert.equal(mutations.length, 2);
  assert.match(mutations[0].query, /addProjectV2ItemById/);
  assert.match(mutations[1].query, /clearProjectV2ItemFieldValue/);
});

test("reconciles items beyond the first Project page", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "vintex-project-pages-"));
  const eventPath = path.join(directory, "event.json");
  fs.writeFileSync(eventPath, "{}");
  const before = { ...process.env };
  const previousFetch = global.fetch;
  const pages = [];
  const mutations = [];
  process.env.GITHUB_EVENT_PATH = eventPath;
  process.env.GITHUB_REPOSITORY = "Vintex-Ages/front-end";
  process.env.GH_TOKEN = "test-token";
  process.env.SOURCE_PROJECT_NUMBER = "3";
  process.env.AGGREGATE_PROJECT_NUMBER = "2";
  global.fetch = async (_url, options) => {
    const { query, variables } = JSON.parse(options.body);
    const number = variables?.number;
    let data;
    if (query.includes("mutation")) {
      mutations.push(query);
      data = {};
    } else if (query.includes("items(first:")) {
      pages.push({ number, cursor: variables.cursor });
      const first = !variables.cursor;
      const ids = first ? Array.from({ length: 100 }, (_, index) => index) : [100];
      data = { organization: { projectV2: { items: {
        pageInfo: { hasNextPage: first, endCursor: first ? "next" : null },
        nodes: ids.map((id) => ({
          id: `${number}-${id}`,
          content: { id: `CONTENT-${id}`, repository: { nameWithOwner: "Vintex-Ages/front-end" } },
          fieldValues: { nodes: [] },
        })),
      } } } };
    } else {
      data = { organization: { projectV2: {
        id: `PROJECT-${number}`, fields: { nodes: [] },
      } } };
    }
    return {
      ok: true, status: 200,
      headers: { get: () => null },
      json: async () => ({ data }),
    };
  };
  try {
    await import("../project-sync.mjs?pagination");
  } finally {
    global.fetch = previousFetch;
    process.env = before;
    fs.rmSync(directory, { recursive: true, force: true });
  }
  assert.equal(pages.filter((page) => page.number === 3).length, 2);
  assert.equal(pages.filter((page) => page.number === 2).length, 2);
  assert.equal(mutations.length, 0);
});
