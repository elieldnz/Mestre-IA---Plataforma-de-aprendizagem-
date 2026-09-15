/* data.js — carrega e indexa os dados da plataforma. */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  const FILES = {
    curriculum: 'data/curriculum.json',
    skills: 'data/skills.json',
    projects: 'data/projects.json'
  };

  const data = {
    curriculum: null,
    skills: null,
    projects: null,
    source: null,
    index: {
      modules: new Map(),
      lessons: new Map(),
      lessonModule: new Map(),
      exercises: new Map(),
      skills: new Map(),
      skillCategories: new Map(),
      projects: new Map(),
      projectsByModule: new Map()
    }
  };

  function buildIndex() {
    const ix = data.index;
    ix.modules.clear(); ix.lessons.clear(); ix.lessonModule.clear();
    ix.exercises.clear(); ix.skills.clear(); ix.skillCategories.clear();
    ix.projects.clear(); ix.projectsByModule.clear();

    data.curriculum.modules.forEach(function (m, i) {
      m.order = i;
      ix.modules.set(m.id, m);
      m.lessons.forEach(function (l, j) {
        l.order = j;
        l.module = m.id;
        ix.lessons.set(l.id, l);
        ix.lessonModule.set(l.id, m.id);
        (l.exercises || []).forEach(function (e) {
          e.lesson = l.id;
          e.module = m.id;
          ix.exercises.set(e.id, e);
        });
      });
    });

    data.skills.categories.forEach(function (c) { ix.skillCategories.set(c.id, c); });
    data.skills.skills.forEach(function (s) { ix.skills.set(s.id, s); });

    data.projects.projects.forEach(function (p) {
      ix.projects.set(p.id, p);
      if (!ix.projectsByModule.has(p.module)) ix.projectsByModule.set(p.module, []);
      ix.projectsByModule.get(p.module).push(p);
    });
  }

  function fromBundle() {
    const b = window.__MIA_BUNDLE__;
    if (!b) return false;
    data.curriculum = b.curriculum;
    data.skills = b.skills;
    data.projects = b.projects;
    data.source = 'bundle';
    return true;
  }

  async function load() {
    try {
      const [curriculum, skills, projects] = await Promise.all(
        Object.values(FILES).map(function (f) {
          return fetch(f, { cache: 'no-cache' }).then(function (r) {
            if (!r.ok) throw new Error(f + ': HTTP ' + r.status);
            return r.json();
          });
        })
      );
      data.curriculum = curriculum;
      data.skills = skills;
      data.projects = projects;
      data.source = 'json';
    } catch (err) {
      // Abrir o index.html direto do disco bloqueia fetch: usamos o bundle.
      if (!fromBundle()) throw err;
    }
    buildIndex();
    return data;
  }

  /* ---- acessos convenientes ---- */
  const get = {
    module: function (id) { return data.index.modules.get(id) || null; },
    lesson: function (id) { return data.index.lessons.get(id) || null; },
    exercise: function (id) { return data.index.exercises.get(id) || null; },
    skill: function (id) { return data.index.skills.get(id) || null; },
    skillCategory: function (id) { return data.index.skillCategories.get(id) || null; },
    project: function (id) { return data.index.projects.get(id) || null; },
    moduleOfLesson: function (id) { return data.index.modules.get(data.index.lessonModule.get(id)) || null; },
    modules: function () { return data.curriculum.modules; },
    allLessons: function () { return Array.from(data.index.lessons.values()); },
    allSkills: function () { return data.skills.skills; },
    allProjects: function () { return data.projects.projects; },
    projectsOfModule: function (id) { return data.index.projectsByModule.get(id) || []; },
    level: function (id) { return (data.curriculum.levels || []).find(function (l) { return l.id === id; }) || null; },
    grading: function (score) {
      return (data.curriculum.grading || []).find(function (g) { return score >= g.min && score <= g.max; }) || null;
    },
    /** Próxima aula ainda não concluída, em ordem de trilha. */
    nextLesson: function (progress) {
      const mods = data.curriculum.modules;
      for (let i = 0; i < mods.length; i++) {
        const m = mods[i];
        // Trilhas piloto são exploração deliberada, nunca a "missão do dia" sugerida.
        if (m.pilot) continue;
        if (progress.moduleState(m.id).state === 'locked') continue;
        for (let j = 0; j < m.lessons.length; j++) {
          const st = progress.lessonState(m.lessons[j].id);
          if (st.state !== 'completed' && st.state !== 'mastered') return m.lessons[j];
        }
      }
      return null;
    }
  };

  MIA.data = data;
  MIA.loadData = load;
  MIA.get = get;
})(window.MIA);
