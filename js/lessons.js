/* lessons.js — correção dos exercícios e páginas de aula. */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  const ui = MIA.ui;
  const P = function () { return MIA.progress; };

  /* ======================= CORREÇÃO ======================= */

  const EVAL_NOTE = 'Correção automática local (heurística), sem IA. Ela confere estrutura e ' +
    'palavras-chave — não julga o mérito da sua ideia.';

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function gradeQuiz(exercise, selected) {
    const correct = selected === exercise.answer;
    return {
      score: correct ? 100 : 0,
      correct: correct,
      strengths: correct ? ['Alternativa correta.'] : [],
      improvements: correct ? [] : ['Reveja o conceito antes de seguir: a alternativa escolhida não se sustenta.'],
      explain: exercise.explain || ''
    };
  }

  function gradeOpen(exercise, text) {
    const rubric = exercise.rubric || {};
    const norm = ui.normalize(text);
    const words = ui.countWords(text);
    const minWords = rubric.minWords || 30;
    const keywords = rubric.keywords || [];
    const structure = rubric.structure || [];

    const hits = keywords.filter(function (k) { return norm.indexOf(ui.normalize(k)) !== -1; });
    const missing = keywords.filter(function (k) { return norm.indexOf(ui.normalize(k)) === -1; });
    const structHits = structure.filter(function (k) { return norm.indexOf(ui.normalize(k)) !== -1; });

    const lengthRatio = clamp(words / minWords, 0, 1);
    const lengthScore = lengthRatio * 30;
    const keyScore = keywords.length ? (hits.length / keywords.length) * 45 : lengthRatio * 45;
    const structScore = structure.length ? (structHits.length / structure.length) * 15 : lengthRatio * 15;

    let detail = 0;
    if (/\d/.test(text)) detail += 4;
    if (/\n|(^|\s)[-*\d]\s|:/.test(text)) detail += 3;
    if (words >= minWords * 1.5) detail += 3;

    let score = Math.round(lengthScore + keyScore + structScore + detail);
    if (words < 8) score = Math.min(score, 25);
    score = clamp(score, 0, 100);

    const strengths = [];
    const improvements = [];

    if (words >= minWords) strengths.push('Extensão adequada: ' + ui.plural(words, 'palavra', 'palavras') + '.');
    else improvements.push('Desenvolva mais: você escreveu ' + ui.plural(words, 'palavra', 'palavras') +
      ' e o exercício pede pelo menos ' + minWords + '.');

    // O feedback dá resultado e orientação, não a rubrica interna: nunca nomeia
    // qual keyword/estrutura faltou ou bateu — só sinaliza que falta aprofundar.
    // O cálculo de score acima usa hits/missing/structHits normalmente; só o
    // TEXTO deixa de enumerá-los (PR #7 — fechar vazamento de evidência).
    if (hits.length) strengths.push('Sua resposta contempla parte dos pontos esperados.');
    if (missing.length) improvements.push('Aprofunde a explicação dos conceitos centrais que o exercício pede.');
    if (structure.length && structHits.length < structure.length) {
      improvements.push('Inclua exemplos ou relações entre os conceitos quando fizer sentido.');
    }
    if (/\d/.test(text)) strengths.push('Você usou dado concreto — isso separa resposta genérica de resposta útil.');
    else improvements.push('Acrescente algo concreto: um número, um prazo ou um exemplo do seu contexto.');

    return { score: score, strengths: strengths, improvements: improvements, explain: '' };
  }

  function runCheck(check, code) {
    switch (check.type) {
      case 'contains':
        return { ok: code.indexOf(check.value) !== -1, label: 'usar `' + check.value + '`' };
      case 'notContains':
        return { ok: code.indexOf(check.value) === -1, label: 'não conter `' + check.value + '`' };
      case 'regex':
        try { return { ok: new RegExp(check.value).test(code), label: 'seguir o padrão `' + check.value + '`' }; }
        catch (e) { return { ok: true, label: 'padrão inválido' }; }
      case 'json':
        try { JSON.parse(code); return { ok: true, label: 'ser um JSON válido' }; }
        catch (e) { return { ok: false, label: 'ser um JSON válido' }; }
      case 'hasKeys': {
        let parsed = null;
        try { parsed = JSON.parse(code); } catch (e) { /* json inválido já é reportado */ }
        const missing = parsed && typeof parsed === 'object'
          ? check.keys.filter(function (k) { return !(k in parsed); })
          : check.keys;
        return { ok: missing.length === 0, label: 'ter as chaves: ' + check.keys.join(', ') };
      }
      default:
        return { ok: true, label: 'verificação desconhecida' };
    }
  }

  function gradeCode(exercise, code) {
    const checks = exercise.checks || [];
    if (!checks.length) return gradeOpen(exercise, code);

    const results = checks.map(function (c) { return runCheck(c, code); });
    const passed = results.filter(function (r) { return r.ok; });
    const failed = results.filter(function (r) { return !r.ok; });
    const score = Math.round((passed.length / results.length) * 100);

    return {
      score: score,
      strengths: passed.length ? ['Verificações que passaram: ' + passed.map(function (r) { return r.label; }).join('; ') + '.'] : [],
      improvements: failed.length ? ['Ainda falta: ' + failed.map(function (r) { return r.label; }).join('; ') + '.'] : [],
      explain: 'Esta verificação confere a estrutura do código por padrões — ela não executa o programa.'
    };
  }

  function grade(exercise, answer) {
    if (exercise.type === 'quiz') return gradeQuiz(exercise, answer);
    if (exercise.type === 'code') return gradeCode(exercise, String(answer || ''));
    return gradeOpen(exercise, String(answer || ''));
  }

  /* ======================= LISTA DE AULAS ======================= */

  function lessonRow(lesson) {
    const st = P().lessonState(lesson.id);
    const locked = st.state === 'locked';
    const href = locked ? '#/aulas' : '#/aula/' + lesson.id;
    return '<li>' +
      '<div class="row row--between">' +
        '<div style="min-width:0">' +
          '<a href="' + href + '"' + (locked ? ' aria-disabled="true" tabindex="-1"' : '') + '><strong>' + ui.escapeHtml(lesson.title) + '</strong></a>' +
          '<div class="small muted">' + lesson.duration + ' min · ' +
            ui.plural((lesson.exercises || []).length, 'exercício', 'exercícios') +
            (st.total ? ' · ' + st.done + '/' + st.total + ' respondidos' : '') + '</div>' +
        '</div>' +
        '<div class="row">' + (st.score ? ui.scoreBadge(st.score) : '') + ui.stateBadge(st.state) + '</div>' +
      '</div>' +
    '</li>';
  }

  function moduleCard(m) {
    const st = P().moduleState(m.id);
    const blockers = P().moduleBlockers(m.id);
    return '<section class="card">' +
      '<div class="row row--between" style="align-items:flex-start">' +
        '<div style="min-width:0">' +
          '<p class="card__label">' + ui.phaseLabel(m) + '</p>' +
          '<h2 style="margin-bottom:4px">' + m.icon + ' ' + ui.escapeHtml(m.title) + '</h2>' +
          '<p class="muted small" style="margin:0">' + ui.escapeHtml(m.subtitle) + '</p>' +
        '</div>' +
        '<div class="row">' + ui.levelBadge(m.level) + ui.stateBadge(st.state) + '</div>' +
      '</div>' +
      '<div style="margin:16px 0">' + ui.bar(st.progress, ui.LEVEL_TONE[m.level]) + '</div>' +
      (blockers.length
        ? '<p class="small muted">🔒 Para liberar: dominar ' + blockers.map(function (b) {
            return b.needed + ' de ' + b.total + ' aulas de <strong>' + ui.escapeHtml(b.title) + '</strong> (você tem ' + b.mastered + ')';
          }).join(' e ') + '.</p>'
        : '<ul class="list">' + m.lessons.map(lessonRow).join('') + '</ul>') +
    '</section>';
  }

  function renderLessonsPage() {
    const modules = MIA.get.modules();
    const pilots = modules.filter(function (m) { return m.pilot; });
    const order = MIA.get.personalizedModules(P());

    let html = '<div class="page-head"><p class="eyebrow">Camada 1 — Aprendizado</p><h1>Aulas</h1>' +
      '<p>' + ui.escapeHtml(MIA.data.curriculum.meta.pedagogy) + ' Cada aula só é considerada dominada com evidência: ' +
      'exercício respondido e nota a partir de ' + (MIA.data.curriculum.masteryThreshold || 80) + '.</p></div>';

    if (order.hasTrack) {
      html += '<p class="card__label">Seu objetivo: ' + ui.escapeHtml(order.trackLabel) +
        ' · <a href="#/perfil">mudar</a></p>';
      html += '<div class="stack">' + order.track.map(moduleCard).join('') + '</div>';
      if (order.rest.length) {
        html += '<h2 style="margin-top:32px">Outras fases da trilha Mestre IA</h2>';
        html += '<div class="stack">' + order.rest.map(moduleCard).join('') + '</div>';
      }
    } else {
      html += '<div class="stack">' + order.rest.map(moduleCard).join('') + '</div>';
    }

    if (pilots.length) {
      const pilotMeta = MIA.data.curriculum.meta.pilotPrograms;
      html += '<div class="stack" style="margin-top:32px">' +
        '<section class="card" style="border-style:dashed"><p class="card__label">🧪 Trilhas piloto — fora do tema IA</p>' +
        (pilotMeta ? '<p class="small">' + ui.escapeHtml(pilotMeta.intro) + '</p>' : '') +
        '</section>' +
        pilots.map(moduleCard).join('') +
      '</div>';
    }

    return html;
  }

  /* ======================= PÁGINA DE AULA ======================= */

  function exerciseTypeLabel(type) {
    return { quiz: 'Quiz', open: 'Resposta aberta', practice: 'Prática', code: 'Código', challenge: 'Desafio', project: 'Projeto' }[type] || type;
  }

  function renderExercise(lesson, exercise, index) {
    const entry = P().state.lessons[lesson.id];
    const rec = entry && entry.exercises ? entry.exercises[exercise.id] : null;
    // "Tentar de novo" não apaga mais o histórico (PR #8) — retrying é o sinal
    // de que o aluno está numa nova oportunidade de resposta; enquanto ele
    // durar, a UI se comporta como se não houvesse resposta ainda (campo em
    // branco, sem nota exibida), embora o histórico continue preservado.
    const retrying = !!(entry && entry.retrying && entry.retrying[exercise.id]);
    const answered = !!rec && !retrying;

    let body = '';
    if (exercise.type === 'quiz') {
      body = '<div class="options" role="radiogroup" aria-label="Alternativas">' +
        exercise.options.map(function (opt, i) {
          return '<label class="option" data-option="' + i + '">' +
            '<input type="radio" name="' + exercise.id + '" value="' + i + '"' +
              (answered && rec.answer === i ? ' checked' : '') + '>' +
            '<span>' + ui.escapeHtml(opt) + '</span></label>';
        }).join('') + '</div>';
    } else if (exercise.type === 'code') {
      body = '<div class="field">' +
        '<label for="in-' + exercise.id + '">Seu código <span class="hint">(' + (exercise.language || 'texto') + ')</span></label>' +
        '<textarea class="code" id="in-' + exercise.id + '" spellcheck="false">' +
        ui.escapeHtml(answered && rec.answer !== undefined ? rec.answer : (exercise.starter || '')) + '</textarea></div>';
    } else {
      body = '<div class="field">' +
        '<label for="in-' + exercise.id + '">Sua resposta</label>' +
        '<textarea id="in-' + exercise.id + '" placeholder="Escreva aqui. Respostas concretas, com exemplo do seu contexto, valem mais.">' +
        ui.escapeHtml(answered && rec.answer !== undefined ? rec.answer : '') + '</textarea></div>';
    }

    return '<article class="exercise" id="ex-' + exercise.id + '" data-exercise="' + exercise.id + '">' +
      '<div class="exercise__head">' +
        '<span class="badge">' + (index + 1) + ' · ' + exerciseTypeLabel(exercise.type) + '</span>' +
        '<span class="row">' + (answered ? ui.scoreBadge(rec.score) : '') +
          '<span class="badge badge--purple">+' + (exercise.xp || 30) + ' XP</span></span>' +
      '</div>' +
      '<p class="exercise__q">' + ui.escapeHtml(exercise.question) + '</p>' +
      body +
      '<div class="row">' +
        '<button class="btn btn--primary" data-action="submit" data-exercise="' + exercise.id + '">Enviar</button>' +
        (answered ? '<button class="btn btn--ghost btn--sm" data-action="retry" data-exercise="' + exercise.id + '">Tentar de novo</button>' : '') +
      '</div>' +
      '<div class="feedback-slot" id="fb-' + exercise.id + '"></div>' +
    '</article>';
  }

  function renderFeedback(exercise, result) {
    const g = MIA.get.grading(result.score) || { label: '' };
    let html = '<div class="feedback">' +
      '<p class="card__label">Feedback</p>' +
      '<div class="feedback__score"><b>' + result.score + '</b><span class="muted">/100 · ' + ui.escapeHtml(g.label) + '</span></div>';

    if (result.strengths && result.strengths.length) {
      html += '<h4>Pontos fortes</h4><ul>' + result.strengths.map(function (s) { return '<li>' + ui.escapeHtml(s) + '</li>'; }).join('') + '</ul>';
    }
    if (result.improvements && result.improvements.length) {
      html += '<h4>Pontos a melhorar</h4><ul>' + result.improvements.map(function (s) { return '<li>' + ui.escapeHtml(s) + '</li>'; }).join('') + '</ul>';
    }
    if (result.explain) html += '<p class="small">' + ui.escapeHtml(result.explain) + '</p>';
    if (result.score < 80) {
      html += '<div class="row" style="margin-top:12px">' +
        '<button class="btn btn--sm" data-action="register-error" data-exercise="' + exercise.id + '">Registrar em “Meus erros”</button></div>';
    }
    html += '<p class="small muted" style="margin-top:12px">' + ui.escapeHtml(EVAL_NOTE) + '</p></div>';
    return html;
  }

  function renderLessonPage(id) {
    const lesson = MIA.get.lesson(id);
    if (!lesson) return '<div class="empty">Aula não encontrada. <a href="#/aulas">Voltar para as aulas</a>.</div>';

    const mod = MIA.get.moduleOfLesson(id);
    const st = P().lessonState(id);
    if (st.state === 'locked') {
      const blockers = P().moduleBlockers(mod.id);
      return '<div class="empty"><h1>Aula bloqueada</h1>' +
        '<p>Esta aula pertence ao módulo <strong>' + ui.escapeHtml(mod.title) + '</strong>, que ainda não foi liberado.</p>' +
        (blockers.length ? '<p>Domine antes: ' + blockers.map(function (b) { return ui.escapeHtml(b.title); }).join(', ') + '.</p>' : '') +
        '<a class="btn btn--primary" href="#/jornada">Ver o mapa da jornada</a></div>';
    }

    const index = mod.lessons.findIndex(function (l) { return l.id === id; });
    const next = mod.lessons[index + 1] || null;
    const percent = st.total ? Math.round((st.done / st.total) * 100) : (st.read ? 100 : 0);

    // data-lesson-page marca o contêiner desta página e é o que delimita o
    // alcance do listener de aula (ver bindLessonPage): sem isso ele capturaria
    // cliques em controles iguais renderizados por outra rota.
    let html = '<article class="lesson stack" data-lesson="' + id + '" data-lesson-page="' + id + '">';

    html += '<header>' +
      '<p class="lesson__crumbs">' + ui.phaseLabel(mod) + ' · ' + ui.escapeHtml(mod.title) + ' · Aula ' + String(index + 1).padStart(2, '0') + '</p>' +
      '<h1>' + ui.escapeHtml(lesson.title) + '</h1>' +
      '<div class="row">' + ui.levelBadge(lesson.level) + '<span class="badge">' + lesson.duration + ' min</span>' +
        ui.stateBadge(st.state) + (st.score ? ui.scoreBadge(st.score) : '') + '</div>' +
      '<div style="margin-top:16px">' + ui.bar(percent, ui.LEVEL_TONE[lesson.level]) + '</div>' +
    '</header>';

    html += '<section class="card"><p class="card__label">Objetivo</p>' +
      '<p>Ao final desta aula você será capaz de:</p>' +
      '<ul class="objectives">' + lesson.objectives.map(function (o) { return '<li>' + ui.escapeHtml(o) + '</li>'; }).join('') + '</ul></section>';

    html += '<section class="prose">';
    (lesson.blocks || []).forEach(function (b) {
      html += '<div class="lesson-block lesson-block--' + (b.type || 'concept') + '">' +
        '<h3>' + ui.escapeHtml(b.title || 'Conceito') + '</h3>' +
        ui.sourceTag(b.source) +
        ui.md(b.body) +
      '</div>';
    });
    html += '</section>';

    if ((lesson.skills || []).length) {
      html += '<section class="card"><p class="card__label">Skills relacionadas</p><div class="row">' +
        lesson.skills.map(function (sid) {
          const s = MIA.get.skill(sid);
          return s ? '<a class="badge badge--blue" href="#/skill/' + s.id + '">🧩 ' + ui.escapeHtml(s.name) + '</a>' : '';
        }).join('') + '</div></section>';
    }

    html += '<section><h2>Tente você</h2>' +
      '<p class="muted small">A nota vem de uma correção automática local — sem IA. Ela verifica estrutura e cobertura dos pontos esperados.</p>' +
      (lesson.exercises || []).map(function (ex, i) { return renderExercise(lesson, ex, i); }).join('') +
    '</section>';

    html += '<footer class="card card--accent"><div class="row row--between">' +
      '<div><p class="card__label">Próxima etapa</p>' +
      (next ? '<strong>' + ui.escapeHtml(next.title) + '</strong>' : '<strong>Checkpoint do módulo ' + ui.escapeHtml(mod.title) + '</strong>') + '</div>' +
      (next
        ? '<a class="btn btn--primary" href="#/aula/' + next.id + '">Próxima aula →</a>'
        : '<a class="btn btn--primary" href="#/checkpoint/' + mod.id + '">Ir para o checkpoint →</a>') +
    '</div></footer>';

    html += '</article>';
    return html;
  }

  /* ---- interações da página de aula ---- */

  function readAnswer(exercise) {
    if (exercise.type === 'quiz') {
      const checked = document.querySelector('input[name="' + exercise.id + '"]:checked');
      return checked ? Number(checked.value) : null;
    }
    const field = document.getElementById('in-' + exercise.id);
    return field ? field.value : '';
  }

  function paintQuiz(exercise, selected) {
    const node = document.getElementById('ex-' + exercise.id);
    if (!node) return;
    ui.qsa('.option', node).forEach(function (opt) {
      const i = Number(opt.dataset.option);
      if (i === exercise.answer) opt.dataset.state = 'correct';
      else if (i === selected) opt.dataset.state = 'wrong';
      else delete opt.dataset.state;
    });
  }

  function bindLessonPage(root, lessonId) {
    const lesson = MIA.get.lesson(lessonId);
    if (!lesson) return;

    P().markRead(lessonId);

    // reexibe feedback de exercícios já respondidos (mas não durante um retry:
    // entry.retrying sinaliza que o aluno está numa tentativa nova, então a
    // tela deve ficar como se ainda não houvesse resposta, mesmo com o
    // histórico preservado por baixo)
    (lesson.exercises || []).forEach(function (ex) {
      const entry = P().state.lessons[lessonId];
      const rec = entry && entry.exercises ? entry.exercises[ex.id] : null;
      const retrying = !!(entry && entry.retrying && entry.retrying[ex.id]);
      if (!rec || retrying) return;
      // o corpo do feedback vem da resposta guardada; a melhor nota fica no cabeçalho
      const result = grade(ex, rec.answer);
      const slot = document.getElementById('fb-' + ex.id);
      if (slot) {
        slot.innerHTML = renderFeedback(ex, result) +
          (rec.score > result.score
            ? '<p class="small muted">Sua melhor nota neste exercício foi ' + rec.score +
              '/100, em uma tentativa anterior.</p>'
            : '');
      }
      if (ex.type === 'quiz') paintQuiz(ex, rec.answer);
    });

    ui.bindOnce(root, 'lessonPage', function () {
      root.addEventListener('click', function (event) {
        const btn = event.target.closest('[data-action]');
        if (!btn) return;
        const exercise = MIA.get.exercise(btn.dataset.exercise);
        if (!exercise) return;

        // O listener vive no <main> permanente, que também hospeda as outras
        // rotas. "Registrar em Meus erros" vem de renderFeedback, compartilhado
        // com a Revisão — sem esta guarda, um clique lá dentro era capturado
        // aqui também e criava um segundo erro, com a aula errada. O contêiner
        // é a fonte do id: só age quando o clique nasceu DENTRO desta página,
        // e sempre com a aula a que o botão realmente pertence.
        const host = btn.closest('[data-lesson-page]');
        if (!host) return;
        const id = host.dataset.lessonPage;

        if (btn.dataset.action === 'submit') {
          const answer = readAnswer(exercise);
          if (exercise.type === 'quiz' && answer === null) { ui.toast('Escolha uma alternativa antes de enviar.'); return; }
          if (exercise.type !== 'quiz' && !String(answer).trim()) { ui.toast('Escreva sua resposta antes de enviar.'); return; }

          const result = grade(exercise, answer);
          const saved = P().recordExercise(id, exercise.id, { score: result.score, answer: answer });
          const slot = document.getElementById('fb-' + exercise.id);
          if (slot) {
            slot.innerHTML = renderFeedback(exercise, result);
            slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
          if (exercise.type === 'quiz') paintQuiz(exercise, answer);
          if (saved && saved.xp) ui.toast('+' + saved.xp + ' XP');
          if (result.score < 60 && exercise.type === 'quiz') {
            P().addError({
              concept: MIA.get.moduleOfLesson(id).title + ' — ' + MIA.get.lesson(id).title,
              error: exercise.question,
              correction: exercise.options ? exercise.options[exercise.answer] : '',
              example: exercise.explain || '',
              lessonId: id
            });
          }
          MIA.app.refreshChrome();
        }

        if (btn.dataset.action === 'retry') {
          P().resetExercise(id, exercise.id);
          MIA.app.render();
        }

        if (btn.dataset.action === 'register-error') {
          P().addError({
            concept: MIA.get.lesson(id).title,
            error: exercise.question,
            correction: exercise.options ? exercise.options[exercise.answer] : '',
            example: exercise.explain || '',
            lessonId: id
          });
          ui.toast('Registrado em Meus erros.');
        }
      });
    });
  }

  MIA.lessons = {
    grade: grade,
    renderLessonsPage: renderLessonsPage,
    renderLessonPage: renderLessonPage,
    renderFeedback: renderFeedback,
    bindLessonPage: bindLessonPage,
    EVAL_NOTE: EVAL_NOTE
  };
})(window.MIA);
