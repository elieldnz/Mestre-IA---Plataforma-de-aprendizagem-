/* Verificações de qualidade: progressão por domínio, links, botões,
   acessibilidade, contraste e abertura via file://.

   Uso: node tests/quality.mjs      (requer Playwright instalado)            */
import { loadChromium } from './pw.mjs';
import fs from 'node:fs';
import { startServer } from './server.mjs';

const { server, base, root } = await startServer();
const curriculum = JSON.parse(fs.readFileSync(root + '/data/curriculum.json', 'utf8'));
const skills = JSON.parse(fs.readFileSync(root + '/data/skills.json', 'utf8'));
const projects = JSON.parse(fs.readFileSync(root + '/data/projects.json', 'utf8'));

const results = []; const errors = [];
const check = (name, ok, extra = '') => results.push({ name, ok: !!ok, extra });

/* estado com o módulo de fundamentos dominado */
const state = {
  version: 1, user: { name: 'Teste', createdAt: '2026-01-01T00:00:00Z' },
  diagnostic: { level: 'iniciante', percent: 20, dimensions: [], strengths: [], gaps: [],
    track: { label: 'x', modules: [] }, date: '2026-01-01T00:00:00Z', mode: 'normal' },
  xp: 500, streak: { current: 3, best: 3, lastDay: new Date().toISOString().slice(0, 10) },
  minutes: 120, lessons: {}, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: { mode: 'normal' }
};
curriculum.modules[0].lessons.forEach(l => {
  state.lessons[l.id] = { read: true, xpAwarded: true, completedAt: '2026-01-02T00:00:00Z', exercises: {} };
  (l.exercises || []).forEach(e => { state.lessons[l.id].exercises[e.id] = { attempts: 1, score: 100, answer: 'x', xpAwarded: true }; });
});

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(state));

/* --- progressão --- */
await page.goto(base + '#/jornada', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const states = await page.$$eval('.journey__item', els => els.map(e => e.dataset.state));
check('módulo dominado fica concluído', states[0] === 'completed', states[0]);
check('módulo seguinte é liberado', states[1] === 'available' || states[1] === 'in_progress', states[1]);
check('módulo distante segue bloqueado', states[3] === 'locked', states[3]);

await page.goto(base + '#/aula/rag-001');
await page.waitForTimeout(250);
check('aula bloqueada não abre', (await page.locator('#conteudo h1').first().textContent()).includes('bloqueada'));

await page.goto(base + '#/checkpoint/fundamentos');
await page.waitForTimeout(250);
check('checkpoint libera o avanço', (await page.locator('#conteudo').textContent()).includes('Você está pronto para'));

/* --- links, páginas vazias e botões --- */
const validRoutes = new Set(['dashboard', 'jornada', 'aulas', 'skills', 'projetos', 'desafios', 'revisao',
  'erros', 'progresso', 'biblioteca', 'perfil', 'aula', 'skill', 'projeto', 'checkpoint']);
const ids = {
  aula: new Set(curriculum.modules.flatMap(m => m.lessons.map(l => l.id))),
  checkpoint: new Set(curriculum.modules.map(m => m.id)),
  skill: new Set(skills.skills.map(s => s.id)),
  projeto: new Set(projects.projects.map(p => p.id))
};
const routes = ['#/dashboard', '#/jornada', '#/aulas', '#/skills', '#/projetos', '#/desafios', '#/revisao',
  '#/erros', '#/progresso', '#/biblioteca', '#/perfil', '#/aula/fund-001', '#/skill/skill-creator',
  '#/projeto/project-assistente-pessoal', '#/checkpoint/fundamentos'];
const bad = []; const dead = [];
for (const r of routes) {
  await page.goto(base + r);
  await page.waitForTimeout(180);
  const hrefs = await page.$$eval('a[href^="#/"]', as => as.map(a => a.getAttribute('href')));
  for (const h of new Set(hrefs)) {
    const [name, param] = h.slice(2).split('/');
    if (!validRoutes.has(name)) { bad.push(r + ' → ' + h + ' (rota inexistente)'); continue; }
    if (ids[name] && !ids[name].has((param || '').split('#')[0])) bad.push(r + ' → ' + h + ' (id inexistente)');
  }
  if ((await page.locator('#conteudo').textContent()).trim().length < 80) bad.push(r + ' → página vazia');
  const noop = await page.$$eval('#conteudo button', bs => bs
    .filter(b => !b.dataset.action && !b.dataset.mode && !b.dataset.exercise && !b.dataset.scroll && !b.dataset.recall && !b.disabled)
    .map(b => b.textContent.trim().slice(0, 30)));
  noop.forEach(d => dead.push(r + ': ' + d));
}
check('nenhum link quebrado e nenhuma página vazia', bad.length === 0, bad.slice(0, 4).join(' | '));
check('nenhum botão sem ação', dead.length === 0, dead.slice(0, 4).join(' | '));

/* --- acessibilidade --- */
await page.goto(base + '#/aula/fund-001');
await page.waitForTimeout(300);
const a11y = await page.evaluate(() => {
  let unlabeled = 0, imgNoAlt = 0;
  document.querySelectorAll('#conteudo input, #conteudo textarea, #conteudo select').forEach(f => {
    const label = (f.id && document.querySelector('label[for="' + f.id + '"]')) || f.closest('label') ||
      f.getAttribute('aria-label') || f.getAttribute('aria-labelledby');
    if (!label) unlabeled++;
  });
  document.querySelectorAll('img').forEach(i => { if (!i.hasAttribute('alt')) imgNoAlt++; });
  return { unlabeled, imgNoAlt };
});
check('todo campo tem label', a11y.unlabeled === 0, 'sem label: ' + a11y.unlabeled);
check('toda imagem tem alt', a11y.imgNoAlt === 0);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.keyboard.press('Tab');
check('primeiro Tab alcança o atalho de conteúdo',
  (await page.evaluate(() => document.activeElement.className)).includes('skip-link'));

let reached = false;
for (let i = 0; i < 60 && !reached; i++) {
  await page.keyboard.press('Tab');
  reached = await page.evaluate(() => document.activeElement.dataset && document.activeElement.dataset.action === 'submit');
}
check('exercício alcançável só pelo teclado', reached);
check('foco visível', (await page.evaluate(() => {
  const b = document.querySelector('#conteudo a[href], #conteudo button');
  b.focus(); return getComputedStyle(b).outlineWidth;
})) !== '0px');

/* --- contraste (WCAG AA para texto) --- */
const lum = hex => {
  const c = hex.replace('#', '').match(/../g).map(h => parseInt(h, 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
[['#F8FAFC', '#0B0F14', 'texto / fundo'], ['#94A3B8', '#0B0F14', 'texto secundário / fundo'],
 ['#94A3B8', '#18212F', 'texto secundário / superfície'], ['#22C55E', '#18212F', 'verde / badge'],
 ['#F59E0B', '#18212F', 'âmbar / badge'], ['#A78BFA', '#18212F', 'roxo / badge'],
 ['#F87171', '#18212F', 'vermelho / badge'], ['#60A5FA', '#18212F', 'azul / badge'],
 ['#60A5FA', '#111827', 'link / superfície'], ['#FFFFFF', '#2563EB', 'botão primário'],
 ['#FFFFFF', '#7C3AED', 'botão do tutor']
].forEach(([f, b, label]) => {
  const r = ratio(f, b);
  check('contraste ' + label + ' ≥ 4.5', r >= 4.5, r.toFixed(2));
});

/* --- abertura direta do arquivo (fallback do bundle) --- */
const filePage = await browser.newPage();
await filePage.goto('file://' + root + '/index.html');
await filePage.waitForTimeout(1200);
check('funciona abrindo index.html direto (file://)', await filePage.locator('.welcome h1').isVisible());

await browser.close();
server.close();

let fails = 0;
console.log('\n=== QUALIDADE ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.extra ? '  [' + r.extra + ']' : '')); });
console.log('\nErros de console/página: ' + errors.length);
errors.slice(0, 10).forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
