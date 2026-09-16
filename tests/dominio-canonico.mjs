/* Prova de equivalência do PR #6: lessonState/moduleState/moduleStateRaw
   foram consolidados para chamar um único primitivo (evaluateLesson), em vez
   de reimplementar a mesma conta de nota/limiar três vezes. Este teste NÃO
   verifica "a regra está certa" — verifica que o comportamento é IDÊNTICO ao
   de antes da consolidação, campo a campo, para os 21 módulos e 106 aulas,
   em 4 estados sintéticos diferentes.

   A linha de base (tests/fixtures/dominio-canonico-baseline.json) foi
   capturada ANTES de qualquer edição em js/progress.js, com o mesmo gerador
   de estados (tests/fixtures/estados-dominio.mjs) que este teste importa —
   então qualquer diferença encontrada aqui só pode vir do refactor, nunca
   de uma divergência nos dados de entrada.

   Uso: node tests/dominio-canonico.mjs   (requer Playwright)               */
import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';
import { loadCurriculum, buildStates } from './fixtures/estados-dominio.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'dominio-canonico-baseline.json'), 'utf8'));
const curriculum = loadCurriculum();
const estados = buildStates(curriculum);

const { server, base: BASE } = await startServer();
const results = []; const errors = [];
const check = (n, c, e = '') => results.push({ n, ok: !!c, e });

const chromium = await loadChromium();
const browser = await chromium.launch();

async function capturarAoVivo(estado) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(estado));
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);

  const resultado = await page.evaluate(() => {
    const out = { lessons: {}, modules: {}, modulesRaw: {} };
    window.MIA.get.modules().forEach(m => {
      out.modules[m.id] = window.MIA.progress.moduleState(m.id);
      out.modules[m.id].__blockers = window.MIA.progress.moduleBlockers(m.id);
      out.modulesRaw[m.id] = window.MIA.progress.moduleStateRaw(m.id);
      m.lessons.forEach(l => { out.lessons[l.id] = window.MIA.progress.lessonState(l.id); });
    });
    out.globalProgress = window.MIA.progress.globalProgress();
    out.currentLevel = window.MIA.progress.currentLevel();
    out.levelRatio = {
      iniciante: window.MIA.progress.levelRatio('iniciante'),
      intermediario: window.MIA.progress.levelRatio('intermediario'),
      avancado: window.MIA.progress.levelRatio('avancado')
    };
    return out;
  });
  await page.close();
  return resultado;
}

/* ============ equivalência completa, para cada um dos 4 estados ============ */
for (const [nome, estado] of Object.entries(estados)) {
  const antes = baseline[nome];
  const depois = await capturarAoVivo(estado);

  if (!antes) { check('[' + nome + '] existe linha de base', false, 'rode tests/fixtures/capture-baseline.mjs'); continue; }

  const modulosDivergentes = Object.keys(antes.modules).filter(
    id => JSON.stringify(antes.modules[id]) !== JSON.stringify(depois.modules[id])
  );
  const rawDivergentes = Object.keys(antes.modulesRaw).filter(
    id => JSON.stringify(antes.modulesRaw[id]) !== JSON.stringify(depois.modulesRaw[id])
  );
  const aulasDivergentes = Object.keys(antes.lessons).filter(
    id => JSON.stringify(antes.lessons[id]) !== JSON.stringify(depois.lessons[id])
  );

  check('[' + nome + '] moduleState idêntico nos 21 módulos (objeto completo)',
    modulosDivergentes.length === 0, modulosDivergentes.join(', '));
  check('[' + nome + '] moduleStateRaw idêntico nos 21 módulos',
    rawDivergentes.length === 0, rawDivergentes.join(', '));
  check('[' + nome + '] lessonState idêntico nas 106 aulas (objeto completo)',
    aulasDivergentes.length === 0, aulasDivergentes.join(', ').slice(0, 200));
  check('[' + nome + '] globalProgress idêntico',
    JSON.stringify(antes.globalProgress) === JSON.stringify(depois.globalProgress),
    JSON.stringify(antes.globalProgress) + ' vs ' + JSON.stringify(depois.globalProgress));
  check('[' + nome + '] currentLevel idêntico', antes.currentLevel === depois.currentLevel,
    antes.currentLevel + ' vs ' + depois.currentLevel);
  check('[' + nome + '] levelRatio idêntico', JSON.stringify(antes.levelRatio) === JSON.stringify(depois.levelRatio));
}

/* ============ aula sintética com zero exercícios: a decisão documentada ============
   Nenhuma das 106 aulas reais está nesse caso hoje. Injeta um módulo/aula
   fabricados no índice em memória (isolados, prerequisites: [], nunca tocam
   o currículo real) só para verificar: "lida" + zero exercícios = completa
   E dominada — a decisão que este PR fixou explicitamente. */
{
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  const estadoBase = estados.zerado;
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(estadoBase));
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);

  const semLer = await page.evaluate(() => {
    const fakeLesson = { id: 'zx-fake-lesson', title: 'Sintética', exercises: [], objectives: ['x'] };
    const fakeModule = { id: 'zx-fake-module', phase: 999, level: 'iniciante', title: 'x', subtitle: 'x',
      icon: '🧪', goal: 'x', prerequisites: [], skills: [], lessons: [fakeLesson] };
    window.MIA.data.curriculum.modules.push(fakeModule);
    window.MIA.data.index.modules.set(fakeModule.id, fakeModule);
    window.MIA.data.index.lessons.set(fakeLesson.id, fakeLesson);
    window.MIA.data.index.lessonModule.set(fakeLesson.id, fakeModule.id);
    fakeLesson.module = fakeModule.id;
    return window.MIA.progress.lessonState(fakeLesson.id).state;
  });
  check('[zero-exercício] sem "read", aula sintética NÃO é completa nem dominada',
    semLer !== 'completed' && semLer !== 'mastered', semLer);

  await page.evaluate(() => { window.MIA.progress.markRead('zx-fake-lesson'); });
  await page.waitForTimeout(120);
  const comLer = await page.evaluate(() => window.MIA.progress.lessonState('zx-fake-lesson'));
  check('[zero-exercício] "lida" + 0 exercícios => completed', comLer.state === 'completed' || comLer.state === 'mastered', comLer.state);
  check('[zero-exercício] "lida" + 0 exercícios => mastered (decisão do PR #6)', comLer.state === 'mastered', comLer.state);

  const moduloSintetico = await page.evaluate(() => window.MIA.progress.moduleStateRaw('zx-fake-module'));
  check('[zero-exercício] moduleStateRaw também conta como completo e dominado',
    moduloSintetico.done === 1 && moduloSintetico.mastered === 1, JSON.stringify(moduloSintetico));
  await page.close();
}

await browser.close();
server.close();

let fails = 0;
console.log('\n=== REGRA CANÔNICA DE DOMÍNIO (equivalência PR #6) ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
