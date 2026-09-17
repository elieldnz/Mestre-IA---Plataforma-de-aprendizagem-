# MESTRE IA — Plataforma de Aprendizagem

> Sua jornada do usuário ao criador de sistemas de IA.

MVP funcional em **HTML + CSS + JavaScript puro**, sem backend e sem dependências de
runtime. Todo o progresso do aluno vive no `localStorage` do navegador.

A plataforma é organizada em duas camadas, que andam juntas:

| Camada | O que é | Onde aparece |
| --- | --- | --- |
| **1 — Aprendizado** | aulas → exercícios → avaliação → revisão → domínio | Aulas, Revisão, Meus erros, Progresso |
| **2 — Construção** | Skills → agentes → automações → código → projetos → portfólio | Skill Explorer, Projetos, Desafios |

---

## Como rodar

**Opção 1 — abrir o arquivo direto**

```
Abra index.html no navegador.
```

Funciona sem servidor: quando o navegador bloqueia `fetch` em `file://`, a aplicação
cai automaticamente para `js/data-bundle.js` (gerado a partir de `/data/*.json`).

**Opção 2 — servidor local** (recomendado para desenvolvimento, pois lê os JSON diretamente)

```bash
python3 -m http.server 8000
# ou
npx http-server -p 8000
```

Depois acesse <http://localhost:8000>.

No primeiro acesso a plataforma aplica o **diagnóstico** (12 perguntas) e monta a
trilha personalizada. Para recomeçar do zero: **Perfil → Apagar tudo**.

---

## O que está implementado

**Primeiro acesso e diagnóstico adaptativo**
- A tela de boas-vindas explica as duas camadas do produto antes da primeira pergunta:
  **Camada 1 — Aprendizado** (desenvolver conhecimento e competência) e **Camada 2 —
  Construção** (transformar isso em Skills, agentes e projetos com evidência) — para o
  aluno entender por que a plataforma não é só um curso.
- Até 12 perguntas — **algumas são puladas de verdade** conforme as respostas anteriores
  (regra fixa e declarada na tela, não uma IA decidindo: quem nunca usou IA não vê perguntas
  sobre ferramentas e agentes; quem não programa não vê Python nem APIs). Um total iniciante
  responde só 8. O resultado lista quais perguntas foram puladas e por quê.
- Cálculo de nível (iniciante / intermediário / avançado), forças, lacunas, ritmo de estudo
  sugerido e objetivo/trilha personalizada.

**Trilha personalizada de verdade**
- O objetivo escolhido no diagnóstico (ex.: "Construir agentes", "Dados e documentos") passa
  a **reordenar de verdade** a Jornada, as Aulas e a "próxima missão" do Dashboard — antes,
  o resultado do diagnóstico só mostrava essa lista uma vez e a plataforma seguia a ordem
  fixa das 20 fases pra todo mundo.
- As fases do seu objetivo aparecem primeiro; o resto da trilha Mestre IA continua logo
  abaixo, em "Outras fases" — nada some, nada é bloqueado ou liberado por causa disso.
- Você pode **mudar de objetivo a qualquer momento pelo Perfil**, sem refazer as 12
  perguntas do diagnóstico.
- É personalização por regra fixa entre 5 objetivos pré-definidos — não é "digite qualquer
  tema e a IA monta uma trilha nova" (isso segue exigindo backend + LLM, ver Roadmap).

**Dashboard**
- saudação, próxima missão, 4 indicadores (progresso, XP, streak, nível),
  missão do dia (15 / 45 / 90 minutos) e prévia do mapa da jornada.

**Trilha e aulas**
- 20 fases sobre IA, 102 aulas, 136 exercícios — mais uma **trilha piloto fora do tema IA**
  (ver abaixo). A Fase 15 (Frameworks de Agentes) ensina Agno, LangChain, LangGraph e CrewAI
  individualmente — conceito, arquitetura, exemplo e comparação de cada um, não só o nome.
- Página de aula: objetivo → conceito → exemplo → “tente você” → feedback → próxima etapa.
- Tipos de exercício: quiz, resposta aberta, prática, código, desafio.
- Checkpoint por módulo, com resultado e liberação do próximo.

**Progressão por competência, não por clique**
- Uma aula só é **dominada** com evidência: todos os exercícios respondidos e média ≥ 80.
- Um módulo libera o seguinte quando 70% das suas aulas estão dominadas.
- A página de cada módulo bloqueado diz exatamente o que falta.
- A página **Progresso** tem uma seção **"O que você já sabe fazer"**: lista o objetivo de
  cada aula dominada (não das assistidas) — competência comprovada, não conteúdo consumido.

**Trilha piloto (fora do tema IA)**
- Um módulo completo — *Produtividade pessoal* (3 aulas + projeto) — construído com o mesmo
  motor da trilha de IA, para provar que diagnóstico, progressão por domínio, exercícios e
  projeto funcionam para qualquer assunto. Aparece separado, sempre disponível, não conta
  para o nível de IA e nunca é sugerido como "missão do dia".
- É conteúdo autoral desta plataforma — **sem curadoria de vídeo do YouTube e sem geração
  automática por IA**. Isso exige um passo que ainda não existe aqui (backend + modelo de
  linguagem real + integração com a API oficial do YouTube) — ver Roadmap.

**Skill Explorer**
- As 50 Skills do material, em 6 categorias, com filtros por categoria, confiança, nível
  e palavra-chave.
- Página de Skill com o que é, quando usar, pré-requisitos, exemplo, exercício, projeto,
  **checklist de segurança de 10 itens antes de instalar** e checklist de estudo.
- A plataforma **não publica comandos de instalação** e não instala nada: o material exige
  verificar repositório oficial, manutenção, compatibilidade e permissões antes.

**Projetos**
- 24 projetos (19 do portfólio + 3 de fase + projeto final + 1 piloto) com workspace de 13
  seções: objetivo, requisitos, arquitetura, tecnologias, Skills, tarefas, código, testes,
  erros, decisões, documentação, resultado e portfólio.
- Concluir exige evidência: todas as tarefas marcadas **e** resultado e portfólio escritos.
- **Autosave com debounce**: salva ~800ms depois de você parar de digitar, sem exigir que
  clique fora do campo. Indicador "Salvo há X segundos" em cada seção; texto recuperado
  automaticamente ao reabrir; aviso do navegador ao tentar fechar a aba **só** quando há
  digitação ainda não salva.

**Memória**
- Revisão espaçada por recuperação ativa (intervalo ajustado pelo quanto você lembrou).
- Registro de erros com conceito, erro, correção, exemplo, data e repetições.
  Quiz errado entra automaticamente.

**Professor IA**
- Painel contextual com os comandos `/aula`, `/exercicio`, `/prova`, `/desafio`, `/revisao`,
  `/projeto`, `/progresso`, `/mapa`, `/explicar`, `/avancar`, `/portfolio`, `/ajuda`.
- Regras de conversa: “não entendi” → reexplica; “entendi” → testa; pedido de resposta →
  incentiva a tentativa; erro repetido → traz o erro registrado.

**Perfil**
- Nome, números, ritmo, diagnóstico, **exportar/importar backup** em JSON e apagar tudo.

---

## Honestidade sobre a avaliação

A correção de respostas abertas e de código é **heurística local, sem IA**:

- **quiz** — comparação com a alternativa correta;
- **resposta aberta / prática / desafio** — extensão, cobertura das palavras-chave da rubrica,
  estrutura pedida e presença de dado concreto;
- **código** — verificação de padrões (`contains`, `regex`, `notContains`, JSON válido, chaves
  obrigatórias). **O código não é executado.**

Isso está escrito na própria tela de feedback. A arquitetura já prevê a substituição desse
avaliador por uma LLM real (ver Roadmap) — enquanto isso não existe, a resposta de referência
de cada exercício deixou de aparecer na tela: mostrá-la junto com a rubrica ensinaria o aluno
a decorar o que o avaliador quer ler, em vez de a resolver o problema.

**Completude não é competência.** O número que o corretor produz (`score`, 0-100) mede
**completude**: o quanto a resposta cobre o comprimento, as palavras-chave e a estrutura que a
rubrica pede. Hoje, "aula dominada" é definido como completude ≥ 80 — um limiar mais alto na
mesma régua, não uma segunda medição independente. Isso significa que a heurística atual pode
ser satisfeita por uma resposta que cobre os termos certos sem demonstrar compreensão real, e
que a plataforma ainda **não tem**, na versão atual, uma forma verificável de medir
competência isoladamente da completude. Essa é uma limitação reconhecida, não escondida: o
roadmap de evolução da avaliação trata completude e competência como conceitos distintos desde
já, mesmo que o mecanismo para medir a segunda ainda não exista.

---

## Origem do conteúdo

Duas fontes externas, nenhuma delas produzida por esta plataforma:

- **A especificação UX/UI** (colada na conversa) — estrutura de 20 fases, projetos do
  portfólio, os 10 estudos de caso de prompts, checklist de segurança, tabela de XP,
  escala de avaliação e a paleta.
- **O guia “50 Claude Skills” (Asimov Academy, Rodrigo Tadewald, atualizado ago/2026)**,
  fornecido em PDF — nome, categoria, descrição oficial, nível de confiança (ALTO/MÉDIO/BAIXO)
  e **link do repositório** de cada uma das 50 Skills. A página de cada Skill mostra esse link
  em uma seção própria (“Repositório oficial, citado no guia”) e nunca sugere um comando de
  instalação — o próprio guia manda abrir o repositório e conferir manutenção, compatibilidade
  e permissões antes.

A plataforma marca cada bloco de conteúdo como **“Baseado no material fornecido”** (vem de uma
dessas duas fontes) ou **“Conhecimento complementar”** (explicações, exemplos, exercícios,
rubricas e critérios de aceite escritos para esta plataforma). Nenhum comando de instalação,
URL de repositório ou recurso de biblioteca foi inventado — os 50 links são os do PDF, citados
literalmente, inclusive quando o próprio guia repete por engano o mesmo link em duas Skills
(o app avisa nesse caso pontual).

---

## Estrutura de arquivos

```
index.html               shell da aplicação
css/styles.css           tokens semânticos, mobile-first, tema escuro
js/
  data.js                carrega /data/*.json (com fallback) e indexa
  data-bundle.js         GERADO por tools/build-data.js — não editar à mão
  ui.js                  helpers, markdown mínimo e seguro, formatação
  progress.js            estado: XP, streak, domínio, revisão, erros, projetos
  lessons.js             correção dos exercícios e páginas de aula
  skills.js              Skill Explorer e página de Skill
  projects.js            biblioteca de projetos e workspace
  review.js              revisão espaçada, erros e missão do dia
  tutor.js               Professor IA (determinístico)
  onboarding.js          boas-vindas, diagnóstico e ponto de partida
  app.js                 roteador, dashboard, jornada, progresso, perfil, biblioteca
data/
  curriculum.json        fases, aulas, exercícios, diagnóstico, XP, avaliação
  skills.json            50 Skills, 6 categorias, checklists
  projects.json          24 projetos e seções do workspace
tools/build-data.js      gera js/data-bundle.js a partir de /data
tests/                   data.mjs · smoke.mjs · quality.mjs · diagnostic.mjs · pilot.mjs ·
                         trilha-personalizada.mjs · autosave.mjs
assets/                  (vazio: os ícones são emoji e SVG inline)
```

### Editando conteúdo

1. edite o JSON em `/data`;
2. rode `node tools/build-data.js` (mantém o fallback sincronizado);
3. rode `node tests/data.mjs` para validar ids, referências e campos obrigatórios.

---

## Testes

```bash
node tests/data.mjs        # ids, referências cruzadas e campos obrigatórios (sem navegador)
node tests/smoke.mjs       # fluxo completo no navegador (38 verificações)
node tests/quality.mjs     # progressão, links, botões, acessibilidade, contraste, file:// (24)
node tests/diagnostic.mjs           # diagnóstico ramificado + camadas no onboarding + a11y do grupo (16)
node tests/pilot.mjs                # trilha piloto isolada do nível de IA e da missão do dia (14)
node tests/trilha-personalizada.mjs # objetivo reordena Jornada/Aulas/missão sem afetar bloqueio (14)
node tests/autosave.mjs             # debounce, indicador, recuperação, aviso de saída, sem vazar entre projetos (14)
```

Ou tudo de uma vez: `npm test`.

Os testes de navegador usam Playwright — instalado no projeto (`npm install --no-save playwright`)
ou globalmente; eles sobem um servidor estático próprio em porta livre.

Cobertura atual: **100% das 120 verificações passando, sem erros de console.** `tests/data.mjs`
também verifica que a Fase 15 ensina cada framework de verdade (nome citado várias vezes, não
só no título, mais uma palavra-chave específica de cada um) — não é suficiente para garantir
qualidade pedagógica sozinho, então vale ler o conteúdo da Fase 15 você mesmo antes de aprovar.

| Verificação | Estado |
| --- | --- |
| Navegação intuitiva, próximo passo sempre visível | ✓ |
| Visual consistente, responsivo (≥ 390 px, sem rolagem horizontal) | ✓ |
| Acessível: labels, foco visível, navegação por teclado, contraste AA | ✓ |
| Progresso, XP, aulas, Skills e projetos persistem | ✓ |
| Sem erros no console | ✓ |
| Sem links quebrados, botões falsos ou páginas vazias | ✓ |

---

## Acessibilidade

- Contraste AA (≥ 4.5:1) verificado por teste para todos os pares de texto da paleta.
- Navegação completa por teclado, com atalho “pular para o conteúdo” e foco visível.
- `label` em todo campo; `aria-current`, `aria-expanded`, `aria-pressed` e `role="log"` onde a
  semântica nativa não basta; foco levado ao título a cada navegação.
- Grupos de múltipla seleção (checkbox) do diagnóstico têm `role="group"` + `aria-label` com o
  texto da pergunta — igual aos de escolha única (`role="radiogroup"`), com teste dedicado para
  não regredir.
- `prefers-reduced-motion` respeitado.

---

## Roadmap

- **V2** — banco de dados, login, sincronização, IA real como tutor e corretor.
- **V3** — execução de código, playground, integração com APIs.
- **V4** — agentes reais, Skills reais, n8n, MCP.
- **V5** — marketplace pessoal de Skills, portfólio público, certificação, métricas avançadas.

### Visão de produto: GPS de aprendizagem para qualquer tema

Um complemento de especificação propõe uma versão mais ambiciosa do produto: o aluno digita
**qualquer** tema (não só IA), a plataforma monta uma trilha automaticamente, cura vídeos
gratuitos do YouTube como recurso (sem baixar ou hospedar cópia, com o player oficial e
crédito claro ao criador), e agentes de IA especializados (pesquisador, avaliador,
pedagógico, de atualização, tutor, de progresso) mantêm isso vivo. O modelo de negócio
proposto é assinatura de baixo custo pela curadoria/organização — não pelos vídeos em si —,
com um experimento futuro de "pague o que valeu".

Essa visão **não está implementada** neste MVP estático, por uma razão de arquitetura, não de
prioridade: ela depende de peças que um site sem backend não tem — chamada a uma LLM de
verdade (client-side exporia a chave de API, o exato erro que a Fase 8 desta trilha ensina a
evitar), a API oficial do YouTube (com quota e servidor para não vazar credencial) e um
processo real de curadoria/atualização de conteúdo. Simular isso com dados estáticos seria
fingir uma capacidade que a plataforma não tem — o mesmo cuidado que guia a correção
heurística (declarada como tal) e o catálogo de Skills (fiel ao PDF fornecido, sem inventar
repositório). O que existe hoje, dentro do que dá para fazer sem backend, é genuíno:
diagnóstico ramificado, progressão por competência e a trilha piloto fora do tema IA
descritos acima. O restante — tema livre por texto, curadoria de vídeo, agentes reais,
modelo de pagamento — é o conteúdo natural da V2 a V5 acima.

O ponto de troca para a **V2** é pequeno de propósito: `MIA.lessons.grade()` (correção) e
`MIA.tutor.respond()` (tutor) são as duas funções que uma LLM substituiria, e
`MIA.progress` é a única camada que fala com o `localStorage`.

---

## Princípio

Esta plataforma não existe para o aluno **assistir aulas**. Ela existe para fazê-lo
**resolver problemas cada vez mais difíceis**: aprender → praticar → criar → automatizar →
programar → construir → testar → criar sistemas.
