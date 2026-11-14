import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupByPage, loadPathMap, matchPage, parseArgs, renderDraft } from './generate-draft.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const script = join(root, 'scripts/docs/generate-draft.mjs');
const pathMap = join(root, 'documentation/path-map.json');
const entries = [
  { pattern: 'components/front-end/**', page: 'operacao/promocoes' },
  { pattern: 'components/**', page: 'arquitetura/gitops' },
  { pattern: '.github/scripts/**', page: 'governanca/pull-requests' },
];

test('a primeira correspondência vence, mesmo com padrões sobrepostos', () => {
  assert.equal(matchPage('components/front-end/release.yml', entries), 'operacao/promocoes');
  assert.equal(matchPage('components/novo/release.yml', entries), 'arquitetura/gitops');
});

test('normaliza barras invertidas', () => {
  assert.equal(matchPage('components\\front-end\\release.yml', entries), 'operacao/promocoes');
});

test('escapa caracteres de expressão regular e ancora o caminho completo', () => {
  const exact = [{ pattern: 'docs/a+b[1].md', page: 'intro' }];
  assert.equal(matchPage('docs/a+b[1].md', exact), 'intro');
  assert.equal(matchPage('docs/ab1Xmd', exact), null);
  assert.equal(matchPage('prefix/docs/a+b[1].md', exact), null);
  assert.equal(matchPage('README.md.bak', [{ pattern: 'README.md', page: 'intro' }]), null);
});

test('padrões com asteriscos alcançam arquivos e subdiretórios', () => {
  assert.equal(matchPage('.github/scripts/nested/check.mjs', entries), 'governanca/pull-requests');
  assert.equal(matchPage('docs/nested/page.md', [{ pattern: 'docs/*', page: 'intro' }]), 'intro');
});

test('caminhos sem mapa retornam null', () => {
  assert.equal(matchPage('LICENSE', entries), null);
});

test('agrupa arquivos de uma página e preserva caminhos sem mapa', () => {
  const result = groupByPage([
    'components/front-end/release.yml',
    '.github/scripts/validate-gitops.mjs',
    '.github/scripts/sync-pr-metadata.mjs',
    'LICENSE',
  ], entries);
  assert.deepEqual([...result.mapped.entries()], [
    ['operacao/promocoes', ['components/front-end/release.yml']],
    ['governanca/pull-requests', ['.github/scripts/validate-gitops.mjs', '.github/scripts/sync-pr-metadata.mjs']],
  ]);
  assert.deepEqual(result.unmapped, ['LICENSE']);
});

test('renderiza entrada vazia', () => {
  assert.match(renderDraft({ mapped: new Map(), unmapped: [] }), /Nenhum arquivo alterado/);
});

test('renderiza páginas ordenadas e caminhos sem mapa como informação', () => {
  const draft = renderDraft({
    mapped: new Map([
      ['operacao/promocoes', ['components/front-end/release.yml']],
      ['governanca/pull-requests', ['z.mjs', 'a.mjs']],
    ]),
    unmapped: ['LICENSE'],
  });
  assert.ok(draft.indexOf('governanca/pull-requests') < draft.indexOf('operacao/promocoes'));
  assert.ok(draft.indexOf('`a.mjs`') < draft.indexOf('`z.mjs`'));
  assert.match(draft, /Sem mapeamento em path-map\.json/);
  assert.match(draft, /não bloqueia o merge/);
  assert.match(draft, /`LICENSE`/);
  assert.ok(draft.endsWith('\n'));
});

test('todas as páginas do mapa versionado existem', () => {
  const loaded = loadPathMap(pathMap);
  assert.ok(loaded.length > 0);
  for (const entry of loaded) {
    assert.equal(typeof entry.pattern, 'string');
    assert.equal(typeof entry.page, 'string');
    assert.ok(existsSync(join(root, 'documentation/docs', `${entry.page}.md`)), entry.page);
  }
});

test('o mapa real cobre manifestos, governança, roadmap e o próprio portal', () => {
  const loaded = loadPathMap(pathMap);
  const cases = {
    'components/front-end/release.yml': 'operacao/promocoes',
    'components/back-end/release.yml': 'operacao/promocoes',
    '.github/scripts/validate-gitops.mjs': 'governanca/pull-requests',
    '.github/workflows/documentation-draft.yml': 'governanca/pull-requests',
    'config/governance/pr-automation.json': 'governanca/pull-requests',
    'CONTRIBUTING.md': 'governanca/pull-requests',
    'docs/aws-roadmap.md': 'operacao/aws',
    'documentation/docs/operacao/aws.md': 'operacao/aws',
    'documentation/package.json': 'intro',
  };
  for (const [path, page] of Object.entries(cases)) assert.equal(matchPage(path, loaded), page);
});

test('CLI aceita as opções existentes e rejeita argumentos ausentes ou inválidos', () => {
  assert.deepEqual(parseArgs([
    '--changed-files-file', 'changed.txt', '--path-map', 'map.json', '--output', 'draft.md',
  ]), { changedFilesFile: 'changed.txt', pathMap: 'map.json', output: 'draft.md' });
  assert.throws(() => parseArgs([]), /Uso:/);
  assert.throws(() => parseArgs(['--changed-files-file']), /sem valor/);
  assert.throws(() => parseArgs(['--changed-files-file', '--output', 'draft.md']), /sem valor/);
  assert.throws(() => parseArgs(['--unknown', 'value']), /inválido/);
});

test('CLI usa o mapa padrão de qualquer diretório e escreve stdout ou arquivo', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'vintex-docs-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const changed = join(directory, 'changed.txt');
  const output = join(directory, 'draft.md');
  writeFileSync(changed, 'components/front-end/release.yml\r\n\r\nLICENSE\r\n');
  const args = [script, '--changed-files-file', changed];
  const stdout = execFileSync(process.execPath, args, { cwd: directory, encoding: 'utf8' });
  assert.match(stdout, /operacao\/promocoes/);
  assert.match(stdout, /`LICENSE`/);
  execFileSync(process.execPath, [...args, '--output', output], { cwd: directory });
  assert.equal(readFileSync(output, 'utf8'), stdout);
  const custom = join(directory, 'custom.json');
  writeFileSync(custom, JSON.stringify({ map: [{ pattern: 'LICENSE', page: 'intro' }] }));
  const customDraft = execFileSync(process.execPath, [...args, '--path-map', custom], { encoding: 'utf8' });
  assert.match(customDraft, /### `intro`/);
  writeFileSync(changed, '');
  assert.match(execFileSync(process.execPath, args, { encoding: 'utf8' }), /Nenhum arquivo alterado/);
});

test('CLI retorna falha útil para entrada ausente ou ilegível', () => {
  const noArgs = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(noArgs.status, 1);
  assert.match(noArgs.stderr, /Uso:/);
  const missing = spawnSync(process.execPath, [script, '--changed-files-file', 'missing-file.txt'], {
    cwd: root, encoding: 'utf8',
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /ENOENT/);
});
