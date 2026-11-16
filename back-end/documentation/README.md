# Documentação viva (VE-25)

Portal Docusaurus do back-end.

```bash
cd back-end/documentation
npm ci
npm start    # dev server em http://localhost:3000
npm run build
```

## Estrutura

```
documentation/
├── docs/                    # conteúdo (Markdown)
├── path-map.json            # caminho de código -> página, usado pelo workflow
├── docusaurus.config.js
├── sidebars.js
└── src/css/custom.css
```

`back-end/scripts/docs/generate_draft.py` lê `path-map.json` e casa os arquivos alterados de um PR contra ele — usado pelo workflow [`back-end-documentation-draft.yml`](../../.github/workflows/back-end-documentation-draft.yml), que remove o prefixo `back-end/` dos caminhos antes de casá-los.

## Escopo (critérios de aceite da issue)

- [x] Portal Docusaurus em `documentation/`
- [x] Mapa versionado caminho → página (`path-map.json`)
- [x] Workflow informativo por PR (rascunho + preview como artifact, não bloqueante)
- [x] Estrutura compatível com o formato de saída do Cognitrace (VE-28, #179) — `docs/` é Markdown simples, sem convenção própria que precise ser desfeita

Ver a issue [VE-25 (#176)](https://github.com/Vintex-Ages/back-end/issues/176) para o desenho completo e o épico [VE-30 (#181)](https://github.com/Vintex-Ages/back-end/issues/181) para o contexto mais amplo de documentação.
