import assert from "node:assert/strict";
import test from "node:test";
import { findProjectItem } from "./project-items.mjs";

test("selects a Project item by ID instead of its shared number", () => {
  const items = [
    { id: "FOREIGN", project: { id: "OTHER", number: 3 } },
    { id: "OWN", project: { id: "EXPECTED", number: 3 } },
  ];
  assert.equal(findProjectItem(items, "EXPECTED").id, "OWN");
  assert.equal(findProjectItem(items, "ABSENT"), undefined);
});
