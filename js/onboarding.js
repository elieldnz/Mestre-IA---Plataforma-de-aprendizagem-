/* onboarding.js — primeiro acesso: boas-vindas, diagnóstico e ponto de partida. */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  const ui = MIA.ui;
  const P = function () { return MIA.progress; };

  let step = 0;           // 0 = boas-vindas; 1..n = perguntas; n+1 = resultado
  let answers = {};
  let skipped = [];       // ids de perguntas puladas por adaptação (respondidas com o valor padrão)
  let name = '';
  let result = null;
  let root = null;

  const DIMENSION_LABEL = {
    base: 'Base tecnológica',
    ia: 'Uso de IA',
    prompt: 'Engenharia de prompts',
    agentes: 'Agentes e GPTs',
    automacao: 'Automação',
    codigo: 'Programação e APIs',
    contexto: 'Contexto pessoal'
  };

  function questions() { return MIA.data.curriculum.diagnostic.questions; }

  function scoreOf(question, answer) {
    if (question.type === 'choice') {
      const opt = question.options[answer];
      return opt ? opt.score : 0;
    }
    if (question.type === 'multi') {
      const picked = (answer || []).map(function (i) { return question.options[i]; }).filter(Boolean);
      return Math.min(picked.reduce(function (a, o) { return a + (o.score || 0); }, 0), 4);
    }
    return 0;
  }

  function maxOf(question) {
    if (question.type === 'choice') {
      return Math.max.apply(null, question.options.map(function (o) { return o.score || 0; }));
    }
    if (question.type === 'multi') {
      return Math.min(question.options.reduce(function (a, o) { return a + (o.score || 0); }, 0), 4);
    }
    return 0;
  }

  /* ---------------- diagnóstico adaptativo ----------------
     Este bloco implementa o "diagnóstico ramificado" pedido pelo complemento:
     8 a 12 perguntas, e as perguntas seguintes mudam de acordo com as
     anteriores. É uma regra fixa e local (se-então declarado abaixo),
     não uma IA decidindo em tempo real — deixamos isso explícito para o
     aluno no resultado. */

  /** Uma pergunta é pulada quando a pergunta da qual ela depende (já
   *  respondida, mais cedo na sequência) tem nota igual ou abaixo do limite. */
  function shouldSkip(q) {
    if (!q.skipIf) return false;
    const dep = questions().find(function (x) { return x.id === q.skipIf.field; });
    if (!dep || !(dep.id in answers)) return false;
    return scoreOf(dep, answers[dep.id]) <= q.skipIf.maxScore;
  }

  function applyDefault(q) {
    answers[q.id] = q.skipDefault;
    if (skipped.indexOf(q.id) === -1) skipped.push(q.id);
  }

  /** Primeira posição visível estritamente depois de fromIdx (pode ser -1
   *  para "antes da primeira"), preenchendo com o valor padrão cada
   *  pergunta pulada no caminho. Retorna qs.length quando não sobra pergunta. */
  function forwardTo(fromIdx) {
    const qs = questions();
    let i = fromIdx + 1;
    while (i < qs.length && shouldSkip(qs[i])) { applyDefault(qs[i]); i++; }
    return i;
  }

  /** Primeira posição visível estritamente antes de fromIdx. Retorna -1
   *  quando a posição anterior é a tela de boas-vindas. */
  function backwardTo(fromIdx) {
    const qs = questions();
    let i = fromIdx - 1;
    while (i >= 0 && shouldSkip(qs[i])) i--;
    return i;
  }

  /** Quantas perguntas visíveis existem de 0 até idx (inclusive) — usado
   *  só para mostrar "pergunta X de até Y" com um número honesto. */
  function visibleCountUpTo(idx) {
    const qs = questions();
    let n = 0;
    for (let i = 0; i <= idx; i++) if (!shouldSkip(qs[i])) n++;
    return n;
  }

  function evaluate() {
    const qs = questions();
    const dims = {};
    let score = 0, max = 0;

    qs.forEach(function (q) {
      if (!q.dimension || q.dimension === 'contexto') return;
      const s = scoreOf(q, answers[q.id]);
      const m = maxOf(q);
      if (!m) return;
      if (!dims[q.dimension]) dims[q.dimension] = { score: 0, max: 0 };
      dims[q.dimension].score += s;
      dims[q.dimension].max += m;
      score += s; max += m;
    });

    const percent = max ? Math.round((score / max) * 100) : 0;
    const level = percent < 35 ? 'iniciante' : percent < 70 ? 'intermediario' : 'avancado';

    const ranked = Object.keys(dims).map(function (k) {
      return { id: k, label: DIMENSION_LABEL[k] || k, ratio: dims[k].max ? dims[k].score / dims[k].max : 0 };
    }).sort(function (a, b) { return b.ratio - a.ratio; });

    const strengths = ranked.filter(function (d) { return d.ratio >= 0.5; }).slice(0, 3);
    const gaps = ranked.slice().reverse().filter(function (d) { return d.ratio < 0.5; }).slice(0, 3);

    const timeQ = qs.find(function (q) { return q.id === 'tempo'; });
    const timeOpt = timeQ && timeQ.options[answers.tempo];
    const mode = (timeOpt && timeOpt.mode) || 'normal';

    const goalQ = qs.find(function (q) { return q.id === 'objetivo'; });
    const goalPick = (answers.objetivo || [])[0];
    const trackId = (goalQ && goalQ.options[goalPick] && goalQ.options[goalPick].track) || 'explorar';
    const track = MIA.data.curriculum.diagnostic.tracks[trackId];

    return {
      name: name,
      profession: answers.profissao || '',
      answers: answers,
      score: score, max: max, percent: percent,
      level: level, dimensions: ranked,
      strengths: strengths, gaps: gaps,
      mode: mode, trackId: trackId, track: track,
      skipped: skipped.slice(),
      date: new Date().toISOString()
    };
  }

  /* ---------------- telas ---------------- */

  function welcome() {
    const intro = MIA.data.curriculum.diagnostic.intro;
    return '<div class="onboarding__card card welcome">' +
      '<p class="card__label">MESTRE IA</p>' +
      '<h1>' + ui.escapeHtml(intro.title) + '</h1>' +
      '<div class="welcome__lines">' + intro.lines.map(function (l) {
        return '<p>' + ui.escapeHtml(l) + '</p>'; }).join('') + '</div>' +
      '<p class="card__label" style="margin-top:24px">Como a plataforma funciona</p>' +
      '<div class="grid grid--2" style="margin-bottom:8px">' +
        '<div style="border:1px solid var(--border-soft);border-radius:var(--r-md);padding:12px 16px">' +
          '<p class="small" style="margin:0 0 4px;font-weight:600">🧠 Camada 1 — Aprendizado</p>' +
          '<p class="small muted" style="margin:0">Você desenvolve conhecimento e competência: aulas curtas, exercícios com feedback e domínio comprovado — não só assistir.</p>' +
        '</div>' +
        '<div style="border:1px solid var(--border-soft);border-radius:var(--r-md);padding:12px 16px">' +
          '<p class="small" style="margin:0 0 4px;font-weight:600">🏗️ Camada 2 — Construção</p>' +
          '<p class="small muted" style="margin:0">Você transforma esse conhecimento em Skills, agentes, automações e projetos reais — com evidência, não só nota.</p>' +
        '</div>' +
      '</div>' +
      '<p class="small muted">É por isso que o MESTRE IA não é só um curso: aprender e construir andam juntos, o tempo todo.</p>' +
      '<div class="field" style="margin-top:16px"><label for="ob-name">Como podemos te chamar?</label>' +
      '<input type="text" id="ob-name" autocomplete="given-name" placeholder="Seu nome" value="' + ui.escapeHtml(name) + '"></div>' +
      '<div class="row" style="margin-top:24px">' +
      '<button class="btn btn--primary" data-action="start">' + ui.escapeHtml(intro.cta) + ' →</button></div>' +
      '<p class="small muted" style="margin-top:24px">São até ' + questions().length + ' perguntas rápidas — algumas são ' +
      'puladas automaticamente conforme suas respostas. Tudo fica salvo apenas neste navegador.</p>' +
    '</div>';
  }

  function questionScreen(index) {
    const qs = questions();
    const q = qs[index];
    const value = answers[q.id];
    let field = '';

    if (q.type === 'text') {
      field = '<div class="field"><label class="sr-only" for="ob-input">' + ui.escapeHtml(q.question) + '</label>' +
        '<input type="text" id="ob-input" placeholder="' + ui.escapeHtml(q.placeholder || '') + '" value="' +
        ui.escapeHtml(value || '') + '"></div>';
    } else if (q.type === 'choice') {
      field = '<div class="diag-options" role="radiogroup" aria-label="' + ui.escapeHtml(q.question) + '">' +
        q.options.map(function (o, i) {
          return '<label class="option"><input type="radio" name="ob" value="' + i + '"' +
            (value === i ? ' checked' : '') + '><span>' + ui.escapeHtml(o.label) + '</span></label>';
        }).join('') + '</div>';
    } else {
      const picked = value || [];
      field = '<div class="diag-options" role="group" aria-label="' + ui.escapeHtml(q.question) + '">' + q.options.map(function (o, i) {
        return '<label class="option"><input type="checkbox" name="ob" value="' + i + '"' +
          (picked.indexOf(i) !== -1 ? ' checked' : '') + '><span>' + ui.escapeHtml(o.label) + '</span></label>';
      }).join('') + '</div>';
    }

    const shown = visibleCountUpTo(index);
    return '<div class="onboarding__card card">' +
      '<p class="onboarding__steps">Pergunta ' + shown + ' de até ' + qs.length + '</p>' +
      ui.bar((shown / qs.length) * 100) +
      '<h2 style="margin-top:24px">' + ui.escapeHtml(q.question) + '</h2>' +
      field +
      '<div class="row row--between" style="margin-top:24px">' +
        '<button class="btn btn--ghost" data-action="back">← Voltar</button>' +
        '<button class="btn btn--primary" data-action="next">' + (isLastVisible(index) ? 'Ver resultado' : 'Continuar') + ' →</button>' +
      '</div>' +
      (q.type === 'multi' ? '<p class="small muted" style="margin-top:12px">Pode marcar mais de uma.</p>' : '') +
    '</div>';
  }

  /** true quando não sobra nenhuma pergunta visível depois desta (sem
   *  aplicar os valores padrão de verdade — só olha à frente). */
  function isLastVisible(index) {
    const qs = questions();
    for (let i = index + 1; i < qs.length; i++) if (!shouldSkip(qs[i])) return false;
    return true;
  }

  function resultScreen() {
    const r = result;
    const level = MIA.get.level(r.level);
    return '<div class="onboarding__card card">' +
      '<p class="card__label">Seu ponto de partida</p>' +
      '<h1>' + ui.escapeHtml(r.name || 'Vamos começar') + '</h1>' +
      '<div class="row" style="margin-bottom:16px">' + ui.levelBadge(r.level) +
        '<span class="badge">Objetivo do nível: ' + ui.escapeHtml(level.goal) + '</span></div>' +

      '<p class="card__label" style="margin-top:24px">Conhecimentos</p>' +
      ui.bar(r.percent, ui.LEVEL_TONE[r.level]) +

      '<p class="card__label" style="margin-top:24px">Principais forças</p>' +
      (r.strengths.length
        ? '<ul class="objectives">' + r.strengths.map(function (d) {
            return '<li>' + ui.escapeHtml(d.label) + ' — ' + Math.round(d.ratio * 100) + '%</li>'; }).join('') + '</ul>'
        : '<p class="muted">Você está começando do zero — e isso é uma vantagem: nada para desaprender.</p>') +

      '<p class="card__label" style="margin-top:16px">Principais lacunas</p>' +
      (r.gaps.length
        ? '<ul class="objectives">' + r.gaps.map(function (d) {
            return '<li>' + ui.escapeHtml(d.label) + ' — ' + Math.round(d.ratio * 100) + '%</li>'; }).join('') + '</ul>'
        : '<p class="muted">Nenhuma lacuna grave. Seu ganho virá de profundidade e de projetos.</p>') +

      '<p class="card__label" style="margin-top:16px">Objetivo recomendado</p>' +
      '<p>' + ui.escapeHtml(r.track.label) + ' — ritmo sugerido: ' +
      ui.escapeHtml((MIA.data.curriculum.studyModes.find(function (m) { return m.id === r.mode; }) || {}).label || '45 minutos') + ' por dia.</p>' +

      '<p class="card__label" style="margin-top:24px">Sua trilha personalizada</p>' +
      '<p>Você não precisa estudar tudo agora. Seu próximo caminho:</p>' +
      '<ol class="prose">' + r.track.modules.map(function (id) {
        const m = MIA.get.module(id);
        return '<li>' + ui.escapeHtml(m ? m.title : id) + '</li>';
      }).join('') + '</ol>' +
      '<p class="small muted">Conteúdos avançados serão desbloqueados conforme você demonstrar domínio.</p>' +

      (r.skipped && r.skipped.length
        ? '<p class="small muted" style="margin-top:16px">↳ Pulamos ' + r.skipped.length +
          ' ' + (r.skipped.length === 1 ? 'pergunta' : 'perguntas') + ' (' +
          r.skipped.map(function (id) {
            const q = questions().find(function (x) { return x.id === id; });
            return ui.escapeHtml(q ? q.question.replace(/\?$/, '') : id);
          }).join(', ') + ') porque suas respostas anteriores já indicavam o nível nelas — ' +
          'é uma regra fixa, não uma IA decidindo sozinha.</p>'
        : '') +

      '<div class="row" style="margin-top:24px">' +
        '<button class="btn btn--primary" data-action="enter">Entrar na plataforma →</button>' +
        '<button class="btn btn--ghost" data-action="restart">Refazer diagnóstico</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------------- controle ---------------- */

  function readCurrent() {
    const qs = questions();
    const q = qs[step - 1];
    if (!q) return true;
    // Se o aluno responde de verdade uma pergunta que tinha sido pulada
    // (porque voltou e mudou a resposta da pergunta da qual ela dependia),
    // ela deixa de contar como "pulada" no resultado final.
    skipped = skipped.filter(function (id) { return id !== q.id; });
    if (q.type === 'text') {
      const field = document.getElementById('ob-input');
      answers[q.id] = field ? field.value.trim() : '';
      return true;
    }
    if (q.type === 'choice') {
      const checked = document.querySelector('input[name="ob"]:checked');
      if (!checked) { ui.toast('Escolha uma opção para continuar.'); return false; }
      answers[q.id] = Number(checked.value);
      return true;
    }
    const picked = ui.qsa('input[name="ob"]:checked').map(function (i) { return Number(i.value); });
    if (!picked.length) { ui.toast('Marque pelo menos uma opção.'); return false; }
    answers[q.id] = picked;
    return true;
  }

  function render() {
    const qs = questions();
    if (step === 0) root.innerHTML = welcome();
    else if (step <= qs.length) root.innerHTML = questionScreen(step - 1);
    else root.innerHTML = resultScreen();

    const focusable = root.querySelector('input, button');
    if (focusable && step > 0) focusable.focus();
  }

  function handle(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const qs = questions();

    if (action === 'start') {
      const field = document.getElementById('ob-name');
      name = field ? field.value.trim() : '';
      const first = forwardTo(-1);
      step = first + 1; // forwardTo nunca chega a qs.length aqui: a 1ª pergunta não tem skipIf
      render(); return;
    }
    if (action === 'next') {
      if (!readCurrent()) return;
      const next = forwardTo(step - 1);
      if (next >= qs.length) { result = evaluate(); step = qs.length + 1; }
      else step = next + 1;
      render(); return;
    }
    if (action === 'back') {
      const prev = backwardTo(step - 1);
      step = prev < 0 ? 0 : prev + 1;
      render(); return;
    }
    if (action === 'restart') {
      step = 0; answers = {}; skipped = []; result = null; render(); return;
    }
    if (action === 'enter') {
      P().saveDiagnostic(result);
      MIA.app.enterApp();
    }
  }

  function start(container) {
    root = container;
    root.hidden = false;
    document.getElementById('app').hidden = true;
    step = 0; answers = {}; skipped = []; result = null;
    const saved = P().state;
    name = saved.user.name || '';
    root.addEventListener('click', handle);
    render();
  }

  MIA.onboarding = { start: start };
})(window.MIA);
