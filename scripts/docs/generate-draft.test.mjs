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
    'back-end/documentation/docs/dominio/brechos.md': 'governanca/pull-requests',
    'back-end/scripts/docs/generate_draft.py': 'governanca/pull-requests',
    'front-end/docs/adr/0001-rascunho-fora-do-painel-do-vendedor.md': 'arquitetura/gitops',
  };
  for (const [path, page] of Object.entries(cases)) assert.equal(matchPage(path, loaded), page);
});

test('código das aplicações não tem página neste portal e aparece como sem mapa', () => {
  const loaded = loadPathMap(pathMap);
  for (const path of ['back-end/app/main.py', 'front-end/src/App.tsx']) {
    assert.equal(matchPage(path, loaded), null, path);
  }
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

// --- Filtro de caminhos dos workflows de documentação ---------------------
// O GitHub avalia `paths:` antes de iniciar o workflow (o `act` não faz isso),
// então a regra é conferida aqui, com a semântica de glob do GitHub.

const workflows = {
  ci: join(root, '.github/workflows/documentation-ci.yml'),
  draft: join(root, '.github/workflows/documentation-draft.yml'),
};

/** Lê cada bloco `paths:` do workflow (pull_request e, no CI, push). */
function pathsBlocks(file) {
  const blocks = [];
  let current = null;

  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (/^\s*paths:\s*$/.test(line)) {
      current = [];
      blocks.push(current);
      continue;
    }
    const item = current && line.match(/^\s*-\s*["']?([^"']+)["']?\s*$/);
    if (item) current.push(item[1]);
    else if (current && line.trim() !== '' && !line.trim().startsWith('#')) current = null;
  }

  return blocks;
}

/** Glob do GitHub Actions: `*` não cruza `/`, `**` cruza. */
function githubGlob(pattern) {
  const source = pattern
    .split('**')
    .map((part) =>
      part
        .split('*')
        .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*'),
    )
    .join('.*');

  return new RegExp(`^${source}$`);
}

/** O workflow dispara se ao menos um arquivo do PR casa com algum padrão. */
function triggers(patterns, changedFiles) {
  return changedFiles.some((file) => patterns.some((pattern) => githubGlob(pattern).test(file)));
}

const applicationCode = ['front-end/**', 'back-end/**'];

test('os workflows de documentação declaram os mesmos paths no PR e no push', () => {
  const ci = pathsBlocks(workflows.ci);
  const draft = pathsBlocks(workflows.draft);

  assert.equal(ci.length, 2, 'CI: pull_request e push');
  assert.equal(draft.length, 1, 'Draft: pull_request');
  assert.deepEqual(ci[1], ci[0]);
  assert.deepEqual(draft[0], ci[0]);
});

test('código das aplicações sozinho não dispara os workflows de documentação', () => {
  const [patterns] = pathsBlocks(workflows.draft);

  for (const files of [
    ['front-end/src/App.tsx'],
    ['back-end/app/main.py'],
    ['front-end/package.json', 'back-end/tests/test_users.py'],
    ['back-end/alembic/versions/e4a2c7b9d1f3_terms.py'],
  ]) {
    assert.equal(triggers(patterns, files), false, files.join(', '));
  }
});

test('o que o path-map mapeia dispara os workflows de documentação', () => {
  const [patterns] = pathsBlocks(workflows.draft);

  for (const files of [
    ['documentation/path-map.json'],
    ['scripts/docs/generate-draft.mjs'],
    ['.github/workflows/gitops-validation.yml'],
    ['config/governance/pr-automation.json'],
    ['components/back-end/release.yml'],
    ['README.md'],
    ['CONTRIBUTING.md'],
    ['docs/aws-roadmap.md'],
    ['back-end/documentation/docs/dominio/brechos.md'],
    ['back-end/scripts/docs/generate_draft.py'],
    ['front-end/docs/adr/0001-rascunho-fora-do-painel-do-vendedor.md'],
    ['front-end/src/App.tsx', 'documentation/docs/intro.md'],
  ]) {
    assert.equal(triggers(patterns, files), true, files.join(', '));
  }
});

test('todo padrão do path-map fora do código das aplicações está coberto pelos paths', () => {
  const [patterns] = pathsBlocks(workflows.draft);
  const sample = (pattern) => pattern.replace(/\*\*/g, 'a/b').replace(/\*/g, 'a');

  for (const entry of loadPathMap(pathMap)) {
    if (applicationCode.includes(entry.pattern)) continue;
    assert.equal(triggers(patterns, [sample(entry.pattern)]), true, entry.pattern);
  }
});

test('o comentário da raiz usa marcador próprio, diferente do portal do back-end', () => {
  const draft = readFileSync(workflows.draft, 'utf8');

  assert.match(draft, /const marker = '<!-- documentation-draft-bot:root -->';/);
  assert.doesNotMatch(draft, /const marker = '<!-- documentation-draft-bot -->';/);
});

// --- Gerenciador de pacotes -----------------------------------------------
// O repositório usa pnpm (como o front-end); o portal não pode voltar ao npm.

test('o portal usa pnpm: packageManager, pnpm-lock.yaml e sem package-lock.json', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'documentation/package.json'), 'utf8'));

  assert.match(manifest.packageManager, /^pnpm@\d+\.\d+\.\d+$/);
  assert.ok(existsSync(join(root, 'documentation/pnpm-lock.yaml')), 'pnpm-lock.yaml');
  assert.equal(existsSync(join(root, 'documentation/package-lock.json')), false);
});

test('o workflow do draft instala e builda com pnpm, sem npm', () => {
  const draft = readFileSync(workflows.draft, 'utf8');

  assert.match(draft, /pnpm\/action-setup@/);
  assert.match(draft, /run: pnpm install --frozen-lockfile/);
  assert.match(draft, /run: pnpm build/);
  assert.match(draft, /cache-dependency-path: documentation\/pnpm-lock\.yaml/);
  assert.doesNotMatch(draft, /\bnpm (ci|install|run)\b/);
  assert.doesNotMatch(draft, /cache: npm/);
});
