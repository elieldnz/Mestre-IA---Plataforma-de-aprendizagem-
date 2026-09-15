/* app.js — roteador, dashboard e páginas gerais. */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  const ui = MIA.ui;
  const P = function () { return MIA.progress; };
  let main = null;
  let currentRoute = '';
  let firstRender = true;

  /* ======================= DASHBOARD ======================= */

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  function renderDashboard() {
    const state = P().state;
    const g = P().globalProgress();
    const level = P().currentLevel();
    const levelDef = MIA.get.level(level);
    const next = MIA.get.nextLesson(P());
    const mission = MIA.review.buildMission();
    const streak = P().currentStreak();
    const name = state.user.name || 'aluno';

    let html = '<section class="hero">' +
      '<p class="card__label">' + greeting() + '</p>' +
      '<h1>Olá, ' + ui.escapeHtml(name) + '.</h1>' +
      '<p class="muted">Continue sua evolução em IA.</p>' +
      '<div class="hero__next">' +
        '<p class="card__label">Próxima missão</p>' +
        (next
          ? '<h2 style="margin-bottom:4px">' + ui.escapeHtml(next.title) + '</h2>' +
            '<p class="muted small">' + ui.escapeHtml(MIA.get.moduleOfLesson(next.id).title) + ' · ' + next.duration + ' min · ' +
            ui.escapeHtml(next.objectives[0]) + '</p>' +
            '<a class="btn btn--primary" href="#/aula/' + next.id + '">Continuar aprendendo →</a>'
          : '<h2 style="margin-bottom:4px">Tudo liberado concluído</h2>' +
            '<p class="muted small">Hora de construir: escolha um projeto do portfólio.</p>' +
            '<a class="btn btn--primary" href="#/projetos">Abrir projetos →</a>') +
      '</div>' +
    '</section>';

    html += '<div class="grid grid--4" style="margin-top:24px">' +
      '<div class="card stat"><p class="card__label">Progresso</p><div class="stat__value">' + g.percent + '<small>%</small></div>' +
        '<p class="small muted">' + g.done + ' de ' + g.total + ' aulas</p></div>' +
      '<div class="card stat"><p class="card__label">XP</p><div class="stat__value">' + state.xp + ' <small>XP</small></div>' +
        '<p class="small muted">' + g.mastered + ' aulas dominadas</p></div>' +
      '<div class="card stat"><p class="card__label">Streak</p><div class="stat__value">' + streak + ' <small>dias</small></div>' +
        '<p class="small muted">' + (streak >= 2 ? 'Você está construindo consistência.' : 'Recorde: ' + (state.streak.best || 0) + ' dias') + '</p></div>' +
      '<div class="card stat"><p class="card__label">Nível</p><div class="stat__value" style="color:var(--level-' + level + ')">' +
        ui.escapeHtml(levelDef.label) + '</div><p class="small muted">' + ui.escapeHtml(levelDef.goal) + '</p></div>' +
    '</div>';

    html += '<div class="grid grid--2" style="margin-top:24px">';

    html += '<section class="card"><div class="row row--between">' +
      '<p class="card__label" style="margin:0">Missão de hoje</p>' +
      '<span class="badge">' + mission.mode.icon + ' ' + mission.mode.minutes + ' min</span></div>' +
      '<div class="modes" style="margin:12px 0 16px">' +
      MIA.data.curriculum.studyModes.map(function (m) {
        return '<button class="btn btn--sm" data-mode="' + m.id + '" aria-pressed="' +
          (mission.mode.id === m.id) + '">' + m.icon + ' ' + ui.escapeHtml(m.label) + '</button>';
      }).join('') + '</div>' +
      '<ul class="mission">' + mission.items.map(function (item) {
        return '<li><div class="mission__body"><strong>' + ui.escapeHtml(item.title) + ' — ' + item.minutes + ' min</strong>' +
          '<span class="small muted">' + ui.escapeHtml(item.detail) + '</span></div>' +
          '<a class="btn btn--sm" href="' + item.href + '">Abrir</a></li>';
      }).join('') + '</ul></section>';

    const modules = MIA.get.modules().slice(0, 6);
    html += '<section class="card"><div class="row row--between">' +
      '<p class="card__label" style="margin:0">Mapa da jornada</p>' +
      '<a class="small" href="#/jornada">ver completo</a></div>' +
      '<ul class="journey" style="margin-top:16px">' + modules.map(journeyItem).join('') + '</ul></section>';

    html += '</div>';

    const errors = state.errors.filter(function (e) { return e.status !== 'resolvido'; });
    const due = P().dueReviews();
    if (errors.length || due.length) {
      html += '<section class="card" style="margin-top:24px;border-color:var(--amber)">' +
        '<p class="card__label">Atenção</p><div class="row">' +
        (due.length ? '<a class="btn btn--sm" href="#/revisao">🔁 ' + ui.plural(due.length, 'revisão vencida', 'revisões vencidas') + '</a>' : '') +
        (errors.length ? '<a class="btn btn--sm" href="#/erros">🔴 ' + ui.plural(errors.length, 'erro em aberto', 'erros em aberto') + '</a>' : '') +
        '</div></section>';
    }

    return html;
  }

  /* ======================= JORNADA ======================= */

  function journeyItem(mod) {
    const st = P().moduleState(mod.id);
    const icon = { completed: '🟢', in_progress: '🟡', available: '🔵', locked: '⚪' }[st.state];
    const href = st.state === 'locked' ? '#/jornada' : '#/aulas';
    return '<li class="journey__item" data-state="' + st.state + '">' +
      '<span class="journey__dot" aria-hidden="true">' + icon + '</span>' +
      '<a class="journey__card" href="' + href + '">' +
        '<h3>' + ui.escapeHtml(mod.title) + '</h3>' +
        '<span class="small muted">Fase ' + mod.phase + ' · ' + st.progress + '%</span>' +
      '</a></li>';
  }

  function renderJourney() {
    const modules = MIA.get.modules();
    let html = '<div class="page-head"><p class="eyebrow">Camadas 1 e 2</p><h1>Minha jornada</h1>' +
      '<p>Cada fase libera a seguinte quando você demonstra domínio — não quando marca “concluído”. ' +
      'É preciso dominar ' + Math.round((MIA.data.curriculum.moduleUnlockRatio || 0.7) * 100) + '% das aulas do pré-requisito, ' +
      'com nota a partir de ' + (MIA.data.curriculum.masteryThreshold || 80) + '.</p></div>';

    html += '<ul class="journey">';
    modules.forEach(function (mod) {
      const st = P().moduleState(mod.id);
      const icon = { completed: '🟢', in_progress: '🟡', available: '🔵', locked: '⚪' }[st.state];
      const blockers = P().moduleBlockers(mod.id);
      const project = mod.project ? MIA.get.project(mod.project) : null;

      html += '<li class="journey__item" data-state="' + st.state + '">' +
        '<span class="journey__dot" aria-hidden="true">' + icon + '</span>' +
        '<div class="journey__card card">' +
          '<div class="row row--between" style="align-items:flex-start">' +
            '<div style="min-width:0"><p class="card__label">Fase ' + mod.phase + '</p>' +
              '<h3>' + mod.icon + ' ' + ui.escapeHtml(mod.title) + '</h3>' +
              '<p class="small muted" style="margin:0">' + ui.escapeHtml(mod.goal) + '</p></div>' +
            '<div class="row">' + ui.levelBadge(mod.level) + ui.stateBadge(st.state) + '</div>' +
          '</div>' +
          '<div style="margin:16px 0">' + ui.bar(st.progress, ui.LEVEL_TONE[mod.level]) + '</div>' +
          '<div class="journey__meta">' +
            '<span class="badge">' + ui.plural(mod.lessons.length, 'aula', 'aulas') + '</span>' +
            '<span class="badge">' + st.mastered + ' dominadas</span>' +
            (project ? '<a class="badge badge--purple" href="#/projeto/' + project.id + '">🏗️ ' + ui.escapeHtml(project.title) + '</a>' : '') +
            (mod.skills || []).slice(0, 3).map(function (s) {
              const sk = MIA.get.skill(s);
              return sk ? '<a class="badge badge--blue" href="#/skill/' + s + '">🧩 ' + ui.escapeHtml(sk.name) + '</a>' : '';
            }).join('') +
          '</div>' +
          (blockers.length
            ? '<p class="small muted" style="margin-top:12px">🔒 Para liberar, domine ' + blockers.map(function (b) {
                return b.needed + ' das ' + b.total + ' aulas de <strong>' + ui.escapeHtml(b.title) +
                  '</strong> (você domina ' + b.mastered + ')'; }).join(' e ') + '.</p>'
            : '<div class="row" style="margin-top:12px">' +
              '<a class="btn btn--sm btn--primary" href="#/aula/' + mod.lessons[0].id + '">Abrir primeira aula</a>' +
              (st.mastered ? '<a class="btn btn--sm btn--ghost" href="#/checkpoint/' + mod.id + '">Checkpoint</a>' : '') +
              '</div>') +
        '</div></li>';
    });
    html += '</ul>';
    return html;
  }

  /* ======================= DESAFIOS ======================= */

  function renderChallenges() {
    const items = [];
    MIA.get.modules().forEach(function (mod) {
      const modState = P().moduleState(mod.id);
      mod.lessons.forEach(function (lesson) {
        (lesson.exercises || []).forEach(function (ex) {
          if (ex.type !== 'challenge') return;
          const entry = P().state.lessons[lesson.id];
          const rec = entry && entry.exercises ? entry.exercises[ex.id] : null;
          items.push({ mod: mod, lesson: lesson, ex: ex, rec: rec, locked: modState.state === 'locked' });
        });
      });
    });

    const done = items.filter(function (i) { return i.rec; }).length;

    let html = '<div class="page-head"><p class="eyebrow">Prática</p><h1>Desafios</h1>' +
      '<p>Problema sem tutorial: você já tem o que precisa para resolver. ' + done + ' de ' + items.length + ' concluídos.</p></div>';

    html += '<div class="grid grid--2">' + items.map(function (i) {
      return '<article class="card skill-card">' +
        '<div class="skill-card__top"><div>' +
          '<span class="skill-card__n">Fase ' + i.mod.phase + ' · ' + ui.escapeHtml(i.mod.title) + '</span>' +
          '<h3>' + ui.escapeHtml(i.lesson.title) + '</h3></div>' +
          (i.locked ? '<span class="badge">🔒</span>' : i.rec ? ui.scoreBadge(i.rec.score) : '<span class="badge badge--purple">+' + i.ex.xp + ' XP</span>') +
        '</div>' +
        '<p class="small">' + ui.escapeHtml(i.ex.question) + '</p>' +
        '<div class="skill-card__foot">' +
          (i.locked
            ? '<span class="small muted">Bloqueado: domine o módulo anterior.</span>'
            : '<a class="btn btn--sm ' + (i.rec ? '' : 'btn--primary') + '" href="#/aula/' + i.lesson.id + '#ex-' + i.ex.id + '">' +
              (i.rec ? 'Revisar' : 'Encarar o desafio') + '</a>') +
        '</div></article>';
    }).join('') + '</div>';

    return html;
  }

  /* ======================= CHECKPOINT ======================= */

  function renderCheckpoint(moduleId) {
    const mod = MIA.get.module(moduleId);
    if (!mod) return '<div class="empty">Módulo não encontrado.</div>';

    const st = P().moduleState(moduleId);
    let lessonsDone = 0, exercisesDone = 0, challengesDone = 0, scoreSum = 0, scored = 0;

    mod.lessons.forEach(function (lesson) {
      const ls = P().lessonState(lesson.id);
      if (ls.state === 'completed' || ls.state === 'mastered') lessonsDone++;
      const entry = P().state.lessons[lesson.id];
      (lesson.exercises || []).forEach(function (ex) {
        const rec = entry && entry.exercises ? entry.exercises[ex.id] : null;
        if (!rec) return;
        exercisesDone++;
        if (ex.type === 'challenge') challengesDone++;
        scoreSum += rec.score; scored++;
      });
    });

    const score = scored ? Math.round(scoreSum / scored) : 0;
    const ratio = MIA.data.curriculum.moduleUnlockRatio || 0.7;
    const needed = Math.ceil(mod.lessons.length * ratio);
    const ready = st.mastered >= needed;
    const nextModule = MIA.get.modules().find(function (m) { return (m.prerequisites || []).indexOf(moduleId) !== -1; });

    let html = '<article class="stack">' +
      '<header><p class="lesson__crumbs">Fase ' + mod.phase + '</p><h1>Checkpoint</h1>' +
      '<p class="muted">' + ui.escapeHtml(mod.title) + '</p></header>';

    html += '<section class="card"><p class="card__label">Você concluiu</p><ul class="objectives">' +
      '<li>' + ui.plural(lessonsDone, 'aula', 'aulas') + ' de ' + mod.lessons.length + '</li>' +
      '<li>' + ui.plural(exercisesDone, 'exercício respondido', 'exercícios respondidos') + '</li>' +
      '<li>' + ui.plural(challengesDone, 'desafio', 'desafios') + '</li>' +
      '<li>' + st.mastered + ' aulas dominadas (nota ≥ ' + (MIA.data.curriculum.masteryThreshold || 80) + ')</li>' +
      '</ul></section>';

    html += '<section class="card card--accent"><p class="card__label">Resultado</p>' +
      '<div class="feedback__score"><b>' + score + '</b><span class="muted">/100</span> ' + ui.scoreBadge(score) + '</div>' +
      '<div style="margin-top:16px">' + ui.bar(st.mastery, ui.LEVEL_TONE[mod.level]) + '</div>' +
      '<p class="small muted">Domínio do módulo: ' + st.mastered + ' de ' + mod.lessons.length + ' aulas (necessário: ' + needed + ').</p>' +
    '</section>';

    html += '<section class="card">' +
      (ready
        ? '<p class="card__label">Você está pronto para</p>' +
          (nextModule
            ? '<h2>Fase ' + nextModule.phase + ' — ' + ui.escapeHtml(nextModule.title) + '</h2>' +
              '<p class="muted">' + ui.escapeHtml(nextModule.goal) + '</p>' +
              '<a class="btn btn--primary" href="#/aula/' + nextModule.lessons[0].id + '">Avançar →</a>'
            : '<h2>O projeto final</h2><a class="btn btn--primary" href="#/projeto/project-final">Abrir projeto final →</a>')
        : '<p class="card__label">Ainda não</p>' +
          '<p>Faltam ' + (needed - st.mastered) + ' aulas dominadas neste módulo. Reveja as aulas com nota abaixo de ' +
          (MIA.data.curriculum.masteryThreshold || 80) + ' e responda os exercícios de novo.</p>' +
          '<a class="btn btn--primary" href="#/aulas">Voltar para as aulas</a>') +
    '</section>';

    const project = mod.project ? MIA.get.project(mod.project) : null;
    if (project) {
      html += '<section class="card"><p class="card__label">Projeto desta fase</p>' +
        '<h3>' + ui.escapeHtml(project.title) + '</h3><p class="muted">' + ui.escapeHtml(project.summary) + '</p>' +
        '<a class="btn btn--sm" href="#/projeto/' + project.id + '">Abrir workspace</a></section>';
    }

    html += '</article>';
    return html;
  }

  /* ======================= PROGRESSO ======================= */

  function renderProgress() {
    const g = P().globalProgress();
    const state = P().state;
    const modules = MIA.get.modules();
    const skills = MIA.get.allSkills();
    const dominated = skills.filter(function (s) { return P().skillState(s.id) === 'dominada'; });
    const projects = MIA.get.allProjects();
    const projectsDone = projects.filter(function (p) { return P().projectState(p.id).state === 'completed'; });

    const withScore = modules.map(function (m) { return { m: m, st: P().moduleState(m.id) }; })
      .filter(function (x) { return x.st.averageScore > 0; });
    const strong = withScore.slice().sort(function (a, b) { return b.st.averageScore - a.st.averageScore; }).slice(0, 3);
    const weak = withScore.slice().sort(function (a, b) { return a.st.averageScore - b.st.averageScore; }).slice(0, 3);

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key: key, data: state.activity[key] || { xp: 0, minutes: 0 } });
    }
    const maxXP = Math.max.apply(null, days.map(function (d) { return d.data.xp; }).concat([1]));

    let html = '<div class="page-head"><p class="eyebrow">Evolução</p><h1>Progresso</h1>' +
      '<p>O que você consegue provar que sabe — não o que você assistiu.</p></div>';

    html += '<div class="grid grid--4">' +
      '<div class="card stat"><p class="card__label">Aulas concluídas</p><div class="stat__value">' + g.done + '<small>/' + g.total + '</small></div></div>' +
      '<div class="card stat"><p class="card__label">Dominadas</p><div class="stat__value">' + g.mastered + '</div></div>' +
      '<div class="card stat"><p class="card__label">Skills dominadas</p><div class="stat__value">' + dominated.length + '<small>/' + skills.length + '</small></div></div>' +
      '<div class="card stat"><p class="card__label">Projetos concluídos</p><div class="stat__value">' + projectsDone.length + '<small>/' + projects.length + '</small></div></div>' +
    '</div>';

    html += '<section class="card" style="margin-top:24px"><p class="card__label">Últimos 14 dias</p>' +
      '<div class="row" style="align-items:flex-end;gap:6px;height:90px;margin-top:12px">' +
      days.map(function (d) {
        const h = Math.max(4, Math.round((d.data.xp / maxXP) * 80));
        const label = new Date(d.key + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px" title="' + label + ': ' + d.data.xp + ' XP">' +
          '<div style="width:100%;height:' + h + 'px;background:' + (d.data.xp ? 'var(--green)' : 'var(--surface-2)') + ';border-radius:4px"></div>' +
          '</div>';
      }).join('') + '</div>' +
      '<p class="small muted" style="margin-top:8px">XP por dia. Tempo estimado de estudo acumulado: ' +
      Math.round(state.minutes / 60) + 'h ' + (state.minutes % 60) + 'min.</p></section>';

    html += '<div class="grid grid--2" style="margin-top:24px">' +
      '<section class="card"><p class="card__label">Áreas fortes</p>' +
      (strong.length ? '<ul class="list">' + strong.map(function (x) {
        return '<li><div class="row row--between"><span>' + ui.escapeHtml(x.m.title) + '</span>' + ui.scoreBadge(x.st.averageScore) + '</div></li>';
      }).join('') + '</ul>' : '<p class="muted">Responda exercícios para gerar esta análise.</p>') + '</section>' +
      '<section class="card"><p class="card__label">Áreas fracas</p>' +
      (weak.length ? '<ul class="list">' + weak.map(function (x) {
        return '<li><div class="row row--between"><span>' + ui.escapeHtml(x.m.title) + '</span>' + ui.scoreBadge(x.st.averageScore) + '</div></li>';
      }).join('') + '</ul>' : '<p class="muted">Sem dados suficientes ainda.</p>') + '</section>' +
    '</div>';

    html += '<section style="margin-top:24px"><h2>Por módulo</h2><div class="table-wrap"><table>' +
      '<thead><tr><th>Fase</th><th>Módulo</th><th>Nível</th><th>Aulas</th><th>Dominadas</th><th>Média</th><th>Estado</th></tr></thead><tbody>' +
      modules.map(function (m) {
        const st = P().moduleState(m.id);
        return '<tr><td>' + m.phase + '</td>' +
          '<td>' + ui.escapeHtml(m.title) + '</td>' +
          '<td>' + ui.LEVEL_LABEL[m.level] + '</td>' +
          '<td>' + st.done + '/' + st.total + '</td>' +
          '<td>' + st.mastered + '</td>' +
          '<td>' + (st.averageScore || '—') + '</td>' +
          '<td>' + ui.stateBadge(st.state) + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';

    return html;
  }

  /* ======================= PERFIL ======================= */

  function renderProfile() {
    const state = P().state;
    const g = P().globalProgress();
    const diag = state.diagnostic;
    const level = MIA.get.level(P().currentLevel());
    const skills = MIA.get.allSkills().filter(function (s) { return P().skillState(s.id) === 'dominada'; });
    const projects = MIA.get.allProjects().filter(function (p) { return P().projectState(p.id).state === 'completed'; });

    let html = '<div class="page-head"><p class="eyebrow">Você</p><h1>Perfil</h1></div>';

    html += '<div class="grid grid--2">' +
      '<section class="card"><p class="card__label">Identificação</p>' +
        '<div class="field"><label for="profile-name">Nome</label>' +
        '<input type="text" id="profile-name" value="' + ui.escapeHtml(state.user.name) + '"></div>' +
        '<p class="small muted">Profissão: ' + ui.escapeHtml(state.user.profession || 'não informada') + '</p>' +
        '<p class="small muted">Na plataforma desde ' + ui.formatDate(state.user.createdAt) + '</p>' +
        '<div class="row"><button class="btn btn--sm" data-action="save-name">Salvar</button></div></section>' +

      '<section class="card"><p class="card__label">Números</p>' +
        '<ul class="list">' +
        '<li><div class="row row--between"><span>Nível</span><strong style="color:var(--level-' + level.id + ')">' + level.label + '</strong></div></li>' +
        '<li><div class="row row--between"><span>XP</span><strong>' + state.xp + '</strong></div></li>' +
        '<li><div class="row row--between"><span>Streak</span><strong>' + P().currentStreak() + ' dias (recorde ' + (state.streak.best || 0) + ')</strong></div></li>' +
        '<li><div class="row row--between"><span>Taxa de conclusão</span><strong>' + g.percent + '%</strong></div></li>' +
        '<li><div class="row row--between"><span>Tempo estudado</span><strong>' + Math.round(state.minutes / 60) + 'h ' + (state.minutes % 60) + 'min</strong></div></li>' +
        '<li><div class="row row--between"><span>Skills dominadas</span><strong>' + skills.length + '</strong></div></li>' +
        '<li><div class="row row--between"><span>Projetos concluídos</span><strong>' + projects.length + '</strong></div></li>' +
        '</ul></section>' +
    '</div>';

    html += '<section class="card" style="margin-top:24px"><p class="card__label">Ritmo de estudo</p>' +
      '<div class="modes">' + MIA.data.curriculum.studyModes.map(function (m) {
        return '<button class="btn btn--sm" data-mode="' + m.id + '" aria-pressed="' +
          ((state.prefs.mode || 'normal') === m.id) + '">' + m.icon + ' ' + ui.escapeHtml(m.label) + '</button>';
      }).join('') + '</div></section>';

    if (diag) {
      html += '<section class="card" style="margin-top:24px"><p class="card__label">Diagnóstico inicial</p>' +
        '<p class="small muted">Feito em ' + ui.formatDate(diag.date) + ' · nível apurado: ' + ui.LEVEL_LABEL[diag.level] + ' (' + diag.percent + '%)</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Competência</th><th>Diagnóstico</th></tr></thead><tbody>' +
        diag.dimensions.map(function (d) {
          return '<tr><td>' + ui.escapeHtml(d.label) + '</td><td style="width:50%">' + ui.bar(d.ratio * 100) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="row" style="margin-top:16px"><button class="btn btn--sm btn--ghost" data-action="redo-diagnostic">Refazer diagnóstico</button></div></section>';
    }

    html += '<section class="card" style="margin-top:24px"><p class="card__label">Seus dados</p>' +
      '<p class="small">Tudo fica no localStorage deste navegador. Limpar os dados do site apaga o seu progresso — ' +
      'exporte um backup antes de trocar de máquina.</p>' +
      '<div class="row">' +
        '<button class="btn btn--sm" data-action="export">Exportar progresso (.json)</button>' +
        '<button class="btn btn--sm" data-action="import">Importar backup</button>' +
        '<button class="btn btn--sm btn--danger" data-action="reset">Apagar tudo</button>' +
      '</div>' +
      '<input type="file" id="import-file" accept="application/json" hidden>' +
      (P().storageAvailable ? '' : '<p class="small" style="color:var(--amber);margin-top:12px">⚠ Este navegador bloqueou o armazenamento local: o progresso não está sendo salvo.</p>') +
    '</section>';

    return html;
  }

  /* ======================= BIBLIOTECA ======================= */

  function renderLibraryPage() {
    const xp = MIA.data.curriculum.xpTable;
    const glossary = [
      ['Token', 'Pedaço de texto que o modelo processa. ~4 caracteres em português. Mede limite, custo e velocidade.'],
      ['Contexto', 'Tudo que o modelo consegue considerar de uma vez. Fora dele, para o modelo, não existe.'],
      ['Alucinação', 'Informação plausível e falsa, produzida com a mesma confiança de uma correta.'],
      ['Prompt estruturado', 'Instrução com seções nomeadas: papel, contexto, objetivo, restrições, formato, critérios.'],
      ['Skill', 'Pasta com um SKILL.md que ensina um agente a executar determinada tarefa.'],
      ['Agente', 'Assistente que pode agir: usa ferramentas e encadeia passos até um objetivo.'],
      ['Ferramenta', 'Função que o agente pode chamar. Classifique sempre por risco.'],
      ['API', 'Conjunto de regras para dois sistemas conversarem. Endpoint é um endereço dentro dela.'],
      ['Webhook', 'Endereço que recebe dados enviados por outro sistema, disparando um fluxo.'],
      ['RAG', 'Buscar trechos dos seus documentos e colocá-los no contexto antes de responder.'],
      ['Embedding', 'Representação numérica de significado. Textos próximos em sentido ficam próximos no espaço.'],
      ['Chunking', 'Dividir documentos em pedaços indexáveis. Onde a maioria dos RAGs falha.'],
      ['MCP', 'Protocolo padronizado para agentes descobrirem e usarem ferramentas externas.'],
      ['Injeção de prompt', 'Conteúdo externo tratado como instrução. Defesa: conteúdo é dado, nunca ordem.'],
      ['Sistema multiagente', 'Supervisor coordenando especialistas com contratos de entrada e saída.']
    ];

    let html = '<div class="page-head"><p class="eyebrow">Referência</p><h1>Biblioteca</h1>' +
      '<p>Consulta rápida: glossário, regras do sistema e as fontes do conteúdo.</p></div>';

    html += '<section class="card"><p class="card__label">Glossário</p><div class="table-wrap"><table><tbody>' +
      glossary.map(function (g) {
        return '<tr><td style="white-space:nowrap"><strong>' + ui.escapeHtml(g[0]) + '</strong></td><td>' + ui.escapeHtml(g[1]) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + ui.sourceTag('complementar') + '</section>';

    html += '<div class="grid grid--2" style="margin-top:24px">' +
      '<section class="card"><p class="card__label">Tabela de XP</p><ul class="list">' +
        '<li><div class="row row--between"><span>Aula concluída</span><strong>+' + xp.lesson + ' XP</strong></div></li>' +
        '<li><div class="row row--between"><span>Exercício</span><strong>+' + xp.exercise + ' XP</strong></div></li>' +
        '<li><div class="row row--between"><span>Quiz</span><strong>+' + xp.quiz + ' XP</strong></div></li>' +
        '<li><div class="row row--between"><span>Desafio</span><strong>+' + xp.challenge + ' XP</strong></div></li>' +
        '<li><div class="row row--between"><span>Projeto</span><strong>+' + xp.project + ' XP</strong></div></li>' +
        '<li><div class="row row--between"><span>Projeto final</span><strong>+' + xp.finalProject + ' XP</strong></div></li>' +
        '</ul>' + ui.sourceTag('material') + '</section>' +

      '<section class="card"><p class="card__label">Escala de avaliação</p><ul class="list">' +
        MIA.data.curriculum.grading.map(function (g) {
          const dot = { vermelho: '🔴', amarelo: '🟡', verde: '🟢', azul: '🔵' }[g.tone];
          return '<li><div class="row row--between"><span>' + dot + ' ' + g.min + '–' + g.max + '</span><strong>' + ui.escapeHtml(g.label) + '</strong></div></li>';
        }).join('') + '</ul>' + ui.sourceTag('material') +
        '<p class="small muted">Regra: assunto avançado só é liberado com domínio dos pré-requisitos.</p></section>' +
    '</div>';

    html += '<section class="card" style="margin-top:24px"><p class="card__label">Checklist de segurança de Skills</p>' +
      '<ol class="prose">' + MIA.data.skills.securityChecklist.map(function (i) {
        return '<li>' + ui.escapeHtml(i) + '</li>'; }).join('') + '</ol>' + ui.sourceTag('material') + '</section>';

    html += '<section class="card" style="margin-top:24px"><p class="card__label">Os 10 estudos de caso de prompts</p>' +
      '<ol class="prose">' + (MIA.get.module('dez-prompts').lessons.map(function (l) {
        return '<li><a href="#/aula/' + l.id + '">' + ui.escapeHtml(l.title.replace(/^Caso \d+ — /, '')) + '</a></li>';
      }).join('')) + '</ol>' + ui.sourceTag('material') + '</section>';

    html += '<section class="card" style="margin-top:24px"><p class="card__label">Origem do conteúdo</p>' +
      '<p>' + ui.escapeHtml(MIA.data.curriculum.meta.sourceNote) + '</p>' +
      '<p>' + ui.escapeHtml(MIA.data.skills.meta.sourceNote) + '</p>' +
      '<p class="small muted">Dados carregados de: ' + (MIA.data.source === 'json' ? '/data/*.json' : 'bundle local (abertura via file://)') + '.</p>' +
    '</section>';

    return html;
  }

  /* ======================= ROTEADOR ======================= */

  function parseRoute() {
    const hash = window.location.hash || '#/dashboard';
    if (hash.indexOf('#/') !== 0) return null;
    const parts = hash.slice(2).split('/');
    return { name: parts[0] || 'dashboard', param: parts[1] ? decodeURIComponent(parts[1].split('#')[0]) : null };
  }

  function render() {
    const route = parseRoute() || { name: 'dashboard', param: null };
    let html = '';

    switch (route.name) {
      case 'dashboard': html = renderDashboard(); break;
      case 'jornada': html = renderJourney(); break;
      case 'aulas': html = MIA.lessons.renderLessonsPage(); break;
      case 'aula': html = MIA.lessons.renderLessonPage(route.param); break;
      case 'skills': html = MIA.skills.renderExplorer(); break;
      case 'skill': html = MIA.skills.renderSkillPage(route.param); break;
      case 'projetos': html = MIA.projects.renderLibrary(); break;
      case 'projeto': html = MIA.projects.renderWorkspace(route.param); break;
      case 'desafios': html = renderChallenges(); break;
      case 'revisao': html = MIA.review.renderReviewPage(); break;
      case 'erros': html = MIA.review.renderErrorsPage(); break;
      case 'progresso': html = renderProgress(); break;
      case 'biblioteca': html = renderLibraryPage(); break;
      case 'perfil': html = renderProfile(); break;
      case 'checkpoint': html = renderCheckpoint(route.param); break;
      default:
        html = '<div class="empty"><h1>Página não encontrada</h1><a class="btn btn--primary" href="#/dashboard">Voltar ao dashboard</a></div>';
    }

    main.innerHTML = html;

    // handlers específicos da rota
    if (route.name === 'aula' && MIA.get.lesson(route.param)) MIA.lessons.bindLessonPage(main, route.param);
    if (route.name === 'skills') MIA.skills.bindExplorer(main);
    if (route.name === 'skill' && MIA.get.skill(route.param)) MIA.skills.bindSkillPage(main, route.param);
    if (route.name === 'projetos') MIA.projects.bindLibrary(main);
    if (route.name === 'projeto' && MIA.get.project(route.param)) MIA.projects.bindWorkspace(main, route.param);
    if (route.name === 'revisao') MIA.review.bindReviewPage(main);
    if (route.name === 'erros') MIA.review.bindErrorsPage(main);
    if (route.name === 'perfil') bindProfile(main);

    bindCommon(main);
    refreshChrome();

    MIA.tutor.setContext({
      route: route.name,
      lessonId: route.name === 'aula' ? route.param : null,
      moduleId: route.name === 'checkpoint' ? route.param : null
    });

    if (currentRoute !== window.location.hash) {
      const changed = !firstRender;
      currentRoute = window.location.hash;
      window.scrollTo({ top: 0, behavior: 'auto' });
      // Move o foco para o título apenas em NAVEGAÇÃO, para não roubar
      // o primeiro Tab (que deve alcançar o link "pular para o conteúdo").
      if (changed) {
        const heading = main.querySelector('h1');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
      }
      firstRender = false;
    }
  }

  function bindCommon(root) {
    root.addEventListener('click', function (event) {
      const mode = event.target.closest('[data-mode]');
      if (mode) {
        P().setPref('mode', mode.dataset.mode);
        ui.toast('Ritmo atualizado.');
        render();
      }
    });
  }

  function bindProfile(root) {
    root.addEventListener('click', function (event) {
      const btn = event.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'save-name') {
        P().setName(document.getElementById('profile-name').value.trim());
        ui.toast('Nome salvo.');
        refreshChrome();
      }
      if (btn.dataset.action === 'redo-diagnostic') {
        MIA.onboarding.start(document.getElementById('onboarding'));
      }
      if (btn.dataset.action === 'export') {
        const blob = new Blob([P().exportJSON()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'mestre-ia-progresso.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      }
      if (btn.dataset.action === 'import') {
        document.getElementById('import-file').click();
      }
      if (btn.dataset.action === 'reset') {
        if (window.confirm('Isto apaga XP, aulas, skills, projetos e erros deste navegador. Continuar?')) {
          P().reset();
          window.location.hash = '#/dashboard';
          boot();
        }
      }
    });

    const file = root.querySelector('#import-file');
    if (file) {
      file.addEventListener('change', function () {
        const chosen = file.files[0];
        if (!chosen) return;
        const reader = new FileReader();
        reader.onload = function () {
          try {
            P().importJSON(String(reader.result));
            ui.toast('Backup importado.');
            render();
          } catch (err) {
            ui.toast('Arquivo inválido: ' + err.message);
          }
        };
        reader.readAsText(chosen);
      });
    }
  }

  /* ======================= CHROME ======================= */

  function refreshChrome() {
    const state = P().state;
    const xpChip = document.getElementById('chip-xp');
    const streakChip = document.getElementById('chip-streak');
    const avatar = document.getElementById('btn-perfil');

    if (xpChip) xpChip.innerHTML = '<strong>' + state.xp + '</strong> XP';
    if (streakChip) {
      const streak = P().currentStreak();
      streakChip.innerHTML = '🔥 <strong>' + streak + '</strong>';
      streakChip.title = streak >= 2 ? 'Você está construindo consistência.' : 'Estude hoje para começar um streak.';
    }
    if (avatar) {
      const name = (state.user.name || '?').trim();
      avatar.textContent = name.split(/\s+/).slice(0, 2).map(function (p) { return p[0]; }).join('').toUpperCase() || '?';
    }

    const route = (parseRoute() || {}).name;
    ui.qsa('.nav a').forEach(function (link) {
      const isCurrent = link.dataset.route === route ||
        (route === 'aula' && link.dataset.route === 'aulas') ||
        (route === 'skill' && link.dataset.route === 'skills') ||
        (route === 'projeto' && link.dataset.route === 'projetos') ||
        (route === 'erros' && link.dataset.route === 'revisao') ||
        (route === 'checkpoint' && link.dataset.route === 'jornada');
      if (isCurrent) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function initChrome() {
    const menuBtn = document.getElementById('btn-menu');
    const nav = document.getElementById('nav-principal');
    menuBtn.addEventListener('click', function () {
      const open = nav.dataset.open === 'true';
      nav.dataset.open = String(!open);
      menuBtn.setAttribute('aria-expanded', String(!open));
    });
    nav.addEventListener('click', function (event) {
      if (event.target.tagName === 'A') {
        nav.dataset.open = 'false';
        menuBtn.setAttribute('aria-expanded', 'false');
      }
    });
    window.addEventListener('hashchange', function () {
      if ((window.location.hash || '').indexOf('#/') !== 0) return;
      render();
    });
  }

  /* ======================= BOOT ======================= */

  function enterApp() {
    const onboarding = document.getElementById('onboarding');
    onboarding.hidden = true;
    onboarding.innerHTML = ''; // evita títulos duplicados no DOM para leitores de tela
    document.getElementById('app').hidden = false;
    if (!window.location.hash || window.location.hash.indexOf('#/') !== 0) window.location.hash = '#/dashboard';
    render();
  }

  function boot() {
    const state = P().load();
    if (!state.diagnostic) MIA.onboarding.start(document.getElementById('onboarding'));
    else enterApp();
  }

  async function init() {
    main = document.getElementById('conteudo');
    try {
      await MIA.loadData();
    } catch (err) {
      main.innerHTML = '<div class="empty"><h1>Não foi possível carregar os dados</h1>' +
        '<p>' + ui.escapeHtml(err.message) + '</p>' +
        '<p class="small">Rode <code>node tools/build-data.js</code> ou sirva a pasta com um servidor local.</p></div>';
      document.getElementById('app').hidden = false;
      return;
    }
    initChrome();
    MIA.tutor.init();
    P().onChange(refreshChrome);
    boot();
  }

  MIA.app = { init: init, render: render, refreshChrome: refreshChrome, enterApp: enterApp, boot: boot };
  document.addEventListener('DOMContentLoaded', init);
})(window.MIA);
