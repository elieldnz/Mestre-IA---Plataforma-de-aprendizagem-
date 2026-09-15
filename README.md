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

**Primeiro acesso e diagnóstico**
- 12 perguntas, cálculo de nível (iniciante / intermediário / avançado), forças, lacunas,
  ritmo de estudo sugerido e trilha personalizada por objetivo.

**Dashboard**
- saudação, próxima missão, 4 indicadores (progresso, XP, streak, nível),
  missão do dia (15 / 45 / 90 minutos) e prévia do mapa da jornada.

**Trilha e aulas**
- 20 fases, 98 aulas, 127 exercícios.
- Página de aula: objetivo → conceito → exemplo → “tente você” → feedback → próxima etapa.
- Tipos de exercício: quiz, resposta aberta, prática, código, desafio.
- Checkpoint por módulo, com resultado e liberação do próximo.

**Progressão por domínio (não por clique)**
- Uma aula só é **dominada** com evidência: todos os exercícios respondidos e média ≥ 80.
- Um módulo libera o seguinte quando 70% das suas aulas estão dominadas.
- A página de cada módulo bloqueado diz exatamente o que falta.

**Skill Explorer**
- As 50 Skills do material, em 6 categorias, com filtros por categoria, confiança, nível
  e palavra-chave.
- Página de Skill com o que é, quando usar, pré-requisitos, exemplo, exercício, projeto,
  **checklist de segurança de 10 itens antes de instalar** e checklist de estudo.
- A plataforma **não publica comandos de instalação** e não instala nada: o material exige
  verificar repositório oficial, manutenção, compatibilidade e permissões antes.

**Projetos**
- 23 projetos (19 do portfólio + 3 de fase + projeto final) com workspace de 13 seções:
  objetivo, requisitos, arquitetura, tecnologias, Skills, tarefas, código, testes, erros,
  decisões, documentação, resultado e portfólio.
- Concluir exige evidência: todas as tarefas marcadas **e** resultado e portfólio escritos.

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

Isso está escrito na própria tela de feedback. Toda resposta aberta traz uma **resposta de
referência** para comparação. A arquitetura já prevê a substituição desse avaliador por uma
LLM real (ver Roadmap).

---

## Origem do conteúdo

A plataforma marca cada bloco de conteúdo:

- **“Baseado no material fornecido.”** — estrutura de fases, projetos do portfólio, os 10
  estudos de caso de prompts, nomes/categorias/níveis de confiança das 50 Skills, checklist
  de segurança, tabela de XP e escala de avaliação.
- **“Conhecimento complementar.”** — explicações, exemplos, exercícios, rubricas e critérios
  de aceite escritos para esta plataforma.

Onde o material fornecido só dá o nome e a confiança de uma Skill, a página mostra o objetivo
**da categoria** (do material) e deixa claro que a descrição de uso é complementar. Nenhum
comando de instalação, URL de repositório ou recurso de biblioteca foi inventado.

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
  projects.json          23 projetos e seções do workspace
tools/build-data.js      gera js/data-bundle.js a partir de /data
tests/                   data.mjs · smoke.mjs · quality.mjs
assets/                  (vazio: os ícones são emoji e SVG inline)
```

### Editando conteúdo

1. edite o JSON em `/data`;
2. rode `node tools/build-data.js` (mantém o fallback sincronizado);
3. rode `node tests/data.mjs` para validar ids, referências e campos obrigatórios.

---

## Testes

```bash
node tests/data.mjs       # ids, referências cruzadas e campos obrigatórios (sem navegador)
node tests/smoke.mjs      # fluxo completo no navegador (38 verificações)
node tests/quality.mjs    # progressão, links, botões, acessibilidade, contraste, file:// (24)
```

Os testes de navegador usam Playwright — instalado no projeto (`npm install --no-save playwright`)
ou globalmente; eles sobem um servidor estático próprio em porta livre.

Cobertura atual: **100% das 62 verificações passando, sem erros de console.**

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
- `prefers-reduced-motion` respeitado.

---

## Roadmap

- **V2** — banco de dados, login, sincronização, IA real como tutor.
- **V3** — execução de código, playground, integração com APIs.
- **V4** — agentes reais, Skills reais, n8n, MCP.
- **V5** — marketplace pessoal de Skills, portfólio público, certificação, métricas avançadas.

O ponto de troca para a **V2** é pequeno de propósito: `MIA.lessons.grade()` (correção) e
`MIA.tutor.respond()` (tutor) são as duas funções que uma LLM substituiria, e
`MIA.progress` é a única camada que fala com o `localStorage`.

---

## Princípio

Esta plataforma não existe para o aluno **assistir aulas**. Ela existe para fazê-lo
**resolver problemas cada vez mais difíceis**: aprender → praticar → criar → automatizar →
programar → construir → testar → criar sistemas.
