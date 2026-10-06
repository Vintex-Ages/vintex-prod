const assert = require('node:assert/strict');
const test = require('node:test');
const braces = require('braces');

test('preserves normal brace expansion', () => {
  assert.deepEqual(braces.expand('{a,{b,c}}'), ['a', 'b', 'c']);
});

test('rejects brace patterns nested beyond the safe depth', () => {
  const allowedPattern = `${'{'.repeat(100)}x${'}'.repeat(100)}`;
  const pattern = `${'{'.repeat(101)}x${'}'.repeat(101)}`;
  const nestedParentheses = `${'('.repeat(101)}x${')'.repeat(101)}`;

  assert.doesNotThrow(() => braces.compile(allowedPattern));
  assert.throws(() => braces.compile(pattern), {
    name: 'SyntaxError',
    message: 'Pattern nesting depth exceeds max (100)',
  });
  assert.throws(() => braces.expand(pattern), {
    name: 'SyntaxError',
    message: 'Pattern nesting depth exceeds max (100)',
  });
  assert.throws(() => braces.compile(nestedParentheses), {
    name: 'SyntaxError',
    message: 'Pattern nesting depth exceeds max (100)',
  });
});
