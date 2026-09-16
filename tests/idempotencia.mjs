/* Idempotência do ciclo render → bind → ação → estado → render.

   O <main> do app é permanente (render() troca só o innerHTML), então qualquer
   bind* que anexe listener a cada render empilha handlers e faz UMA ação do
   aluno produzir N efeitos. Estes testes reproduzem os cenários exatos que a
   auditoria encontrou e verificam EFEITO OBSERVÁVEL NO ESTADO (XP, registros,
   nota, status), não presença de elemento.

   Uso: node tests/idempotencia.mjs   (requer Playwright)                    */
import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const curriculum = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curriculum.json'), 'utf8'));
const xpTable = curriculum.xpTable;

const { server, base: BASE } = await startServer();
const results = []; const errors = [];
const check = (n, c, e = '') => results.push({ n, ok: !!c, e });

const chromium = await loadChromium();
const browser = await chromium.launch();
const context = await browser.newContext();

function cleanState() {
  return {
    version: 1, user: { name: 'Teste', createdAt: '2026-01-01T00:00:00Z' },
    diagnostic: { level: 'iniciante', percent: 10, dimensions: [], strengths: [], gaps: [],
      track: { label: 'x', modules: [] }, date: '2026-01-01T00:00:00Z', mode: 'normal' },
    xp: 0, streak: { current: 0, best: 0, lastDay: null }, minutes: 0,
    lessons: {}, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: {}
  };
}

async function openApp(state) {
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(state));
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(150);
  return page;
}

const read = page => page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
const go = async (page, hash) => {
  await page.evaluate(h => { window.location.hash = h; }, hash);
  await page.waitForTimeout(220);
};

const fundamentos = curriculum.modules.find(m => m.id === 'fundamentos');
const L = fundamentos.lessons;

/* ================= A) listener de aulas ================= */
{
  const page = await openApp(cleanState());
  // abre três aulas na mesma sessão e responde UM exercício na terceira
  await go(page, '#/aula/' + L[0].id);
  await go(page, '#/aula/' + L[1].id);
  await go(page, '#/aula/' + L[2].id);

  const quiz = L[2].exercises.find(e => e.type === 'quiz');
  await page.locator('#ex-' + quiz.id + ' input[type=radio]').nth(quiz.answer).check();
  await page.click('#ex-' + quiz.id + ' [data-action="submit"]');
  await page.waitForTimeout(250);

  const s = await read(page);
  // XP da conclusão da aula só entra quando TODOS os exercícios dela foram respondidos
  const esperado = (quiz.xp || xpTable.exercise) + (L[2].exercises.length === 1 ? xpTable.lesson : 0);
  const poluidas = Object.keys(s.lessons).filter(k => s.lessons[k].exercises && s.lessons[k].exercises[quiz.id]);

  check('A1 · um envio em C credita XP uma única vez', s.xp === esperado, 'esperado=' + esperado + ' obtido=' + s.xp);
  check('A2 · o exercício foi gravado só na aula C', poluidas.length === 1 && poluidas[0] === L[2].id, poluidas.join(','));
  check('A3 · a tentativa foi contada uma vez', s.lessons[L[2].id].exercises[quiz.id].attempts === 1,
    'attempts=' + s.lessons[L[2].id].exercises[quiz.id].attempts);
  await page.close();
}

/* ================= A') erro também não vaza entre aulas ================= */
{
  const page = await openApp(cleanState());
  await go(page, '#/aula/' + L[0].id);
  await go(page, '#/aula/' + L[1].id);
  await go(page, '#/aula/' + L[3].id);

  const quiz = L[3].exercises.find(e => e.type === 'quiz');
  const errada = quiz.options.findIndex((_, i) => i !== quiz.answer);
  await page.locator('#ex-' + quiz.id + ' input[type=radio]').nth(errada).check();
  await page.click('#ex-' + quiz.id + ' [data-action="submit"]');
  await page.waitForTimeout(250);

  const s = await read(page);
  check('A4 · errar um quiz registra exatamente um erro', s.errors.length === 1, 'erros=' + s.errors.length);
  check('A5 · o erro aponta para a aula certa', s.errors.length === 1 && s.errors[0].lessonId === L[3].id,
    s.errors.map(e => e.lessonId).join(','));
  await page.close();
}

/* ================= B) listener de Skills ================= */
{
  const page = await openApp(cleanState());
  await go(page, '#/skill/find-skills');
  await go(page, '#/skill/skill-creator');
  await page.locator('[data-check="study"][data-index="0"]').first().check();
  await page.waitForTimeout(220);

  // visitar uma Skill já cria a entrada dela no estado (skills.js chama
  // skillEntry no render), então o que importa aqui é a MUTAÇÃO, não a chave.
  const s = await read(page);
  const a = s.skills['find-skills'] || { checklist: {}, status: 'nao-estudada' };
  const b = s.skills['skill-creator'];
  check('B1 · marcar o checklist de B altera a Skill B', b && b.checklist['0'] === true, JSON.stringify(b && b.checklist));
  check('B2 · a Skill A não recebeu a marcação feita em B',
    !a.checklist['0'] && a.status === 'nao-estudada', 'checklist=' + JSON.stringify(a.checklist) + ' status=' + a.status);
  await page.close();
}

/* ================= C) setPref após vários renders ================= */
{
  const page = await openApp(cleanState());
  const chamadas = [];
  for (let i = 0; i < 4; i++) {
    await go(page, '#/perfil');
    await go(page, '#/dashboard');
    await go(page, '#/perfil');
    await page.evaluate(() => {
      if (!window.__patched) {
        window.__patched = true;
        const orig = window.MIA.progress.setPref;
        window.MIA.progress.setPref = function () { window.__calls++; return orig.apply(this, arguments); };
      }
      window.__calls = 0;
    });
    await page.click('[data-mode="rapido"]');
    await page.waitForTimeout(180);
    chamadas.push(await page.evaluate(() => window.__calls));
  }
  check('C1 · setPref roda exatamente 1× por clique, após N renders',
    chamadas.every(n => n === 1), 'sequência=' + chamadas.join(' -> '));
  await page.close();
}

/* ================= D) resetExercise não recredita XP ================= */
{
  const page = await openApp(cleanState());
  await go(page, '#/aula/' + L[0].id);
  const quiz = L[0].exercises.find(e => e.type === 'quiz');

  await page.locator('#ex-' + quiz.id + ' input[type=radio]').nth(quiz.answer).check();
  await page.click('#ex-' + quiz.id + ' [data-action="submit"]');
  await page.waitForTimeout(250);
  const xpPrimeiro = (await read(page)).xp;

  for (let i = 0; i < 3; i++) {
    // o botão "Tentar de novo" só é emitido num render posterior ao envio
    // (achado de UX fora do escopo deste PR — registrado no roadmap), então
    // forçamos o render aqui para poder exercitar o caminho de XP.
    await page.evaluate(() => window.MIA.app.render());
    await page.waitForTimeout(120);
    await page.click('#ex-' + quiz.id + ' [data-action="retry"]');
    await page.waitForTimeout(220);
    await page.locator('#ex-' + quiz.id + ' input[type=radio]').nth(quiz.answer).check();
    await page.click('#ex-' + quiz.id + ' [data-action="submit"]');
    await page.waitForTimeout(220);
  }
  const s = await read(page);
  check('D1 · três ciclos de "tentar de novo" não somam XP', s.xp === xpPrimeiro,
    'antes=' + xpPrimeiro + ' depois=' + s.xp);
  check('D2 · refazer continua registrando a nota (progressão legítima preservada)',
    s.lessons[L[0].id].exercises[quiz.id].score === 100);
  await page.close();
}

/* ================= E) setSkillStatus não pode ser farmado ================= */
{
  const page = await openApp(cleanState());
  await go(page, '#/skill/find-skills');
  await page.click('[data-action="status"][data-status="dominada"]');
  await page.waitForTimeout(220);
  const xpPrimeiro = (await read(page)).xp;
  check('E1 · dominar uma Skill paga 30 XP', xpPrimeiro === 30, 'xp=' + xpPrimeiro);

  for (let i = 0; i < 3; i++) {
    await page.click('[data-action="status"][data-status="nao-estudada"]');
    await page.waitForTimeout(200);
    await page.click('[data-action="status"][data-status="dominada"]');
    await page.waitForTimeout(200);
  }
  const s = await read(page);
  check('E2 · alternar o status não paga de novo', s.xp === xpPrimeiro, 'antes=' + xpPrimeiro + ' depois=' + s.xp);
  check('E3 · o status final continua sendo respeitado', s.skills['find-skills'].status === 'dominada');
  await page.close();
}

/* ================= F) render → render → render → ação única ================= */
{
  const page = await openApp(cleanState());
  // força muitos renders da MESMA rota antes de uma única ação
  await go(page, '#/aula/' + L[1].id);
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.MIA.app.render());
    await page.waitForTimeout(60);
  }
  const quiz = L[1].exercises.find(e => e.type === 'quiz');
  await page.locator('#ex-' + quiz.id + ' input[type=radio]').nth(quiz.answer).check();
  await page.click('#ex-' + quiz.id + ' [data-action="submit"]');
  await page.waitForTimeout(250);

  const s = await read(page);
  const esperado = (quiz.xp || xpTable.exercise) + (L[1].exercises.length === 1 ? xpTable.lesson : 0);
  check('F1 · 6 renders + 1 ação = 1 consequência', s.xp === esperado, 'esperado=' + esperado + ' obtido=' + s.xp);
  check('F2 · 6 renders + 1 ação = 1 tentativa', s.lessons[L[1].id].exercises[quiz.id].attempts === 1,
    'attempts=' + s.lessons[L[1].id].exercises[quiz.id].attempts);

  // e o registro de erro também não multiplica após muitos renders
  await go(page, '#/erros');
  for (let i = 0; i < 4; i++) { await page.evaluate(() => window.MIA.app.render()); await page.waitForTimeout(60); }
  await page.fill('#err-concept', 'APIs');
  await page.fill('#err-error', 'Confundi API com endpoint.');
  await page.click('[data-action="add-error"]');
  await page.waitForTimeout(220);
  const s2 = await read(page);
  check('F3 · registrar erro após N renders cria um único erro', s2.errors.length === 1, 'erros=' + s2.errors.length);
  await page.close();
}

/* ================= G) workspace e biblioteca continuam funcionando ================= */
{
  const page = await openApp(cleanState());
  await go(page, '#/projetos');
  await go(page, '#/projeto/project-assistente-pessoal');
  await page.locator('[data-task="0"]').check();
  await page.waitForTimeout(200);
  await go(page, '#/projeto/project-piloto-blocos-de-tempo');
  await page.locator('[data-task="0"]').check();
  await page.waitForTimeout(200);

  const s = await read(page);
  check('G1 · tarefa do projeto A ficou no projeto A',
    s.projects['project-assistente-pessoal'] && s.projects['project-assistente-pessoal'].tasks['0'] === true);
  check('G2 · tarefa do projeto B ficou no projeto B',
    s.projects['project-piloto-blocos-de-tempo'] && s.projects['project-piloto-blocos-de-tempo'].tasks['0'] === true);

  await go(page, '#/projetos');
  await page.selectOption('#p-level', 'avancado');
  await page.waitForTimeout(250);
  const visiveis = await page.locator('#conteudo .skill-card').count();
  check('G3 · filtro da biblioteca continua funcionando', visiveis > 0 && visiveis < 27, 'cards=' + visiveis);
  await page.close();
}

await browser.close();
server.close();

let fails = 0;
console.log('\n=== IDEMPOTÊNCIA (render/listeners/XP) ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
