/* progress.js — estado do aluno: XP, streak, domínio, revisão e erros.
   Tudo vive no localStorage deste navegador. */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  const KEY = 'mestre-ia:v1';
  const ui = MIA.ui;

  const EMPTY = {
    version: 1,
    user: { name: '', profession: '', createdAt: null },
    diagnostic: null,
    xp: 0,
    streak: { current: 0, best: 0, lastDay: null },
    minutes: 0,
    lessons: {},
    skills: {},
    projects: {},
    errors: [],
    reviews: {},
    activity: {},
    prefs: { mode: 'normal' }
  };

  let state = clone(EMPTY);
  let available = true;
  const listeners = [];

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) state = Object.assign(clone(EMPTY), JSON.parse(raw));
    } catch (err) {
      available = false;
      console.warn('localStorage indisponível: o progresso não será salvo.', err);
    }
    // normaliza campos que podem faltar em dados antigos
    ['lessons', 'skills', 'projects', 'reviews', 'activity'].forEach(function (k) {
      if (!state[k] || typeof state[k] !== 'object') state[k] = {};
    });
    if (!Array.isArray(state.errors)) state.errors = [];
    if (!state.prefs) state.prefs = { mode: 'normal' };
    return state;
  }

  function save() {
    if (!available) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      available = false;
      ui.toast('Não foi possível salvar o progresso neste navegador.');
    }
  }

  function emit() { listeners.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } }); }
  function onChange(fn) { listeners.push(fn); }
  function commit() { save(); emit(); }

  /* ---------------- dia, streak e atividade ---------------- */

  function today() { return ui.todayISO(); }

  function dayEntry(day) {
    if (!state.activity[day]) state.activity[day] = { xp: 0, minutes: 0, lessons: 0, exercises: 0 };
    return state.activity[day];
  }

  /** Marca atividade de hoje e atualiza o streak. */
  function touch() {
    const day = today();
    const s = state.streak;
    if (s.lastDay === day) return;
    if (!s.lastDay) s.current = 1;
    else {
      const diff = ui.daysBetween(s.lastDay, day);
      s.current = diff === 1 ? s.current + 1 : diff <= 0 ? s.current : 1;
    }
    s.lastDay = day;
    s.best = Math.max(s.best || 0, s.current);
    dayEntry(day);
  }

  /** O streak "vence" se o aluno pulou mais de um dia. */
  function currentStreak() {
    const s = state.streak;
    if (!s.lastDay) return 0;
    const diff = ui.daysBetween(s.lastDay, today());
    return diff <= 1 ? s.current : 0;
  }

  function addXP(amount, minutes) {
    if (!amount && !minutes) return;
    touch();
    const day = dayEntry(today());
    if (amount) { state.xp += amount; day.xp += amount; }
    if (minutes) { state.minutes += minutes; day.minutes += minutes; }
  }

  /* ---------------- aulas ---------------- */

  function lessonEntry(id) {
    if (!state.lessons[id]) state.lessons[id] = { read: false, exercises: {}, xpAwarded: false, completedAt: null };
    if (!state.lessons[id].exercises) state.lessons[id].exercises = {};
    return state.lessons[id];
  }

  /**
   * Estado de uma aula. Uma aula só é "dominada" com evidência:
   * todos os exercícios respondidos e média >= masteryThreshold (§51).
   */
  function lessonState(id) {
    const lesson = MIA.get.lesson(id);
    if (!lesson) return { state: 'locked', score: 0, done: 0, total: 0 };

    const moduleState_ = moduleState(lesson.module);
    const entry = state.lessons[id];
    const exercises = lesson.exercises || [];
    const total = exercises.length;
    const scores = [];
    let done = 0;

    exercises.forEach(function (ex) {
      const rec = entry && entry.exercises ? entry.exercises[ex.id] : null;
      if (rec && typeof rec.score === 'number') { done++; scores.push(rec.score); }
    });

    const score = scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0;
    const threshold = MIA.data.curriculum.masteryThreshold || 80;

    let st = 'available';
    if (moduleState_.state === 'locked') st = 'locked';
    else if (total > 0 && done === total && score >= threshold) st = 'mastered';
    else if (total > 0 && done === total && score >= 60) st = 'completed';
    else if (total === 0 && entry && entry.read) st = 'completed';
    else if (entry && (entry.read || done > 0)) st = 'in_progress';

    return {
      state: st, score: score, done: done, total: total,
      read: !!(entry && entry.read),
      completedAt: entry ? entry.completedAt : null
    };
  }

  function markRead(id) {
    const entry = lessonEntry(id);
    if (!entry.read) {
      entry.read = true;
      touch();
      const lesson = MIA.get.lesson(id);
      addXP(0, lesson ? Math.round((lesson.duration || 15) * 0.4) : 5);
      commit();
    }
  }

  /** Registra a resposta de um exercício e concede XP na primeira aprovação. */
  function recordExercise(lessonId, exerciseId, result) {
    const lesson = MIA.get.lesson(lessonId);
    const exercise = MIA.get.exercise(exerciseId);
    if (!lesson || !exercise) return null;

    const entry = lessonEntry(lessonId);
    const prev = entry.exercises[exerciseId] || { attempts: 0, score: null, xpAwarded: false };
    const rec = {
      attempts: (prev.attempts || 0) + 1,
      score: Math.max(prev.score || 0, result.score),
      lastScore: result.score,
      answer: result.answer !== undefined ? result.answer : prev.answer,
      lastAt: new Date().toISOString(),
      xpAwarded: prev.xpAwarded || false
    };

    touch();
    let gained = 0;
    if (!rec.xpAwarded && result.score >= 60) {
      gained = exercise.xp || MIA.data.curriculum.xpTable.exercise;
      rec.xpAwarded = true;
      addXP(gained, 0);
    }
    entry.exercises[exerciseId] = rec;
    dayEntry(today()).exercises += 1;

    // conclusão da aula
    const st = lessonState(lessonId);
    if ((st.state === 'completed' || st.state === 'mastered') && !entry.xpAwarded) {
      entry.xpAwarded = true;
      entry.completedAt = new Date().toISOString();
      addXP(MIA.data.curriculum.xpTable.lesson, 0);
      dayEntry(today()).lessons += 1;
      gained += MIA.data.curriculum.xpTable.lesson;
      scheduleReview(lessonId, st.score);
    } else if (st.state === 'completed' || st.state === 'mastered') {
      scheduleReview(lessonId, st.score);
    }

    commit();
    return { record: rec, xp: gained, lesson: st };
  }

  function resetExercise(lessonId, exerciseId) {
    const entry = state.lessons[lessonId];
    if (entry && entry.exercises) { delete entry.exercises[exerciseId]; commit(); }
  }

  /* ---------------- módulos ---------------- */

  function moduleState(id) {
    const mod = MIA.get.module(id);
    if (!mod) return { state: 'locked', progress: 0, mastery: 0, done: 0, total: 0 };

    const total = mod.lessons.length;
    let done = 0, mastered = 0, started = 0, sum = 0, scored = 0;

    mod.lessons.forEach(function (l) {
      const entry = state.lessons[l.id];
      if (!entry) return;
      const exercises = l.exercises || [];
      const recs = exercises.map(function (e) { return entry.exercises[e.id]; }).filter(Boolean);
      if (entry.read || recs.length) started++;
      if (recs.length && recs.length === exercises.length) {
        const avg = Math.round(recs.reduce(function (a, r) { return a + r.score; }, 0) / recs.length);
        sum += avg; scored++;
        if (avg >= 60) done++;
        if (avg >= (MIA.data.curriculum.masteryThreshold || 80)) mastered++;
      } else if (!exercises.length && entry.read) { done++; mastered++; sum += 100; scored++; }
    });

    const ratio = MIA.data.curriculum.moduleUnlockRatio || 0.7;
    const unlocked = (mod.prerequisites || []).every(function (p) {
      const st = moduleStateRaw(p);
      return st.total === 0 || st.mastered / st.total >= ratio;
    });

    let st = 'locked';
    if (unlocked) {
      if (total && mastered === total) st = 'completed';
      else if (started) st = 'in_progress';
      else st = 'available';
    }

    return {
      state: st, total: total, done: done, mastered: mastered, started: started,
      progress: total ? Math.round((done / total) * 100) : 0,
      mastery: total ? Math.round((mastered / total) * 100) : 0,
      averageScore: scored ? Math.round(sum / scored) : 0,
      unlocked: unlocked
    };
  }

  /** Versão sem checar pré-requisitos (evita recursão infinita). */
  function moduleStateRaw(id) {
    const mod = MIA.get.module(id);
    if (!mod) return { total: 0, done: 0, mastered: 0 };
    let done = 0, mastered = 0;
    mod.lessons.forEach(function (l) {
      const entry = state.lessons[l.id];
      if (!entry) return;
      const exercises = l.exercises || [];
      const recs = exercises.map(function (e) { return entry.exercises[e.id]; }).filter(Boolean);
      if (recs.length && recs.length === exercises.length) {
        const avg = recs.reduce(function (a, r) { return a + r.score; }, 0) / recs.length;
        if (avg >= 60) done++;
        if (avg >= (MIA.data.curriculum.masteryThreshold || 80)) mastered++;
      } else if (!exercises.length && entry.read) { done++; mastered++; }
    });
    return { total: mod.lessons.length, done: done, mastered: mastered };
  }

  function moduleBlockers(id) {
    const mod = MIA.get.module(id);
    if (!mod) return [];
    const ratio = MIA.data.curriculum.moduleUnlockRatio || 0.7;
    return (mod.prerequisites || []).filter(function (p) {
      const st = moduleStateRaw(p);
      return !(st.total === 0 || st.mastered / st.total >= ratio);
    }).map(function (p) {
      const st = moduleStateRaw(p);
      return { id: p, title: MIA.get.module(p).title, mastered: st.mastered, needed: Math.ceil(st.total * ratio), total: st.total };
    });
  }

  /* ---------------- nível e progresso global ---------------- */

  function globalProgress() {
    const lessons = MIA.get.allLessons();
    let done = 0, mastered = 0;
    lessons.forEach(function (l) {
      const st = lessonState(l.id);
      if (st.state === 'completed' || st.state === 'mastered') done++;
      if (st.state === 'mastered') mastered++;
    });
    return {
      total: lessons.length, done: done, mastered: mastered,
      percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0
    };
  }

  function levelRatio(levelId) {
    // Trilhas piloto (fora do tema IA) não contam para o nível de IA do aluno.
    const mods = MIA.get.modules().filter(function (m) { return m.level === levelId && !m.pilot; });
    let total = 0, mastered = 0;
    mods.forEach(function (m) { const st = moduleStateRaw(m.id); total += st.total; mastered += st.mastered; });
    return total ? mastered / total : 0;
  }

  /** Nível atual: começa no diagnóstico e sobe com domínio comprovado. */
  function currentLevel() {
    const base = (state.diagnostic && state.diagnostic.level) || 'iniciante';
    let level = base;
    if (levelRatio('iniciante') >= 0.7) level = 'intermediario';
    if (levelRatio('intermediario') >= 0.7) level = 'avancado';
    const order = ['iniciante', 'intermediario', 'avancado'];
    return order[Math.max(order.indexOf(base), order.indexOf(level))];
  }

  /* ---------------- revisão espaçada ---------------- */

  function intervalFor(score, previous) {
    const base = score < 60 ? 1 : score < 80 ? 2 : score < 90 ? 4 : 7;
    if (!previous) return base;
    return score >= 80 ? Math.min(previous * 2, 30) : base;
  }

  function scheduleReview(lessonId, score) {
    const prev = state.reviews[lessonId];
    const days = intervalFor(score, prev ? prev.interval : 0);
    const due = new Date();
    due.setDate(due.getDate() + days);
    state.reviews[lessonId] = {
      interval: days,
      due: due.toISOString().slice(0, 10),
      lastScore: score,
      lastAt: new Date().toISOString()
    };
  }

  function dueReviews() {
    const day = today();
    return Object.keys(state.reviews)
      .filter(function (id) { return MIA.get.lesson(id) && state.reviews[id].due <= day; })
      .map(function (id) { return { lessonId: id, review: state.reviews[id], lesson: MIA.get.lesson(id) }; })
      .sort(function (a, b) { return a.review.lastScore - b.review.lastScore; });
  }

  function recordReview(lessonId, score) {
    touch();
    scheduleReview(lessonId, score);
    addXP(10, 5);
    commit();
  }

  /* ---------------- erros ---------------- */

  function addError(entry) {
    const existing = state.errors.find(function (e) {
      return ui.normalize(e.concept) === ui.normalize(entry.concept) &&
             ui.normalize(e.error) === ui.normalize(entry.error);
    });
    if (existing) {
      existing.repetitions = (existing.repetitions || 1) + 1;
      existing.date = new Date().toISOString();
      existing.status = 'revisar';
    } else {
      state.errors.unshift({
        id: ui.uid('err'),
        concept: entry.concept || '',
        error: entry.error || '',
        correction: entry.correction || '',
        example: entry.example || '',
        lessonId: entry.lessonId || null,
        date: new Date().toISOString(),
        repetitions: 1,
        status: 'revisar'
      });
    }
    commit();
  }

  function updateError(id, patch) {
    const err = state.errors.find(function (e) { return e.id === id; });
    if (err) { Object.assign(err, patch); commit(); }
  }

  function removeError(id) {
    state.errors = state.errors.filter(function (e) { return e.id !== id; });
    commit();
  }

  /* ---------------- skills ---------------- */

  function skillEntry(id) {
    if (!state.skills[id]) state.skills[id] = { status: 'nao-estudada', checklist: {}, security: {}, notes: '' };
    return state.skills[id];
  }

  function skillState(id) {
    const entry = state.skills[id];
    return entry ? entry.status : 'nao-estudada';
  }

  function setSkillStatus(id, status) {
    const entry = skillEntry(id);
    const before = entry.status;
    entry.status = status;
    touch();
    if (status === 'dominada' && before !== 'dominada') addXP(30, 0);
    commit();
  }

  function toggleSkillCheck(id, kind, index, value) {
    const entry = skillEntry(id);
    const bag = kind === 'security' ? entry.security : entry.checklist;
    bag[index] = value;
    if (kind === 'study') {
      const total = MIA.data.skills.studyChecklist.length;
      const done = Object.values(entry.checklist).filter(Boolean).length;
      if (done === total && entry.status !== 'dominada') setSkillStatus(id, 'dominada');
      else if (done > 0 && entry.status === 'nao-estudada') setSkillStatus(id, 'estudando');
    }
    commit();
  }

  /* ---------------- projetos ---------------- */

  function projectEntry(id) {
    if (!state.projects[id]) {
      state.projects[id] = { status: 'nao-iniciado', tasks: {}, notes: {}, startedAt: null, completedAt: null, xpAwarded: false };
    }
    return state.projects[id];
  }

  function projectState(id) {
    const project = MIA.get.project(id);
    const entry = state.projects[id];
    if (!project) return { state: 'locked', progress: 0 };
    const modState = moduleState(project.module);
    const tasks = project.tasks || [];
    const done = tasks.filter(function (_, i) { return entry && entry.tasks[i]; }).length;
    let st = 'available';
    if (modState.state === 'locked') st = 'locked';
    else if (entry && entry.status === 'concluido') st = 'completed';
    else if (entry && (done > 0 || entry.status === 'em-andamento')) st = 'in_progress';
    return { state: st, progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0, done: done, total: tasks.length };
  }

  function toggleProjectTask(id, index, value) {
    const entry = projectEntry(id);
    entry.tasks[index] = value;
    if (!entry.startedAt) entry.startedAt = new Date().toISOString();
    if (entry.status === 'nao-iniciado') entry.status = 'em-andamento';
    touch();
    commit();
  }

  function setProjectNote(id, section, text) {
    const entry = projectEntry(id);
    entry.notes[section] = text;
    if (entry.status === 'nao-iniciado' && text.trim()) entry.status = 'em-andamento';
    commit();
  }

  function completeProject(id) {
    const project = MIA.get.project(id);
    const entry = projectEntry(id);
    if (entry.status === 'concluido') return 0;
    entry.status = 'concluido';
    entry.completedAt = new Date().toISOString();
    touch();
    let gained = 0;
    if (!entry.xpAwarded) {
      gained = project.xp || MIA.data.curriculum.xpTable.project;
      entry.xpAwarded = true;
      addXP(gained, 0);
    }
    commit();
    return gained;
  }

  function reopenProject(id) {
    const entry = projectEntry(id);
    entry.status = 'em-andamento';
    entry.completedAt = null;
    commit();
  }

  /* ---------------- diagnóstico e perfil ---------------- */

  function saveDiagnostic(result) {
    state.diagnostic = result;
    state.user.name = result.name || state.user.name;
    state.user.profession = result.profession || state.user.profession;
    if (!state.user.createdAt) state.user.createdAt = new Date().toISOString();
    if (result.mode) state.prefs.mode = result.mode;
    touch();
    commit();
  }

  /**
   * Muda o objetivo (trilha personalizada) sem refazer as 12 perguntas do
   * diagnóstico. Só muda a ORDEM de apresentação e a sugestão de próxima
   * aula — não desbloqueia nada e não afeta o nível de IA calculado.
   */
  function setTrack(trackId) {
    const track = MIA.data.curriculum.diagnostic.tracks[trackId];
    if (!track) return false;
    if (!state.diagnostic) state.diagnostic = {};
    state.diagnostic.trackId = trackId;
    state.diagnostic.track = track;
    commit();
    return true;
  }

  function setPref(key, value) { state.prefs[key] = value; commit(); }
  function setName(name) { state.user.name = name; commit(); }

  function reset() {
    state = clone(EMPTY);
    try { localStorage.removeItem(KEY); } catch (e) { /* ignorado */ }
    emit();
  }

  function exportJSON() { return JSON.stringify(state, null, 2); }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('Arquivo inválido.');
    state = Object.assign(clone(EMPTY), parsed);
    commit();
  }

  MIA.progress = {
    load: load, save: save, onChange: onChange, get state() { return state; },
    get storageAvailable() { return available; },
    touch: touch, addXP: addXP, currentStreak: currentStreak,
    lessonState: lessonState, markRead: markRead, recordExercise: recordExercise, resetExercise: resetExercise,
    moduleState: moduleState, moduleBlockers: moduleBlockers,
    globalProgress: globalProgress, currentLevel: currentLevel, levelRatio: levelRatio,
    dueReviews: dueReviews, recordReview: recordReview, scheduleReview: scheduleReview,
    addError: addError, updateError: updateError, removeError: removeError,
    skillState: skillState, skillEntry: skillEntry, setSkillStatus: setSkillStatus, toggleSkillCheck: toggleSkillCheck,
    projectState: projectState, projectEntry: projectEntry, toggleProjectTask: toggleProjectTask,
    setProjectNote: setProjectNote, completeProject: completeProject, reopenProject: reopenProject,
    saveDiagnostic: saveDiagnostic, setTrack: setTrack, setPref: setPref, setName: setName,
    reset: reset, exportJSON: exportJSON, importJSON: importJSON
  };
})(window.MIA);
