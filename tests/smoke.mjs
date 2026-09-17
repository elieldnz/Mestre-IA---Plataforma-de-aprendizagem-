/* Teste de fluxo do MVP: diagnóstico → dashboard → aula → exercícios →
   skills → projetos → revisão → erros → tutor → persistência → mobile.

   Uso: node tests/smoke.mjs        (requer Playwright instalado)            */
import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';

const { server, base } = await startServer();
const results = []; const errors = [];
const check = (name, ok, extra = '') => results.push({ name, ok: !!ok, extra });

const chromium = await loadChromium();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));

await page.goto(base, { waitUntil: 'networkidle' });

/* --- diagnóstico --- */
check('tela de boas-vindas', await page.locator('.welcome h1').isVisible());
await page.fill('#ob-name', 'Eliel');
await page.click('[data-action="start"]');
check('primeira pergunta é a profissão', (await page.locator('.onboarding__card h2').textContent()).includes('profissão'));
await page.fill('#ob-input', 'Analista de marketing');
await page.click('[data-action="next"]');
for (let i = 0; i < 11; i++) {
  const radios = page.locator('input[name="ob"][type="radio"]');
  if (await radios.count() > 0) await radios.nth(1).check();
  else await page.locator('input[name="ob"][type="checkbox"]').nth(0).check();
  await page.click('[data-action="next"]');
}
check('resultado do diagnóstico', await page.locator('text=Seu ponto de partida').isVisible());
check('nível apurado', /Iniciante|Intermediário|Avançado/.test(await page.locator('.onboarding__card .badge').first().textContent()));
await page.click('[data-action="enter"]');

/* --- dashboard --- */
await page.waitForSelector('.hero h1');
check('saudação com o nome', (await page.locator('.hero h1').textContent()).includes('Eliel'));
check('4 indicadores', await page.locator('.grid--4 .stat').count() === 4);
check('missão do dia', await page.locator('.mission li').count() > 0);
check('mapa da jornada', await page.locator('.journey__item').count() > 0);

/* --- aula e exercícios --- */
await page.click('.hero a.btn--primary');
await page.waitForSelector('.lesson h1');
check('aula abre', !!(await page.locator('.lesson h1').textContent()));
check('blocos de conteúdo', await page.locator('.lesson-block').count() >= 2);
check('marcação de origem do conteúdo', await page.locator('.source-tag').count() >= 2);

const quiz = page.locator('.exercise').first();
await quiz.locator('.option').nth(1).click();
await quiz.locator('[data-action="submit"]').click();
await page.waitForSelector('.feedback');
check('quiz corrigido', (await quiz.locator('.feedback').textContent()).includes('100'));
check('XP creditado', parseInt(await page.locator('#chip-xp').textContent()) >= 40);

const aberta = page.locator('.exercise').nth(1);
await aberta.locator('textarea').fill('Classificar é decidir a categoria de algo, por exemplo separar 200 e-mails entre spam e não spam. Gerar é criar conteúdo novo, como escrever a resposta do e-mail. No meu dia eu classifico chamados e gero o texto da resposta ao cliente.');
await aberta.locator('[data-action="submit"]').click();
await page.waitForTimeout(300);
const fb = await aberta.locator('.feedback').textContent();
check('resposta aberta avaliada', parseInt(fb.match(/(\d+)\s*\/100/)?.[1] || '0') >= 60);
check('resposta de referência NÃO é exibida (PR #7 — fechar vazamento de evidência)', !fb.includes('resposta de referência'));

/* --- listas --- */
await page.click('a[href="#/aulas"]');
await page.waitForSelector('.list');
check('módulos listados', await page.locator('section.card h2').count() >= 5);
check('módulo bloqueado explica o que falta', await page.locator('text=Para liberar').count() > 0);

await page.click('.nav a[href="#/skills"]');
await page.waitForSelector('.skill-card');
check('50 Skills', await page.locator('.skill-card').count() === 50);
await page.selectOption('#f-category', 'documentos-escritorio');
await page.waitForTimeout(200);
check('filtro por categoria', await page.locator('.skill-card').count() === 7);
await page.fill('#f-query', 'excel');
await page.waitForTimeout(200);
check('busca por palavra-chave', await page.locator('.skill-card').count() >= 1);
await page.click('[data-action="clear-filters"]');
await page.waitForFunction(() => document.querySelectorAll('.skill-card').length === 50);
await page.locator('.skill-card').nth(1).click();
await page.waitForFunction(() => location.hash.startsWith('#/skill/'));
await page.waitForTimeout(200);
check('checklists da Skill (segurança + estudo)', await page.locator('.checklist input').count() === 16);
await page.locator('[data-action="status"][data-status="dominada"]').click();
await page.waitForTimeout(200);
check('Skill marcada como dominada', await page.locator('.badge', { hasText: 'Dominada' }).count() > 0);

/* --- projetos --- */
await page.click('.nav a[href="#/projetos"]');
await page.waitForSelector('.skill-card');
check('projetos listados', await page.locator('.skill-card').count() >= 5);
await page.locator('.skill-card').first().click();
await page.waitForTimeout(300);
if (await page.locator('.tasks input').count() > 0) {
  await page.locator('.tasks input').first().check();
  await page.waitForTimeout(150);
  check('tarefa do projeto persiste', await page.locator('.tasks input').first().isChecked());
}

/* --- revisão e erros --- */
await page.click('.nav a[href="#/revisao"]');
await page.waitForFunction(() => location.hash === '#/revisao');
await page.waitForTimeout(200);
check('página de revisão', (await page.locator('#conteudo h1').first().textContent()).includes('Revisão'));

await page.goto(base + '#/erros');
await page.waitForSelector('#conteudo h1');
await page.fill('#err-concept', 'APIs');
await page.fill('#err-error', 'Confundi API com endpoint.');
await page.click('[data-action="add-error"]');
await page.waitForTimeout(200);
check('erro registrado', await page.locator('table tbody tr').count() >= 1);

/* --- demais rotas --- */
for (const [route, needle] of [['#/progresso', 'Progresso'], ['#/biblioteca', 'Biblioteca'], ['#/perfil', 'Perfil'],
  ['#/desafios', 'Desafios'], ['#/jornada', 'Minha jornada'], ['#/checkpoint/fundamentos', 'Checkpoint']]) {
  await page.goto(base + route);
  await page.waitForTimeout(250);
  check('rota ' + route, (await page.locator('#conteudo h1').first().textContent()).includes(needle));
}

/* --- tutor --- */
await page.goto(base + '#/dashboard');
await page.click('#tutor-fab');
await page.waitForSelector('#tutor-panel:not([hidden])');
await page.fill('#tutor-input', '/progresso');
await page.press('#tutor-input', 'Enter');
await page.waitForTimeout(200);
check('tutor responde comando', (await page.locator('.msg--tutor').last().textContent()).includes('XP'));
await page.fill('#tutor-input', 'não entendi');
await page.press('#tutor-input', 'Enter');
await page.waitForTimeout(200);
check('tutor reexplica', (await page.locator('.msg--tutor').last().textContent()).length > 40);
await page.keyboard.press('Escape');
check('Esc fecha o tutor', await page.locator('#tutor-panel').isHidden());

/* --- persistência e mobile --- */
await page.reload({ waitUntil: 'networkidle' });
check('não repete o diagnóstico', await page.locator('#onboarding').isHidden());
check('XP persistido', parseInt(await page.locator('#chip-xp').textContent()) > 0);

const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
mob.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
await mob.goto(base, { waitUntil: 'networkidle' });
await mob.waitForTimeout(400);
const overflow = await mob.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('sem rolagem horizontal no celular', overflow <= 1, 'overflow=' + overflow);

await browser.close();
server.close();

let fails = 0;
console.log('\n=== SMOKE ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.name + (r.extra ? '  [' + r.extra + ']' : '')); });
console.log('\nErros de console/página: ' + errors.length);
errors.slice(0, 10).forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
