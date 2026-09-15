/* Validação dos dados: ids únicos, referências cruzadas e campos obrigatórios.
   Não precisa de navegador.   Uso: node tests/data.mjs                       */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const curriculum = read('curriculum.json');
const skills = read('skills.json');
const projects = read('projects.json');

const problems = [];
const fail = m => problems.push(m);

const skillIds = new Set();
skills.skills.forEach(s => {
  if (skillIds.has(s.id)) fail('Skill duplicada: ' + s.id);
  skillIds.add(s.id);
  ['name', 'category', 'confidence', 'level', 'what', 'when', 'example', 'exercise', 'project', 'repo']
    .forEach(k => { if (!s[k]) fail('Skill ' + s.id + ' sem campo ' + k); });
  if (!/^https?:\/\//.test(s.repo)) fail('Skill ' + s.id + ': repo não é uma URL válida (' + s.repo + ')');
});
const categoryIds = new Set(skills.categories.map(c => c.id));
skills.skills.forEach(s => {
  if (!categoryIds.has(s.category)) fail('Skill ' + s.id + ': categoria inválida ' + s.category);
  (s.prerequisites || []).forEach(p => { if (!skillIds.has(p)) fail('Skill ' + s.id + ': pré-requisito inexistente ' + p); });
});
if (skills.skills.length !== 50) fail('Esperadas 50 Skills, encontradas ' + skills.skills.length);

const moduleIds = new Set(); const lessonIds = new Set(); const exerciseIds = new Set();
let lessons = 0, exercises = 0, xp = 0;
curriculum.modules.forEach(m => {
  if (moduleIds.has(m.id)) fail('Módulo duplicado: ' + m.id);
  moduleIds.add(m.id);
  (m.skills || []).forEach(s => { if (!skillIds.has(s)) fail('Módulo ' + m.id + ': Skill inexistente ' + s); });
  if (!m.lessons.length) fail('Módulo ' + m.id + ' sem aulas');
  m.lessons.forEach(l => {
    lessons++; xp += l.xp || 0;
    if (lessonIds.has(l.id)) fail('Aula duplicada: ' + l.id);
    lessonIds.add(l.id);
    if (!(l.objectives || []).length) fail('Aula ' + l.id + ' sem objetivos');
    if (!(l.blocks || []).length) fail('Aula ' + l.id + ' sem conteúdo');
    (l.blocks || []).forEach(b => {
      if (!b.body) fail('Aula ' + l.id + ': bloco vazio');
      if (!['material', 'complementar'].includes(b.source)) fail('Aula ' + l.id + ': bloco sem origem declarada');
    });
    (l.skills || []).forEach(s => { if (!skillIds.has(s)) fail('Aula ' + l.id + ': Skill inexistente ' + s); });
    (l.exercises || []).forEach(e => {
      exercises++; xp += e.xp || 0;
      if (exerciseIds.has(e.id)) fail('Exercício duplicado: ' + e.id);
      exerciseIds.add(e.id);
      if (!['quiz', 'open', 'practice', 'code', 'challenge', 'project'].includes(e.type)) fail('Exercício ' + e.id + ': tipo inválido');
      if (e.type === 'quiz') {
        if (!Array.isArray(e.options) || e.options.length < 2) fail('Quiz ' + e.id + ' sem alternativas');
        if (typeof e.answer !== 'number' || !e.options[e.answer]) fail('Quiz ' + e.id + ': resposta inválida');
        if (!e.explain) fail('Quiz ' + e.id + ' sem explicação');
      } else if (e.type === 'code') {
        if (!(e.checks || []).length) fail('Exercício de código ' + e.id + ' sem verificações');
      } else if (!e.rubric) fail('Exercício ' + e.id + ' sem rubrica');
      if (!e.model && e.type !== 'quiz') fail('Exercício ' + e.id + ' sem resposta de referência');
    });
  });
});
curriculum.modules.forEach(m => {
  (m.prerequisites || []).forEach(p => { if (!moduleIds.has(p)) fail('Módulo ' + m.id + ': pré-requisito inexistente ' + p); });
});

const projectIds = new Set();
projects.projects.forEach(p => {
  if (projectIds.has(p.id)) fail('Projeto duplicado: ' + p.id);
  projectIds.add(p.id);
  if (!moduleIds.has(p.module)) fail('Projeto ' + p.id + ': módulo inexistente ' + p.module);
  (p.skills || []).forEach(s => { if (!skillIds.has(s)) fail('Projeto ' + p.id + ': Skill inexistente ' + s); });
  ['objective', 'architecture', 'acceptance', 'summary'].forEach(k => { if (!p[k]) fail('Projeto ' + p.id + ' sem ' + k); });
  if (!(p.tasks || []).length) fail('Projeto ' + p.id + ' sem tarefas');
});
curriculum.modules.forEach(m => {
  if (m.project && !projectIds.has(m.project)) fail('Módulo ' + m.id + ': projeto inexistente ' + m.project);
});

/* o bundle precisa estar sincronizado com os JSON */
const bundlePath = path.join(ROOT, 'js', 'data-bundle.js');
if (!fs.existsSync(bundlePath)) fail('js/data-bundle.js não existe — rode: node tools/build-data.js');
else {
  const raw = fs.readFileSync(bundlePath, 'utf8').replace(/^[\s\S]*?window\.__MIA_BUNDLE__ = /, '').replace(/;\s*$/, '');
  const bundle = JSON.parse(raw);
  ['curriculum', 'skills', 'projects'].forEach(k => {
    const source = { curriculum, skills, projects }[k];
    if (JSON.stringify(bundle[k]) !== JSON.stringify(source)) {
      fail('js/data-bundle.js desatualizado em "' + k + '" — rode: node tools/build-data.js');
    }
  });
}

console.log('\n=== DADOS ===');
console.log('módulos: ' + moduleIds.size + ' · aulas: ' + lessons + ' · exercícios: ' + exercises +
  ' · Skills: ' + skillIds.size + ' · projetos: ' + projectIds.size + ' · XP disponível: ' + xp);
if (problems.length) {
  problems.forEach(p => console.log('✗ ' + p));
  console.log(problems.length + ' problema(s).');
  process.exit(1);
}
console.log('✓ Dados consistentes.');
