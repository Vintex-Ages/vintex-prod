import { createGraphqlClient } from './github-graphql.mjs';

export function createProjectStatusClient({ token, org }) {
  const graphql = createGraphqlClient(token);
  const projectCache = new Map();
  const itemCache = new Map();

  async function loadProject(projectNumber) {
    if (projectCache.has(projectNumber)) return projectCache.get(projectNumber);
    const data = await graphql(`query($org: String!, $number: Int!) {
      organization(login: $org) { projectV2(number: $number) {
        id fields(first: 100) { nodes {
          ... on ProjectV2SingleSelectField { id name options { id name } }
        } }
      } }
    }`, { org, number: projectNumber });
    const project = data.organization?.projectV2;
    if (!project) throw new Error(`Project ${projectNumber} não encontrado`);
    const statusField = project.fields.nodes.find((field) => field?.name === 'Status');
    if (!statusField) throw new Error(`Campo Status ausente no Project ${projectNumber}`);
    const loaded = { id: project.id, statusField };
    projectCache.set(projectNumber, loaded);
    return loaded;
  }

  async function loadItem(projectNumber, contentId) {
    const key = `${projectNumber}:${contentId}`;
    if (itemCache.has(key)) return itemCache.get(key);
    let cursor = null;
    do {
      const data = await graphql(`query($id: ID!, $cursor: String) {
        node(id: $id) {
          ... on Issue { projectItems(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { id project { number } fieldValues(first: 100) { nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name optionId field { ... on ProjectV2SingleSelectField { id name } }
              }
            } } }
          } }
          ... on PullRequest { projectItems(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { id project { number } fieldValues(first: 100) { nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name optionId field { ... on ProjectV2SingleSelectField { id name } }
              }
            } } }
          } }
        }
      }`, { id: contentId, cursor });
      const connection = data.node?.projectItems;
      if (!connection) break;
      const item = connection.nodes.find((candidate) => candidate?.project.number === projectNumber);
      if (item) {
        itemCache.set(key, item);
        return item;
      }
      cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    } while (cursor);
    itemCache.set(key, null);
    return null;
  }

  async function readStatus(projectNumber, contentId) {
    const project = await loadProject(projectNumber);
    const item = await loadItem(projectNumber, contentId);
    const value = item?.fieldValues.nodes.find(
      (candidate) => candidate.field?.id === project.statusField.id,
    );
    return value?.name ?? null;
  }

  async function setStatus(projectNumber, contentId, desiredStatus) {
    const project = await loadProject(projectNumber);
    const option = project.statusField.options.find(
      (candidate) => candidate.name.toLowerCase() === desiredStatus.toLowerCase(),
    );
    if (!option) throw new Error(`Status ${desiredStatus} ausente no Project ${projectNumber}`);

    let item = await loadItem(projectNumber, contentId);
    if (!item) {
      const added = await graphql(`mutation($project: ID!, $content: ID!) {
        addProjectV2ItemById(input: { projectId: $project, contentId: $content }) {
          item { id }
        }
      }`, { project: project.id, content: contentId });
      item = { id: added.addProjectV2ItemById.item.id, fieldValues: { nodes: [] } };
    }
    const current = item.fieldValues.nodes.find(
      (candidate) => candidate.field?.id === project.statusField.id,
    );
    if (current?.optionId !== option.id) {
      await graphql(`mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $project, itemId: $item, fieldId: $field,
          value: { singleSelectOptionId: $option }
        }) { projectV2Item { id } }
      }`, { project: project.id, item: item.id, field: project.statusField.id, option: option.id });
    }
    itemCache.delete(`${projectNumber}:${contentId}`);
  }

  return { readStatus, setStatus };
}
