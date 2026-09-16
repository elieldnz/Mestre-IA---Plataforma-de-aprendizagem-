/* projects.js — biblioteca de projetos e workspace. */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  const ui = MIA.ui;
  const P = function () { return MIA.progress; };
  const levelFilter = { level: '', status: '' };

  /* ---------------- autosave do workspace ----------------
     Salva enquanto o usuário digita (com debounce), sem mudar a estrutura
     persistida (entry.notes[sectionId] continua uma string simples). O
     "salvo há X segundos" e o controle de alterações pendentes são
     propositalmente EFÊMEROS (não vão pro localStorage) — o que precisa
     sobreviver a um reload é o texto em si, que já é salvo normalmente. */
  const AUTOSAVE_DEBOUNCE_MS = 800;
  const debounceTimers = {};   // sectionId -> timeoutId
  const pendingSaves = new Set(); // sectionId com digitação ainda não salva
  const lastSavedAt = {};      // sectionId -> timestamp (ms) do último save
  let tickIntervalId = null;

  function formatSavedAgo(ms) {
    const diff = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (diff < 5) return 'Salvo agora mesmo.';
    if (diff < 60) return 'Salvo há ' + diff + ' segundos.';
    const min = Math.round(diff / 60);
    return 'Salvo há ' + min + ' ' + (min === 1 ? 'minuto.' : 'minutos.');
  }

  function paintSavedIndicator(sectionId) {
    const el = document.querySelector('[data-saved="' + sectionId + '"]');
    if (!el) return;
    if (pendingSaves.has(sectionId)) { el.textContent = 'Salvando…'; return; }
    if (lastSavedAt[sectionId]) el.textContent = formatSavedAgo(lastSavedAt[sectionId]);
  }

  function ensureTicking() {
    if (tickIntervalId) return;
    tickIntervalId = setInterval(function () {
      Object.keys(lastSavedAt).forEach(paintSavedIndicator);
    }, 5000);
  }

  function flushSave(projectId, sectionId, value) {
    delete debounceTimers[sectionId];
    pendingSaves.delete(sectionId);
    P().setProjectNote(projectId, sectionId, value);
    lastSavedAt[sectionId] = Date.now();
    paintSavedIndicator(sectionId);
    ensureTicking();
  }

  function scheduleSave(projectId, sectionId, value) {
    pendingSaves.add(sectionId);
    paintSavedIndicator(sectionId);
    clearTimeout(debounceTimers[sectionId]);
    debounceTimers[sectionId] = setTimeout(function () {
      flushSave(projectId, sectionId, value);
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  /** Só avisa ao sair se houver digitação real ainda não salva. */
  window.addEventListener('beforeunload', function (event) {
    if (pendingSaves.size === 0) return;
    event.preventDefault();
    event.returnValue = '';
  });

  function projectCard(project) {
    const st = P().projectState(project.id);
    const mod = MIA.get.module(project.module);
    const locked = st.state === 'locked';
    return '<a class="card skill-card" href="' + (locked ? '#/projetos' : '#/projeto/' + project.id) + '"' +
      (locked ? ' aria-disabled="true"' : '') + '>' +
      '<div class="skill-card__top"><div>' +
        '<span class="skill-card__n">Projeto ' + String(project.n).padStart(2, '0') + '</span>' +
        '<h3>' + ui.escapeHtml(project.title) + '</h3></div>' +
        ui.stateBadge(st.state) +
      '</div>' +
      '<p>' + ui.escapeHtml(project.summary) + '</p>' +
      '<p class="small muted">Módulo: ' + ui.escapeHtml(mod ? mod.title : project.module) + ' · ' +
        ui.escapeHtml((project.technologies || []).join(', ')) + '</p>' +
      '<div class="skill-card__foot">' + ui.levelBadge(project.level) +
        '<span class="badge badge--purple">+' + project.xp + ' XP</span>' +
        (project.skills || []).slice(0, 2).map(function (s) {
          const sk = MIA.get.skill(s);
          return sk ? '<span class="badge">🧩 ' + ui.escapeHtml(sk.name) + '</span>' : '';
        }).join('') +
      '</div>' +
      (st.total ? '<div style="margin-top:12px">' + ui.bar(st.progress, ui.LEVEL_TONE[project.level]) + '</div>' : '') +
    '</a>';
  }

  function renderLibrary() {
    const all = MIA.get.allProjects();
    const list = all.filter(function (p) {
      if (levelFilter.level && p.level !== levelFilter.level) return false;
      if (levelFilter.status && P().projectState(p.id).state !== levelFilter.status) return false;
      return true;
    });

    const groups = [
      { level: 'iniciante', title: 'Iniciante' },
      { level: 'intermediario', title: 'Intermediário' },
      { level: 'avancado', title: 'Avançado' }
    ];

    let html = '<div class="page-head"><p class="eyebrow">Camada 2 — Construção</p><h1>Projetos</h1>' +
      '<p>' + ui.escapeHtml(MIA.data.projects.meta.sourceNote) + '</p></div>';

    html += '<div class="filters" style="grid-template-columns:repeat(2,minmax(0,1fr))">' +
      '<div class="field"><label for="p-level">Nível</label><select id="p-level" data-pfilter="level">' +
        '<option value="">Todos</option>' +
        ['iniciante', 'intermediario', 'avancado'].map(function (l) {
          return '<option value="' + l + '"' + (levelFilter.level === l ? ' selected' : '') + '>' + ui.LEVEL_LABEL[l] + '</option>';
        }).join('') + '</select></div>' +
      '<div class="field"><label for="p-status">Status</label><select id="p-status" data-pfilter="status">' +
        '<option value="">Todos</option>' +
        [['available', 'Disponível'], ['in_progress', 'Em andamento'], ['completed', 'Concluído'], ['locked', 'Bloqueado']].map(function (s) {
          return '<option value="' + s[0] + '"' + (levelFilter.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
        }).join('') + '</select></div>' +
    '</div>';

    groups.forEach(function (g) {
      const items = list.filter(function (p) { return p.level === g.level; });
      if (!items.length) return;
      html += '<section style="margin-bottom:32px"><h2>' + g.title + '</h2>' +
        '<div class="grid grid--3">' + items.map(projectCard).join('') + '</div></section>';
    });

    if (!list.length) html += '<div class="empty">Nenhum projeto com esses filtros.</div>';
    return html;
  }

  function noteField(project, section, entry) {
    const value = (entry.notes && entry.notes[section.id]) || '';
    const recovered = value.trim().length > 0 ? 'Recuperado de onde você parou.' : '';
    return '<section class="card" id="ws-' + section.id + '">' +
      '<p class="card__label">' + ui.escapeHtml(section.label) + '</p>' +
      (section.hint ? '<p class="small muted">' + ui.escapeHtml(section.hint) + '</p>' : '') +
      '<div class="field"><label class="sr-only" for="note-' + section.id + '">' + ui.escapeHtml(section.label) + '</label>' +
      '<textarea id="note-' + section.id + '" data-note="' + section.id + '">' + ui.escapeHtml(value) + '</textarea></div>' +
      '<p class="small muted" data-saved="' + section.id + '">' + recovered + '</p>' +
    '</section>';
  }

  function renderWorkspace(id) {
    const project = MIA.get.project(id);
    if (!project) return '<div class="empty">Projeto não encontrado. <a href="#/projetos">Voltar</a>.</div>';

    const st = P().projectState(id);
    const entry = P().projectEntry(id);
    const mod = MIA.get.module(project.module);

    if (st.state === 'locked') {
      return '<div class="empty"><h1>Projeto bloqueado</h1>' +
        '<p>Ele depende do módulo <strong>' + ui.escapeHtml(mod.title) + '</strong>, que ainda não foi liberado.</p>' +
        '<a class="btn btn--primary" href="#/jornada">Ver o mapa da jornada</a></div>';
    }

    const sections = MIA.data.projects.meta.workspaceSections;
    let html = '<article class="stack" data-project="' + id + '">';

    html += '<header>' +
      '<p class="lesson__crumbs">Projeto ' + String(project.n).padStart(2, '0') + ' · ' + ui.escapeHtml(mod.title) + '</p>' +
      '<h1>' + ui.escapeHtml(project.title) + '</h1>' +
      '<p class="muted">' + ui.escapeHtml(project.summary) + '</p>' +
      '<div class="row">' + ui.levelBadge(project.level) + ui.stateBadge(st.state) +
        '<span class="badge badge--purple">+' + project.xp + ' XP</span></div>' +
      '<div style="margin-top:16px">' + ui.bar(st.progress, ui.LEVEL_TONE[project.level]) + '</div>' +
    '</header>';

    if (project.warning) {
      html += '<div class="card" style="border-color:var(--amber)"><p class="card__label">Atenção</p><p>' +
        ui.escapeHtml(project.warning) + '</p></div>';
    }

    html += '<nav class="workspace__nav" aria-label="Seções do projeto">' +
      sections.map(function (s) {
        return '<button class="btn btn--sm btn--ghost" data-scroll="ws-' + s.id + '">' + ui.escapeHtml(s.label) + '</button>';
      }).join('') + '</nav>';

    sections.forEach(function (section) {
      if (section.kind === 'data') {
        let body = '';
        if (section.id === 'objetivo') body = '<p>' + ui.escapeHtml(project.objective) + '</p>' +
          '<p class="small muted"><strong>Critério de aceite:</strong> ' + ui.escapeHtml(project.acceptance) + '</p>';
        if (section.id === 'requisitos') body = '<ul class="objectives">' + project.requirements.map(function (r) {
          return '<li>' + ui.escapeHtml(r) + '</li>'; }).join('') + '</ul>';
        if (section.id === 'arquitetura') body = '<p>' + ui.escapeHtml(project.architecture) + '</p>';
        if (section.id === 'tecnologias') body = '<div class="row">' + project.technologies.map(function (t) {
          return '<span class="badge">' + ui.escapeHtml(t) + '</span>'; }).join('') + '</div>';
        if (section.id === 'skills') body = (project.skills || []).length
          ? '<div class="row">' + project.skills.map(function (s) {
              const sk = MIA.get.skill(s);
              const done = P().skillState(s) === 'dominada';
              return sk ? '<a class="badge ' + (done ? 'badge--green' : 'badge--blue') + '" href="#/skill/' + s + '">🧩 ' +
                ui.escapeHtml(sk.name) + '</a>' : '';
            }).join('') + '</div>'
          : '<p class="muted">Nenhuma Skill obrigatória.</p>';

        html += '<section class="card" id="ws-' + section.id + '"><p class="card__label">' +
          ui.escapeHtml(section.label) + '</p>' + body + '</section>';
        return;
      }

      if (section.kind === 'tasks') {
        html += '<section class="card" id="ws-tarefas"><p class="card__label">Tarefas</p>' +
          '<ul class="tasks">' + project.tasks.map(function (t, i) {
            return '<li><input type="checkbox" id="task-' + i + '" data-task="' + i + '"' +
              (entry.tasks[i] ? ' checked' : '') + '><label for="task-' + i + '">' + ui.escapeHtml(t) + '</label></li>';
          }).join('') + '</ul>' +
          '<p class="small muted">' + st.done + ' de ' + st.total + ' concluídas.</p></section>';
        return;
      }

      html += noteField(project, section, entry);
    });

    const notesOk = ['resultado', 'portfolio'].every(function (k) { return (entry.notes[k] || '').trim().length > 20; });
    const tasksOk = st.done === st.total && st.total > 0;
    const canComplete = notesOk && tasksOk;

    html += '<footer class="card card--accent"><p class="card__label">Conclusão</p>' +
      (entry.status === 'concluido'
        ? '<p>Projeto concluído em ' + ui.formatDate(entry.completedAt) + '. XP creditado: ' + project.xp + '.</p>' +
          '<button class="btn btn--sm" data-action="reopen">Reabrir projeto</button>'
        : '<p>Para concluir, todas as tarefas precisam estar marcadas e as seções <strong>Resultado</strong> e ' +
          '<strong>Portfólio</strong> preenchidas — evidência, não apenas um clique.</p>' +
          '<ul class="small muted"><li>' + (tasksOk ? '✓' : '○') + ' Tarefas: ' + st.done + '/' + st.total + '</li>' +
          '<li>' + (notesOk ? '✓' : '○') + ' Resultado e portfólio escritos</li></ul>' +
          '<button class="btn btn--primary" data-action="complete"' + (canComplete ? '' : ' disabled') + '>Concluir projeto (+' + project.xp + ' XP)</button>') +
    '</footer>';

    html += '</article>';
    return html;
  }

  function bindLibrary(root) {
    root.addEventListener('change', function (event) {
      const field = event.target.closest('[data-pfilter]');
      if (!field) return;
      levelFilter[field.dataset.pfilter] = field.value;
      MIA.app.render();
    });
  }

  // A view inteira é recriada (root.innerHTML) a cada navegação, mas o `root`
  // (o <main> fixo) é o mesmo elemento — então os listeners abaixo são
  // registrados UMA VEZ e ficam lendo `currentProjectId` a cada evento, em
  // vez de fechar sobre o `id` do momento em que foram anexados. Sem isso,
  // visitar dois projetos na mesma sessão empilha um listener por visita, e
  // digitar no projeto B também dispara o listener antigo do projeto A —
  // salvando o texto de B dentro do projeto A. Ficou mais importante ainda
  // de evitar agora que a digitação passou a salvar sozinha (ver abaixo).
  let currentProjectId = null;

  function bindWorkspace(root, id) {
    currentProjectId = id;
    if (root.__miaWorkspaceBound) return;
    root.__miaWorkspaceBound = true;

    root.addEventListener('change', function (event) {
      const task = event.target.closest('[data-task]');
      if (!task) return;
      const pid = currentProjectId;
      P().toggleProjectTask(pid, Number(task.dataset.task), task.checked);
      MIA.app.refreshChrome();
      const project = MIA.get.project(pid);
      const st = P().projectState(pid);
      const counter = root.querySelector('#ws-tarefas .small');
      if (counter) counter.textContent = st.done + ' de ' + st.total + ' concluídas.';
      if (st.done === project.tasks.length) ui.toast('Todas as tarefas concluídas. Escreva o resultado e o portfólio.');
    });

    root.addEventListener('input', function (event) {
      const note = event.target.closest('[data-note]');
      if (!note) return;
      scheduleSave(currentProjectId, note.dataset.note, note.value);
    });

    // blur não borbulha — precisa de captura. Sempre salva na hora (flush),
    // cancelando qualquer debounce pendente daquela seção: cobre o caso de
    // sair do campo antes dos 800ms do autosave.
    root.addEventListener('blur', function (event) {
      const note = event.target.closest('[data-note]');
      if (!note) return;
      clearTimeout(debounceTimers[note.dataset.note]);
      flushSave(currentProjectId, note.dataset.note, note.value);
    }, true);

    root.addEventListener('click', function (event) {
      const jump = event.target.closest('[data-scroll]');
      if (jump) {
        const target = document.getElementById(jump.dataset.scroll);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          const field = target.querySelector('textarea, input');
          if (field) field.focus({ preventScroll: true });
        }
        return;
      }
      const btn = event.target.closest('[data-action]');
      if (!btn) return;
      const pid = currentProjectId;
      if (btn.dataset.action === 'complete') {
        const xp = P().completeProject(pid);
        ui.toast(xp ? '+' + xp + ' XP — projeto concluído!' : 'Projeto concluído.');
        MIA.app.render();
      }
      if (btn.dataset.action === 'reopen') {
        P().reopenProject(pid);
        MIA.app.render();
      }
    });
  }

  MIA.projects = {
    renderLibrary: renderLibrary,
    renderWorkspace: renderWorkspace,
    bindLibrary: bindLibrary,
    bindWorkspace: bindWorkspace,
    AUTOSAVE_DEBOUNCE_MS: AUTOSAVE_DEBOUNCE_MS,
    hasPendingSaves: function () { return pendingSaves.size > 0; }
  };
})(window.MIA);
