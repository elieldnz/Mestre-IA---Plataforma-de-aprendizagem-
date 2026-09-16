/* ui.js — helpers de renderização, markdown mínimo e utilidades. */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  /* ---------- texto ---------- */

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** minúsculas, sem acento — usado nas correções heurísticas. */
  function normalize(str) {
    return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function countWords(str) {
    const t = String(str || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  function inline(text) {
    // texto JÁ escapado entra aqui
    return text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  }

  /**
   * Markdown mínimo e seguro: parágrafos, listas, citação, código em bloco,
   * negrito, itálico e código inline. Não aceita HTML bruto (tudo é escapado).
   */
  function md(source) {
    const text = String(source == null ? '' : source);
    const parts = text.split(/```/);
    let out = '';

    parts.forEach(function (part, i) {
      if (i % 2 === 1) {
        const nl = part.indexOf('\n');
        const body = nl >= 0 ? part.slice(nl + 1) : part;
        out += '<pre><code>' + escapeHtml(body.replace(/\n$/, '')) + '</code></pre>';
        return;
      }

      const lines = escapeHtml(part).split('\n');
      let buffer = [];
      let listType = null;

      function flushParagraph() {
        if (!buffer.length) return;
        out += '<p>' + inline(buffer.join('<br>')) + '</p>';
        buffer = [];
      }
      function closeList() {
        if (listType) { out += '</' + listType + '>'; listType = null; }
      }

      lines.forEach(function (raw) {
        const line = raw.trimEnd();
        const trimmed = line.trim();

        if (!trimmed) { flushParagraph(); closeList(); return; }

        const bullet = trimmed.match(/^[-*]\s+(.*)$/);
        const numbered = trimmed.match(/^\d+\.\s+(.*)$/);
        // o texto já vem escapado, portanto '>' chega como '&gt;'
        const quote = trimmed.match(/^&gt;\s?(.*)$/);

        if (bullet) {
          flushParagraph();
          if (listType !== 'ul') { closeList(); out += '<ul>'; listType = 'ul'; }
          out += '<li>' + inline(bullet[1]) + '</li>';
          return;
        }
        if (numbered) {
          flushParagraph();
          if (listType !== 'ol') { closeList(); out += '<ol>'; listType = 'ol'; }
          out += '<li>' + inline(numbered[1]) + '</li>';
          return;
        }
        if (quote) {
          flushParagraph(); closeList();
          out += '<blockquote>' + inline(quote[1]) + '</blockquote>';
          return;
        }
        closeList();
        buffer.push(trimmed);
      });

      flushParagraph();
      closeList();
    });

    return out;
  }

  /* ---------- DOM ---------- */

  function el(tag, attrs, html) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'dataset') Object.assign(node.dataset, attrs[k]);
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
      });
    }
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  let toastTimer = null;
  function toast(message) {
    const node = document.getElementById('toast');
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.hidden = true; }, 3200);
  }

  /* ---------- formatação ---------- */

  const LEVEL_LABEL = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
  const LEVEL_TONE = { iniciante: 'green', intermediario: 'amber', avancado: 'purple' };
  const CONF_TONE = { alto: 'green', medio: 'amber', baixo: 'red' };
  const STATE_LABEL = {
    locked: 'Bloqueado', available: 'Disponível', in_progress: 'Em andamento',
    completed: 'Concluído', mastered: 'Dominado'
  };
  const STATE_ICON = { locked: '🔒', available: '○', in_progress: '◐', completed: '●', mastered: '★' };

  /** "Fase N" para módulos normais; rótulo distinto para trilhas piloto,
   *  que não fazem parte da numeração de fases da trilha MESTRE IA. */
  function phaseLabel(mod) {
    return mod.pilot ? '🧪 Piloto' : 'Fase ' + mod.phase;
  }

  function levelBadge(level) {
    return '<span class="badge badge--' + (LEVEL_TONE[level] || 'blue') + '">' +
      escapeHtml(LEVEL_LABEL[level] || level) + '</span>';
  }

  function stateBadge(state) {
    const tone = state === 'mastered' ? 'blue' : state === 'completed' ? 'green'
      : state === 'in_progress' ? 'amber' : state === 'available' ? 'blue' : '';
    return '<span class="badge' + (tone ? ' badge--' + tone : '') + '">' +
      STATE_ICON[state] + ' ' + escapeHtml(STATE_LABEL[state] || state) + '</span>';
  }

  function scoreBadge(score) {
    const g = MIA.get.grading(score);
    if (!g) return '';
    const tone = { vermelho: 'red', amarelo: 'amber', verde: 'green', azul: 'blue' }[g.tone];
    return '<span class="badge badge--' + tone + '">' + score + '/100 · ' + escapeHtml(g.label) + '</span>';
  }

  function sourceTag(source) {
    if (source === 'material') {
      return '<span class="source-tag source-tag--material">Baseado no material fornecido.</span>';
    }
    return '<span class="source-tag">Conhecimento complementar.</span>';
  }

  function bar(percent, tone) {
    const p = Math.max(0, Math.min(100, Math.round(percent)));
    return '<div class="progress-line"><div class="bar' + (tone ? ' bar--' + tone : '') + '" role="img" ' +
      'aria-label="Progresso: ' + p + '%"><div class="bar__fill" style="width:' + p + '%"></div></div>' +
      '<span>' + p + '%</span></div>';
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function todayISO() {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  }

  function daysBetween(isoA, isoB) {
    const a = new Date(isoA + 'T00:00:00');
    const b = new Date(isoB + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  /** Padrão oficial de binding da aplicação.
   *
   * O <main> do app é um nó PERMANENTE: render() troca o innerHTML, nunca o nó.
   * Logo, quem chama addEventListener nele a cada render empilha um listener por
   * render, e a mesma ação do aluno passa a produzir N efeitos (XP multiplicado,
   * registro gravado na entidade errada). As três regras que evitam isso:
   *
   *   1. anexar UMA vez por nó — é o que esta função garante;
   *   2. delegar (event.target.closest) — o handler passa a valer para o DOM que
   *      ainda nem existia quando foi anexado, então anexar uma vez basta;
   *   3. ler o id da entidade atual de uma variável de módulo NO MOMENTO do evento
   *      (late binding) — closure sobre o parâmetro congelaria o primeiro valor.
   *
   * Esta função cobre a regra 1. As regras 2 e 3 são responsabilidade de quem usa:
   * atualize a variável de contexto ANTES de chamar bindOnce, fora do setup.
   *
   * Retorna true se anexou agora, false se já estava anexado.
   */
  function bindOnce(root, key, setup) {
    const flag = '__miaBound_' + key;
    if (root[flag]) return false;
    root[flag] = true;
    setup();
    return true;
  }

  MIA.ui = {
    escapeHtml: escapeHtml, normalize: normalize, countWords: countWords, md: md,
    el: el, qs: qs, qsa: qsa, toast: toast,
    levelBadge: levelBadge, stateBadge: stateBadge, scoreBadge: scoreBadge, sourceTag: sourceTag,
    bar: bar, plural: plural, formatDate: formatDate, todayISO: todayISO, daysBetween: daysBetween, uid: uid,
    phaseLabel: phaseLabel, bindOnce: bindOnce,
    LEVEL_LABEL: LEVEL_LABEL, LEVEL_TONE: LEVEL_TONE, CONF_TONE: CONF_TONE,
    STATE_LABEL: STATE_LABEL, STATE_ICON: STATE_ICON
  };
})(window.MIA);
