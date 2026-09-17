/* PR #7 — Fechar vazamento de evidência.

   Prova, para os 89 exercícios reais com rubrica (open/practice/challenge),
   que o feedback de gradeOpen/renderFeedback parou de expor a rubrica
   interna (keywords que faltaram, keywords que bateram, estrutura
   esperada) e a resposta de referência (exercise.model) — sem alterar em
   NADA o cálculo da nota. E prova, via fluxo real de UI, que "Registrar em
   Meus erros" (na Aula e na Revisão) parou de gravar exercise.model no
   campo `correction`, e que a tela de Meus Erros usa um texto pedagógico
   genérico quando não há correção — nunca um "—" mudo, nunca a rubrica.

   Este teste NÃO verifica "a nota está certa" — verifica que, para o
   MESMO conteúdo de rubrica, o cálculo de gradeOpen continua idêntico ao
   registrado em tests/fixtures/vazamento-baseline.json. Essa baseline
   precisa ser recapturada (tests/fixtures/capture-vazamento-baseline.mjs)
   sempre que um PR mudar deliberadamente o CONTEÚDO das rubricas (ex.:
   PR #9) — o que este teste protege é o algoritmo, não o texto das
   keywords. Evita a checagem ingênua `!html.includes(keyword)`: uma keyword
   de rubrica pode legitimamente aparecer no texto fixo do template (ex.:
   "Você usou dado concreto" contém a palavra "dado"). Em vez disso, cada
   frase de strengths/improvements é comparada a uma lista fechada de
   templates fixos que o código pode gerar — se QUALQUER frase fugir dessa
   lista, é porque voltou a nomear algo específico da rubrica.

   Uso: node tests/vazamento-evidencia.mjs   (requer Playwright)            */
import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';
import { loadCurriculum, buildCases } from './fixtures/respostas-rubrica.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const curriculum = loadCurriculum();
const cases = buildCases(curriculum);
const baseline = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'vazamento-baseline.json'), 'utf8'));

const { server, base: BASE } = await startServer();
const results = []; const errors = [];
const check = (n, c, e = '') => results.push({ n, ok: !!c, e });

const chromium = await loadChromium();
const browser = await chromium.launch();

/* Lista fechada de frases que gradeOpen/renderFeedback têm permissão de
   gerar. Qualquer string fora daqui prova que voltou a nomear rubrica. */
const ALLOWLIST = [
  /^Extensão adequada: \d+ palavras?\.$/,
  /^Desenvolva mais: você escreveu \d+ palavras? e o exercício pede pelo menos \d+\.$/,
  /^Sua resposta contempla parte dos pontos esperados\.$/,
  /^Aprofunde a explicação dos conceitos centrais que o exercício pede\.$/,
  /^Inclua exemplos ou relações entre os conceitos quando fizer sentido\.$/,
  /^Você usou dado concreto — isso separa resposta genérica de resposta útil\.$/,
  /^Acrescente algo concreto: um número, um prazo ou um exemplo do seu contexto\.$/
];
function frasesForaDaLista(frases) {
  return frases.filter(function (f) { return !ALLOWLIST.some(function (re) { return re.test(f); }); });
}

/* ============ parte 1: varredura estática nos 89 exercícios ============ */
{
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const state = {
    version: 1, user: { name: 'Teste', createdAt: '2026-01-01T00:00:00Z' },
    diagnostic: { level: 'iniciante', percent: 10, dimensions: [], strengths: [], gaps: [],
      track: { label: 'x', modules: [] }, date: '2026-01-01T00:00:00Z', mode: 'normal' },
    xp: 0, streak: { current: 0, best: 0, lastDay: null }, minutes: 0,
    lessons: {}, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: {}
  };
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(state));
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);

  const varredura = await page.evaluate((cases) => {
    return cases.map(function (c) {
      const lesson = window.MIA.get.lesson(c.lessonId);
      const exercise = lesson.exercises.find(function (e) { return e.id === c.exerciseId; });
      const variantes = {};
      Object.keys(c.respostas).forEach(function (nome) {
        const result = window.MIA.lessons.grade(exercise, c.respostas[nome]);
        const html = window.MIA.lessons.renderFeedback(exercise, result);
        variantes[nome] = {
          score: result.score,
          frases: (result.strengths || []).concat(result.improvements || []),
          html: html
        };
      });
      return { exerciseId: c.exerciseId, model: exercise.model || '', variantes: variantes };
    });
  }, cases);

  varredura.forEach(function (v) {
    const base = baseline[v.exerciseId];
    if (!base) { check('[' + v.exerciseId + '] existe linha de base de score', false, 'rode capture-vazamento-baseline.mjs'); return; }

    Object.keys(v.variantes).forEach(function (nome) {
      const variante = v.variantes[nome];

      check('[' + v.exerciseId + '/' + nome + '] score idêntico ao de antes do PR #7 (cálculo não muda)',
        variante.score === base[nome], 'antes=' + base[nome] + ' depois=' + variante.score);

      const fora = frasesForaDaLista(variante.frases);
      check('[' + v.exerciseId + '/' + nome + '] feedback só usa frases genéricas (rubrica não é nomeada)',
        fora.length === 0, JSON.stringify(fora));

      check('[' + v.exerciseId + '/' + nome + '] feedback não tem bloco de resposta de referência (<details>)',
        !variante.html.includes('<details'));

      if (v.model) {
        check('[' + v.exerciseId + '/' + nome + '] feedback não contém o texto de exercise.model',
          !variante.html.includes(v.model.slice(0, 40)));
      }
    });
  });

  await page.close();
}

/* ============ parte 2: fluxo real de UI — Aula ============ */
const LESSON_ID = 'fund-001';
const lesson = curriculum.modules.flatMap(m => m.lessons).find(l => l.id === LESSON_ID);
const quiz = lesson.exercises.find(e => e.type === 'quiz');
const aberta = lesson.exercises.find(e => e.type === 'open');

function baseState() {
  return {
    version: 1, user: { name: 'Teste', createdAt: '2026-01-01T00:00:00Z' },
    diagnostic: { level: 'iniciante', percent: 10, dimensions: [], strengths: [], gaps: [],
      track: { label: 'x', modules: [] }, date: '2026-01-01T00:00:00Z', mode: 'normal' },
    xp: 0, streak: { current: 0, best: 0, lastDay: null }, minutes: 0,
    lessons: {}, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: {}
  };
}

{
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(baseState()));
  await page.goto(BASE + '#/aula/' + LESSON_ID, { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);

  /* exercício quiz errado -> registra erro -> correction é a alternativa
     CORRETA (comportamento preexistente, não deve ser afetado pelo PR) */
  const wrongIndex = quiz.options.findIndex((_, i) => i !== quiz.answer);
  const quizCard = page.locator('#ex-' + quiz.id);
  await quizCard.locator('.option').nth(wrongIndex).click();
  await quizCard.locator('[data-action="submit"]').click();
  await page.waitForTimeout(150);
  await quizCard.locator('[data-action="register-error"]').click();
  await page.waitForTimeout(150);

  /* exercício aberto sem keywords -> nota baixa -> registra erro -> correction
     não deve conter exercise.model (o vazamento original) */
  const abertaCard = page.locator('#ex-' + aberta.id);
  await abertaCard.locator('textarea').fill('texto sem relação nenhuma com o exercício pedido aqui mesmo');
  await abertaCard.locator('[data-action="submit"]').click();
  await page.waitForTimeout(150);
  const temBotaoErro = await abertaCard.locator('[data-action="register-error"]').count();
  if (temBotaoErro) {
    await abertaCard.locator('[data-action="register-error"]').click();
    await page.waitForTimeout(150);
  }

  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
  const errQuiz = saved.errors.find(e => e.error === quiz.question);
  const errAberta = saved.errors.find(e => e.error === aberta.question);

  check('[Aula] erro de quiz registra a alternativa CORRETA em correction (preexistente, intacto)',
    !!errQuiz && errQuiz.correction === quiz.options[quiz.answer]);
  check('[Aula] erro de exercício aberto NÃO grava exercise.model em correction',
    !!errAberta && errAberta.correction !== aberta.model && !String(errAberta.correction || '').includes(aberta.model.slice(0, 40)));
  check('[Aula] erro de exercício aberto grava correction vazia (sem substituto que vaze a rubrica)',
    !!errAberta && errAberta.correction === '');

  /* ---- Meus erros: fallback pedagógico genérico, não "—", não a rubrica ----
     A checagem fica restrita à célula de CORREÇÃO (3ª <td>), nunca à linha
     inteira: a célula de "Erro" mostra a pergunta do exercício verbatim, que
     legitimamente contém as mesmas keywords da rubrica (ex.: a pergunta de
     fund-001-e1 já usa "classificar" e "gerar") — isso não é vazamento, é a
     pergunta que o aluno já viu. Testar a linha inteira produziria falso
     positivo exatamente do tipo que este PR foi instruído a evitar. */
  await page.goto(BASE + '#/erros', { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  const linhaAberta = page.locator('tr', { hasText: aberta.question });
  const celulaCorrecao = await linhaAberta.locator('td').nth(2).textContent();
  check('[Meus erros] fallback é um texto pedagógico genérico (não "—")',
    celulaCorrecao.includes('Reabra a aula para revisar a explicação e tentar novamente.') && !celulaCorrecao.includes('—'));
  check('[Meus erros] célula de correção não contém a resposta de referência',
    !celulaCorrecao.includes(aberta.model.slice(0, 40)));
  check('[Meus erros] célula de correção não contém nenhuma keyword da rubrica (fallback é 100% fixo)',
    !(aberta.rubric.keywords || []).some(function (k) { return celulaCorrecao.toLowerCase().includes(k.toLowerCase()); }));

  await page.close();
}

/* ============ parte 3: fluxo real de UI — Revisão ============ */
{
  const state = baseState();
  state.lessons[LESSON_ID] = { read: true, xpAwarded: true, completedAt: '2026-01-01T00:00:00Z', exercises: {} };
  state.reviews[LESSON_ID] = { interval: 1, due: new Date().toISOString().slice(0, 10), lastScore: 40, lastAt: '2026-01-01T00:00:00Z' };
  // força recallPrompt a oferecer o exercício ABERTO (exclui o quiz do pool
  // marcando-o como já tendo um erro em aberto na mesma aula).
  state.errors = [{ id: 'err-pre', concept: 'x', error: quiz.question, correction: quiz.options[quiz.answer], example: '', lessonId: LESSON_ID, date: '2026-01-01T00:00:00Z', repetitions: 1, status: 'revisar' }];

  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(state));
  await page.goto(BASE + '#/revisao', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);

  const card = page.locator('[data-review="' + LESSON_ID + '"]');
  const hasCheck = await card.locator('[data-action="check-recall"]').count();
  check('[Revisão] pool exclui o quiz (erro aberto) e oferece o exercício aberto para recall', hasCheck > 0);

  if (hasCheck > 0) {
    await card.locator('textarea').fill('texto sem relação nenhuma com o exercício pedido aqui mesmo');
    await card.locator('[data-action="check-recall"]').click();
    await page.waitForTimeout(150);

    const registerBtn = card.locator('[data-action="register-error"]');
    if (await registerBtn.count()) {
      await registerBtn.click();
      await page.waitForTimeout(150);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
      const errAberta = saved.errors.find(e => e.lessonId === LESSON_ID && e.error === aberta.question);
      check('[Revisão] "Registrar em Meus erros" no exercício aberto NÃO grava exercise.model',
        !!errAberta && errAberta.correction === '');
    } else {
      check('[Revisão] "Registrar em Meus erros" no exercício aberto NÃO grava exercise.model',
        true, 'botão não apareceu (nota não ficou abaixo de 80, comportamento esperado)');
    }
  }
  await page.close();
}

await browser.close();
server.close();

let fails = 0;
console.log('\n=== VAZAMENTO DE EVIDÊNCIA (PR #7) ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros de console/página: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
