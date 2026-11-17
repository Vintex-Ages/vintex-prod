// Detecção de mudanças da pipeline: decide quais componentes o CI precisa validar.

export function globToRegExp(glob) {
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      pattern += ".*";
      index += 1;
      if (glob[index + 1] === "/") index += 1;
    } else if (char === "*") {
      pattern += "[^/]*";
    } else {
      pattern += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${pattern}$`);
}

export function matchesAny(file, globs) {
  return globs.some((glob) => globToRegExp(glob).test(file));
}

// "all" valida tudo (promoções, push, agenda); "changed" valida só o que mudou.
export function resolveMode({ eventName, baseRef }, config) {
  if (config.allModeEvents.includes(eventName)) return "all";
  if (config.allModeBaseRefs.includes(baseRef)) return "all";
  return "changed";
}

// Cada componente é uma pasta "pai": qualquer arquivo alterado dentro dela liga o
// componente inteiro, sem distinguir subpastas (mudou algo em `back-end/`, roda tudo
// do back-end). `exists` recebe um caminho e diz se ele existe no checkout;
// componentes que declaram `requires` ficam desligados enquanto o arquivo não existir
// (ex.: back-end antes de ser importado), em qualquer modo.
//
// Documentação (`docsGlobs`) nunca liga componente: um PR só de docs não roda testes, e
// um PR de docs + código liga apenas o componente do código. O flag `docs` olha a lista
// original de arquivos.
//
// `onlyPullRequestBaseRefs` restringe o componente a PRs cujo destino esteja na lista
// (ex.: infra só em PRs para `qa`); push, agenda e execução manual não o ligam.
export function classify({
  files,
  mode,
  config,
  exists = () => true,
  eventName = "",
  baseRef = "",
}) {
  const forceAll =
    mode === "all" || files.some((file) => matchesAny(file, config.runAllWhenChanged));
  const codeFiles = files.filter((file) => !matchesAny(file, config.docsGlobs || []));
  const flags = {};
  for (const [name, component] of Object.entries(config.components)) {
    const present = !component.requires || exists(component.requires);
    const eligible =
      !component.onlyPullRequestBaseRefs ||
      (eventName === "pull_request" && component.onlyPullRequestBaseRefs.includes(baseRef));
    const candidates = name === "docs" ? files : codeFiles;
    const touched = candidates.some((file) => matchesAny(file, component.paths));
    flags[name] = present && eligible && (forceAll || touched);
  }
  return { flags, forceAll, frontEndScope: frontEndScope({ codeFiles, mode, forceAll, config }) };
}

// Quantos testes do front-end rodar. "changed": só os afetados (o job pede ao vitest a
// lista via grafo de módulos e, se ela vier vazia, roda tudo). "all": suíte completa.
// Só vale "changed" em PR para `develop` quando todo arquivo alterado do front-end está
// em `frontEnd.scopedPaths` e fora de `frontEnd.fullTestPaths` (setup global dos testes).
// Qualquer outro arquivo (package.json, lockfile, configs, tests/...) não tem teste
// identificável e vale a suíte completa.
export function frontEndScope({ codeFiles, mode, forceAll, config }) {
  const { scopedPaths = [], fullTestPaths = [] } = config.frontEnd || {};
  if (mode !== "changed" || forceAll) return "all";
  const own = codeFiles.filter((file) => matchesAny(file, ["front-end/**"]));
  if (!own.length) return "all";
  const identifiable = own.every(
    (file) => matchesAny(file, scopedPaths) && !matchesAny(file, fullTestPaths),
  );
  return identifiable ? "changed" : "all";
}
