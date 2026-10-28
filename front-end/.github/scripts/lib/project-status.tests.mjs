import assert from "node:assert/strict";
import test from "node:test";
import { createProjectStatusClient } from "./project-status.mjs";

test("reads and writes the item from the configured organization Project", async () => {
  const originalFetch = global.fetch;
  const mutations = [];
  global.fetch = async (_url, options) => {
    const { query, variables } = JSON.parse(options.body);
    let data;
    if (query.includes("organization(login:")) {
      data = { organization: { projectV2: {
        id: "EXPECTED", fields: { nodes: [{ id: "STATUS", name: "Status",
          options: [{ id: "review", name: "In review" }] }] },
      } } };
    } else if (query.includes("node(id:")) {
      data = { node: { projectItems: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          { id: "FOREIGN", project: { id: "OTHER" }, fieldValues: { nodes: [
            { name: "Done", optionId: "done", field: { id: "STATUS" } },
          ] } },
          { id: "OWN", project: { id: "EXPECTED" }, fieldValues: { nodes: [
            { name: "In progress", optionId: "progress", field: { id: "STATUS" } },
          ] } },
        ],
      } } };
    } else {
      mutations.push({ query, variables });
      data = { updateProjectV2ItemFieldValue: { projectV2Item: { id: "OWN" } } };
    }
    return { ok: true, status: 200, headers: { get: () => null },
      json: async () => ({ data }) };
  };
  try {
    const client = createProjectStatusClient({ token: "test-token", org: "Vintex-Ages" });
    assert.equal(await client.readStatus(3, "ISSUE"), "In progress");
    await client.setStatus(3, "ISSUE", "In review");
    assert.equal(mutations.length, 1);
    assert.equal(mutations[0].variables.item, "OWN");
  } finally {
    global.fetch = originalFetch;
  }
});
