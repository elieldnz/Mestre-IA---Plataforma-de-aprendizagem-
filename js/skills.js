/* skills.js — Skill Explorer e página de uma Skill. */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  const ui = MIA.ui;
  const P = function () { return MIA.progress; };

  const filters = { category: '', confidence: '', level: '', query: '', status: '' };

  const STATUS = {
    'nao-estudada': { icon: '○', label: 'Não estudada', tone: 'muted' },
    'estudando': { icon: '◐', label: 'Estudando', tone: 'amber' },
    'dominada': { icon: '●', label: 'Dominada', tone: 'green' }
  };

  function confidenceBadge(conf) {
    return '<span class="badge badge--' + (ui.CONF_TONE[conf] || 'blue') + '">Confiança ' +
      (conf || '').toUpperCase() + '</span>';
  }

  function matches(skill) {
    if (filters.category && skill.category !== filters.category) return false;
    if (filters.confidence && skill.confidence !== filters.confidence) return false;
    if (filters.level && skill.level !== filters.level) return false;
    if (filters.status && P().skillState(skill.id) !== filters.status) return false;
    if (filters.query) {
      const q = ui.normalize(filters.query);
      const cat = MIA.get.skillCategory(skill.category);
      const haystack = ui.normalize([
        skill.name, skill.what, skill.when, skill.objective, (skill.tags || []).join(' '),
        cat ? cat.name + ' ' + cat.objective : ''
      ].join(' '));
      if (haystack.indexOf(q) === -1) return false;
    }
    return true;
  }

  function skillCard(skill) {
    const status = P().skillState(skill.id);
    const cat = MIA.get.skillCategory(skill.category);
    return '<a class="card skill-card" href="#/skill/' + skill.id + '">' +
      '<div class="skill-card__top">' +
        '<div><span class="skill-card__n">' + String(skill.n).padStart(2, '0') + '</span>' +
          '<h3>' + ui.escapeHtml(skill.name) + '</h3></div>' +
        '<span class="status-dot status-dot--' + STATUS[status].tone + '" title="' + STATUS[status].label +
          '" aria-label="' + STATUS[status].label + '">' + STATUS[status].icon + '</span>' +
      '</div>' +
      '<p class="small muted">' + ui.escapeHtml(cat ? cat.code + ' — ' + cat.name : '') + '</p>' +
      '<p>' + ui.escapeHtml(skill.objective || skill.what) + '</p>' +
      '<div class="skill-card__foot">' + confidenceBadge(skill.confidence) + ui.levelBadge(skill.level) + '</div>' +
    '</a>';
  }

  function selectField(id, label, value, options, placeholder) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<select id="' + id + '" data-filter="' + id.replace('f-', '') + '">' +
      '<option value="">' + placeholder + '</option>' +
      options.map(function (o) {
        return '<option value="' + o.value + '"' + (value === o.value ? ' selected' : '') + '>' + ui.escapeHtml(o.label) + '</option>';
      }).join('') + '</select></div>';
  }

  function renderExplorer() {
    const all = MIA.get.allSkills();
    const list = all.filter(matches);
    const counts = { dominada: 0, estudando: 0 };
    all.forEach(function (s) {
      const st = P().skillState(s.id);
      if (counts[st] !== undefined) counts[st]++;
    });

    let html = '<div class="page-head"><p class="eyebrow">Camada 2 — Construção</p><h1>Skill Explorer</h1>' +
      '<p>' + ui.escapeHtml(MIA.data.skills.meta.sourceNote) + '</p>' +
      '<p><strong>Escolha pela dor.</strong> Não instale por lista: descubra → avalie → escolha → instale → teste → use → combine → crie. ' +
      ui.sourceTag('material') + '</p></div>';

    html += '<div class="row" style="margin-bottom:16px">' +
      '<span class="badge badge--green">● ' + counts.dominada + ' dominadas</span>' +
      '<span class="badge badge--amber">◐ ' + counts.estudando + ' em estudo</span>' +
      '<span class="badge">Total: ' + all.length + '</span></div>';

    html += '<div class="filters">' +
      selectField('f-category', 'Categoria', filters.category,
        MIA.data.skills.categories.map(function (c) { return { value: c.id, label: c.code + ' — ' + c.name }; }), 'Todas') +
      selectField('f-confidence', 'Confiança', filters.confidence,
        MIA.data.skills.confidenceLevels.map(function (c) { return { value: c.id, label: c.label }; }), 'Todas') +
      selectField('f-level', 'Nível', filters.level,
        [{ value: 'iniciante', label: 'Iniciante' }, { value: 'intermediario', label: 'Intermediário' }, { value: 'avancado', label: 'Avançado' }], 'Todos') +
      '<div class="field"><label for="f-query">Objetivo ou palavra-chave</label>' +
      '<input type="text" id="f-query" data-filter="query" value="' + ui.escapeHtml(filters.query) + '" placeholder="Ex.: documentos, testes, pesquisa"></div>' +
    '</div>';

    if (filters.category || filters.confidence || filters.level || filters.query || filters.status) {
      html += '<div class="row" style="margin-bottom:16px"><button class="btn btn--sm btn--ghost" data-action="clear-filters">Limpar filtros</button>' +
        '<span class="muted small">' + ui.plural(list.length, 'Skill encontrada', 'Skills encontradas') + '</span></div>';
    }

    html += list.length
      ? '<div class="grid grid--3">' + list.map(skillCard).join('') + '</div>'
      : '<div class="empty">Nenhuma Skill com esses filtros. <button class="btn btn--sm" data-action="clear-filters">Limpar filtros</button></div>';

    return html;
  }

  function renderSkillPage(id) {
    const skill = MIA.get.skill(id);
    if (!skill) return '<div class="empty">Skill não encontrada. <a href="#/skills">Voltar ao explorer</a>.</div>';

    const cat = MIA.get.skillCategory(skill.category);
    const entry = P().skillEntry(skill.id);
    const status = entry.status;
    const studyList = MIA.data.skills.studyChecklist;
    const securityList = MIA.data.skills.securityChecklist;

    let html = '<article class="stack" data-skill="' + skill.id + '">';

    html += '<header>' +
      '<p class="lesson__crumbs">' + ui.escapeHtml(cat.code + ' — ' + cat.name) + '</p>' +
      '<h1>' + ui.escapeHtml(skill.name) + '</h1>' +
      '<div class="row">' + confidenceBadge(skill.confidence) + ui.levelBadge(skill.level) +
        '<span class="badge">' + STATUS[status].icon + ' ' + STATUS[status].label + '</span></div>' +
    '</header>';

    html += '<section class="card"><p class="card__label">Objetivo</p>' +
      (skill.objective
        ? '<p>' + ui.escapeHtml(skill.objective) + '</p>' + ui.sourceTag('material')
        : '<p>' + ui.escapeHtml(cat.objective) + '</p>' + ui.sourceTag('material') +
          '<p class="small muted">O material fornecido classifica esta Skill nesta categoria e neste nível de confiança; ' +
          'o objetivo específico acima é o da categoria.</p>') +
    '</section>';

    html += '<section class="card"><p class="card__label">O que é</p><div class="prose">' + ui.md(skill.what) + '</div>' +
      ui.sourceTag(skill.whatSource || 'complementar') + '</section>';

    if (skill.repo) {
      html += '<section class="card"><p class="card__label">Repositório oficial (citado no guia)</p>' +
        '<p><a href="' + ui.escapeHtml(skill.repo) + '" target="_blank" rel="noopener noreferrer">' +
        ui.escapeHtml(skill.repo) + '</a></p>' +
        (skill.repoNote ? '<p class="small muted">⚠ ' + ui.escapeHtml(skill.repoNote) + '</p>' : '') +
        '<p class="small muted">Este link vem do guia fornecido. Esta plataforma não instala Skills — ' +
        'abra o repositório e percorra o checklist de segurança abaixo antes de decidir.</p>' +
        ui.sourceTag('material') + '</section>';
    }

    html += '<section class="card"><p class="card__label">Quando utilizar</p><div class="prose">' + ui.md(skill.when) + '</div>' + ui.sourceTag('complementar') + '</section>';

    html += '<section class="card"><p class="card__label">Pré-requisitos</p>' +
      ((skill.prerequisites || []).length
        ? '<div class="row">' + skill.prerequisites.map(function (p) {
            const s = MIA.get.skill(p);
            const done = P().skillState(p) === 'dominada';
            return '<a class="badge ' + (done ? 'badge--green' : '') + '" href="#/skill/' + p + '">' +
              (done ? '● ' : '○ ') + ui.escapeHtml(s ? s.name : p) + '</a>';
          }).join('') + '</div>'
        : '<p class="muted">Nenhum. Você pode estudar esta Skill agora.</p>') +
    '</section>';

    html += '<section class="card"><p class="card__label">Exemplo</p><div class="prose">' + ui.md(skill.example) + '</div>' + ui.sourceTag('complementar') + '</section>';
    html += '<section class="card"><p class="card__label">Exercício</p><div class="prose">' + ui.md(skill.exercise) + '</div>' + ui.sourceTag('complementar') + '</section>';
    html += '<section class="card"><p class="card__label">Projeto</p><div class="prose">' + ui.md(skill.project) + '</div>' + ui.sourceTag('complementar') + '</section>';

    html += '<section class="card"><p class="card__label">Checklist de segurança antes de instalar</p>' +
      '<p class="small">' + ui.escapeHtml(MIA.data.skills.meta.installNote) + '</p>' +
      '<ul class="checklist">' + securityList.map(function (item, i) {
        return '<li><label><input type="checkbox" data-check="security" data-index="' + i + '"' +
          (entry.security[i] ? ' checked' : '') + '><span>' + ui.escapeHtml(item) + '</span></label></li>';
      }).join('') + '</ul>' + ui.sourceTag('material') +
      '<p class="small muted">Nunca recomendar instalação cegamente.</p>' +
    '</section>';

    html += '<section class="card"><p class="card__label">Checklist de estudo</p>' +
      '<ul class="checklist">' + studyList.map(function (item, i) {
        return '<li><label><input type="checkbox" data-check="study" data-index="' + i + '"' +
          (entry.checklist[i] ? ' checked' : '') + '><span>' + ui.escapeHtml(item) + '</span></label></li>';
      }).join('') + '</ul>' + ui.sourceTag('material') + '</section>';

    html += '<section class="card"><p class="card__label">Anotações</p>' +
      '<div class="field"><label class="sr-only" for="skill-notes">Anotações sobre esta Skill</label>' +
      '<textarea id="skill-notes" placeholder="O que você testou, o que funcionou, o que não funcionou.">' +
      ui.escapeHtml(entry.notes || '') + '</textarea></div>' +
      '<div class="row"><button class="btn btn--sm" data-action="save-notes">Salvar anotações</button></div></section>';

    html += '<footer class="card card--accent"><p class="card__label">Status desta Skill</p><div class="row">' +
      Object.keys(STATUS).map(function (key) {
        return '<button class="btn btn--sm" data-action="status" data-status="' + key + '"' +
          (status === key ? ' aria-pressed="true" disabled' : '') + '>' + STATUS[key].icon + ' ' + STATUS[key].label + '</button>';
      }).join('') + '</div>' +
      '<p class="small muted" style="margin-top:12px">Marcar como dominada vale +30 XP na primeira vez.</p></footer>';

    html += '</article>';
    return html;
  }

  function bindExplorer(root) {
    ui.bindOnce(root, 'skillExplorer', function () {
      root.addEventListener('input', function (event) {
        const field = event.target.closest('[data-filter]');
        if (!field) return;
        filters[field.dataset.filter] = field.value;
        if (field.tagName === 'SELECT') MIA.app.render();
        else {
          // busca por texto: re-renderiza sem perder o foco
          const grid = root.querySelector('.grid, .empty');
          const list = MIA.get.allSkills().filter(matches);
          if (grid) {
            grid.outerHTML = list.length
              ? '<div class="grid grid--3">' + list.map(skillCard).join('') + '</div>'
              : '<div class="empty">Nenhuma Skill com esses filtros.</div>';
          }
        }
      });

      root.addEventListener('click', function (event) {
        if (event.target.closest('[data-action="clear-filters"]')) {
          Object.keys(filters).forEach(function (k) { filters[k] = ''; });
          MIA.app.render();
        }
      });
    });
  }

  // Skill atualmente na tela — mesma razão do currentLessonId em lessons.js:
  // sem isso, marcar o checklist da Skill B gravava também na Skill A.
  let currentSkillId = null;

  function bindSkillPage(root, id) {
    currentSkillId = id;

    ui.bindOnce(root, 'skillPage', function () {
      root.addEventListener('change', function (event) {
        const box = event.target.closest('[data-check]');
        if (!box) return;
        if (!currentSkillId) return;
        P().toggleSkillCheck(currentSkillId, box.dataset.check, Number(box.dataset.index), box.checked);
        MIA.app.refreshChrome();
      });

      root.addEventListener('click', function (event) {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        if (!currentSkillId) return;
        if (btn.dataset.action === 'status') {
          P().setSkillStatus(currentSkillId, btn.dataset.status);
          ui.toast('Status atualizado.');
          MIA.app.render();
        }
        if (btn.dataset.action === 'save-notes') {
          const field = document.getElementById('skill-notes');
          P().skillEntry(currentSkillId).notes = field ? field.value : '';
          P().save();
          ui.toast('Anotações salvas.');
        }
      });
    });
  }

  MIA.skills = {
    renderExplorer: renderExplorer,
    renderSkillPage: renderSkillPage,
    bindExplorer: bindExplorer,
    bindSkillPage: bindSkillPage,
    filters: filters,
    setFilter: function (k, v) { filters[k] = v; }
  };
})(window.MIA);
