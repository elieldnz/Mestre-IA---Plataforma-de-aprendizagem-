/* Robustez do estado: blob corrompido, recuperação, quarentena e import.

   O bug perigoso nunca foi "JSON.parse falhar". Era: falhar → desligar o save
   em silêncio → a aplicação continuar aparentando funcionar enquanto nada é
   gravado, com o aluno preso num onboarding infinito.

   Os dois invariantes centrais:
     válido → corrupção → load → quarentena → estado seguro → save → reload → persiste
     válido → import inválido → rejeitado → estado válido intacto

   Uso: node tests/estado-corrompido.mjs   (requer Playwright)               */
import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';

const KEY = 'mestre-ia:v1';
const QUARENTENA = KEY + ':corrompido';

const { server, base: BASE } = await startServer();
const results = []; const errors = [];
const check = (n, c, e = '') => results.push({ n, ok: !!c, e });

const chromium = await loadChromium();
const browser = await chromium.launch();

function estadoValido(xp) {
  return {
    version: 1, user: { name: 'Teste', createdAt: '2026-01-01T00:00:00Z' },
    diagnostic: { level: 'iniciante', percent: 10, dimensions: [], strengths: [], gaps: [],
      track: { label: 'x', modules: [] }, date: '2026-01-01T00:00:00Z', mode: 'normal' },
    xp: xp || 0, streak: { current: 1, best: 1, lastDay: null }, minutes: 0,
    lessons: {}, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: {}
  };
}

/** Abre o app num contexto novo com um blob bruto já no storage. */
async function abrir(blobBruto, opts) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (opts && opts.bloquearStorage) {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          return {
            getItem() { throw new Error('storage bloqueado'); },
            setItem() { throw new Error('storage bloqueado'); },
            removeItem() { throw new Error('storage bloqueado'); }
          };
        }
      });
    });
  } else if (blobBruto !== null) {
    await page.addInitScript((args) => localStorage.setItem(args.k, args.v), { k: KEY, v: blobBruto });
  }
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  return { context, page };
}

const ler = (page, k) => page.evaluate(key => localStorage.getItem(key), k);
const estado = page => page.evaluate(() => window.MIA.progress.state);

/* ============ 1-3) blobs ilegíveis: truncado, "null", array ============ */
for (const [nome, blob] of [
  ['truncado', '{"version":1,"user":{"nam'],
  ['"null"', 'null'],
  ['array', '[]']
]) {
  const { context, page } = await abrir(blob);
  const s = await estado(page);
  const q = await ler(page, QUARENTENA);
  const principal = await ler(page, KEY);
  const rec = await page.evaluate(() => window.MIA.progress.recovery);

  check('[' + nome + '] recuperou para um estado seguro (xp=0, sem crash)', s && s.xp === 0 && !!s.lessons);
  check('[' + nome + '] o save continua ligado (não confundiu com storage bloqueado)',
    await page.evaluate(() => window.MIA.progress.storageAvailable));
  check('[' + nome + '] registrou a recuperação', !!rec && !!rec.reason, rec && rec.reason);
  check('[' + nome + '] o blob original foi para a quarentena', q === blob, 'quarentena=' + q);
  check('[' + nome + '] o blob original NÃO foi sobrescrito no load', principal === blob);
  await context.close();
}

/* ============ 4) JSON válido com shape inválido: preservação parcial ============ */
{
  const parcial = {
    version: 1,
    diagnostic: { level: 'iniciante', percent: 10, track: { label: 'x', modules: [] }, mode: 'normal' },
    xp: 'muito',                       // tipo errado -> default
    streak: null,                      // derrubava a aplicação antes
    minutes: -5,                       // inválido -> default
    lessons: {
      'fund-001': { read: true, exercises: { 'fund-001-q1': { score: 100, attempts: 1 } } }, // válida
      'fund-002': 'lixo',              // inválida -> descartar só ela
      'fund-003': { read: true, exercises: 'quebrado' }                                      // válida, exercises coagido
    },
    skills: [],                        // array no lugar de objeto -> {}
    errors: [{ id: 'e1', concept: 'x', error: 'y' }, 'lixo', null]
  };
  const { context, page } = await abrir(JSON.stringify(parcial));
  const s = await estado(page);

  check('[shape] aula válida foi preservada', !!s.lessons['fund-001'] && s.lessons['fund-001'].read === true);
  check('[shape] só a aula podre foi descartada', !s.lessons['fund-002'] && !!s.lessons['fund-003'],
    Object.keys(s.lessons).join(','));
  check('[shape] a nota da aula válida sobreviveu',
    s.lessons['fund-001'].exercises['fund-001-q1'].score === 100);
  check('[shape] exercises com tipo errado virou objeto', s.lessons['fund-003'].exercises &&
    typeof s.lessons['fund-003'].exercises === 'object' && !Array.isArray(s.lessons['fund-003'].exercises));
  check('[shape] xp inválido virou 0 (não concatena string)', s.xp === 0, 'xp=' + JSON.stringify(s.xp));
  check('[shape] minutes negativo virou 0', s.minutes === 0);
  check('[shape] streak null virou o default, sem crash', !!s.streak && s.streak.current === 0);
  check('[shape] skills como array virou objeto', !Array.isArray(s.skills) && typeof s.skills === 'object');
  check('[shape] errors manteve só as entradas válidas', s.errors.length === 1 && s.errors[0].id === 'e1',
    'n=' + s.errors.length);
  check('[shape] diagnóstico válido preservado -> não caiu no onboarding',
    await page.evaluate(() => document.getElementById('onboarding').hidden));
  await context.close();
}

/* ============ 5) localStorage indisponível ============ */
{
  const { context, page } = await abrir(null, { bloquearStorage: true });
  check('[bloqueado] a aplicação abre mesmo assim',
    await page.evaluate(() => !!document.getElementById('conteudo')));
  check('[bloqueado] storageAvailable = false',
    (await page.evaluate(() => window.MIA.progress.storageAvailable)) === false);
  check('[bloqueado] NÃO é reportado como corrupção',
    (await page.evaluate(() => window.MIA.progress.recovery)) === null);
  await context.close();
}

/* ====== INVARIANTE 1: válido → corrupção → recuperação → save → reload ====== */
{
  const context = await browser.newContext();
  const p1 = await context.newPage();
  p1.on('pageerror', e => errors.push('pageerror: ' + e.message));

  // estado válido persistido
  await p1.addInitScript((args) => localStorage.setItem(args.k, args.v),
    { k: KEY, v: JSON.stringify(estadoValido(500)) });
  await p1.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await p1.waitForTimeout(250);
  check('[invariante 1] estado válido carregou', (await estado(p1)).xp === 500);
  await p1.close();

  // corrupção externa (aba fechada, storage adulterado)
  const p2 = await context.newPage();
  p2.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p2.goto(BASE + '#/dashboard', { waitUntil: 'domcontentloaded' });
  await p2.evaluate(k => localStorage.setItem(k, '{"version":1,"xp":5'), KEY);
  await p2.close();

  // reabre: precisa recuperar e voltar a salvar
  const p3 = await context.newPage();
  p3.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p3.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await p3.waitForTimeout(300);
  check('[invariante 1] após corrupção, recuperou sem travar',
    (await estado(p3)).xp === 0 && await p3.evaluate(() => window.MIA.progress.storageAvailable));
  check('[invariante 1] o blob corrompido está na quarentena',
    (await ler(p3, QUARENTENA)) === '{"version":1,"xp":5');

  // nova mutação real
  await p3.evaluate(() => { window.MIA.progress.addXP(70, 0); window.MIA.progress.save(); });
  await p3.waitForTimeout(150);
  const gravado = await ler(p3, KEY);
  check('[invariante 1] o save substituiu o blob ruim', gravado !== '{"version":1,"xp":5' &&
    JSON.parse(gravado).xp === 70, 'gravado=' + String(gravado).slice(0, 40));
  await p3.close();

  // reabre de novo: o estado recuperado precisa persistir
  const p4 = await context.newPage();
  p4.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p4.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await p4.waitForTimeout(300);
  check('[invariante 1] estado recuperado persiste após reload', (await estado(p4)).xp === 70);
  check('[invariante 1] não entrou em loop de onboarding depois de salvar',
    (await p4.evaluate(() => window.MIA.progress.recovery)) === null);
  await p4.close();
  await context.close();
}

/* ============ quarentena não destrutiva ============ */
{
  const context = await browser.newContext();
  const p1 = await context.newPage();
  await p1.addInitScript((args) => {
    localStorage.setItem(args.k, '{"primeira corrupcao');
  }, { k: KEY });
  await p1.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await p1.waitForTimeout(250);
  await p1.close();

  const p2 = await context.newPage();
  await p2.goto(BASE + '#/dashboard', { waitUntil: 'domcontentloaded' });
  await p2.evaluate(k => localStorage.setItem(k, '{"segunda corrupcao'), KEY);
  await p2.close();

  const p3 = await context.newPage();
  await p3.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await p3.waitForTimeout(250);
  check('[quarentena] a primeira evidência não é sobrescrita pela segunda',
    (await ler(p3, QUARENTENA)) === '{"primeira corrupcao', 'q=' + await ler(p3, QUARENTENA));
  await p3.close();
  await context.close();
}

/* ====== INVARIANTE 2: import inválido não destrói o estado atual ====== */
{
  const { context, page } = await abrir(JSON.stringify(estadoValido(900)));
  check('[invariante 2] estado válido antes do import', (await estado(page)).xp === 900);

  const invalidos = [
    ['null', 'null'],
    ['array', '[]'],
    ['objeto vazio', '{}'],
    ['JSON quebrado', '{"xp":'],
    ['objeto alheio', '{"foo":1,"bar":2}'],
    ['versão futura', '{"version":99,"xp":1}']
  ];
  for (const [nome, texto] of invalidos) {
    const r = await page.evaluate(t => {
      try { window.MIA.progress.importJSON(t); return 'aceitou'; }
      catch (e) { return 'rejeitou: ' + e.message; }
    }, texto);
    const s = await estado(page);
    check('[import inválido: ' + nome + '] rejeitado', r.startsWith('rejeitou'), r);
    check('[import inválido: ' + nome + '] estado atual intacto', s.xp === 900, 'xp=' + s.xp);
  }

  // import VÁLIDO substitui
  await page.evaluate(v => window.MIA.progress.importJSON(v), JSON.stringify(estadoValido(1234)));
  await page.waitForTimeout(150);
  check('[import válido] substituiu o estado', (await estado(page)).xp === 1234);
  check('[import válido] persistiu no storage', JSON.parse(await ler(page, KEY)).xp === 1234);

  // versão antiga / ausente é compatível (migração = defaults)
  await page.evaluate(() => window.MIA.progress.importJSON(JSON.stringify({
    xp: 42, lessons: { 'fund-001': { read: true } }   // sem version, sem streak, sem prefs
  })));
  await page.waitForTimeout(150);
  const s = await estado(page);
  check('[import antigo] backup sem version foi aceito e migrado', s.xp === 42 && !!s.lessons['fund-001']);
  check('[import antigo] campos ausentes ganharam default', !!s.streak && !!s.prefs && Array.isArray(s.errors));
  await context.close();
}

await browser.close();
server.close();

let fails = 0;
console.log('\n=== ROBUSTEZ DE ESTADO ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
