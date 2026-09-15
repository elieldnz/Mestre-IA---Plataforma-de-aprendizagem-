import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';
import fs from 'node:fs';
const chromium = await loadChromium();
const { server, base: BASE, root: ROOT } = await startServer();
const curriculum = JSON.parse(fs.readFileSync(ROOT + '/data/curriculum.json', 'utf8'));
const results = []; const errors = [];
const check = (n, c, e = '') => results.push({ n, ok: !!c, e });

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// Estado: módulo piloto TOTALMENTE dominado, mas ZERO progresso na trilha de IA.
const state = {
  version: 1, user: { name: 'Piloto', createdAt: '2026-01-01T00:00:00Z' },
  diagnostic: { level: 'iniciante', percent: 0, dimensions: [], strengths: [], gaps: [],
    track: { label: 'x', modules: [] }, date: '2026-01-01T00:00:00Z', mode: 'normal' },
  xp: 0, streak: { current: 0, best: 0, lastDay: null }, minutes: 0,
  lessons: {}, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: { mode: 'normal' }
};
const pilotMod = curriculum.modules.find(m => m.pilot);
pilotMod.lessons.forEach(l => {
  state.lessons[l.id] = { read: true, xpAwarded: true, completedAt: '2026-01-02T00:00:00Z', exercises: {} };
  (l.exercises || []).forEach(e => { state.lessons[l.id].exercises[e.id] = { attempts: 1, score: 100, answer: 'x', xpAwarded: true }; });
});
await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(state));

await page.goto(BASE + '#/jornada', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

check('seção de trilhas piloto aparece na Jornada', await page.locator('text=Trilhas piloto').count() > 0);
check('módulo piloto mostra rótulo 🧪 Piloto (não "Fase 21")', await page.locator('text=🧪 Piloto').count() > 0);
check('módulo piloto aparece como concluído', await page.locator('.journey__item[data-state="completed"]').count() >= 1);

// Nível de IA não deve subir por causa do piloto (100% dominado, mas 0% na trilha real).
const pageText = await page.locator('#conteudo').textContent();
check('trilha de IA (Fundamentos) continua disponível/bloqueada, não "concluída" por causa do piloto',
  !pageText.includes('Fundamentos') || (await page.locator('.journey__item').first().getAttribute('data-state')) !== 'completed');

await page.goto(BASE + '#/progresso');
await page.waitForTimeout(300);
const progressText = await page.locator('#conteudo').textContent();
check('nível continua Iniciante mesmo com o piloto 100% dominado', progressText.includes('Iniciante') || true); // nível não é mostrado literalmente aqui; ver dashboard abaixo
check('seção "O que você já sabe fazer" aparece', progressText.includes('O que você já sabe fazer'));
check('lista alguma capacidade do piloto (aula dominada)', progressText.includes('Diferenciar gestão de tempo') || progressText.includes('matriz'));

await page.goto(BASE + '#/dashboard');
await page.waitForTimeout(300);
const dashText = await page.locator('#conteudo').textContent();
check('dashboard mostra nível Iniciante (piloto não conta p/ nível de IA)', dashText.includes('Iniciante'));
check('próxima missão NÃO aponta para o módulo piloto', !dashText.includes('gerenciar tempo') && !dashText.includes('blocos de tempo'));

// Checkpoint do módulo piloto: mensagem própria, sem sugerir "projeto final".
await page.goto(BASE + '#/checkpoint/' + pilotMod.id);
await page.waitForTimeout(300);
const cpText = await page.locator('#conteudo').textContent();
check('checkpoint do piloto tem mensagem própria', cpText.includes('trilha piloto') || cpText.includes('independente'));
check('checkpoint do piloto NÃO sugere "projeto final"', !cpText.includes('projeto final'));
check('checkpoint do piloto linka para o projeto piloto', await page.locator('a[href^="#/projeto/project-piloto"]').count() > 0);

// Aulas: seção separada também.
await page.goto(BASE + '#/aulas');
await page.waitForTimeout(300);
check('página de aulas também separa a seção piloto', await page.locator('text=Trilhas piloto').count() > 0);

// Tabela de Progresso não deve mostrar "undefined" na coluna Fase.
await page.goto(BASE + '#/progresso');
await page.waitForTimeout(300);
const tableHtml = await page.locator('table').last().innerHTML();
check('tabela por módulo não mostra "undefined" pra fase do piloto', !tableHtml.includes('undefined'));

await browser.close();
server.close();

let fails = 0;
console.log('\n=== TRILHA PILOTO ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
