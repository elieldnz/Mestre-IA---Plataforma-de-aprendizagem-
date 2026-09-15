import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';
const chromium = await loadChromium();
const { server, base: BASE } = await startServer();
const results = []; const errors = [];
const check = (n, c, e = '') => results.push({ n, ok: !!c, e });

const browser = await chromium.launch();

// --- Caso 1: iniciante total -> deve pular ferramentas, agentes, python, apis (12 -> 8) ---
{
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.fill('#ob-name', 'Novato');
  await page.click('[data-action="start"]');

  const seen = [];
  for (let i = 0; i < 15; i++) {
    const h2 = await page.locator('.onboarding__card h2').textContent().catch(() => null);
    if (!h2) break;
    seen.push(h2.trim());
    const radios = page.locator('input[name="ob"][type="radio"]');
    const boxes = page.locator('input[name="ob"][type="checkbox"]');
    if (await radios.count() > 0) await radios.nth(0).check();      // sempre a opção "mais baixa" (índice 0)
    else if (await boxes.count() > 0) await boxes.nth(0).check();
    const btn = page.locator('[data-action="next"]');
    const label = await btn.textContent();
    await btn.click();
    await page.waitForTimeout(120);
    if (label.includes('resultado')) break;
  }
  check('iniciante total: NÃO viu "Quais ferramentas"', !seen.some(s => s.includes('ferramentas você já usou')), seen.join(' | '));
  check('iniciante total: NÃO viu "criou GPTs"', !seen.some(s => s.includes('criou GPTs')));
  check('iniciante total: NÃO viu "Conhece Python"', !seen.some(s => s.includes('Conhece Python')));
  check('iniciante total: NÃO viu "utilizou APIs"', !seen.some(s => s.includes('utilizou APIs')));
  check('iniciante total: só 8 perguntas mostradas', seen.length === 8, 'mostradas=' + seen.length);
  await page.waitForSelector('text=Seu ponto de partida');
  const resultText = await page.locator('.onboarding__card').textContent();
  check('resultado avisa quantas perguntas pulou', resultText.includes('Pulamos 4 perguntas'), resultText.slice(0, 300));
}

// --- Caso 2: avançado total -> deve ver TODAS as 12 perguntas (nenhum skip) ---
{
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror2: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.fill('#ob-name', 'Sênior');
  await page.click('[data-action="start"]');
  const seen = [];
  for (let i = 0; i < 15; i++) {
    const h2 = await page.locator('.onboarding__card h2').textContent().catch(() => null);
    if (!h2) break;
    seen.push(h2.trim());
    const radios = page.locator('input[name="ob"][type="radio"]');
    const boxes = page.locator('input[name="ob"][type="checkbox"]');
    if (await radios.count() > 0) await radios.nth((await radios.count()) - 1).check(); // sempre a melhor opção
    else if (await boxes.count() > 0) await boxes.nth(0).check();
    const btn = page.locator('[data-action="next"]');
    const label = await btn.textContent();
    await btn.click();
    await page.waitForTimeout(120);
    if (label.includes('resultado')) break;
  }
  check('avançado total: viu as 12 perguntas', seen.length === 12, 'mostradas=' + seen.length);
  await page.waitForSelector('text=Seu ponto de partida');
  const resultText = await page.locator('.onboarding__card').textContent();
  check('avançado total: SEM aviso de perguntas puladas', !resultText.includes('Pulamos'));
  check('avançado total: nível avançado', resultText.includes('Avançado'));
}

// --- Caso 3: back/forward não quebra e re-adapta ---
{
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror3: ' + e.message));
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('[data-action="start"]'); // profissão (texto)
  await page.fill('#ob-input', 'Teste');
  await page.click('[data-action="next"]'); // tecnologia
  await page.locator('input[name="ob"]').nth(0).check();
  await page.click('[data-action="next"]'); // usa-ia -> escolhe "Nunca usei" (pula ferramentas e agentes)
  await page.locator('input[name="ob"]').nth(0).check();
  await page.click('[data-action="next"]');
  let h2 = await page.locator('.onboarding__card h2').textContent();
  check('pulou para "prompts" (não "ferramentas")', h2.includes('prompts estruturados'), h2);
  await page.click('[data-action="back"]'); // volta pra "usa-ia"
  h2 = await page.locator('.onboarding__card h2').textContent();
  check('voltar chega direto em "usa-ia" (pulando ferramentas)', h2.includes('utiliza IA'), h2);
  await page.locator('input[name="ob"]').nth(2).check(); // muda para "Uso toda semana" -> ferramentas volta a existir
  await page.click('[data-action="next"]');
  h2 = await page.locator('.onboarding__card h2').textContent();
  check('mudou a resposta -> "ferramentas" reaparece', h2.includes('ferramentas você já usou'), h2);
}

await browser.close();
server.close();

let fails = 0;
console.log('\n=== DIAGNÓSTICO RAMIFICADO ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
