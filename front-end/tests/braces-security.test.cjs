const assert = require('node:assert/strict');
const test = require('node:test');
const { createRequire } = require('node:module');
const vendoredBraces = require('../vendor/braces');
const tailwindRequire = createRequire(require.resolve('tailwindcss/package.json'));
const micromatchRequire = createRequire(tailwindRequire.resolve('micromatch'));
const installedBraces = micromatchRequire('braces');
const implementations = [
  ['vendored', vendoredBraces],
  ['installed through micromatch', installedBraces],
];

for (const [name, braces] of implementations) {
  test(`${name}: preserves normal brace expansion`, () => {
    assert.deepEqual(braces.expand('{a,{b,c}}'), ['a', 'b', 'c']);
  });

  test(`${name}: rejects input nested beyond the safe depth`, () => {
    const allowedPattern = `${'{'.repeat(100)}x${'}'.repeat(100)}`;
    const pattern = `${'{'.repeat(101)}x${'}'.repeat(101)}`;
    const nestedParentheses = `${'('.repeat(101)}x${')'.repeat(101)}`;

    assert.doesNotThrow(() => braces.compile(allowedPattern));
    for (const method of ['compile', 'expand', 'stringify']) {
      assert.throws(() => braces[method](pattern), {
        name: 'SyntaxError',
        message: 'Pattern nesting depth exceeds max (100)',
      });
    }
    assert.throws(() => braces.compile(nestedParentheses), {
      name: 'SyntaxError',
      message: 'Pattern nesting depth exceeds max (100)',
    });
  });

  test(`${name}: rejects a deeply nested AST passed directly`, () => {
    let ast = { type: 'text', value: 'x' };
    for (let depth = 0; depth < 101; depth += 1) {
      ast = { type: 'brace', nodes: [ast] };
    }
    ast = { type: 'root', nodes: [ast] };

    for (const method of ['compile', 'expand', 'stringify']) {
      assert.throws(() => braces[method](ast), {
        name: 'SyntaxError',
        message: 'Pattern nesting depth exceeds max (100)',
      });
    }
  });

  test(`${name}: rejects a cyclic AST before walking it`, () => {
    const ast = { type: 'root', nodes: [] };
    ast.nodes.push(ast);
    assert.throws(() => braces.compile(ast), {
      name: 'SyntaxError',
      message: 'Pattern AST contains a repeated node',
    });
  });
}
