/* Captura a linha de base de SCORE do PR #7 contra o código ORIGINAL (antes
   de mexer no texto de feedback de gradeOpen em js/lessons.js). O PR #7 só
   troca o TEXTO gerado (hits/missing/structure deixam de ser nomeados) —
   o cálculo numérico (lengthScore/keyScore/structScore/detail/score) não
   deveria mudar em nem um ponto. Esta captura prova isso: roda as mesmas
   respostas (tests/fixtures/respostas-rubrica.mjs) contra os 89 exercícios
   com rubrica, usando exatamente o código de gradeOpen que estava no main
   antes deste PR (obtido via `git show`, sem nenhuma edição), e grava os
   scores resultantes. tests/vazamento-evidencia.mjs reconstrói as MESMAS
   respostas e compara ao vivo contra este JSON.

   Rodar ANTES de editar js/lessons.js, ou temporariamente restaurando a
   versão do main durante a captura (troca de arquivo, captura, restaura —
   mesma técnica usada em tests/fixtures/capture-baseline.mjs no PR #6).

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
