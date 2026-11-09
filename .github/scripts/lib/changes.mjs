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

// `exists` recebe um caminho e diz se ele existe no checkout; componentes que
// declaram `requires` ficam desligados enquanto o arquivo não existir (ex.: back-end
// antes de ser importado), em qualquer modo.
export function classify({ files, mode, config, exists = () => true }) {
  const forceAll =
    mode === "all" || files.some((file) => matchesAny(file, config.runAllWhenChanged));
  const flags = {};
  for (const [name, component] of Object.entries(config.components)) {
    const present = !component.requires || exists(component.requires);
    const touched = files.some((file) => matchesAny(file, component.paths));
    flags[name] = present && (forceAll || touched);
  }
  return { flags, forceAll };
}
