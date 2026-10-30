/**
 * Gera um rascunho de documentação a partir de documentation/path-map.json.
 *
 * O workflow documentation-draft.yml passa os arquivos alterados de um PR;
 * caminhos sem mapa permanecem visíveis no Markdown e nunca são erro.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultPathMap = resolve(scriptDirectory, '../../documentation/path-map.json');

/** @typedef {{ pattern: string, page: string }} PathMapEntry */

/** @param {string} pathMapFile @returns {PathMapEntry[]} */
export function loadPathMap(pathMapFile) {
  const data = JSON.parse(readFileSync(pathMapFile, 'utf8'));

  return data.map;
}

/** @param {string} pattern */
function patternToRegExp(pattern) {
  const escaped = pattern
    .split(/\*+/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  return new RegExp(`^${escaped}$`);
}

/** @param {string} changedPath @param {PathMapEntry[]} entries */
export function matchPage(changedPath, entries) {
  const normalized = changedPath.replace(/\\/g, '/');

  return entries.find((entry) => patternToRegExp(entry.pattern).test(normalized))?.page ?? null;
}

/** @param {string[]} changedPaths @param {PathMapEntry[]} entries */
export function groupByPage(changedPaths, entries) {
  /** @type {Map<string, string[]>} */
  const mapped = new Map();
  /** @type {string[]} */
  const unmapped = [];

  for (const changedPath of changedPaths) {
    const page = matchPage(changedPath, entries);

    if (!page) {
      unmapped.push(changedPath);
      continue;
    }

    const paths = mapped.get(page) ?? [];
    paths.push(changedPath);
    mapped.set(page, paths);
  }

  return { mapped, unmapped };
}

/** @param {{ mapped: Map<string, string[]>, unmapped: string[] }} draft */
export function renderDraft({ mapped, unmapped }) {
  const lines = ['# Rascunho de documentação', ''];

  if (mapped.size === 0 && unmapped.length === 0) {
    return `${lines.concat('Nenhum arquivo alterado neste PR.').join('\n')}\n`;
  }

  if (mapped.size > 0) {
    lines.push('## Páginas para revisar', '');

    for (const [page, paths] of [...mapped.entries()].sort(([first], [second]) =>
      first.localeCompare(second),
    )) {
      lines.push(`### \`${page}\``);

      for (const changedPath of [...paths].sort()) {
        lines.push(`- \`${changedPath}\``);
      }

      lines.push('');
    }
  }

  if (unmapped.length > 0) {
    lines.push('## Sem mapeamento em path-map.json', '');
    lines.push(
      'Informativo — não bloqueia o merge. Considere adicionar uma entrada em ' +
        '`documentation/path-map.json` se algum destes caminhos merecer uma página própria.',
      '',
    );

    for (const changedPath of [...unmapped].sort()) {
      lines.push(`- \`${changedPath}\``);
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const options = { changedFilesFile: null, pathMap: defaultPathMap, output: null };
  const flags = {
    '--changed-files-file': 'changedFilesFile',
    '--path-map': 'pathMap',
    '--output': 'output',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (!Object.hasOwn(flags, flag) || !value || value.startsWith('--')) {
      throw new Error(`Argumento inválido ou sem valor: ${flag}`);
    }
    options[flags[flag]] = value;
    index += 1;
  }

  if (!options.changedFilesFile) {
    throw new Error('Uso: generate-draft.mjs --changed-files-file <arquivo> [--path-map <arquivo>] [--output <arquivo>]');
  }

  return options;
}

/** @param {string[]} argv */
export function main(argv) {
  const options = parseArgs(argv);
  const changedPaths = readFileSync(options.changedFilesFile, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const draft = renderDraft(groupByPage(changedPaths, loadPathMap(options.pathMap)));

  if (options.output) {
    writeFileSync(options.output, draft, 'utf8');
  } else {
    process.stdout.write(draft);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
