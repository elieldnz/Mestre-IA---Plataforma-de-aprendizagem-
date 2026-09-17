/* Captura a linha de base de SCORE usada por tests/vazamento-evidencia.mjs
   (nascida no PR #7, para provar que aquele PR só trocava o TEXTO de
   feedback — hits/missing/structure deixam de ser nomeados — sem mudar o
   cálculo numérico de gradeOpen). O invariante que este arquivo prova é
   "mesmo código de gradeOpen + mesmo conteúdo de rubrica ⇒ mesmo score",
   não "o conteúdo da rubrica nunca muda". Por isso, sempre que um PR
   alterar deliberadamente o CONTEÚDO das rubricas em data/curriculum.json
   (ex.: PR #9 — reforma das rubricas), esta baseline precisa ser
   RECAPTURADA contra o conteúdo novo antes de rodar a suíte — o script
   sempre lê o curriculum.json atual do disco, nunca uma cópia congelada.
   Só é preciso trocar temporariamente js/lessons.js (como no PR #6) quando
   o próprio ALGORITMO de gradeOpen mudar, o que nenhum PR até aqui fez.

   Uso: node tests/fixtures/capture-vazamento-baseline.mjs                  */
import { loadChromium } from '../pw.mjs';
import { startServer } from '../server.mjs';
import { loadCurriculum, buildCases } from './respostas-rubrica.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const curriculum = loadCurriculum();
const cases = buildCases(curriculum);

const { server, base: BASE } = await startServer();
const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => console.error('pageerror: ' + e.message));

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

const baseline = await page.evaluate((cases) => {
  const out = {};
  cases.forEach(function (c) {
    const lesson = window.MIA.get.lesson(c.lessonId);
    const exercise = lesson.exercises.find(function (e) { return e.id === c.exerciseId; });
    out[c.exerciseId] = {
      generica: window.MIA.lessons.grade(exercise, c.respostas.generica).score,
      exploit: window.MIA.lessons.grade(exercise, c.respostas.exploit).score,
      parcial: window.MIA.lessons.grade(exercise, c.respostas.parcial).score
    };
  });
  return out;
}, cases);

fs.writeFileSync(path.join(HERE, 'vazamento-baseline.json'), JSON.stringify(baseline, null, 2));
console.log('✓ Linha de base de score gravada em vazamento-baseline.json (' + Object.keys(baseline).length + ' exercícios)');

await browser.close();
server.close();
