export const findProjectItem = (items, projectId) =>
  items.find((item) => item?.project?.id === projectId);
