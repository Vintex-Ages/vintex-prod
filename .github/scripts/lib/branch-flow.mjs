// Cadeia: feature -> develop -> qa -> main -> deploy.
// Enquanto a branch `qa` não existir, `main` continua aceitando `develop`.
export function flowErrors({ base, head, qaExists }) {
  const errors = [];
  if (base === "qa" && head !== "develop")
    errors.push("qa aceita somente Pull Requests de develop.");
  if (base === "main") {
    const expected = qaExists ? "qa" : "develop";
    if (head !== expected)
      errors.push(`main aceita somente Pull Requests de ${expected}.`);
  }
  if (base === "deploy" && head !== "main")
    errors.push("deploy aceita somente Pull Requests de main.");
  const allowed = ["develop", "main", "deploy", ...(qaExists ? ["qa"] : [])];
  if (!allowed.includes(base)) errors.push(`Base ${base} não é permitida.`);
  return errors;
}
