/* Captura a linha de base do PR #6 contra o código ORIGINAL (pré-consolidação,
   sem nenhuma edição). Duas partes:

   1) ESTÁTICA: lessonState/moduleState (objeto completo, incluindo `unlocked`
      e `__blockers` — que dependem de moduleStateRaw internamente, testando-o
      por consequência já que ele nunca foi público) + globalProgress +
      currentLevel + levelRatio, para os 21 módulos e 106 aulas, em 4 estados
      sintéticos.

   2) DINÂMICA: chamadas reais a recordExercise (a função que decide XP),
      capturando o XP concedido em cada chamada, o XP acumulado e o estado
      resultante da aula — para provar que a consolidação não muda quanto
      XP é pago nem quando, não só como o estado é LIDO.

   Rodar contra o código anterior à consolidação. Depois da consolidação,
   tests/dominio-canonico.mjs reconstrói os MESMOS estados e cenários (mesmo
   gerador, mesma sequência de chamadas) e compara ao vivo contra este JSON.

   Uso: node tests/fixtures/capture-baseline.mjs                            */
import { loadChromium } from '../pw.mjs';
import { startServer } from '../server.mjs';
import { loadCurriculum, buildStates } from './estados-dominio.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const curriculum = loadCurriculum();
const estados = buildStates(curriculum);

const { server, base: BASE } = await startServer();
const chromium = await loadChromium();
const browser = await chromium.launch();

async function capturarEstatico(estado) {
  const page = await browser.newPage();
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

/* Cenários dinâmicos: cada um começa de um estado limpo e específico, chama
   recordExercise ao vivo (não é simulação de estado, é a própria função de
   produção decidindo) e captura o que ela devolve + o XP acumulado depois. */
const fundamentos = curriculum.modules.find(m => m.id === 'fundamentos');
const python = curriculum.modules.find(m => m.id === 'python'); // módulo travado no início

const cenarios = [
  {
    nome: 'primeiro-exercicio-de-aula-multi-exercicio',
    // fund-001 tem 2 exercícios: responder só o 1º não fecha a aula -> sem bônus de conclusão
    lessonId: fundamentos.lessons[0].id,
    exercicios: [{ exId: fundamentos.lessons[0].exercises[0].id, score: 100 }]
  },
  {
    nome: 'completa-aula-com-media-abaixo-de-80-mas-acima-de-60',
    // completa os 2 exercícios com nota 65 -> "completed", não "mastered"; bônus de conclusão pago
    lessonId: fundamentos.lessons[0].id,
    exercicios: fundamentos.lessons[0].exercises.map(e => ({ exId: e.id, score: 65 }))
  },
  {
    nome: 'completa-aula-com-media-80-plus',
    // mesma aula, agora com nota 100 nos 2 -> "mastered"; bônus de conclusão pago
    lessonId: fundamentos.lessons[0].id,
    exercicios: fundamentos.lessons[0].exercises.map(e => ({ exId: e.id, score: 100 }))
  },
  {
    nome: 'aula-de-um-exercicio-so',
    // fund-005 tem 1 único exercício: respondê-lo já fecha a aula em uma chamada
    lessonId: fundamentos.lessons[4].id,
    exercicios: [{ exId: fundamentos.lessons[4].exercises[0].id, score: 100 }]
  },
  {
    nome: 'exercicio-em-modulo-travado-nao-paga-bonus-de-conclusao',
    // python precisa de pré-requisitos não cumpridos: a aula fica lessonState='locked'
    // mesmo respondendo tudo certo, então o bônus de CONCLUSÃO DA AULA não deveria sair
    // (o XP do exercício em si, esse sim, é pago sempre que score >= 60 — são coisas diferentes)
    lessonId: python.lessons[0].id,
    exercicios: python.lessons[0].exercises.map(e => ({ exId: e.id, score: 100 }))
  }
];

async function capturarDinamico() {
  const out = {};
  for (const cenario of cenarios) {
    const page = await browser.newPage();
    const estadoLimpo = estados.zerado;
    await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(estadoLimpo));
    await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    const resultado = await page.evaluate(({ lessonId, exercicios }) => {
      const chamadas = [];
      exercicios.forEach(({ exId, score }) => {
        const r = window.MIA.progress.recordExercise(lessonId, exId, { score: score, answer: 'x' });
        chamadas.push({ xpConcedido: r.xp, estadoDaAula: r.lesson.state, notaDaAula: r.lesson.score });
      });
      return { chamadas: chamadas, xpAcumulado: window.MIA.progress.state.xp };
    }, { lessonId: cenario.lessonId, exercicios: cenario.exercicios });

    out[cenario.nome] = resultado;
    await page.close();
  }
  return out;
}

const baseline = { estados: {}, transicoes: null };
for (const [nome, estado] of Object.entries(estados)) {
  console.log('capturando estado estático: ' + nome + '...');
  baseline.estados[nome] = await capturarEstatico(estado);
}
console.log('capturando transições dinâmicas de XP...');
baseline.transicoes = await capturarDinamico();

fs.writeFileSync(path.join(HERE, 'dominio-canonico-baseline.json'), JSON.stringify(baseline, null, 2));
console.log('\n✓ Linha de base gravada em dominio-canonico-baseline.json');

await browser.close();
server.close();
