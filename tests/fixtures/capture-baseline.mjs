/* Captura a linha de base do PR #6: para os 4 estados sintéticos, roda
   lessonState/moduleState/moduleStateRaw (todos os 21 módulos e 106 aulas)
   mais globalProgress/levelRatio/currentLevel/moduleBlockers contra o código
   ANTERIOR à consolidação, e grava em dominio-canonico-baseline.json.

   Rodar ANTES de tocar em js/progress.js. Depois da consolidação,
   tests/dominio-canonico.mjs reconstrói os MESMOS estados (mesmo gerador)
   e compara ao vivo contra este arquivo.

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

async function capturar(estado) {
  const page = await browser.newPage();
  await page.addInitScript(s => localStorage.setItem('mestre-ia:v1', s), JSON.stringify(estado));
  await page.goto(BASE + '#/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(250);

  const resultado = await page.evaluate(() => {
    const out = { lessons: {}, modules: {}, modulesRaw: {} };
    window.MIA.get.modules().forEach(m => {
      out.modules[m.id] = window.MIA.progress.moduleState(m.id);
      out.modulesRaw[m.id] = window.MIA.progress.moduleStateRaw(m.id);
      out.modules[m.id].__blockers = window.MIA.progress.moduleBlockers(m.id);
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

const baseline = {};
for (const [nome, estado] of Object.entries(estados)) {
  console.log('capturando: ' + nome + '...');
  baseline[nome] = await capturar(estado);
}

fs.writeFileSync(path.join(HERE, 'dominio-canonico-baseline.json'), JSON.stringify(baseline, null, 2));
console.log('\n✓ Linha de base gravada em dominio-canonico-baseline.json');

await browser.close();
server.close();
