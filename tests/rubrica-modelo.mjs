/* PR #9 — Reforma das rubricas: guarda permanente contra a recorrência do
   problema que o mapeamento encontrou (81% dos modelos não atingiam a
   própria rubrica, porque rubrica e resposta-modelo eram escritas sem
   checagem cruzada). Esta suíte roda em todo `npm test`, não só nesta
   reforma — qualquer PR futuro que editar `data/curriculum.json` precisa
   continuar satisfazendo o mesmo invariante.

   Duas frentes, para os 89 exercícios com rubrica (open/practice/challenge):

   1) Consistência rubrica × modelo: a resposta que o próprio autor
      declarou como referência precisa atingir >= 80 (o limiar de
      "mastered") na sua própria rubrica, calculado com o gradeOpen REAL
      (nenhuma reimplementação do algoritmo aqui — o mesmo código que
      avalia o aluno avalia o modelo).

   2) Qualidade estrutural da rubrica, independente do modelo:
      - keywords não vazia, sem elemento vazio/em branco;
      - nenhuma keyword é só caractere de formatação ({, }, --, etc.);
      - nenhuma keyword é um número puro (casamento por substring o torna
        um falso-positivo fácil, ex.: "10" dentro de "410");
      - structure não vazia;
      - structure não é um placeholder numérico (["1","2","3"] e afins).

   Uso: node tests/rubrica-modelo.mjs   (requer Playwright)                */
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

const cases = [];
curriculum.modules.forEach(m => m.lessons.forEach(l => (l.exercises || []).forEach(e => {
  if (e.rubric) cases.push({ lessonId: l.id, exerciseId: e.id });
})));

const resultado = await page.evaluate((cases) => {
  return cases.map(function (c) {
    const lesson = window.MIA.get.lesson(c.lessonId);
    const exercise = lesson.exercises.find(function (e) { return e.id === c.exerciseId; });
    const rubric = exercise.rubric;
    const model = exercise.model || '';
    const r = window.MIA.lessons.grade(exercise, model);
    const norm = window.MIA.ui.normalize;
    const modelNorm = norm(model);
    const words = window.MIA.ui.countWords(model);
    const missing = (rubric.keywords || []).filter(function (k) { return modelNorm.indexOf(norm(k)) === -1; });
    const structMissing = (rubric.structure || []).filter(function (k) { return modelNorm.indexOf(norm(k)) === -1; });
    return {
      id: c.exerciseId, score: r.score, words: words, minWords: rubric.minWords || 30,
      keywords: rubric.keywords || [], structure: rubric.structure || [], missing: missing, structMissing: structMissing
    };
  });
}, cases);

/* ============ 1) consistência rubrica × modelo ============ */
resultado.forEach(function (r) {
  check('[' + r.id + '] resposta-modelo atinge >= 80 na própria rubrica',
    r.score >= 80,
    'score=' + r.score + ' palavras=' + r.words + '/' + r.minWords +
    (r.missing.length ? ' keywords faltando=' + JSON.stringify(r.missing) : '') +
    (r.structMissing.length ? ' structure faltando=' + JSON.stringify(r.structMissing) : ''));
});

/* ============ 2) qualidade estrutural, independente do modelo ============ */
const SO_FORMATACAO = /^[{}\-_.,;:!?()[\]]+$/;
const NUMERO_PURO = /^\d+$/;

resultado.forEach(function (r) {
  check('[' + r.id + '] keywords não está vazia', r.keywords.length >= 1);
  check('[' + r.id + '] nenhuma keyword vazia ou em branco',
    r.keywords.every(function (k) { return k && k.trim().length > 0; }));
  check('[' + r.id + '] nenhuma keyword é só caractere de formatação ({, }, --, etc.)',
    r.keywords.every(function (k) { return !SO_FORMATACAO.test(k); }), JSON.stringify(r.keywords));
  check('[' + r.id + '] nenhuma keyword é um número puro (falso-positivo fácil por substring)',
    r.keywords.every(function (k) { return !NUMERO_PURO.test(k); }), JSON.stringify(r.keywords));
  check('[' + r.id + '] structure não está vazia', r.structure.length >= 1, JSON.stringify(r.structure));
  check('[' + r.id + '] structure não é um placeholder numérico (ex.: ["1","2","3"])',
    !r.structure.every(function (s) { return NUMERO_PURO.test(s); }), JSON.stringify(r.structure));
});

await browser.close();
server.close();

let fails = 0;
console.log('\n=== RUBRICA × MODELO (PR #9) ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros de console/página: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
