/* Gerador determinístico de estados sintéticos para o teste de equivalência
   da regra de domínio (tests/dominio-canonico.mjs). Este arquivo é importado
   pelo script que capturou a linha de base (código anterior ao PR #6) e pelo
   teste que roda depois da consolidação — a MESMA função gera os mesmos
   estados nas duas pontas, então qualquer diferença no resultado só pode vir
   do código de progress.js, nunca dos dados de entrada.

   Cobre, mecanicamente, os quatro grupos de módulos (por índice % 4):
     0 → todas as aulas dominadas (score 100)
     1 → todas completas, nenhuma dominada (score 65: >=60, <80)
     2 → parcialmente respondidas (só o 1º exercício de cada aula) — in_progress
     3 → intocadas, exceto a 1ª aula marcada só como "lida" (sem exercício)  */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadCurriculum() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'curriculum.json'), 'utf8'));
}

function baseState(lessons) {
  return {
    version: 1, user: { name: 'Teste', createdAt: '2026-01-01T00:00:00Z' },
    diagnostic: { level: 'iniciante', percent: 10, dimensions: [], strengths: [], gaps: [],
      track: { label: 'x', modules: [] }, date: '2026-01-01T00:00:00Z', mode: 'normal' },
    xp: 0, streak: { current: 0, best: 0, lastDay: null }, minutes: 0,
    lessons: lessons, skills: {}, projects: {}, errors: [], reviews: {}, activity: {}, prefs: {}
  };
}

function exerciseRecord(score) {
  return { attempts: 1, score: score, lastScore: score, answer: 'x', lastAt: '2026-01-02T00:00:00Z', xpAwarded: true };
}

/** Retorna { zerado, completoNaoMasterizado, masterizadoTotal, misto } — cada
 *  um um objeto de estado completo, pronto para localStorage.setItem. */
export function buildStates(curriculum) {
  const modules = curriculum.modules;

  function allLessons(fn) {
    const out = {};
    modules.forEach(function (m, i) {
      m.lessons.forEach(function (l) {
        const entry = fn(m, i, l);
        if (entry) out[l.id] = entry;
      });
    });
    return out;
  }

  const zerado = baseState({});

  const completoNaoMasterizado = baseState(allLessons(function (m, i, l) {
    const exercises = {};
    (l.exercises || []).forEach(function (e) { exercises[e.id] = exerciseRecord(65); });
    return { read: true, exercises: exercises, xpAwarded: true, completedAt: '2026-01-02T00:00:00Z' };
  }));

  const masterizadoTotal = baseState(allLessons(function (m, i, l) {
    const exercises = {};
    (l.exercises || []).forEach(function (e) { exercises[e.id] = exerciseRecord(100); });
    return { read: true, exercises: exercises, xpAwarded: true, completedAt: '2026-01-02T00:00:00Z' };
  }));

  const misto = baseState(allLessons(function (m, i, l) {
    const grupo = i % 4;
    if (grupo === 0) {
      const exercises = {};
      (l.exercises || []).forEach(function (e) { exercises[e.id] = exerciseRecord(100); });
      return { read: true, exercises: exercises, xpAwarded: true, completedAt: '2026-01-02T00:00:00Z' };
    }
    if (grupo === 1) {
      const exercises = {};
      (l.exercises || []).forEach(function (e) { exercises[e.id] = exerciseRecord(65); });
      return { read: true, exercises: exercises, xpAwarded: true, completedAt: '2026-01-02T00:00:00Z' };
    }
    if (grupo === 2) {
      const ex = l.exercises || [];
      if (!ex.length) return { read: true, exercises: {} };
      const exercises = {};
      exercises[ex[0].id] = exerciseRecord(100);
      return { read: true, exercises: exercises };
    }
    // grupo === 3: intocado, exceto a primeira aula do módulo (só "lida")
    if (l === m.lessons[0]) return { read: true, exercises: {} };
    return null;
  }));

  return { zerado: zerado, completoNaoMasterizado: completoNaoMasterizado,
    masterizadoTotal: masterizadoTotal, misto: misto };
}
