/* PR #8 — Histórico não destrutivo + resumo compatível + retry como estado de
   UI + contador vitalício.

   "Tentar de novo" (resetExercise) parou de apagar entry.exercises[exerciseId]
   — agora só marca entry.retrying[exerciseId] = true, um estado operacional
   transitório que a UI usa para se comportar como se não houvesse resposta
   ainda (campo em branco, sem nota exibida), sem perder o que já foi
   submetido. recordExercise passou a acumular cada submissão em
   entry.exercises[exerciseId].attempts (histórico vitalício, nunca apagado),
   mantendo score/lastScore/answer/lastAt como o resumo compatível que
   evaluateLesson e o resto do código já liam antes deste campo existir.

   Este teste prova, na ordem do contrato aprovado:
   T1 — a sequência mista que expõe os dois caminhos que o código tratava de
        forma diferente (reenvio direto x "Tentar de novo"): responder A →
        responder B sem clicar em retry → "Tentar de novo" → responder C.
   T2 — retry sozinho (sem reenviar) não paga XP nem cria tentativa.
   T3 — em modo retrying, a UI volta a se comportar como se não houvesse
        resposta (campo em branco, sem badge de nota, sem botão de retry),
        mesmo com o histórico preservado por baixo.
   T5 — um registro no formato antigo (sem attempts) continua sendo lido
        normalmente, e uma nova submissão começa o histórico do zero, sem
        fabricar a tentativa antiga.
   T6 — entry.retrying corrompido é descartado pelo sanitize/importJSON sem
        derrubar a aula nem outras aulas do mesmo import.

   T4 (equivalência: XP e estado de aula idênticos aos de antes do PR #8 para
   as chamadas normais de recordExercise) é coberta por tests/dominio-
   canonico.mjs, que já roda cenários reais de recordExercise contra uma
   linha de base anterior a este PR — ele continua no mesmo número de
   verificações (34/34) porque nada nesses cenários passa por retry.

   Uso: node tests/historico-tentativas.mjs   (requer Playwright)            */
import { loadChromium } from './pw.mjs';
import { startServer } from './server.mjs';
import { loadCurriculum, buildCases } from './fixtures/respostas-rubrica.mjs';

const curriculum = loadCurriculum();
const cases = buildCases(curriculum);
const caseE1 = cases.find(c => c.exerciseId === 'fund-001-e1');

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
  await page.goto(BASE + '#/aula/fund-001', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  return page;
}

const read = page => page.evaluate(() => JSON.parse(localStorage.getItem('mestre-ia:v1')));

/* ================= T1) sequência mista: A, B (sem retry), retry, C ================= */
try {
  const page = await openApp(cleanState());
  const card = page.locator('#ex-' + caseE1.exerciseId);

  // A: exploit (todas as keywords) -> nota alta, mas NÃO é a última submissão
  await card.locator('textarea').fill(caseE1.respostas.exploit);
  await card.locator('[data-action="submit"]').click();
  await page.waitForTimeout(200);

  // B: genérica (0 keywords), reenviada SEM clicar em "Tentar de novo" -> nota baixa
  await card.locator('textarea').fill(caseE1.respostas.generica);
  await card.locator('[data-action="submit"]').click();
  await page.waitForTimeout(200);

  // "Tentar de novo" -> C: parcial (metade das keywords) -> nota intermediária
  // (o botão só aparece num render posterior ao envio — slot.innerHTML só troca
  // o feedback, não o card inteiro; achado de UX já documentado em idempotencia.mjs)
  await page.evaluate(() => window.MIA.app.render());
  await page.waitForTimeout(120);
  await card.locator('[data-action="retry"]').click();
  await page.waitForTimeout(150);
  await card.locator('textarea').fill(caseE1.respostas.parcial);
  await card.locator('[data-action="submit"]').click();
  await page.waitForTimeout(200);

  const s = await read(page);
  const rec = s.lessons['fund-001'].exercises[caseE1.exerciseId];
  const respostas = (rec.attempts || []).map(a => a.answer);

  check('T1.1 · attempts tem exatamente 3 tentativas (A, B e retry+C — nenhuma some, nenhuma é inventada)',
    Array.isArray(rec.attempts) && rec.attempts.length === 3, 'attempts=' + (rec.attempts || []).length);
  check('T1.2 · a 1ª tentativa preservada é A (exploit)', respostas[0] === caseE1.respostas.exploit);
  check('T1.3 · a 2ª tentativa preservada é B (genérica, reenviada sem retry)', respostas[1] === caseE1.respostas.generica);
  check('T1.4 · a 3ª tentativa preservada é C (parcial, após "Tentar de novo")', respostas[2] === caseE1.respostas.parcial);
  check('T1.5 · score é a MELHOR nota entre as 3 (não a última) — prova que "score" não é só "lastScore"',
    rec.score === Math.max(rec.attempts[0].score, rec.attempts[1].score, rec.attempts[2].score) && rec.score !== rec.attempts[2].score,
    'score=' + rec.score + ' attempts=' + JSON.stringify(rec.attempts.map(a => a.score)));
  check('T1.6 · lastScore é a nota da última submissão (C)', rec.lastScore === rec.attempts[2].score);
  check('T1.7 · answer é a resposta da última submissão (C)', rec.answer === caseE1.respostas.parcial);
  check('T1.8 · lastAt bate com o "at" da última tentativa registrada (mesmo timestamp, uma só captura por submissão)',
    rec.lastAt === rec.attempts[2].at);

  // XP: só a 1ª submissão que atingiu >=60 paga (aqui a exploit, no passo A) —
  // nenhuma das 3 submissões deveria pagar de novo, retry incluso.
  const xpExercicio = curriculum.modules.flatMap(m => m.lessons).find(l => l.id === 'fund-001')
    .exercises.find(e => e.id === caseE1.exerciseId).xp;
  check('T1.9 · XP do exercício pago exatamente uma vez (3 submissões, 1 pagamento)',
    s.xp === xpExercicio, 'xp=' + s.xp + ' esperado(1 pagamento)=' + xpExercicio);

  await page.close();
} catch (e) { check('T1 · bloco completou sem exceção', false, e.message); }

/* ================= T2) retry sozinho não paga XP nem cria tentativa ================= */
try {
  const page = await openApp(cleanState());
  const quiz = curriculum.modules.flatMap(m => m.lessons).find(l => l.id === 'fund-001')
    .exercises.find(e => e.type === 'quiz');
  const card = page.locator('#ex-' + quiz.id);

  await card.locator('input[type=radio]').nth(quiz.answer).check();
  await card.locator('[data-action="submit"]').click();
  await page.waitForTimeout(200);
  const antes = await read(page);

  await page.evaluate(() => window.MIA.app.render()); // garante que o botão "Tentar de novo" já está no DOM
  await page.waitForTimeout(120);
  await card.locator('[data-action="retry"]').click();
  await page.waitForTimeout(150);

  const depois = await read(page);
  check('T2.1 · "Tentar de novo" sozinho não paga XP', depois.xp === antes.xp, 'antes=' + antes.xp + ' depois=' + depois.xp);
  check('T2.2 · "Tentar de novo" sozinho não cria tentativa nova',
    depois.lessons['fund-001'].exercises[quiz.id].attempts.length === antes.lessons['fund-001'].exercises[quiz.id].attempts.length);
  check('T2.3 · "Tentar de novo" sozinho NÃO apaga o registro (histórico continua lá)',
    !!depois.lessons['fund-001'].exercises[quiz.id] && depois.lessons['fund-001'].exercises[quiz.id].score === antes.lessons['fund-001'].exercises[quiz.id].score);
  check('T2.4 · entry.retrying fica marcado para este exercício',
    depois.lessons['fund-001'].retrying && depois.lessons['fund-001'].retrying[quiz.id] === true);

  await page.close();
} catch (e) { check('T2 · bloco completou sem exceção', false, e.message); }

/* ================= T3) UI em modo retrying: campo em branco, sem badge, sem retry ================= */
try {
  const page = await openApp(cleanState());
  const quiz = curriculum.modules.flatMap(m => m.lessons).find(l => l.id === 'fund-001')
    .exercises.find(e => e.type === 'quiz');
  const card = page.locator('#ex-' + quiz.id);

  await card.locator('input[type=radio]').nth(quiz.answer).check();
  await card.locator('[data-action="submit"]').click();
  await page.waitForTimeout(200);
  await page.evaluate(() => window.MIA.app.render());
  await page.waitForTimeout(120);

  check('T3.1 · antes do retry, o botão "Tentar de novo" está visível', await card.locator('[data-action="retry"]').count() === 1);
  await card.locator('[data-action="retry"]').click();
  await page.waitForTimeout(150);

  check('T3.2 · depois do retry, nenhuma opção aparece marcada (campo "em branco")',
    await card.locator('.option input:checked').count() === 0);
  check('T3.3 · depois do retry, nenhum data-state de correto/errado nas opções (paintQuiz não roda em modo retrying)',
    await card.locator('.option[data-state]').count() === 0);
  check('T3.4 · depois do retry, o botão "Tentar de novo" some (a UI trata como não respondido)',
    await card.locator('[data-action="retry"]').count() === 0);
  check('T3.5 · depois do retry, nenhuma badge de nota no cabeçalho do exercício (scoreBadge sempre inclui "/100")',
    !(await card.locator('.exercise__head').textContent()).includes('/100'));

  const s = await read(page);
  check('T3.6 · mesmo em modo retrying na tela, o histórico da tentativa anterior continua no estado',
    s.lessons['fund-001'].exercises[quiz.id].attempts.length === 1);

  await page.close();
} catch (e) { check('T3 · bloco completou sem exceção', false, e.message); }

/* ================= T5) compatibilidade com registro no formato antigo (sem attempts) ================= */
try {
  const legadoState = cleanState();
  const quiz = curriculum.modules.flatMap(m => m.lessons).find(l => l.id === 'fund-001')
    .exercises.find(e => e.type === 'quiz');
  legadoState.lessons['fund-001'] = {
    read: true, xpAwarded: false, completedAt: null,
    exercises: { [quiz.id]: { attempts: 1, score: 100, lastScore: 100, answer: quiz.answer, lastAt: '2026-01-01T00:00:00Z', xpAwarded: true } }
  };
  const page = await openApp(legadoState);

  const before = await read(page);
  check('T5.1 · registro legado (attempts numérico, não array) é lido sem quebrar a página',
    before.lessons['fund-001'].exercises[quiz.id].score === 100 && errors.length === 0);

  // nova submissão sobre um registro legado: histórico começa do zero, não com 2
  const errada = quiz.options.findIndex((_, i) => i !== quiz.answer);
  const card = page.locator('#ex-' + quiz.id);
  await card.locator('input[type=radio]').nth(errada).check();
  await card.locator('[data-action="submit"]').click();
  await page.waitForTimeout(200);

  const depois = await read(page);
  const rec = depois.lessons['fund-001'].exercises[quiz.id];
  check('T5.2 · a partir da 1ª submissão pós-PR8, attempts existe e tem length 1 (não fabrica a tentativa legada)',
    Array.isArray(rec.attempts) && rec.attempts.length === 1, 'attempts=' + JSON.stringify(rec.attempts));
  check('T5.3 · score continua sendo o melhor entre o legado (100) e a nova submissão (0)', rec.score === 100);
  check('T5.4 · XP não é pago de novo (já estava xpAwarded no registro legado)', depois.xp === 0);

  await page.close();
} catch (e) { check('T5 · bloco completou sem exceção', false, e.message); }

/* ================= T6) entry.retrying corrompido não derruba o import ================= */
try {
  const page = await openApp(cleanState());
  const resultado = await page.evaluate(() => {
    const payload = {
      version: 1, xp: 500,
      lessons: {
        'fund-001': { read: true, exercises: {}, retrying: 'isso não é um objeto' },
        'fund-002': { read: true, exercises: { 'fund-002-q1': { attempts: [{ answer: 0, score: 100, at: '2026-01-01T00:00:00Z' }], score: 100, lastScore: 100, answer: 0, lastAt: '2026-01-01T00:00:00Z', xpAwarded: true } } }
      }
    };
    try {
      window.MIA.progress.importJSON(JSON.stringify(payload));
      return { aceitou: true };
    } catch (e) {
      return { aceitou: false, erro: e.message };
    }
  });
  check('T6.1 · import com entry.retrying corrompido é ACEITO (sanitize recupera, não rejeita)', resultado.aceitou, JSON.stringify(resultado));

  const s = await read(page);
  check('T6.2 · entry.retrying corrompido foi descartado (não é mais string)',
    s.lessons['fund-001'] && s.lessons['fund-001'].retrying === undefined);
  check('T6.3 · a aula com retrying corrompido continua com exercises intacto (objeto vazio, não some)',
    s.lessons['fund-001'] && typeof s.lessons['fund-001'].exercises === 'object');
  check('T6.4 · a OUTRA aula do mesmo import fica intacta (attempts preservado)',
    s.lessons['fund-002'] && s.lessons['fund-002'].exercises['fund-002-q1'].attempts.length === 1);

  await page.close();
} catch (e) { check('T6 · bloco completou sem exceção', false, e.message); }

await browser.close();
server.close();

let fails = 0;
console.log('\n=== HISTÓRICO DE TENTATIVAS (PR #8) ===');
results.forEach(r => { if (!r.ok) fails++; console.log((r.ok ? '✓' : '✗') + ' ' + r.n + (r.e ? '  [' + r.e + ']' : '')); });
console.log('\nErros de console/página: ' + errors.length);
errors.forEach(e => console.log('  ! ' + e));
console.log((results.length - fails) + '/' + results.length + ' verificações passaram.');
process.exit(fails || errors.length ? 1 : 0);
