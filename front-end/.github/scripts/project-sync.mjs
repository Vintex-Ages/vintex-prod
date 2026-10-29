import fs from "node:fs";
import { createGraphqlClient } from "./lib/github-graphql.mjs";
import { findProjectItem } from "./lib/project-items.mjs";

const config = JSON.parse(fs.readFileSync("config/project/project.json", "utf8"));
const event = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
  : {};
const token = process.env.GH_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const sourceNumber = Number(process.env.SOURCE_PROJECT_NUMBER);
const targetNumber = Number(process.env.AGGREGATE_PROJECT_NUMBER);
const syncedFields = new Set(config.fields);
if (!token) throw new Error("GH_TOKEN não configurado.");
const graphql = createGraphqlClient(token);

const fieldValues = `fieldValues(first: 100) { nodes {
  ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2Field { id name } } }
  ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2Field { id name } } }
  ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2Field { id name } } }
  ... on ProjectV2ItemFieldSingleSelectValue { name optionId field { ... on ProjectV2SingleSelectField { id name } } }
}}`;
const projectFields = `fields(first: 100) { nodes {
  ... on ProjectV2Field { id name dataType }
  ... on ProjectV2SingleSelectField { id name options { id name } }
}}`;
const projectItems = `items(first: 100, after: $cursor) {
  pageInfo { hasNextPage endCursor }
  nodes { id content {
    ... on Issue { id repository { nameWithOwner } }
    ... on PullRequest { id repository { nameWithOwner } }
  } ${fieldValues} }
}`;

async function loadProject(number, includeItems) {
  const data = await graphql(`query($org: String!, $number: Int!) {
    organization(login: $org) { projectV2(number: $number) { id ${projectFields} } }
  }`, { org: config.organization, number });
  const project = data.organization?.projectV2;
  if (!project) throw new Error(`Project #${number} não encontrado.`);
  project.fields = project.fields.nodes.filter(Boolean);
  project.items = [];
  if (!includeItems) return project;

  let cursor = null;
  do {
    const page = await graphql(`query($org: String!, $number: Int!, $cursor: String) {
      organization(login: $org) { projectV2(number: $number) { ${projectItems} } }
    }`, { org: config.organization, number, cursor });
    const connection = page.organization.projectV2.items;
    project.items.push(...connection.nodes.filter(Boolean));
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return project;
}

async function itemsForContent(contentId) {
  const found = [];
  let cursor = null;
  do {
    const data = await graphql(`query($id: ID!, $cursor: String) {
      node(id: $id) {
        ... on Issue { projectItems(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id project { id number } ${fieldValues} }
        } }
        ... on PullRequest { projectItems(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id project { id number } ${fieldValues} }
        } }
      }
    }`, { id: contentId, cursor });
    const connection = data.node?.projectItems;
    if (!connection) return found;
    found.push(...connection.nodes.filter(Boolean));
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
  } while (cursor);
  return found;
}

const currentValue = (item, name) =>
  item?.fieldValues?.nodes.find((value) => value?.field?.name === name);

function desiredValue(value, targetField) {
  if (value.name !== undefined) {
    const option = targetField.options?.find(
      (candidate) => candidate.name.toLowerCase() === value.name.toLowerCase(),
    );
    if (!option) throw new Error(`Opção ${value.name} ausente em ${targetField.name} no Project ${targetNumber}`);
    return { singleSelectOptionId: option.id };
  }
  if (value.text !== undefined) return { text: value.text };
  if (value.number !== undefined) return { number: value.number };
  if (value.date !== undefined) return { date: value.date };
  return null;
}

function equalValue(current, desired) {
  if (!current || !desired) return false;
  if ("singleSelectOptionId" in desired) return current.optionId === desired.singleSelectOptionId;
  if ("text" in desired) return current.text === desired.text;
  if ("number" in desired) return current.number === desired.number;
  return current.date === desired.date;
}

const eventContent = Boolean(event.issue || event.pull_request);
const source = await loadProject(sourceNumber, !eventContent);
const target = await loadProject(targetNumber, !eventContent);
const targetFields = new Map(target.fields.map((field) => [field.name, field]));
const targetItems = new Map(target.items.filter((item) => item.content)
  .map((item) => [item.content.id, item]));
let sourceItems;

if (eventContent) {
  const contentId = (event.issue || event.pull_request).node_id;
  const linked = await itemsForContent(contentId);
  const sourceItem = findProjectItem(linked, source.id);
  const targetItem = findProjectItem(linked, target.id);
  sourceItems = sourceItem ? [{ ...sourceItem, content: { id: contentId } }] : [];
  if (targetItem) targetItems.set(contentId, targetItem);
} else {
  sourceItems = source.items.filter(
    (item) => item.content?.repository?.nameWithOwner === repository,
  );
}

let added = 0;
let updated = 0;
let cleared = 0;
for (const sourceItem of sourceItems) {
  let targetItem = targetItems.get(sourceItem.content.id);
  if (!targetItem) {
    const result = await graphql(`mutation($project: ID!, $content: ID!) {
      addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
        item { id ${fieldValues} }
      }
    }`, { project: target.id, content: sourceItem.content.id });
    targetItem = result.addProjectV2ItemById.item;
    targetItems.set(sourceItem.content.id, targetItem);
    added += 1;
  }

  const sourceValues = new Map(sourceItem.fieldValues.nodes
    .filter((value) => syncedFields.has(value?.field?.name))
    .map((value) => [value.field.name, value]));
  for (const name of syncedFields) {
    const value = sourceValues.get(name);
    const current = currentValue(targetItem, name);
    if (!value && !current) continue;
    const targetField = targetFields.get(name);
    if (!targetField) throw new Error(`Campo ${name} ausente no Project ${targetNumber}`);
    const desired = value ? desiredValue(value, targetField) : null;
    if (!desired) {
      if (!current) continue;
      await graphql(`mutation($project: ID!, $item: ID!, $field: ID!) {
        clearProjectV2ItemFieldValue(input: {
          projectId: $project, itemId: $item, fieldId: $field
        }) { projectV2Item { id } }
      }`, { project: target.id, item: targetItem.id, field: targetField.id });
      cleared += 1;
      continue;
    }
    if (equalValue(current, desired)) continue;
    await graphql(`mutation($project: ID!, $item: ID!, $field: ID!, $value: ProjectV2FieldValue!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $project, itemId: $item, fieldId: $field, value: $value
      }) { projectV2Item { id } }
    }`, { project: target.id, item: targetItem.id, field: targetField.id, value: desired });
    updated += 1;
  }
}
console.log(`Project ${sourceNumber} → ${targetNumber}: ${sourceItems.length} itens, ${added} adicionados, ${updated} campos atualizados, ${cleared} campos limpos.`);
