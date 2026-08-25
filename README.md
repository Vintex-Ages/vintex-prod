# vintex-prod

Controle GitOps e preparação de releases do Vintex.

`develop` recebe promoções independentes de frontend e backend. `main` representa a última composição operacional aprovada e será a fonte do futuro deploy AWS.

## Componentes

- [`components/front-end/release.yml`](components/front-end/release.yml)
- [`components/back-end/release.yml`](components/back-end/release.yml)

Cada manifesto referencia um commit imutável da branch `deploy` do repositório de origem. Este repositório é público: nunca adicione segredos, chaves, tokens ou valores sensíveis de ambiente.

Consulte [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir um Pull Request.
