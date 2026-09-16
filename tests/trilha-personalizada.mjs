/* Verifica que a trilha personalizada é REAL: reordena Jornada, Aulas e a
   "próxima missão" do Dashboard conforme o objetivo do diagnóstico — sem
   esconder nem desbloquear nada — e que o objetivo pode ser trocado a
   qualquer momento pelo Perfil, sem refazer o diagnóstico.

   Uso: node tests/trilha-personalizada.mjs   (requer Playwright)          */
import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';
import fs from 'node:fs';

const { server, base: BASE, root: ROOT } = await startServer();
const curriculum = JSON.parse(fs.readFileSync(ROOT + '/data/curriculum.json', 'utf8'));
const results = []; const errors = [];
const check = (n, c, e = '') => results.push({ n, ok: !!c, e });

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const dadosTrack = curriculum.diagnostic.tracks.dados; // "dados" = Dados e documentos
const dadosModules = dadosTrack.modules; // ["fundamentos","prompt-engineering","skills","apis","rag"]

const state = {
  version: 1, user: { name: 'Teste', createdAt: '2026-01-01T00:00:00Z' },
  diagnostic: {
    level: 'iniciante', percent: 10, dimensions: [], strengths: [], gaps: [],
    trackId: 'dados', track: dadosTrack, date: '2026-01-01T00:00:00Z', mode: 'normal'
  },
  xp: 0, streak: { current: 0, best: 0, lastDay: null }, minutes: 0,
  lessons: {}, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: { mode: 'normal' }
};
await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(state));

/* ---- Jornada: track primeiro, resto depois, nada perdido ---- */
await page.goto(BASE + '#/jornada', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

check('mostra o rótulo do objetivo escolhido', (await page.locator('#conteudo').textContent()).includes(dadosTrack.label));
check('link para mudar objetivo aponta pro Perfil', await page.locator('a[href="#/perfil"]').count() > 0);

// h3 traz "ícone + título" (ex.: "🧠 Fundamentos") — tira o ícone antes de comparar.
const journeyTitles = await page.$$eval('.journey__card h3', els => els.map(e => e.textContent.replace(/^\S+\s/, '').trim()));
const expectedFirstTitles = dadosModules.map(id => curriculum.modules.find(m => m.id === id).title);
check('as 5 primeiras fases da Jornada são exatamente o objetivo, na ordem certa',
  JSON.stringify(journeyTitles.slice(0, 5)) === JSON.stringify(expectedFirstTitles),
  journeyTitles.slice(0, 5).join(' | '));
// A Jornada também lista a(s) trilha(s) piloto (mesma classe .journey__card),
// então o total esperado é TODOS os módulos, piloto incluído.
check('nenhuma fase da trilha Mestre IA desaparece (todas ainda listadas)',
  journeyTitles.length === curriculum.modules.length,
  'mostradas=' + journeyTitles.length + ' esperado=' + curriculum.modules.length);
check('seção "Outras fases" existe pro resto da trilha', (await page.locator('text=Outras fases da trilha Mestre IA').count()) > 0);

/* ---- Aulas: mesma reordenação ---- */
await page.goto(BASE + '#/aulas');
await page.waitForTimeout(300);
const lessonsPageModuleTitles = await page.$$eval('#conteudo h2', els => els.map(e => e.textContent.replace(/^\S+\s/, '').trim()));
check('página de Aulas também reordena pelo objetivo',
  lessonsPageModuleTitles.slice(0, 5).join('|').includes(expectedFirstTitles[0]) &&
  JSON.stringify(lessonsPageModuleTitles.slice(0, 5)) === JSON.stringify(expectedFirstTitles),
  lessonsPageModuleTitles.slice(0, 5).join(' | '));

/* ---- Dashboard: próxima missão prioriza o objetivo ---- */
await page.goto(BASE + '#/dashboard');
await page.waitForTimeout(300);
const dashText = await page.locator('.hero').textContent();
const fundamentosFirstLessonTitle = curriculum.modules.find(m => m.id === 'fundamentos').lessons[0].title;
check('próxima missão é a 1ª aula de Fundamentos (início do objetivo "Dados")', dashText.includes(fundamentosFirstLessonTitle));

/* ---- Gating continua intacto: Prompt Engineering ainda bloqueado sem dominar Fundamentos ---- */
await page.goto(BASE + '#/jornada');
await page.waitForTimeout(300);
const states = await page.$$eval('.journey__item', els => els.map(e => e.dataset.state));
check('objetivo não muda o bloqueio: 2ª fase do objetivo ainda travada', states[1] === 'locked', states.slice(0, 3).join(','));

/* ---- Perfil: trocar objetivo sem refazer diagnóstico ---- */
await page.goto(BASE + '#/perfil');
await page.waitForTimeout(300);
check('mostra os botões de objetivo', await page.locator('[data-track]').count() >= 5);
check('objetivo atual "Dados" aparece marcado', await page.locator('[data-track="dados"][aria-pressed="true"]').count() === 1);

await page.click('[data-track="automacao"]');
await page.waitForTimeout(300);
check('trocar objetivo não volta pro diagnóstico', page.url().includes('#/perfil'));
check('novo objetivo fica marcado', await page.locator('[data-track="automacao"][aria-pressed="true"]').count() === 1);

await page.goto(BASE + '#/jornada');
await page.waitForTimeout(300);
const newFirstTitles = await page.$$eval('.journey__card h3', els => els.map(e => e.textContent.replace(/^\S+\s/, '').trim()));
const automacaoModules = curriculum.diagnostic.tracks.automacao.modules;
const expectedAutomacao = automacaoModules.map(id => curriculum.modules.find(m => m.id === id).title);
check('Jornada reflete o novo objetivo imediatamente',
  JSON.stringify(newFirstTitles.slice(0, 5)) === JSON.stringify(expectedAutomacao),
  newFirstTitles.slice(0, 5).join(' | '));

/* ---- Sem diagnóstico salvo: não quebra, mostra a trilha inteira ---- */
const page2 = await browser.newPage();
page2.on('pageerror', e => errors.push('pageerror(sem diag): ' + e.message));
await page2.addInitScript(() => localStorage.setItem('mestre-ia:v1', JSON.stringify({
  version: 1, user: { name: 'X' }, diagnostic: null, xp: 0, streak: {}, minutes: 0,
  lessons: {}, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: {}
})));
// diagnostic:null força a tela de onboarding de novo (comportamento esperado — sem diagnóstico, sem trilha).
await page2.goto(BASE, { waitUntil: 'networkidle' });
await page2.waitForTimeout(300);
check('sem diagnóstico salvo, volta pro onboarding (comportamento existente, não quebrou)',
  await page2.locator('.welcome h1').isVisible());

await browser.close();
server.close();

let fails = 0;
console.log('\n=== TRILHA PERSONALIZADA ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
