/* PR #12 — becos de UX destravados pelo PR #4 (idempotência) + lote na
   revisão + telas de erro consistentes.

   Os itens A e B (aula/projeto) são destravados pelo PR #4 especificamente
   porque re-renderizar deixou de acumular listeners — mas nenhum dos dois usa
   MIA.app.render() cego: a aula insere só o botão que falta (preserva
   rascunho de outro exercício não enviado na mesma página) e o projeto faz
   patch cirúrgico do rodapé (preserva foco/cursor no autosave). O item C
   (lote na revisão) e D (telas de erro) são independentes do PR #4.

   Uso: node tests/ux-pos-idempotencia.mjs   (requer Playwright)             */
import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const curriculum = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curriculum.json'), 'utf8'));

const { server, base: BASE } = await startServer();
const results = []; const errors = [];
const check = (n, c, e = '') => results.push({ n, ok: !!c, e });

const chromium = await loadChromium();
const browser = await chromium.launch();
const context = await browser.newContext();

function cleanState(overrides) {
  return Object.assign({
    version: 1, user: { name: 'Teste', createdAt: '2026-01-01T00:00:00Z' },
    diagnostic: { level: 'iniciante', percent: 10, dimensions: [], strengths: [], gaps: [],
      track: { label: 'x', modules: [] }, date: '2026-01-01T00:00:00Z', mode: 'normal' },
    xp: 0, streak: { current: 0, best: 0, lastDay: null }, minutes: 0,
    lessons: {}, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: {}
  }, overrides || {});
}

async function openApp(state, hash) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(state));
  await page.goto(BASE + (hash || '#/dashboard'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  return page;
}

const read = page => page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));

const fundamentos = curriculum.modules.find(m => m.id === 'fundamentos');
const L = fundamentos.lessons;

/* ============ A) "Tentar de novo" aparece na mesma sessão, sem sair da página ============ */
{
  // fund-001 tem 2 exercícios: responder só o 1º prova que o botão aparece
  // SEM esperar a aula inteira ficar "completa", e que o 2º exercício —
  // ainda intocado — continua intocado (nenhum render() cego aconteceu).
  const lesson = L[0];
  const quiz = lesson.exercises[0];
  const page = await openApp(cleanState(), '#/aula/' + lesson.id);

  check('[A] antes de responder, não há botão "Tentar de novo"',
    (await page.locator('#ex-' + quiz.id + ' [data-action="retry"]').count()) === 0);

  await page.locator('#ex-' + quiz.id + ' input[type=radio]').nth(quiz.answer).check();
  await page.click('#ex-' + quiz.id + ' [data-action="submit"]');
  await page.waitForTimeout(250);

  check('[A] depois de responder, "Tentar de novo" aparece NA MESMA SESSÃO (sem navegar)',
    (await page.locator('#ex-' + quiz.id + ' [data-action="retry"]').count()) === 1);
  check('[A] o botão "Enviar" continua lá (não foi substituído por um render completo)',
    (await page.locator('#ex-' + quiz.id + ' [data-action="submit"]').count()) === 1);
  // Posição importa, não só presença: o artigo tem DOIS ".row" (o badge de
  // nota/XP no cabeçalho e a fileira de botões) — um querySelector('.row')
  // ingênuo pegaria o errado e o botão apareceria junto do badge de XP, não
  // ao lado de "Enviar". Achado numa auditoria desta própria implementação.
  check('[A] "Tentar de novo" é IRMÃO de "Enviar" (mesma fileira de botões, não o badge de XP do cabeçalho)',
    await page.evaluate(id => {
      const submit = document.querySelector('#ex-' + id + ' [data-action="submit"]');
      const retry = document.querySelector('#ex-' + id + ' [data-action="retry"]');
      return !!submit && !!retry && submit.parentElement === retry.parentElement;
    }, quiz.id));
  check('[A] "Tentar de novo" NÃO está dentro do cabeçalho (.exercise__head)',
    (await page.locator('#ex-' + quiz.id + ' .exercise__head [data-action="retry"]').count()) === 0);

  // clicar duas vezes seguidas não deveria duplicar o botão
  await page.locator('#ex-' + quiz.id + ' input[type=radio]').nth(quiz.answer).check();
  await page.click('#ex-' + quiz.id + ' [data-action="submit"]');
  await page.waitForTimeout(250);
  check('[A] reenviar não duplica o botão "Tentar de novo"',
    (await page.locator('#ex-' + quiz.id + ' [data-action="retry"]').count()) === 1);

  await page.close();
}

/* ============ A2) responder o exercício 1 não mexe num rascunho não enviado no exercício 2 ============ */
{
  const lesson = L[0]; // fund-001: exercises[0] quiz, exercises[1] open
  const quiz = lesson.exercises[0];
  const open = lesson.exercises[1];
  const page = await openApp(cleanState(), '#/aula/' + lesson.id);

  const draft = 'rascunho ainda não enviado, não pode sumir';
  await page.fill('#in-' + open.id, draft);

  await page.locator('#ex-' + quiz.id + ' input[type=radio]').nth(quiz.answer).check();
  await page.click('#ex-' + quiz.id + ' [data-action="submit"]');
  await page.waitForTimeout(250);

  const stillThere = await page.locator('#in-' + open.id).inputValue();
  check('[A2] responder o exercício 1 preserva o rascunho não enviado do exercício 2',
    stillThere === draft, 'valor atual: "' + stillThere + '"');
  await page.close();
}

/* ============ B) "Concluir projeto" habilita sem sair da página ============ */
{
  const PROJECT = 'project-assistente-pessoal';
  const page = await openApp(cleanState(), '#/projeto/' + PROJECT);

  check('[B] botão começa desabilitado (nada feito ainda)',
    await page.locator('#ws-btn-complete').isDisabled());

  // marca as 6 tarefas
  const taskCount = await page.locator('[data-task]').count();
  for (let i = 0; i < taskCount; i++) await page.locator('[data-task="' + i + '"]').check();
  await page.waitForTimeout(150);

  check('[B] checklist de tarefas reflete "concluído" sem sair da página',
    (await page.locator('#ws-check-tarefas').textContent()).includes('✓'));
  check('[B] botão ainda desabilitado (faltam as notas)',
    await page.locator('#ws-btn-complete').isDisabled());

  await page.fill('#note-resultado', 'x'.repeat(25));
  await page.locator('#note-resultado').blur(); // blur força o flushSave na hora
  await page.waitForTimeout(150);
  await page.fill('#note-portfolio', 'y'.repeat(25));
  await page.locator('#note-portfolio').blur();
  await page.waitForTimeout(200);

  check('[B] checklist de notas reflete "concluído" sem sair da página',
    (await page.locator('#ws-check-notas').textContent()).includes('✓'));
  check('[B] botão "Concluir projeto" HABILITA sem navegar pra fora e voltar',
    !(await page.locator('#ws-btn-complete').isDisabled()));

  // e o clique realmente funciona
  await page.click('#ws-btn-complete');
  await page.waitForTimeout(200);
  const saved = await read(page);
  check('[B] o clique realmente conclui o projeto', saved.projects[PROJECT].status === 'concluido');
  await page.close();
}

/* ============ B2) digitar na nota não dispara render() cego (sem perder foco no meio) ============ */
{
  const PROJECT = 'project-assistente-pessoal';
  const page = await openApp(cleanState(), '#/projeto/' + PROJECT);
  await page.click('#note-resultado');
  await page.keyboard.type('abc', { delay: 30 });
  await page.waitForTimeout(100);
  const stillFocused = await page.evaluate(() => document.activeElement && document.activeElement.id);
  check('[B2] o campo continua com foco durante a digitação (autosave não força render completo)',
    stillFocused === 'note-resultado', 'foco atual: ' + stillFocused);
  await page.close();
}

/* ============ C) revisão em lote: no máximo 5 cartões, mesmo com dezenas vencidas ============ */
{
  const today = new Date().toISOString().slice(0, 10);
  const reviews = {};
  const lessons = {};
  // monta 12 aulas "dominadas" com revisão vencida hoje — bem acima do lote de 5
  const allLessons = curriculum.modules.flatMap(m => m.lessons).slice(0, 12);
  allLessons.forEach((l, i) => {
    const exercises = {};
    (l.exercises || []).forEach(e => { exercises[e.id] = { attempts: [{ score: 100 }], score: 100, lastScore: 100, answer: 'x', lastAt: '2026-01-01T00:00:00Z', xpAwarded: true }; });
    lessons[l.id] = { read: true, xpAwarded: true, completedAt: '2026-01-01T00:00:00Z', exercises };
    reviews[l.id] = { interval: 1, due: today, lastScore: 40 + i, lastAt: '2026-01-01T00:00:00Z' };
  });
  const page = await openApp(cleanState({ lessons, reviews }), '#/revisao');

  const cardCount = await page.locator('[data-review]').count();
  check('[C] no máximo 5 cartões renderizados, mesmo com ' + allLessons.length + ' vencidas',
    cardCount <= 5 && cardCount > 0, 'cardCount=' + cardCount);
  check('[C] o contador "Para revisar hoje" mostra o TOTAL real, não só o lote exibido',
    (await page.locator('.stat__value').first().textContent()).trim() === String(allLessons.length));
  check('[C] avisa que há mais vencidas aguardando',
    (await page.locator('#conteudo').textContent()).includes(String(allLessons.length)));

  // as mais urgentes (pior lastScore) devem ser as exibidas, não as 5 primeiras por ordem de id
  const shownIds = await page.locator('[data-review]').evaluateAll(els => els.map(e => e.dataset.review));
  const expectedTop5 = allLessons.map(l => l.id).slice(0, 5); // lastScore cresce com i, então os 5 primeiros são os piores
  check('[C] mostra as mais urgentes primeiro (pior nota), não uma ordem arbitrária',
    JSON.stringify(shownIds) === JSON.stringify(expectedTop5), shownIds.join(',') + ' vs esperado ' + expectedTop5.join(','));
  await page.close();
}

/* ============ D) telas de "não encontrado" com <h1> e saída, sem beco absoluto ============ */
{
  const cenarios = [
    { nome: 'checkpoint de módulo inexistente', hash: '#/checkpoint/xxx-nao-existe' },
    { nome: 'aula inexistente', hash: '#/aula/xxx-nao-existe' },
    { nome: 'skill inexistente', hash: '#/skill/xxx-nao-existe' },
    { nome: 'projeto inexistente', hash: '#/projeto/xxx-nao-existe' }
  ];
  for (const c of cenarios) {
    const page = await openApp(cleanState(), c.hash);
    const h1Count = await page.locator('#conteudo h1').count();
    const linkCount = await page.locator('#conteudo a.btn').count();
    check('[D] ' + c.nome + ': tem <h1>', h1Count >= 1, 'h1Count=' + h1Count);
    check('[D] ' + c.nome + ': tem link de saída', linkCount >= 1, 'linkCount=' + linkCount);
    await page.close();
  }
}

await browser.close();
server.close();

let fails = 0;
console.log('\n=== UX PÓS-IDEMPOTÊNCIA (PR #12) ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
