/* Verifica o autosave do Workspace: salva com debounce enquanto digita,
   indicador "Salvo há X segundos", recuperação ao reabrir, aviso de saída
   só quando há alteração não salva, e — o motivo pelo qual o listener do
   workspace foi reescrito — que digitar no projeto B não vaza pro projeto A
   quando os dois foram visitados na mesma sessão.

   Uso: node tests/autosave.mjs   (requer Playwright)                      */
import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';

const { server, base: BASE } = await startServer();
const results = []; const errors = [];
const check = (n, c, e = '') => results.push({ n, ok: !!c, e });

const chromium = await loadChromium();
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
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

const PROJECT_A = 'project-assistente-pessoal';
const PROJECT_B = 'project-piloto-blocos-de-tempo'; // piloto: sempre disponível, sem pré-requisito
const DEBOUNCE = await (async () => {
  await page.goto(BASE + '#/projeto/' + PROJECT_A, { waitUntil: 'networkidle' });
  return page.evaluate(() => window.MIA.projects.AUTOSAVE_DEBOUNCE_MS);
})();

/* ---- digitar não salva antes do debounce, salva depois ---- */
await page.fill('#note-resultado', 'De 3 horas por semana para 10 minutos.');
await page.waitForTimeout(150);
let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
check('antes do debounce, ainda não foi pro localStorage',
  !(saved.projects['project-assistente-pessoal'] && saved.projects['project-assistente-pessoal'].notes &&
    saved.projects['project-assistente-pessoal'].notes.resultado));
check('indicador mostra "Salvando…" enquanto o debounce corre',
  (await page.locator('[data-saved="resultado"]').textContent()).includes('Salvando'));
check('MIA.projects.hasPendingSaves() é true com digitação pendente',
  await page.evaluate(() => window.MIA.projects.hasPendingSaves()));

await page.waitForTimeout(DEBOUNCE + 400);
saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
check('depois do debounce, o texto foi salvo no localStorage',
  saved.projects['project-assistente-pessoal'].notes.resultado === 'De 3 horas por semana para 10 minutos.');
check('indicador muda para "Salvo…"', (await page.locator('[data-saved="resultado"]').textContent()).includes('Salvo'));
check('hasPendingSaves() volta a false depois de salvar',
  !(await page.evaluate(() => window.MIA.projects.hasPendingSaves())));

/* ---- sair do campo (blur) força o save imediato, mesmo antes do debounce ---- */
await page.fill('#note-portfolio', 'Problema, solução e resultado documentados.');
await page.locator('#note-portfolio').blur();
await page.waitForTimeout(150);
saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
check('blur salva na hora, sem esperar o debounce',
  saved.projects['project-assistente-pessoal'].notes.portfolio === 'Problema, solução e resultado documentados.');

/* ---- recuperação ao reabrir: simula fechar e reabrir a aba com uma página
   nova no MESMO contexto (localStorage é por origem, não por aba) — em vez
   de page.reload(), que reexecutaria o addInitScript e apagaria os dados
   que acabamos de salvar (isso seria um bug do teste, não do app). ---- */
const reopened = await context.newPage();
await reopened.goto(BASE + '#/projeto/' + PROJECT_A, { waitUntil: 'networkidle' });
check('texto recuperado ao reabrir a página', await reopened.inputValue('#note-resultado') === 'De 3 horas por semana para 10 minutos.');
check('aviso de "recuperado" aparece no campo com conteúdo salvo',
  (await reopened.locator('[data-saved="resultado"]').textContent()).includes('Recuperado'));
await reopened.close();

/* ---- aviso de saída só com alteração pendente ---- */
check('sem digitação nova, não há aviso de saída pendente',
  !(await page.evaluate(() => window.MIA.projects.hasPendingSaves())));
await page.fill('#note-decisoes', 'Escolhi Python puro por serem poucos usuários internos.');
check('com digitação nova (ainda dentro do debounce), há aviso de saída pendente',
  await page.evaluate(() => window.MIA.projects.hasPendingSaves()));
await page.waitForTimeout(DEBOUNCE + 400);
check('depois de salvar, aviso de saída desarma de novo',
  !(await page.evaluate(() => window.MIA.projects.hasPendingSaves())));

/* ---- o motivo da reescrita: projeto B não pode vazar pro projeto A ---- */
await page.goto(BASE + '#/projeto/' + PROJECT_B, { waitUntil: 'networkidle' });
await page.fill('#note-resultado', 'Texto do projeto B, não deveria ir para o A.');
await page.waitForTimeout(DEBOUNCE + 400);
saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));
check('projeto B salvou no PRÓPRIO registro',
  saved.projects[PROJECT_B] && saved.projects[PROJECT_B].notes.resultado === 'Texto do projeto B, não deveria ir para o A.');
check('projeto A NÃO foi sobrescrito pela digitação feita no projeto B (sem listener duplicado/vazado)',
  saved.projects['project-assistente-pessoal'].notes.resultado === 'De 3 horas por semana para 10 minutos.');

await browser.close();
server.close();

let fails = 0;
console.log('\n=== AUTOSAVE DO WORKSPACE ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
