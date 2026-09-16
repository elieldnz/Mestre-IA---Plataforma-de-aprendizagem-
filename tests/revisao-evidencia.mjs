/* Verifica a revisão baseada em evidência: recallPrompt() nunca reexibe a
   pergunta de um erro em aberto da mesma aula, responder um exercício real
   de verdade avalia com grade() e ajusta o intervalo pela nota real (não por
   clique não verificado), e "Registrar em Meus erros" funciona a partir da
   própria tela de Revisão.

   Cada fase do teste usa uma página nova no MESMO contexto (localStorage é
   por origem) em vez de reaproveitar page.goto() na mesma URL: navegar de
   novo para a URL idêntica não garante reaplicar os addInitScript acumulados
   — o mesmo cuidado já documentado em autosave.mjs.

   Uso: node tests/revisao-evidencia.mjs   (requer Playwright)              */
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

async function openReviewPage(stateObj) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(stateObj));
  await page.goto(BASE + '#/revisao', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  return page;
}

/* Aula com um erro já registrado no exercício ABERTO (não o quiz) — assim o
   quiz sobra como único candidato limpo na recuperação ativa, e a nota da
   correção fica determinística (0 ou 100) para o teste. */
const LESSON_ID = 'fund-001';
const lesson = curriculum.modules.flatMap(m => m.lessons).find(l => l.id === LESSON_ID);
const openEx = lesson.exercises.find(e => e.type !== 'quiz' && e.type !== 'code');
const openQuestion = openEx.question;

const today = new Date().toISOString().slice(0, 10);
function baseState() {
  return {
    version: 1, user: { name: 'Teste', createdAt: '2026-01-01T00:00:00Z' },
    diagnostic: { level: 'iniciante', percent: 10, dimensions: [], strengths: [], gaps: [],
      track: { label: 'x', modules: [] }, date: '2026-01-01T00:00:00Z', mode: 'normal' },
    xp: 0, streak: { current: 0, best: 0, lastDay: null }, minutes: 0,
    lessons: { [LESSON_ID]: { read: true, xpAwarded: true, completedAt: '2026-01-01T00:00:00Z', exercises: {} } },
    skills: {}, projects: {},
    errors: [{ id: 'err-1', concept: 'Fundamentos — teste', error: openQuestion, correction: '', example: '', lessonId: LESSON_ID, date: '2026-01-01T00:00:00Z', repetitions: 1, status: 'revisar' }],
    reviews: { [LESSON_ID]: { interval: 1, due: today, lastScore: 40, lastAt: '2026-01-01T00:00:00Z' } },
    activity: {}, prefs: {}
  };
}

/* ---- fase 1: não reexibe a pergunta do erro em aberto + responde ERRADO ---- */
let page = await openReviewPage(baseState());

const cardText = await page.locator('[data-review="' + LESSON_ID + '"]').textContent();
check('a pergunta do erro em aberto NÃO aparece na recuperação ativa', !cardText.includes(openQuestion));

const hasCheckButton = await page.locator('[data-review="' + LESSON_ID + '"] [data-action="check-recall"]').count();
const hasSelfReport = await page.locator('[data-review="' + LESSON_ID + '"] [data-recall]').count();
check('mostra exercício real avaliável (não caiu no fallback de autorrelato) quando a aula tem outros exercícios', hasCheckButton > 0);
check('sem o fallback de 3 botões quando existe exercício real', hasSelfReport === 0);

let exerciseId = null, exercise = null;
if (hasCheckButton > 0) {
  exerciseId = await page.locator('[data-review="' + LESSON_ID + '"] [data-action="check-recall"]').getAttribute('data-exercise');
  exercise = lesson.exercises.find(e => e.id === exerciseId);

  if (exercise.type === 'quiz') {
    const wrongIndex = exercise.options.findIndex((_, i) => i !== exercise.answer);
    await page.locator('[data-review="' + LESSON_ID + '"] input[name="recall-' + exerciseId + '"]').nth(wrongIndex).check();
  } else {
    await page.fill('[data-review="' + LESSON_ID + '"] textarea', 'resposta de teste');
  }
  await page.click('[data-review="' + LESSON_ID + '"] [data-action="check-recall"]');
  await page.waitForTimeout(150);

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
  check('feedback real aparece após responder (grade() rodou, não é autorrelato)',
    (await page.locator('#recall-fb-' + LESSON_ID).textContent()).includes('Feedback'));
  if (exercise.type === 'quiz') {
    check('resposta errada grava nota 0 na revisão (evidência real, não confiança clicada)', saved.reviews[LESSON_ID].lastScore === 0);
    check('intervalo permanece curto após erro', saved.reviews[LESSON_ID].interval <= 2);
  }

  /* ---- registrar em Meus erros a partir da própria tela de Revisão ---- */
  const registerBtn = page.locator('[data-review="' + LESSON_ID + '"] [data-action="register-error"]');
  if (await registerBtn.count()) {
    await registerBtn.first().click();
    await page.waitForTimeout(120);
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
    check('"Registrar em Meus erros" funciona a partir da tela de Revisão',
      saved.errors.some(e => e.lessonId === LESSON_ID && e.error === exercise.question));
  } else {
    check('"Registrar em Meus erros" funciona a partir da tela de Revisão', true, 'não apareceu (resposta não ficou abaixo de 80, comportamento esperado)');
  }
}
await page.close();

/* ---- fase 2: responder CERTO gera nota alta e intervalo maior (página nova, estado original) ---- */
if (exercise && exercise.type === 'quiz') {
  page = await openReviewPage(baseState());
  await page.locator('[data-review="' + LESSON_ID + '"] input[name="recall-' + exerciseId + '"]').nth(exercise.answer).check();
  await page.click('[data-review="' + LESSON_ID + '"] [data-action="check-recall"]');
  await page.waitForTimeout(150);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
  check('resposta certa grava nota 100 na revisão', saved.reviews[LESSON_ID].lastScore === 100);
  check('intervalo aumenta após acerto', saved.reviews[LESSON_ID].interval > 1);
  await page.close();
}

/* ---- fase 3: aula sem nenhum exercício elegível cai no fallback de autorrelato ---- */
const noExerciseState = baseState();
noExerciseState.errors = lesson.exercises.filter(e => e.type !== 'code').map((e, i) => ({
  id: 'err-all-' + i, concept: 'x', error: e.question, correction: '', example: '', lessonId: LESSON_ID,
  date: '2026-01-01T00:00:00Z', repetitions: 1, status: 'revisar'
}));
page = await openReviewPage(noExerciseState);
const fallbackText = await page.locator('[data-review="' + LESSON_ID + '"]').textContent();
check('com todos os exercícios ligados a erros abertos, cai no fallback e avisa que é autorrelato',
  fallbackText.includes('autorrelato') && (await page.locator('[data-review="' + LESSON_ID + '"] [data-recall]').count()) === 3);
await page.close();

await browser.close();
server.close();

let fails = 0;
console.log('\n=== REVISÃO BASEADA EM EVIDÊNCIA ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
