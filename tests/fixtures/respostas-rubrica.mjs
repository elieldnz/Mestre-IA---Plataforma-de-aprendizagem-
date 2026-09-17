/* Gerador determinístico de casos de teste para o vazamento de evidência
   (tests/vazamento-evidencia.mjs). Usado tanto pelo script que capturou a
   linha de base de SCORE (contra o código anterior ao PR #7, antes de
   mexer no texto de feedback) quanto pelo teste que roda depois — a MESMA
   função gera as MESMAS respostas nas duas pontas, então qualquer
   diferença de score encontrada só pode vir do cálculo em gradeOpen,
   nunca dos dados de entrada.

   Três variantes por exercício com rubrica (89 no total), cobrindo os três
   ramos de texto que o PR #7 alterou (hits / missing / structure
   incompleta), sem depender de coincidência de palavras: as respostas são
   construídas diretamente a partir das keywords/structure de CADA rubrica,
   nunca de um texto fixo que poderia coincidir por acaso.

     generica — nenhuma keyword, nenhuma estrutura: aciona "missing.length"
       e, quando a rubrica tem estrutura, "structHits < structure.length".
     exploit  — todas as keywords + toda a estrutura, preenchida com números
       sequenciais até passar de 1.3x minWords: aciona "hits.length" cheio
       e (quando há estrutura) fecha a estrutura também.
     parcial  — metade das keywords, nenhuma estrutura: aciona hits E
       missing ao mesmo tempo (os dois parágrafos de feedback juntos).       */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadCurriculum() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curriculum.json'), 'utf8'));
}

function pad(parts, minWords) {
  const alvo = Math.ceil((minWords || 30) * 1.3);
  let i = 1;
  const out = parts.slice();
  while (out.length < alvo) out.push(String(i++));
  return out.join(' ');
}

export function buildCases(curriculum) {
  const cases = [];
  curriculum.modules.forEach(function (m) {
    m.lessons.forEach(function (l) {
      (l.exercises || []).forEach(function (e) {
        if (!e.rubric) return;
        const keywords = e.rubric.keywords || [];
        const structure = e.rubric.structure || [];
        const minWords = e.rubric.minWords || 30;
        const metade = keywords.slice(0, Math.ceil(keywords.length / 2));

        cases.push({
          lessonId: l.id,
          exerciseId: e.id,
          respostas: {
            generica: pad([], minWords),
            exploit: pad(keywords.concat(structure), minWords),
            parcial: pad(metade, minWords)
          }
        });
      });
    });
  });
  return cases;
}
