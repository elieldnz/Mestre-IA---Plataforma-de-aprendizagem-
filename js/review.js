/* review.js — revisão inteligente, registro de erros e plano de estudo do dia.

   A revisão tem duas evidências diferentes, e elas não valem o mesmo:
   - exercício real disponível → aluno responde → grade() → recordReview(score real).
   - sem exercício (só quando a aula não tem nenhum exercício elegível) → autorrelato
     de 3 botões, tratado na interface como fallback, não como evidência equivalente. */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  const ui = MIA.ui;
  const P = function () { return MIA.progress; };

  const RECALL = [
    { key: 'nao', label: 'Não lembrei', score: 40, tone: 'red' },
    { key: 'esforco', label: 'Lembrei com esforço', score: 72, tone: 'amber' },
    { key: 'bem', label: 'Lembrei bem', score: 95, tone: 'green' }
  ];

  function toneForScore(score) {
    return score < 60 ? 'red' : score < 80 ? 'amber' : score < 90 ? 'green' : 'blue';
  }

  /** Recuperação ativa: escolhe um exercício real da aula, nunca um ligado a um
   * erro ainda em aberto daquela mesma aula (senão a revisão devolveria ao
   * aluno a pergunta em que ele acabou de errar). Sem candidato limpo, cai no
   * fallback de autorrelato — ver comentário no topo do arquivo. */
  function recallPrompt(lesson) {
    const openErrors = (P().state.errors || [])
      .filter(function (e) { return e.lessonId === lesson.id && e.status !== 'resolvido'; })
      .map(function (e) { return e.error; });
    const all = (lesson.exercises || []).filter(function (e) { return e.type !== 'code'; });
    const pool = all.filter(function (e) { return openErrors.indexOf(e.question) === -1; });
    if (pool.length) {
      return { exercise: pool[Math.floor(Date.now() / 86400000) % pool.length], fallback: false };
    }
    return { exercise: null, fallback: true, text: 'Explique em voz alta, sem consultar: ' + lesson.objectives[0].toLowerCase() + '.' };
  }

  /** UI mínima de resposta para a recuperação ativa: rádio para quiz, textarea
   * para os demais tipos. Não reaproveita a renderização de lessons.js (não é
   * exportada) — só a correção (grade) e o feedback (renderFeedback) são reusados. */
  function recallInputField(exercise) {
    if (exercise.type === 'quiz') {
      return '<div class="options" role="radiogroup" aria-label="Alternativas">' +
        (exercise.options || []).map(function (opt, i) {
          return '<label class="option" data-option="' + i + '">' +
            '<input type="radio" name="recall-' + exercise.id + '" value="' + i + '">' +
            '<span>' + ui.escapeHtml(opt) + '</span></label>';
        }).join('') + '</div>';
    }
    return '<div class="field"><label for="recall-in-' + exercise.id + '">Sua resposta</label>' +
      '<textarea id="recall-in-' + exercise.id + '" data-recall-input="' + exercise.id + '" placeholder="Responda de cabeça, sem consultar."></textarea></div>';
  }

  function readRecallAnswer(card, exercise) {
    if (exercise.type === 'quiz') {
      const checked = card.querySelector('input[name="recall-' + exercise.id + '"]:checked');
      return checked ? Number(checked.value) : null;
    }
    const field = card.querySelector('[data-recall-input="' + exercise.id + '"]');
    return field ? field.value : '';
  }

  function renderReviewPage() {
    const due = P().dueReviews();
    const errors = P().state.errors.filter(function (e) { return e.status !== 'resolvido'; });
    const scheduled = Object.keys(P().state.reviews).length;

    let html = '<div class="page-head"><p class="eyebrow">Memória</p><h1>Revisão inteligente</h1>' +
      '<p>Recuperação ativa: tente lembrar antes de reabrir a aula. O intervalo da próxima revisão ' +
      'se ajusta ao quanto você lembrou.</p></div>';

    html += '<div class="grid grid--3" style="margin-bottom:24px">' +
      '<div class="card stat"><p class="card__label">Para revisar hoje</p><div class="stat__value">' + due.length + '</div></div>' +
      '<div class="card stat"><p class="card__label">Aulas em revisão</p><div class="stat__value">' + scheduled + '</div></div>' +
      '<div class="card stat"><p class="card__label">Erros em aberto</p><div class="stat__value">' + errors.length + '</div></div>' +
    '</div>';

    if (!due.length) {
      html += '<div class="empty"><p><strong>Nada vencido hoje.</strong></p>' +
        '<p>Conclua aulas para alimentar a revisão — cada aula concluída entra automaticamente na fila.</p>' +
        '<a class="btn btn--primary" href="#/aulas">Ir para as aulas</a></div>';
    } else {
      html += '<h2>Hoje você precisa revisar</h2><div class="stack">';
      due.forEach(function (item) {
        const mod = MIA.get.moduleOfLesson(item.lessonId);
        const tone = toneForScore(item.review.lastScore);
        const dot = { red: '🔴', amber: '🟡', green: '🟢', blue: '🔵' }[tone];
        const recall = recallPrompt(item.lesson);
        html += '<section class="card" data-review="' + item.lessonId + '">' +
          '<div class="row row--between"><div style="min-width:0">' +
            '<p class="card__label">' + dot + ' ' + ui.escapeHtml(mod.title) + '</p>' +
            '<h3>' + ui.escapeHtml(item.lesson.title) + '</h3></div>' +
            '<span class="badge badge--' + tone + '">última nota ' + item.review.lastScore + '</span></div>';

        if (!recall.fallback) {
          const ex = recall.exercise;
          html += '<p><strong>Recuperação ativa:</strong> ' + ui.escapeHtml(ex.question) + '</p>' +
            '<p class="small muted">Responda de cabeça, sem consultar. A correção é a mesma usada nas aulas.</p>' +
            '<div class="recall-answer" data-recall-exercise="' + ex.id + '">' + recallInputField(ex) + '</div>' +
            '<div class="row" style="margin-top:12px">' +
              '<button class="btn btn--sm btn--primary" data-action="check-recall" data-lesson="' + item.lessonId + '" data-exercise="' + ex.id + '">Conferir</button>' +
              '<a class="btn btn--sm btn--ghost" href="#/aula/' + item.lessonId + '">Abrir a aula</a>' +
            '</div>' +
            '<div id="recall-fb-' + item.lessonId + '"></div>';
        } else {
          html += '<p><strong>Recuperação ativa:</strong> ' + ui.escapeHtml(recall.text) + '</p>' +
            '<p class="small muted">Sem exercício disponível para conferir automaticamente — isto é autorrelato, não evidência de domínio.</p>' +
            '<div class="row">' + RECALL.map(function (r) {
              return '<button class="btn btn--sm" data-recall="' + r.key + '" data-lesson="' + item.lessonId + '">' +
                ui.escapeHtml(r.label) + '</button>';
            }).join('') + '<a class="btn btn--sm btn--ghost" href="#/aula/' + item.lessonId + '">Abrir a aula</a></div>';
        }
        html += '</section>';
      });
      html += '</div>';
    }

    html += '<section style="margin-top:32px"><h2>Revisão de erros</h2>' +
      (errors.length
        ? '<ul class="list">' + errors.slice(0, 5).map(function (e) {
            return '<li><strong>' + ui.escapeHtml(e.concept) + '</strong><br>' +
              '<span class="small muted">' + ui.escapeHtml(e.error) + '</span></li>';
          }).join('') + '</ul><a class="btn btn--sm" href="#/erros">Ver todos os erros</a>'
        : '<div class="empty">Nenhum erro em aberto. Quando errar um quiz, ele aparece aqui.</div>') +
    '</section>';

    return html;
  }

  function renderErrorsPage() {
    const errors = P().state.errors;
    let html = '<div class="page-head"><p class="eyebrow">Memória</p><h1>Meus erros</h1>' +
      '<p>Erro registrado é erro que volta para você em vez de voltar na prova. ' +
      'Quizzes errados entram aqui automaticamente.</p></div>';

    html += '<section class="card" style="margin-bottom:24px"><p class="card__label">Registrar um erro</p>' +
      '<div class="field"><label for="err-concept">Conceito</label>' +
      '<input type="text" id="err-concept" placeholder="Ex.: APIs"></div>' +
      '<div class="field"><label for="err-error">O erro</label>' +
      '<input type="text" id="err-error" placeholder="Ex.: Confundi API com endpoint."></div>' +
      '<div class="field"><label for="err-correction">A correção</label>' +
      '<input type="text" id="err-correction" placeholder="Ex.: API é o contrato inteiro; endpoint é um endereço dentro dela."></div>' +
      '<div class="field"><label for="err-example">Exemplo</label>' +
      '<input type="text" id="err-example" placeholder="Ex.: /v1/clientes/42 é um endpoint da API de clientes."></div>' +
      '<div class="row" style="margin-top:16px"><button class="btn btn--primary" data-action="add-error">Registrar erro</button></div></section>';

    if (!errors.length) {
      html += '<div class="empty">Nenhum erro registrado ainda.</div>';
      return html;
    }

    html += '<div class="table-wrap"><table><thead><tr>' +
      '<th>Conceito</th><th>Erro</th><th>Correção</th><th>Repetições</th><th>Data</th><th>Status</th><th></th>' +
      '</tr></thead><tbody>' +
      errors.map(function (e) {
        const resolved = e.status === 'resolvido';
        return '<tr>' +
          '<td><strong>' + ui.escapeHtml(e.concept) + '</strong></td>' +
          '<td>' + ui.escapeHtml(e.error) + '</td>' +
          '<td>' + ui.escapeHtml(e.correction || '—') + (e.example ? '<br><span class="small muted">' + ui.escapeHtml(e.example) + '</span>' : '') + '</td>' +
          '<td>' + (e.repetitions || 1) + '</td>' +
          '<td class="small">' + ui.formatDate(e.date) + '</td>' +
          '<td>' + (resolved ? '<span class="badge badge--green">🟢 Resolvido</span>' : '<span class="badge badge--red">🔴 Precisa revisar</span>') + '</td>' +
          '<td><div class="row">' +
            '<button class="btn btn--sm btn--ghost" data-action="toggle-error" data-id="' + e.id + '">' +
              (resolved ? 'Reabrir' : 'Resolver') + '</button>' +
            '<button class="btn btn--sm btn--danger" data-action="remove-error" data-id="' + e.id + '">Excluir</button>' +
          '</div></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';

    return html;
  }

  /* ---------------- plano de estudo do dia (§53/§54) ---------------- */

  function buildMission() {
    const mode = P().state.prefs.mode || 'normal';
    const modeDef = MIA.data.curriculum.studyModes.find(function (m) { return m.id === mode; }) ||
      MIA.data.curriculum.studyModes[1];
    const due = P().dueReviews();
    const nextLesson = MIA.get.nextLesson(P());
    const items = [];

    if (modeDef.blocks.indexOf('revisao') !== -1) {
      items.push(due.length
        ? { minutes: Math.min(10, due.length * 3), title: 'Revisão', detail: ui.plural(due.length, 'aula vencida', 'aulas vencidas') + ' esperando recuperação ativa.', href: '#/revisao' }
        : { minutes: 5, title: 'Revisão', detail: 'Nada vencido. Dê uma olhada nos seus erros em aberto.', href: '#/erros' });
    }
    if (nextLesson && modeDef.blocks.indexOf('aula') !== -1) {
      items.push({ minutes: Math.min(nextLesson.duration, 20), title: 'Aula', detail: nextLesson.title, href: '#/aula/' + nextLesson.id });
    }
    if (nextLesson && modeDef.blocks.indexOf('exercicio') !== -1 && (nextLesson.exercises || []).length) {
      items.push({ minutes: 10, title: 'Exercício', detail: 'Responda os exercícios de “' + nextLesson.title + '”.', href: '#/aula/' + nextLesson.id });
    }
    if (modeDef.blocks.indexOf('desafio') !== -1) {
      const challenge = findChallenge();
      if (challenge) {
        items.push({ minutes: 10, title: 'Desafio', detail: challenge.exercise.question.slice(0, 90) + '…', href: '#/aula/' + challenge.lesson.id });
      }
    }
    if (modeDef.blocks.indexOf('projeto') !== -1) {
      const project = findProject();
      if (project) items.push({ minutes: 25, title: 'Projeto', detail: project.title, href: '#/projeto/' + project.id });
    }

    return { mode: modeDef, items: items };
  }

  function findChallenge() {
    const mods = MIA.get.modules();
    for (let i = 0; i < mods.length; i++) {
      if (mods[i].pilot) continue; // trilha piloto não entra na sugestão automática do dia
      if (P().moduleState(mods[i].id).state === 'locked') continue;
      for (let j = 0; j < mods[i].lessons.length; j++) {
        const lesson = mods[i].lessons[j];
        const entry = P().state.lessons[lesson.id];
        const challenge = (lesson.exercises || []).find(function (e) { return e.type === 'challenge'; });
        if (challenge && !(entry && entry.exercises && entry.exercises[challenge.id])) {
          return { lesson: lesson, exercise: challenge };
        }
      }
    }
    return null;
  }

  function findProject() {
    return MIA.get.allProjects().find(function (p) {
      if (p.kind === 'pilot') return false; // trilha piloto não entra na sugestão automática do dia
      const st = P().projectState(p.id);
      return st.state === 'in_progress' || st.state === 'available';
    }) || null;
  }

  function bindReviewPage(root) {
    ui.bindOnce(root, 'reviewPage', function () {
      root.addEventListener('click', onReviewClick);
    });
  }

  function onReviewClick(event) {
    const recallBtn = event.target.closest('[data-recall]');
    if (recallBtn) {
      const choice = RECALL.find(function (r) { return r.key === recallBtn.dataset.recall; });
      P().recordReview(recallBtn.dataset.lesson, choice.score);
      ui.toast('Revisão registrada. Próxima em ' + P().state.reviews[recallBtn.dataset.lesson].interval + ' dia(s).');
      MIA.app.render();
      return;
    }

    const checkBtn = event.target.closest('[data-action="check-recall"]');
    if (checkBtn) {
      if (checkBtn.disabled) return; // já corrigido nesta tela — não registra a mesma revisão duas vezes
      const lessonId = checkBtn.dataset.lesson;
      const lesson = MIA.get.lesson(lessonId);
      const exercise = (lesson.exercises || []).find(function (e) { return e.id === checkBtn.dataset.exercise; });
      const card = checkBtn.closest('[data-review]');
      const answer = readRecallAnswer(card, exercise);
      if (exercise.type === 'quiz' && answer === null) { ui.toast('Escolha uma alternativa antes de conferir.'); return; }
      if (exercise.type !== 'quiz' && !String(answer).trim()) { ui.toast('Escreva sua resposta antes de conferir.'); return; }

      const result = MIA.lessons.grade(exercise, answer);
      const slot = document.getElementById('recall-fb-' + lessonId);
      if (slot) slot.innerHTML = MIA.lessons.renderFeedback(exercise, result);
      P().recordReview(lessonId, result.score);
      ui.toast('Revisão registrada. Próxima em ' + P().state.reviews[lessonId].interval + ' dia(s).');

      // trava o controle: o feedback já mostrado fica visível, mas o exercício
      // não pode ser reenviado para inflar XP/intervalo com a mesma resposta.
      checkBtn.disabled = true;
      checkBtn.textContent = 'Conferido';
      const answerArea = card.querySelector('[data-recall-exercise="' + exercise.id + '"]');
      if (answerArea) {
        answerArea.querySelectorAll('input, textarea').forEach(function (field) { field.disabled = true; });
      }

      MIA.app.refreshChrome();
      return;
    }

    const errBtn = event.target.closest('[data-action="register-error"]');
    if (errBtn) {
      const card = errBtn.closest('[data-review]');
      const lessonId = card && card.dataset.review;
      const lesson = lessonId && MIA.get.lesson(lessonId);
      const exercise = lesson && (lesson.exercises || []).find(function (e) { return e.id === errBtn.dataset.exercise; });
      if (!lesson || !exercise) return;
      P().addError({
        concept: MIA.get.moduleOfLesson(lessonId).title + ' — ' + lesson.title,
        error: exercise.question,
        correction: exercise.model || (exercise.options ? exercise.options[exercise.answer] : ''),
        example: exercise.explain || '',
        lessonId: lessonId
      });
      ui.toast('Registrado em Meus erros.');
    }
  }

  function bindErrorsPage(root) {
    ui.bindOnce(root, 'errorsPage', function () {
      root.addEventListener('click', onErrorsClick);
    });
  }

  function onErrorsClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;

    if (btn.dataset.action === 'add-error') {
      const concept = document.getElementById('err-concept').value.trim();
      const error = document.getElementById('err-error').value.trim();
      if (!concept || !error) { ui.toast('Preencha ao menos o conceito e o erro.'); return; }
      P().addError({
        concept: concept, error: error,
        correction: document.getElementById('err-correction').value.trim(),
        example: document.getElementById('err-example').value.trim()
      });
      ui.toast('Erro registrado.');
      MIA.app.render();
    }
    if (btn.dataset.action === 'toggle-error') {
      const current = P().state.errors.find(function (e) { return e.id === btn.dataset.id; });
      P().updateError(btn.dataset.id, { status: current.status === 'resolvido' ? 'revisar' : 'resolvido' });
      MIA.app.render();
    }
    if (btn.dataset.action === 'remove-error') {
      P().removeError(btn.dataset.id);
      MIA.app.render();
    }
  }

  MIA.review = {
    renderReviewPage: renderReviewPage,
    renderErrorsPage: renderErrorsPage,
    bindReviewPage: bindReviewPage,
    bindErrorsPage: bindErrorsPage,
    buildMission: buildMission,
    findChallenge: findChallenge
  };
})(window.MIA);
