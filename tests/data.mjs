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

// Trilhas piloto: sempre acessíveis (sem pré-requisito) e nunca referenciadas
// como pré-requisito por nenhum módulo da trilha principal — elas são
// exploração à parte, não podem travar nem ser travadas pelo resto.
const pilotModuleIds = new Set(curriculum.modules.filter(m => m.pilot).map(m => m.id));
curriculum.modules.forEach(m => {
  if (m.pilot && (m.prerequisites || []).length) fail('Módulo piloto ' + m.id + ' não deveria ter pré-requisitos');
  (m.prerequisites || []).forEach(p => { if (pilotModuleIds.has(p)) fail('Módulo ' + m.id + ' depende de um módulo piloto (' + p + ')'); });
});

// Perguntas do diagnóstico com skipIf precisam apontar para uma pergunta
// que já foi respondida ANTES delas na sequência (senão a regra nunca dispara).
const diagQuestions = curriculum.diagnostic.questions;
diagQuestions.forEach((q, i) => {
  if (!q.skipIf) return;
  const depIdx = diagQuestions.findIndex(x => x.id === q.skipIf.field);
  if (depIdx === -1) fail('Pergunta ' + q.id + ': skipIf aponta para pergunta inexistente ' + q.skipIf.field);
  else if (depIdx >= i) fail('Pergunta ' + q.id + ': skipIf depende de uma pergunta que vem depois (' + q.skipIf.field + ')');
  if (q.skipDefault === undefined) fail('Pergunta ' + q.id + ' tem skipIf mas não tem skipDefault');
});

// Fase 15 (Frameworks de Agentes) precisa ensinar CADA framework de verdade,
// não só citar o nome. Verifica, para cada um: uma aula dedicada, com o nome
// aparecendo várias vezes (não só no título), pelo menos 3 blocos de conteúdo,
// pelo menos 2 exercícios, e uma palavra-chave que só faz sentido se o
// conceito específico daquele framework foi mesmo explicado.
const frameworksModule = curriculum.modules.find(m => m.id === 'frameworks-agentes');
if (!frameworksModule) fail('Módulo frameworks-agentes não encontrado');
else {
  const FRAMEWORKS = [
    { name: 'Agno', keyword: /instructions|ferramentas e instru/i },
    { name: 'LangChain', keyword: /encadea|LCEL|Runnable/i },
    { name: 'LangGraph', keyword: /grafo|estado|checkpoint/i },
    { name: 'CrewAI', keyword: /papel|Crew|backstory/i }
  ];
  FRAMEWORKS.forEach(fw => {
    const lesson = frameworksModule.lessons.find(l => l.title.includes(fw.name));
    if (!lesson) { fail('Fase 15: nenhuma aula dedicada a ' + fw.name); return; }
    const fullBody = lesson.blocks.map(b => b.body).join(' ');
    const mentions = (fullBody.match(new RegExp(fw.name, 'g')) || []).length;
    if (mentions < 3) fail('Aula de ' + fw.name + ' (' + lesson.id + ') cita o nome só ' + mentions + ' vez(es) — parece raso, não ensinado de verdade');
    if (lesson.blocks.length < 3) fail('Aula de ' + fw.name + ' (' + lesson.id + ') tem poucos blocos de conteúdo (' + lesson.blocks.length + ')');
    if ((lesson.exercises || []).length < 2) fail('Aula de ' + fw.name + ' (' + lesson.id + ') tem menos de 2 exercícios');
    if (!fw.keyword.test(fullBody)) fail('Aula de ' + fw.name + ' (' + lesson.id + ') não menciona um conceito específico dele (' + fw.keyword + ')');
  });
}

// Fase 17 (Modelos locais) precisa ensinar Hugging Face de verdade — a
// auditoria de conteúdo encontrou o nome só no título do módulo, nunca
// explicado em nenhuma aula. Mesmo padrão de rigor da Fase 15.
const modelosLocaisModule = curriculum.modules.find(m => m.id === 'modelos-locais');
if (!modelosLocaisModule) fail('Módulo modelos-locais não encontrado');
else {
  const hfLesson = modelosLocaisModule.lessons.find(l => l.title.includes('Hugging Face'));
  if (!hfLesson) fail('Fase 17: nenhuma aula dedicada a Hugging Face');
  else {
    const fullBody = hfLesson.blocks.map(b => b.body).join(' ');
    const mentions = (fullBody.match(/Hugging Face/g) || []).length;
    if (mentions < 3) fail('Aula de Hugging Face (' + hfLesson.id + ') cita o nome só ' + mentions + ' vez(es) — parece raso, não ensinado de verdade');
    if (hfLesson.blocks.length < 3) fail('Aula de Hugging Face (' + hfLesson.id + ') tem poucos blocos de conteúdo (' + hfLesson.blocks.length + ')');
    if ((hfLesson.exercises || []).length < 2) fail('Aula de Hugging Face (' + hfLesson.id + ') tem menos de 2 exercícios');
  }
}

// Fase 5 (GPTs e Agentes) lista 6 projetos nomeados no material — a auditoria
// encontrou só 1 deles de fato associado ao módulo. Verifica que os 6 existem;
// os 3 que faltavam (escritor, analista, documentos) precisam apontar para
// gpts-agentes — "professor-ia" e "assistente-pessoal" já existem em módulos
// anteriores (prompt-engineering, fundamentos) e continuam lá.
const gptsAgentesProjects = ['project-professor-ia', 'project-assistente-pessoal', 'project-agente-pesquisador',
  'project-agente-escritor', 'project-agente-analista', 'project-agente-documentos'];
const mustBeInGptsAgentes = ['project-agente-escritor', 'project-agente-analista', 'project-agente-documentos'];
gptsAgentesProjects.forEach(id => {
  const p = projects.projects.find(x => x.id === id);
  if (!p) { fail('Fase 5: projeto ' + id + ' não encontrado em projects.json'); return; }
  if (mustBeInGptsAgentes.includes(id) && p.module !== 'gpts-agentes') {
    fail('Fase 5: projeto ' + id + ' deveria ter module "gpts-agentes", tem "' + p.module + '"');
  }
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
