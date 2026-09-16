/* Prova de equivalência do PR #6: lessonState/moduleState foram consolidados
   para chamar um único primitivo (evaluateLesson), em vez de reimplementar a
   mesma conta de nota/limiar (moduleState e moduleStateRaw tinham cada uma a
   sua). moduleStateRaw continua privada — nunca foi parte da API pública e
   não vira uma só para o teste alcançar; é exercitada indiretamente através
   de moduleState.unlocked e moduleBlockers, que dependem dela internamente
   para todo módulo que aparece como pré-requisito de outro.

   Este teste NÃO verifica "a regra está certa" — verifica que o
   comportamento é IDÊNTICO ao de antes da consolidação:
     - leitura estática: lessonState/moduleState/globalProgress/currentLevel/
       levelRatio, objeto completo, para os 21 módulos e 106 aulas, em 4
       estados sintéticos;
     - transição dinâmica: chamadas reais a recordExercise (a função que
       decide XP), comparando o XP concedido em cada chamada, o acumulado, e
       o estado resultante — inclusive o caso de módulo travado, onde o
       bônus de conclusão da aula não deveria sair mesmo com nota 100.

   A linha de base (tests/fixtures/dominio-canonico-baseline.json) foi
   capturada contra o código ORIGINAL, sem nenhuma edição — trocando
   js/progress.js pela versão do main, rodando a captura, e restaurando a
   versão consolidada depois. O gerador de estados (estados-dominio.mjs) é o
   mesmo nas duas pontas, então qualquer diferença encontrada aqui só pode
   vir do refactor, nunca de uma divergência nos dados de entrada.

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

async function capturarEstatico(estado) {
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(estado));
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);

  const resultado = await page.evaluate(() => {
    const out = { lessons: {}, modules: {} };
    window.MIA.get.modules().forEach(m => {
      const st = window.MIA.progress.moduleState(m.id);
      st.__blockers = window.MIA.progress.moduleBlockers(m.id); // exercita moduleStateRaw indiretamente
      out.modules[m.id] = st;
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

/* ============ leitura estática: os 4 estados, objeto completo ============ */
for (const [nome, estado] of Object.entries(estados)) {
  const antes = baseline.estados[nome];
  const depois = await capturarEstatico(estado);

  if (!antes) { check('[' + nome + '] existe linha de base', false, 'rode tests/fixtures/capture-baseline.mjs'); continue; }

  const modulosDivergentes = Object.keys(antes.modules).filter(
    id => JSON.stringify(antes.modules[id]) !== JSON.stringify(depois.modules[id])
  );
  const aulasDivergentes = Object.keys(antes.lessons).filter(
    id => JSON.stringify(antes.lessons[id]) !== JSON.stringify(depois.lessons[id])
  );

  check('[' + nome + '] moduleState idêntico nos 21 módulos — inclui unlocked e __blockers (moduleStateRaw indireto)',
    modulosDivergentes.length === 0, modulosDivergentes.join(', '));
  check('[' + nome + '] lessonState idêntico nas 106 aulas (objeto completo)',
    aulasDivergentes.length === 0, aulasDivergentes.join(', ').slice(0, 200));
  check('[' + nome + '] globalProgress idêntico',
    JSON.stringify(antes.globalProgress) === JSON.stringify(depois.globalProgress),
    JSON.stringify(antes.globalProgress) + ' vs ' + JSON.stringify(depois.globalProgress));
  check('[' + nome + '] currentLevel idêntico', antes.currentLevel === depois.currentLevel,
    antes.currentLevel + ' vs ' + depois.currentLevel);
  check('[' + nome + '] levelRatio idêntico (iniciante/intermediario/avancado)',
    JSON.stringify(antes.levelRatio) === JSON.stringify(depois.levelRatio),
    JSON.stringify(antes.levelRatio) + ' vs ' + JSON.stringify(depois.levelRatio));
}

/* ============ transição dinâmica: recordExercise decidindo XP de verdade ============
   Reproduz exatamente as mesmas chamadas capturadas na linha de base, na
   MESMA ordem, a partir do MESMO estado zerado — incluindo o cenário do
   módulo travado, onde nota 100 não deveria pagar o bônus de conclusão. */
const fundamentos = curriculum.modules.find(m => m.id === 'fundamentos');
const python = curriculum.modules.find(m => m.id === 'python');
const cenarios = [
  { nome: 'primeiro-exercicio-de-aula-multi-exercicio',
    lessonId: fundamentos.lessons[0].id,
    exercicios: [{ exId: fundamentos.lessons[0].exercises[0].id, score: 100 }] },
  { nome: 'completa-aula-com-media-abaixo-de-80-mas-acima-de-60',
    lessonId: fundamentos.lessons[0].id,
    exercicios: fundamentos.lessons[0].exercises.map(e => ({ exId: e.id, score: 65 })) },
  { nome: 'completa-aula-com-media-80-plus',
    lessonId: fundamentos.lessons[0].id,
    exercicios: fundamentos.lessons[0].exercises.map(e => ({ exId: e.id, score: 100 })) },
  { nome: 'aula-de-um-exercicio-so',
    lessonId: fundamentos.lessons[4].id,
    exercicios: [{ exId: fundamentos.lessons[4].exercises[0].id, score: 100 }] },
  { nome: 'exercicio-em-modulo-travado-nao-paga-bonus-de-conclusao',
    lessonId: python.lessons[0].id,
    exercicios: python.lessons[0].exercises.map(e => ({ exId: e.id, score: 100 })) }
];

for (const cenario of cenarios) {
  const antes = baseline.transicoes[cenario.nome];
  if (!antes) { check('[transição: ' + cenario.nome + '] existe linha de base', false); continue; }

  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(estados.zerado));
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);

  const depois = await page.evaluate(({ lessonId, exercicios }) => {
    const chamadas = [];
    exercicios.forEach(({ exId, score }) => {
      const r = window.MIA.progress.recordExercise(lessonId, exId, { score: score, answer: 'x' });
      chamadas.push({ xpConcedido: r.xp, estadoDaAula: r.lesson.state, notaDaAula: r.lesson.score });
    });
    return { chamadas: chamadas, xpAcumulado: window.MIA.progress.state.xp };
  }, { lessonId: cenario.lessonId, exercicios: cenario.exercicios });
  await page.close();

  check('[transição: ' + cenario.nome + '] XP concedido e estado idênticos em cada chamada',
    JSON.stringify(antes.chamadas) === JSON.stringify(depois.chamadas),
    JSON.stringify(antes.chamadas) + ' vs ' + JSON.stringify(depois.chamadas));
  check('[transição: ' + cenario.nome + '] XP acumulado idêntico',
    antes.xpAcumulado === depois.xpAcumulado, antes.xpAcumulado + ' vs ' + depois.xpAcumulado);
}

/* ============ aula sintética com zero exercícios: a decisão documentada ============
   Nenhuma das 106 aulas reais está nesse caso hoje. Injeta um módulo/aula
   fabricados no índice em memória (isolados, prerequisites: [], nunca tocam
   o currículo real) só para verificar: "lida" + zero exercícios = completa
   E dominada — a decisão que este PR fixou explicitamente. */
{
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(estados.zerado));
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
  await page.close();
}

/* ============ moduleStateRaw não é pública ============ */
{
  const page = await browser.newPage();
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(estados.zerado));
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  const exposta = await page.evaluate(() => typeof window.MIA.progress.moduleStateRaw);
  check('[API] moduleStateRaw continua privada (não exportada)', exposta === 'undefined', 'typeof = ' + exposta);
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
