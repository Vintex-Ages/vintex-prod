'use strict';

const MAX_NESTING_DEPTH = 100;

const assertSafeDepth = ast => {
  const pending = [{ node: ast, depth: 0 }];
  const visited = new Set();

  while (pending.length > 0) {
    const { node, depth } = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (visited.has(node)) {
      throw new SyntaxError('Pattern AST contains a repeated node');
    }
    visited.add(node);

    if (!Array.isArray(node.nodes)) continue;
    if (depth > MAX_NESTING_DEPTH) {
      throw new SyntaxError(`Pattern nesting depth exceeds max (${MAX_NESTING_DEPTH})`);
    }

    for (const child of node.nodes) {
      pending.push({ node: child, depth: depth + 1 });
    }
  }
};

module.exports = { MAX_NESTING_DEPTH, assertSafeDepth };
