# Frontend

Documentação técnica do front-end do Vintex, reunindo as decisões de tecnologia, a estrutura do projeto e as convenções adotadas pelo time.

O Vintex é uma prova de conceito de marketplace de moda circular, que conecta brechós e microempreendedores de moda usada a compradores locais.

Todo o código do projeto vive em um único repositório, o [vintex-prod](https://github.com/Vintex-Ages/vintex-prod), com uma pasta na raiz para cada componente. Esta página documenta a pasta `front-end/`. O back-end ocupa a pasta `back-end/` e é consumido via API REST, com documentação própria. Os repositórios separados `front-end` e `back-end` foram usados até novembro de 2026 e não recebem mais Pull Requests.

## Sumário

- [Escolha de tecnologias](#escolha-de-tecnologias)
- [Organização do repositório](#organização-do-repositório)
  - [Camadas](#camadas)
  - [Arquitetura de componentes](#arquitetura-de-componentes)
- [Camada de services](#camada-de-services)
  - [Mock e API real](#mock-e-api-real)
- [Estado e hooks](#estado-e-hooks)
- [Design system](#design-system)
- [Padrões de código](#padrões-de-código)
  - [Nomenclatura](#nomenclatura)
  - [Regras de código](#regras-de-código)
- [Testes](#testes)
- [Segurança de dependências](#segurança-de-dependências)
- [Registro de decisões](#registro-de-decisões)
- [Padrões de commit e branch](#padrões-de-commit-e-branch)
- [Ambiente de desenvolvimento](#ambiente-de-desenvolvimento)

## Escolha de tecnologias

A stack foi definida no início do projeto a partir da familiaridade do time e dos requisitos do Termo de Abertura: aplicação web responsiva, com modo claro e escuro, e integração com recursos de Inteligência Artificial.

A decisão mais característica do Vintex é a ausência de bibliotecas pesadas de estado e de componentes. Não há React Query, Zustand nem biblioteca de UI pronta: o estado global vive em Context do próprio React, o cache de dados é responsabilidade de cada hook, e todos os componentes visuais são escritos pelo time sobre Tailwind CSS. A contrapartida é mais código próprio; o ganho é controle total sobre a identidade visual e um pacote final menor.

### Stack completa

| Tecnologia | Versão mínima | Papel |
|---|---|---|
| React | 18.3.1 | Biblioteca de UI |
| TypeScript | 5.5.4 | JavaScript tipado |
| Vite | 6.4.4 | Build e servidor de desenvolvimento |
| React Router | 7.18.2 | Roteamento no cliente |
| Tailwind CSS | 3.4.7 | Estilização por classes utilitárias |
| Axios | 1.7.4 | Cliente HTTP |
| clsx | 2.1.1 | Composição condicional de classes CSS |
| Vitest | 4.1.10 | Testes unitários e de componente |
| Testing Library | 16.3.2 | Consultas ao DOM orientadas a acessibilidade |
| jsdom | 29.1.1 | DOM simulado para os testes |
| ESLint | 8.57.0 | Análise estática |
| Prettier | 3.3.3 | Formatação de código |
| pnpm | 11.28.4 | Gerenciador de pacotes |

As versões da tabela são as **mínimas declaradas** no `package.json`. Cada uma é registrada com o sinal `^`, que autoriza o gerenciador a instalar qualquer versão mais nova dentro da mesma linha principal: `^5.5.4` aceita a 5.9.3, mas nunca a 6.0.0. A versão exata que cada pessoa tem instalada está no `pnpm-lock.yaml`, e é a mesma para todo o time, porque o arquivo é versionado. Para saber o que de fato está rodando na sua máquina, use `pnpm list`.

O gerenciador de pacotes é o **pnpm**, fixado em `packageManager` no `package.json`. O projeto migrou do npm em outubro de 2026, depois que vulnerabilidades em dependências do Tailwind v3 apareceram antes no registro do pnpm do que no do npm. Apenas o `pnpm-lock.yaml` é versionado.

## Organização do repositório

Tudo o que esta página descreve fica dentro de `front-end/`, a partir da raiz do `vintex-prod`. Os caminhos e comandos abaixo partem dessa pasta.

Dentro dela, o projeto adota uma organização **por responsabilidade técnica**, com uma pasta por camada, e subdivide componentes e páginas por domínio de negócio dentro de cada uma.

```
front-end/src/
├── assets/            # imagens por contexto (images, catalog, onboarding, product-detail)
├── components/        # componentes de apresentação, agrupados por domínio
│   ├── admin/
│   ├── auth/
│   ├── cart/
│   ├── catalog/
│   ├── checkout/
│   ├── common/        # genéricos e reutilizáveis (Button, InputField, EmptyState…)
│   ├── layout/        # Header, Footer, Container, Layout
│   ├── orders/
│   ├── preferences/
│   ├── product/
│   ├── seller/
│   ├── store/
│   └── vintex-ai/     # assistente de IA
├── context/           # contextos globais (AuthContext, ToastContext)
├── hooks/             # hooks customizados
├── mocks/             # dados falsos usados quando a API está desligada
├── pages/             # telas, em pasta própria quando têm mais de um arquivo
├── routes/            # definição de rotas e guardas de acesso
├── services/          # acesso a dados e chamadas à API
│   └── __contracts__/ # contratos de resposta usados nos testes dos services
├── styles/            # estilos globais e tokens de design
├── test/              # configuração do ambiente de testes
├── types/             # contratos de dados compartilhados
└── utils/             # funções utilitárias (formatação, documentos)
```

O alias `@/` aponta para `src/` e está configurado em `vite.config.ts` e `tsconfig.json`. Imports relativos profundos (`../../../`) devem ser evitados.

### Camadas

A comunicação entre as camadas segue sempre o mesmo sentido, e cada uma tem uma responsabilidade única:

| Camada | Responsabilidade | Não pode |
|---|---|---|
| `pages/` | Orquestrar a tela: decide o que mostrar em cada estado | Chamar a API diretamente |
| `hooks/` | Buscar dados, guardar estado e aplicar condições de fluxo | Renderizar elementos |
| `services/` | Falar com a API e converter o formato do back para o do front | Conhecer componentes |
| `components/` | Renderizar o que recebe por props | Conter regra de negócio |
| `types/` | Declarar os contratos de dados | — |

Uma página consome um hook, o hook consome um service, o service fala com a API. Um componente de apresentação nunca pula essa cadeia.

### Arquitetura de componentes

O projeto separa **componentes de apresentação** de **componentes com lógica**, sem usar os nomes "smart" e "dumb":

**Componentes de apresentação** vivem em `src/components/` e só renderizam o que recebem por props. Não fazem chamadas HTTP nem contêm validação específica de uma tela. O `Button`, o `StatCard` e o `EmptyState` são exemplos: recebem valores já formatados e emitem eventos, sem saber de onde os dados vieram nem o que acontece depois.

**A lógica vive nas páginas e nos hooks.** Quando uma tela precisa buscar dados, decidir entre estados ou aplicar uma regra, isso acontece em `pages/` ou em um hook de `hooks/`, nunca dentro do componente visual.

Um exemplo concreto dessa divisão: o `StatCard` recebe um `value` já formatado como string e não sabe formatar moeda nem contagem. Quem formata é a página que o usa. Isso mantém o componente reutilizável em qualquer contexto e testável sem nenhuma dependência.

A maioria dos componentes é um arquivo único dentro da pasta do seu domínio. Quando um componente cresce o bastante para ter partes próprias, ele ganha uma pasta com o seu nome, como `components/vintex-ai/ChatBubble/`, `components/vintex-ai/LookSuggestions/` e `components/vintex-ai/OutfitSuggestionCard/`.

## Camada de services

Toda chamada HTTP passa por `src/services/`. Nenhuma tela usa `fetch` ou `axios` diretamente.

Os services disponíveis:

| Service | Responsabilidade |
|---|---|
| `httpClient.ts` | Instância do Axios com `baseURL`, autenticação e renovação de sessão; base dos demais |
| `authService.ts` | Cadastro, login, logout, sessão e política de senha |
| `catalogService.ts` | Feed, filtros, busca textual, busca por imagem e detalhe de peça |
| `recommendationService.ts` | Recomendações personalizadas de peças |
| `favoriteService.ts` | Peças favoritadas pelo usuário |
| `cartService.ts` | Carrinho de compras |
| `orderService.ts` | Pedidos, endereço de entrega e envio de comprovante |
| `reportService.ts` | Reclamações sobre pedidos: abertura pelo comprador e listagem para a administração |
| `adminReceiptService.ts` | Revisão de comprovantes pela administração da plataforma |
| `adminModerationService.ts` | Moderação de peças: suspender, restaurar e listar as suspensas |
| `dashboardService.ts` | Painel geral da administração da plataforma |
| `sellerProductService.ts` | Peças do vendedor: rascunho, mídia, publicação, gestão e resumo de vendas |
| `storeService.ts` | Criação, edição, verificação e consulta de loja |
| `preferenceService.ts` | Estilos e preferências do usuário |
| `notificationService.ts` | Notificações do usuário e contagem de não lidas |
| `legalService.ts` | Documentos legais, termos de uso e contrato do vendedor |
| `cepService.ts` | Consulta de endereço por CEP |
| `combinationService.ts` | Sugestões de look a partir de uma peça |
| `vintexAiService.ts` | Conversa com a assistente de IA, sugestão de anúncio e sugestão de preço |

Cada service também define o erro do seu domínio (`CatalogError`, `SellerProductError`, `AdminModerationError`), carregando o mesmo `code` do envelope de erro do back-end. Assim quem chama trata um formato único, independentemente de o dado ter vindo do mock ou da API.

Todo service tem um arquivo de teste irmão, com o mesmo nome e a extensão `.test.ts`. A pasta `src/services/__contracts__/` guarda os contratos de resposta usados por esses testes, de modo que uma mudança no formato que o back-end devolve quebra o teste do service antes de quebrar a tela.

### Mock e API real

Esta é a decisão de arquitetura mais importante do repositório. Cada service implementa **duas vezes** a mesma função, uma contra dados falsos e outra contra a API, e expõe só uma delas:

```ts
export function getFeed(params: FeedParams = {}): Promise<Paginated<Product>> {
  return useMocks ? Promise.resolve(mockGetFeed(params)) : apiGetFeed(params);
}
```

A escolha vem da variável `VITE_USE_MOCKS`, que vale para todos os services de uma vez. **Qualquer valor diferente de `false` mantém o mock**, inclusive a variável ausente, de modo que o projeto roda sem nenhum arquivo `.env` local.

Isso permitiu que o front fosse construído e testado antes de o back-end existir, e continua permitindo trabalhar em telas cujas rotas ainda não foram entregues. Com o mock desligado, erro HTTP é erro: não existe queda automática de volta para o mock.

A conversão entre o formato do back (`snake_case`, `cover_image_url`) e o do front (`camelCase`, `coverImageUrl`) é responsabilidade do service, nunca da camada de contratos nem do componente.

## Estado e hooks

O estado global vive em Context do React, em `src/context/`:

| Contexto | Responsabilidade |
|---|---|
| `AuthContext` | Usuário autenticado, sessão e renovação de token |
| `CartContext` | Carrinho de compras |
| `FavoritesContext` | Peças favoritadas |
| `NotificationsContext` | Notificações e contagem de não lidas |
| `ToastContext` | Mensagens temporárias de feedback |

O `AuthContext` espelha usuário, token de acesso e token de renovação em `sessionStorage`, além de guardar o caminho para onde redirecionar depois do login. O efeito prático dessa escolha é que a sessão não sobrevive ao fechamento da aba.

Cada contexto é acompanhado de um hook de consumo com o mesmo nome em camelCase, no mesmo diretório: `useAuth`, `useCart`, `useFavorites`, `useNotifications` e `useToast`. Nenhum componente usa `useContext` direto; o hook é a porta de entrada, e é ele que falha de forma clara quando o componente está fora do provider.

Repare que esses cinco hooks ficam em `src/context/`, ao lado do contexto que servem, e não em `src/hooks/`. A pasta `src/hooks/` guarda os hooks de tela, que buscam dados e controlam estado de uma página específica.

Para estado de tela, o projeto usa hooks próprios em `src/hooks/`. O padrão adotado é a **união discriminada de estados**, em vez de variáveis booleanas soltas:

```ts
export type MyStoreState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; store: StoreProfile | null };
```

A vantagem é que estados impossíveis deixam de existir: não há como estar carregando e com erro ao mesmo tempo, e o TypeScript obriga a tratar cada caso. Carregamento, erro, ausência de dados e sucesso são sempre explícitos.

Os hooks que buscam dados seguem três convenções:

1. Descartam a resposta de uma consulta que ficou obsoleta, com uma variável `cancelled` na limpeza do `useEffect`, evitando que uma resposta antiga sobrescreva uma mais recente
2. Expõem uma função `retry` que refaz a consulta, usada pelo `ErrorState`
3. Não renderizam nada: quem decide o que mostrar em cada estado é a página

## Design system

A identidade visual vive em `src/styles/tokens.ts` e em `tailwind.config.ts`. As cores têm nomes próprios do projeto (`tinta`, `branco-quente`, `papel-profundo`, `linha`, `texto-auxiliar`, `vermelho-escuro`, `verde-rs`), e a tipografia é dividida entre `font-display` e `font-ui`.

**Valores hexadecimais não entram nos componentes.** Toda cor, tamanho de fonte e espaçamento sai de um token do Tailwind. Se um valor necessário não existir, ele é adicionado ao `tailwind.config.ts`, nunca escrito direto na classe.

Os estados de interação (repouso, hover, foco, pressionado, desabilitado) seguem [`front-end/.ai/interaction-states.md`](https://github.com/Vintex-Ages/vintex-prod/blob/develop/front-end/.ai/interaction-states.md). Todo elemento interativo precisa de indicador de foco visível, e a navegação por teclado é requisito, não detalhe.

A página `/style-guide` renderiza os tokens em tela e serve de referência visual durante o desenvolvimento.

## Padrões de código

### Nomenclatura

| Item | Padrão | Exemplo |
|---|---|---|
| Componente | PascalCase, sem sufixo | `Button.tsx`, `StatCard.tsx`, `SellerProductRow.tsx` |
| Página | PascalCase, em pasta de mesmo nome | `pages/Catalog/Catalog.tsx` |
| Página simples | PascalCase, arquivo solto em `pages/` | `pages/Home.tsx`, `pages/ProductDetail.tsx` |
| Hook | camelCase com prefixo `use` | `useSellerProducts.ts`, `useMyStore.ts` |
| Service | camelCase com sufixo `Service` | `catalogService.ts`, `authService.ts` |
| Tipo / contrato | camelCase no arquivo, PascalCase no tipo | `types/product.ts` → `SellerProduct` |
| Teste | mesmo nome do alvo, com `.test` | `SellerAdmin.test.tsx` |

Identificadores de código (funções, variáveis, tipos, props) são escritos em **inglês**, em camelCase para funções e variáveis e em PascalCase para tipos e componentes. Comentários, mensagens de erro e qualquer texto visível ao usuário são escritos em **português**.

Diferentemente de outros projetos da AGES, o Vintex **não** usa sufixos `Component` ou `Screen` nos nomes de arquivo. A pasta já indica a natureza do módulo.

### Regras de código

As regras completas estão em [`front-end/.ai/coding-rules.md`](https://github.com/Vintex-Ages/vintex-prod/blob/develop/front-end/.ai/coding-rules.md), ao lado de outros documentos de contexto do projeto (`architecture.md`, `interaction-states.md`, `glossary.md`, `git-workflow.md`). As regras que mais aparecem em revisão:

- Componentes funcionais em TypeScript, com props e retornos tipados
- Componentes compartilhados não contêm regra de negócio: nem chamada HTTP, nem validação específica de uma tela
- Carregamento, erro, ausência de dados e sucesso tratados de forma explícita
- HTML semântico, navegação por teclado, rótulos de formulário e contraste adequado
- Sem dependência nova sem justificativa e verificação de compatibilidade
- Sem segredo no pacote final: só variáveis públicas apropriadas ao Vite chegam ao cliente
- As configurações de TypeScript, ESLint e Prettier não são enfraquecidas para fazer o código passar

Antes de concluir qualquer trabalho:

```bash
pnpm lint
pnpm format:check
pnpm exec tsc --noEmit
pnpm test
pnpm build
pnpm audit --audit-level high
```

Essa é exatamente a ordem do CI. Os três primeiros formam o job `Static checks`, que roda sozinho e precisa passar antes de qualquer outro; só então testes, cobertura, build e `audit` rodam em paralelo. Rodar na mesma ordem localmente faz você encontrar primeiro o erro que o CI encontraria primeiro.

## Testes

Os testes usam **Vitest** com **Testing Library**, em ambiente `jsdom`. A configuração do ambiente fica em `src/test/`.

O princípio que orienta a escrita é consultar o DOM **como o usuário o percebe**: por papel acessível e por texto visível, não por classe CSS ou estrutura interna. Na prática, `getByRole('button', { name: 'Anunciar peça' })` em vez de seletor de classe. Isso faz o teste continuar válido depois de uma mudança de estilo e falhar de verdade quando a acessibilidade quebra.

Testes de página isolam a camada de dados substituindo o service inteiro:

```ts
vi.mock('@/services/sellerProductService', () => ({
  getMine: vi.fn(),
}));
```

Assim o teste exercita a tela de verdade, com seus estados de carregamento, erro e vazio, sem depender de rede nem do mock de dados da aplicação.

Duas práticas que o time adota:

**Escrever o teste antes da implementação**, confirmando que ele falha nesse momento. Um teste que nunca falhou não prova nada.

**Garantir que o teste possa falhar.** Ao verificar ordenação, por exemplo, os dados são criados fora de ordem de propósito; criados já ordenados, o teste passaria mesmo com a funcionalidade quebrada.

Cobertura é verificada com `pnpm test:coverage`.

## Segurança de dependências

O front-end carrega uma correção de segurança própria, e vale entender o motivo antes de mexer nela.

O `braces` é uma biblioteca pequena que expande padrões como `{a,b}`. Ninguém a instalou de propósito: ela chega por baixo, pelo caminho `tailwindcss → micromatch → braces`. A vulnerabilidade dessa família é de negação de serviço. Um padrão com aninhamento muito profundo faz a expansão crescer de forma explosiva e trava o processo.

Enquanto não houver versão corrigida e compatível publicada, o projeto usa uma cópia própria, versionada em `front-end/vendor/braces`, com limite de aninhamento aplicado tanto ao analisador de padrões quanto às entradas recebidas já em forma de árvore. A substituição é declarada no `pnpm-workspace.yaml`:

```yaml
overrides:
  braces: file:./vendor/braces
  follow-redirects: ">=1.16.2"
```

Assim qualquer dependência que peça `braces`, em qualquer profundidade, recebe a cópia corrigida.

A correção é protegida por teste. O `pnpm test:braces-security` roda antes do Vitest, em `tests/braces-security.test.cjs`, e verifica **duas** cópias: a versionada em `vendor/` e a que chega pelo caminho real de resolução, via `micromatch`. A segunda não é redundância, é a confirmação de que o override de fato pegou. Para cada uma, o teste exige três comportamentos: que a expansão normal continue funcionando, que 101 níveis de aninhamento sejam recusados com erro, e que uma estrutura circular seja recusada antes de ser percorrida.

Por que isso importa para quem vai atualizar dependências: uma atualização pode trazer de volta uma versão sem o limite, sem ninguém perceber. O teste transforma esse risco silencioso em build vermelho. O `pnpm audit --audit-level high` também roda no CI, incluindo dependências de desenvolvimento e sem ignorar a advisory. **Remova o override somente quando uma versão corrigida e compatível estiver publicada**, e nunca para fazer o audit passar.

## Registro de decisões

Decisões que mudaram o rumo de uma tela ficam registradas em `front-end/docs/adr/`, numeradas em ordem cronológica. Cada registro explica o contexto, a decisão tomada e as consequências. É o que permite entender por que uma parte do código está de um jeito que à primeira vista parece errado.

Os registros existentes tratam do fluxo de anúncio e do painel do vendedor:

| Registro | Assunto |
|---|---|
| `0001` | Rascunho fora do painel do vendedor |
| `0002` | Edição da peça cai no detalhe público até a entrega de `back-end#234` |
| `0003` | Erro de formulário: resumo único e controle de foco |
| `0004` | Rascunhos em aba própria do painel |

Antes de alterar o comportamento de uma dessas telas, leia o registro correspondente. Parte do que parece inconsistência é decisão documentada, às vezes à espera de uma entrega do back-end.

## Padrões de commit e branch

O projeto adota **Conventional Commits**.

Formato do commit:

```
<tipo>: <descrição curta> (#<issue>)
```

| Tipo | Propósito |
|---|---|
| `feat` | Nova funcionalidade |
| `fix` | Correção de bug |
| `hotfix` | Correção crítica em produção |
| `refactor` | Refatoração sem mudança de comportamento |
| `docs` | Alteração em documentação |
| `chore` | Configurações, CI e dependências |

Formato de branch, sempre criada a partir de `develop`:

```
<prefixo>/<issue>-<descricao>
```

Os prefixos aceitos são `feature`, `bugfix`, `hotfix`, `refactor`, `docs` e `chore`. Repare que o prefixo da branch e o tipo do commit não são a mesma palavra: a branch usa `feature`, o commit usa `feat`.

Exemplos reais do projeto:

```
feature/220-painel-vendedor
chore/139-postgres-opcional-testes
docs/252-docusaurus-por-componente
```

Palavras em minúsculas separadas por hífen. **Todo trabalho precisa de uma issue**, inclusive alterações de governança e de pipeline. O nome da branch é validado automaticamente pelo `GitOps Validation`.

O fluxo de promoção é:

```
branch de trabalho → develop → qa → main → deploy
```

Cada etapa só aceita Pull Request da etapa anterior. `qa` recebe de `develop`, `main` recebe de `qa` e `deploy` recebe de `main`. As validações `PR Governance` e `GitOps Validation` recusam qualquer outro caminho.

Regras de Pull Request, detalhadas em [`CONTRIBUTING.md`](https://github.com/Vintex-Ages/vintex-prod/blob/develop/CONTRIBUTING.md):

- PRs de trabalho apontam para `develop`
- O template é preenchido por inteiro: Descrição, O que foi feito, Tipo de mudança, Componentes afetados, Uso de IA, Evidências, Prints, Checklist e Observações
- `Closes #<issue>` é a referência primária lida pela automação, e a primeira issue citada precisa ter o mesmo número da branch
- Exatamente um tipo de mudança é selecionado, em inglês, correspondendo ao prefixo da branch: `feature/...` exige `Feature`
- O uso de Inteligência Artificial é declarado, com as ferramentas e onde foram usadas, ou se escreve "Nenhuma"
- A revisão é pedida automaticamente aos donos do código, definidos em `.github/CODEOWNERS` como os integrantes de AGES III e AGES IV
- Um PR para `develop` exige uma aprovação e o CI verde. Não há merge automático
- Commits pequenos; um commit novo invalida aprovações anteriores

Quatro das regras acima são verificadas por automação, e o PR fica bloqueado até que passem: nome da branch e `Closes` pelo `GitOps Validation`; Descrição, O que foi feito, Uso de IA e Tipo de mudança pelo `PR Governance`.

O único check obrigatório do CI é o **`CI gate`**. Ele agrega os jobs que de fato rodaram e reprova se algum deles falhar. A razão de existir é sutil e vale conhecer: o CI só executa os componentes cuja pasta mudou, e um job que não roda fica pendente para sempre numa regra de proteção de branch. Exigir o `gate`, e não cada job, resolve isso.

## Ambiente de desenvolvimento

Requer **Node.js 22** e **pnpm 11.28.4**. O repositório não fixa a versão de Node em um `.nvmrc`; a referência é o CI, que instala essas duas versões em `.github/actions/setup-front-end` antes de qualquer verificação do front.

Todos os comandos rodam de dentro de `front-end/`:

```bash
cd front-end
pnpm install --frozen-lockfile
pnpm dev
```

O padrão é rodar com dados falsos. Para consumir a API real, crie um `.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8000/api
VITE_USE_MOCKS=false
```

`VITE_API_BASE_URL` já termina em `/api` de propósito: é o `baseURL` do `httpClient`, e por isso os caminhos nos services começam depois dele (`/users/me/store`, e não `/api/users/me/store`).

O Vite lê as variáveis de ambiente uma única vez, no início. **Reinicie o servidor sempre que alterar qualquer uma delas.**

Scripts disponíveis:

| Comando | O que faz |
|---|---|
| `pnpm dev` | Servidor de desenvolvimento |
| `pnpm build` | Verificação de tipos e build de produção |
| `pnpm preview` | Serve o build de produção localmente |
| `pnpm lint` | ESLint, sem tolerância a avisos |
| `pnpm format` | Formata com Prettier |
| `pnpm format:check` | Verifica a formatação de `src/` sem alterar arquivos |
| `pnpm test` | Verificação de cadeia de dependências e, em seguida, os testes com Vitest |
| `pnpm test:braces-security` | Apenas a verificação de cadeia de dependências |
| `pnpm test:coverage` | Testes com relatório de cobertura |

O `pnpm test` roda `test:braces-security` antes do Vitest, de propósito: se a verificação de cadeia de dependências falhar, a suíte nem começa.

### Limitações conhecidas com a API real

Salvar preferências, no fim do onboarding e na tela de perfil, ainda não funciona com o mock desligado: o front chama `GET` e `PUT /users/me/preferences` e a rota não existe na `develop` do back-end (`back-end#80` e `back-end#81`). Ler os estilos funciona (`GET /styles`), então a tela carrega e só falha ao concluir.

As funcionalidades de Inteligência Artificial (conversa com a Vintex e preenchimento de peça pela foto) exigem `AI_PROVIDER=google` e uma `GOOGLE_API_KEY` no `.env` do back-end. Com o valor padrão, o back responde 503 e o front mostra o aviso de indisponibilidade.
