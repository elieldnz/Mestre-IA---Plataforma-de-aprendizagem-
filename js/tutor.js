/* tutor.js — Professor IA: painel contextual com comandos.
   Importante: é um tutor determinístico (regras locais), não uma LLM.
   A arquitetura prevê a troca por uma IA real (§71 da especificação). */
window.MIA = window.MIA || {};

(function (MIA) {
  'use strict';

  const ui = MIA.ui;
  const P = function () { return MIA.progress; };

  const COMMANDS = [
    ['/aula', 'Retoma a próxima aula da sua trilha'],
    ['/exercicio', 'Aponta o próximo exercício não respondido'],
    ['/prova', 'Monta uma verificação rápida do módulo atual'],
    ['/desafio', 'Traz o próximo desafio disponível'],
    ['/revisao', 'Mostra o que está vencido para revisar'],
    ['/projeto', 'Mostra o projeto do momento'],
    ['/progresso', 'Resumo de XP, nível, streak e domínio'],
    ['/mapa', 'Onde você está na jornada'],
    ['/explicar', 'Reapresenta o conceito da aula atual'],
    ['/avancar', 'Diz se você pode avançar e o que falta'],
    ['/portfolio', 'Estado dos seus projetos e do portfólio'],
    ['/ajuda', 'Lista os comandos']
  ];

  let log = [];
  let pendingQuiz = null;
  let currentContext = { route: '', lessonId: null, moduleId: null };

  function push(role, text) {
    log.push({ role: role, text: text });
    if (log.length > 60) log = log.slice(-60);
    paint();
  }

  function paint() {
    const box = document.getElementById('tutor-log');
    if (!box) return;
    box.innerHTML = log.map(function (m) {
      return '<div class="msg msg--' + m.role + '">' +
        (m.role === 'tutor' ? ui.md(m.text) : '<p>' + ui.escapeHtml(m.text) + '</p>') + '</div>';
    }).join('');
    box.scrollTop = box.scrollHeight;
  }

  function contextLine() {
    const lesson = currentContext.lessonId ? MIA.get.lesson(currentContext.lessonId) : null;
    const mod = lesson ? MIA.get.moduleOfLesson(lesson.id)
      : currentContext.moduleId ? MIA.get.module(currentContext.moduleId) : null;
    const level = ui.LEVEL_LABEL[P().currentLevel()];
    const parts = ['Nível: ' + level, 'XP: ' + P().state.xp];
    if (mod) parts.push('Módulo: ' + mod.title);
    if (lesson) parts.push('Aula: ' + lesson.title);
    return parts.join(' · ');
  }

  function setContext(ctx) {
    currentContext = Object.assign({ route: '', lessonId: null, moduleId: null }, ctx);
    const node = document.getElementById('tutor-ctx');
    if (node) node.textContent = contextLine();
  }

  function currentLesson() {
    if (currentContext.lessonId) return MIA.get.lesson(currentContext.lessonId);
    return MIA.get.nextLesson(P());
  }

  /* ---------------- respostas ---------------- */

  function help() {
    return '**Comandos disponíveis**\n\n' +
      COMMANDS.map(function (c) { return '- `' + c[0] + '` — ' + c[1]; }).join('\n') +
      '\n\nVocê também pode escrever: *não entendi*, *entendi*, *me dá a resposta*, *estou travado*.';
  }

  function cmdAula() {
    const lesson = currentLesson();
    if (!lesson) return 'Você concluiu tudo que está liberado. Vá para `/projeto` e construa algo com isso.';
    const mod = MIA.get.moduleOfLesson(lesson.id);
    const st = P().lessonState(lesson.id);
    return '**Próxima aula:** ' + lesson.title + '\n\n' +
      'Módulo: ' + mod.title + ' · ' + lesson.duration + ' min · ' + ui.STATE_LABEL[st.state] + '\n\n' +
      'Objetivo principal: ' + lesson.objectives[0] + '\n\n' +
      'Abrir: [' + lesson.title + '](#/aula/' + lesson.id + ')';
  }

  function cmdExercicio() {
    const lesson = currentLesson();
    if (!lesson) return 'Nada pendente por aqui.';
    const entry = P().state.lessons[lesson.id];
    const pending = (lesson.exercises || []).find(function (e) {
      return !(entry && entry.exercises && entry.exercises[e.id]);
    });
    if (!pending) return 'Todos os exercícios desta aula já foram respondidos. Tente `/desafio` ou `/avancar`.';
    return '**Próximo exercício** (' + pending.type + ', +' + pending.xp + ' XP)\n\n' +
      pending.question + '\n\nResponda na página da aula: [abrir](#/aula/' + lesson.id + ')';
  }

  function cmdProva() {
    const lesson = currentLesson();
    const mod = lesson ? MIA.get.moduleOfLesson(lesson.id) : null;
    if (!mod) return 'Escolha um módulo primeiro em `/mapa`.';
    const quizzes = [];
    mod.lessons.forEach(function (l) {
      (l.exercises || []).forEach(function (e) { if (e.type === 'quiz') quizzes.push({ lesson: l, ex: e }); });
    });
    if (!quizzes.length) return 'Este módulo não tem quiz. Use `/desafio`.';
    const pick = quizzes[Math.floor(Math.random() * quizzes.length)];
    pendingQuiz = pick;
    return '**Verificação rápida — ' + mod.title + '**\n\n' + pick.ex.question + '\n\n' +
      pick.ex.options.map(function (o, i) { return (i + 1) + '. ' + o; }).join('\n') +
      '\n\nResponda com o número.';
  }

  function answerQuiz(text) {
    const n = parseInt(String(text).trim(), 10);
    if (isNaN(n) || n < 1 || n > pendingQuiz.ex.options.length) {
      return 'Responda com o número da alternativa (1 a ' + pendingQuiz.ex.options.length + '), ou digite `/ajuda`.';
    }
    const correct = (n - 1) === pendingQuiz.ex.answer;
    const ex = pendingQuiz.ex;
    const lesson = pendingQuiz.lesson;
    pendingQuiz = null;
    if (correct) {
      return '**Correto.** ' + (ex.explain || '') + '\n\nVamos aumentar a dificuldade: peça `/desafio`.';
    }
    P().addError({
      concept: lesson.title, error: ex.question,
      correction: ex.options[ex.answer], example: ex.explain || '', lessonId: lesson.id
    });
    return '**Ainda não.** A resposta correta é: *' + ex.options[ex.answer] + '*\n\n' +
      (ex.explain || '') + '\n\nRegistrei isso em **Meus erros** para voltar na revisão. ' +
      'Reveja a aula: [' + lesson.title + '](#/aula/' + lesson.id + ')';
  }

  function cmdDesafio() {
    const found = MIA.review.findChallenge();
    if (!found) return 'Nenhum desafio pendente nos módulos liberados. Avance nas aulas para liberar mais.';
    return '**Desafio — ' + found.lesson.title + '** (+' + found.exercise.xp + ' XP)\n\n' +
      found.exercise.question + '\n\n[Abrir a aula](#/aula/' + found.lesson.id + ')';
  }

  function cmdRevisao() {
    const due = P().dueReviews();
    if (!due.length) return 'Nada vencido hoje. Se quiser praticar mesmo assim, use `/desafio`.';
    return '**Vencidas hoje:** ' + due.length + '\n\n' +
      due.slice(0, 5).map(function (d) {
        return '- ' + d.lesson.title + ' (última nota ' + d.review.lastScore + ')';
      }).join('\n') + '\n\n[Abrir a revisão](#/revisao)';
  }

  function cmdProjeto() {
    const project = MIA.get.allProjects().find(function (p) {
      return P().projectState(p.id).state === 'in_progress';
    }) || MIA.get.allProjects().find(function (p) {
      return P().projectState(p.id).state === 'available';
    });
    if (!project) return 'Nenhum projeto liberado ainda. Domine as primeiras aulas para liberar o primeiro.';
    const st = P().projectState(project.id);
    return '**Projeto do momento:** ' + project.title + '\n\n' +
      project.summary + '\n\nProgresso: ' + st.done + '/' + st.total + ' tarefas.\n\n' +
      '[Abrir workspace](#/projeto/' + project.id + ')';
  }

  function cmdProgresso() {
    const g = P().globalProgress();
    return '**Seu progresso**\n\n' +
      '- Aulas concluídas: ' + g.done + '/' + g.total + ' (' + g.percent + '%)\n' +
      '- Dominadas: ' + g.mastered + '\n' +
      '- XP: ' + P().state.xp + '\n' +
      '- Streak: ' + P().currentStreak() + ' dias\n' +
      '- Nível: ' + ui.LEVEL_LABEL[P().currentLevel()] + '\n\n[Ver detalhes](#/progresso)';
  }

  function cmdMapa() {
    const mods = MIA.get.modules();
    const current = mods.find(function (m) { return P().moduleState(m.id).state === 'in_progress'; }) ||
      mods.find(function (m) { return P().moduleState(m.id).state === 'available'; });
    const lines = mods.slice(0, 8).map(function (m) {
      const st = P().moduleState(m.id);
      const icon = { completed: '🟢', in_progress: '🟡', available: '🔵', locked: '⚪' }[st.state];
      return icon + ' ' + m.title + ' — ' + st.progress + '%';
    });
    return '**Mapa da jornada**\n\n' + lines.join('\n') +
      (current ? '\n\nVocê está em: **' + current.title + '**' : '') + '\n\n[Ver mapa completo](#/jornada)';
  }

  function cmdExplicar() {
    const lesson = currentLesson();
    if (!lesson) return 'Abra uma aula para eu explicar o conceito dela.';
    const concept = (lesson.blocks || []).find(function (b) { return b.type === 'concept'; }) || lesson.blocks[0];
    return '**' + lesson.title + '**\n\nO que você precisa levar desta aula:\n\n' +
      lesson.objectives.map(function (o) { return '- ' + o; }).join('\n') +
      '\n\n' + String(concept.body).split('\n\n').slice(0, 2).join('\n\n') +
      '\n\n[Ler a aula inteira](#/aula/' + lesson.id + ')';
  }

  function cmdAvancar() {
    const lesson = currentLesson();
    if (!lesson) return 'Não há aula pendente nos módulos liberados.';
    const mod = MIA.get.moduleOfLesson(lesson.id);
    const st = P().moduleState(mod.id);
    const threshold = MIA.data.curriculum.masteryThreshold || 80;
    const ratio = MIA.data.curriculum.moduleUnlockRatio || 0.7;
    const needed = Math.ceil(st.total * ratio);
    if (st.mastered >= needed) {
      return 'Sim: você domina ' + st.mastered + ' de ' + st.total + ' aulas de **' + mod.title + '** — ' +
        'o suficiente para liberar o próximo módulo. Faça o [checkpoint](#/checkpoint/' + mod.id + ').';
    }
    return 'Ainda não. Em **' + mod.title + '** você domina ' + st.mastered + ' de ' + st.total + ' aulas ' +
      'e precisa de ' + needed + '. Dominar significa nota ' + threshold + ' ou mais nos exercícios da aula — ' +
      'não basta marcar como concluída.';
  }

  function cmdPortfolio() {
    const projects = MIA.get.allProjects();
    const done = projects.filter(function (p) { return P().projectState(p.id).state === 'completed'; });
    const doing = projects.filter(function (p) { return P().projectState(p.id).state === 'in_progress'; });
    return '**Portfólio**\n\n' +
      '- Concluídos: ' + done.length + '\n' +
      '- Em andamento: ' + doing.length + '\n' +
      '- Disponíveis: ' + projects.filter(function (p) { return P().projectState(p.id).state === 'available'; }).length +
      (done.length ? '\n\nConcluídos: ' + done.map(function (p) { return p.title; }).join(', ') : '') +
      '\n\n[Abrir projetos](#/projetos)';
  }

  /* ---------------- regras de conversa (§56) ---------------- */

  function freeform(text) {
    const t = ui.normalize(text);
    const lesson = currentLesson();

    if (/^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(t)) {
      return 'Olá. Estou vendo o seu contexto: ' + contextLine() + '.\n\nDigite `/ajuda` para os comandos ou me diga onde travou.';
    }
    if (t.indexOf('nao entendi') !== -1 || t.indexOf('nao compreendi') !== -1 || t.indexOf('confuso') !== -1) {
      return cmdExplicar() + '\n\nSe ainda ficar confuso, me diga **qual palavra específica** não fez sentido.';
    }
    if (/^entendi\b|^entendi$|ja entendi|entendi tudo/.test(t)) {
      return 'Então vamos testar — entender é diferente de saber fazer.\n\n' + cmdProva();
    }
    if (t.indexOf('resposta') !== -1 && (t.indexOf('me da') !== -1 || t.indexOf('qual e') !== -1 || t.indexOf('me de') !== -1)) {
      return 'Tente primeiro, mesmo que erre — errar e corrigir é o que fixa.\n\n' +
        'Escreva a sua versão, ainda que incompleta. Depois de enviar o exercício, ' +
        'a correção automática te mostra o que já está bom e o que precisa aprofundar.';
    }
    if (t.indexOf('travado') !== -1 || t.indexOf('travei') !== -1 || t.indexOf('nao sei por onde') !== -1) {
      const repeated = P().state.errors.filter(function (e) { return (e.repetitions || 1) > 1 && e.status !== 'resolvido'; });
      if (repeated.length) {
        return 'Você repetiu este erro: **' + repeated[0].concept + '** — “' + repeated[0].error + '”.\n\n' +
          'Correção: ' + (repeated[0].correction || 'reveja a aula de origem') + '\n\n' +
          'Comece por aí, depois volte para a aula.';
      }
      return 'Vamos reduzir o problema. ' + (lesson
        ? 'Você está em **' + lesson.title + '**. Me responda só isto: qual dos objetivos abaixo você não conseguiria explicar?\n\n' +
          lesson.objectives.map(function (o) { return '- ' + o; }).join('\n')
        : 'Digite `/mapa` para ver onde você está.');
    }
    if (t.indexOf('skill') !== -1) {
      return 'Skill é uma pasta com um SKILL.md que ensina um agente a executar uma tarefa. ' +
        'Escolha pela dor, não pela lista.\n\n[Abrir o Skill Explorer](#/skills)';
    }
    if (t.indexOf('projeto') !== -1) return cmdProjeto();
    if (t.indexOf('revis') !== -1) return cmdRevisao();
    if (t.indexOf('xp') !== -1 || t.indexOf('progresso') !== -1 || t.indexOf('nivel') !== -1) return cmdProgresso();

    return 'Não tenho uma resposta pronta para isso — sou um tutor local, por regras, sem IA generativa por trás.\n\n' +
      'O que eu faço bem: `/aula`, `/exercicio`, `/prova`, `/desafio`, `/revisao`, `/projeto`, `/progresso`, `/mapa`, ' +
      '`/explicar`, `/avancar`, `/portfolio`.';
  }

  function respond(input) {
    const text = String(input || '').trim();
    if (!text) return '';
    if (pendingQuiz && !text.startsWith('/')) return answerQuiz(text);

    const cmd = text.toLowerCase().split(/\s+/)[0];
    switch (cmd) {
      case '/ajuda': case '/help': return help();
      case '/aula': return cmdAula();
      case '/exercicio': return cmdExercicio();
      case '/prova': return cmdProva();
      case '/desafio': return cmdDesafio();
      case '/revisao': return cmdRevisao();
      case '/projeto': return cmdProjeto();
      case '/progresso': return cmdProgresso();
      case '/mapa': return cmdMapa();
      case '/explicar': return cmdExplicar();
      case '/avancar': return cmdAvancar();
      case '/portfolio': return cmdPortfolio();
      default:
        if (cmd.startsWith('/')) return 'Comando desconhecido. ' + help();
        return freeform(text);
    }
  }

  function open() {
    const panel = document.getElementById('tutor-panel');
    const fab = document.getElementById('tutor-fab');
    panel.hidden = false;
    fab.setAttribute('aria-expanded', 'true');
    setContext(currentContext);
    if (!log.length) {
      push('tutor', 'Olá. Sou o **Professor IA** desta plataforma — um tutor por regras, local, **sem IA generativa** ' +
        'por trás (a arquitetura já prevê a troca por uma IA real).\n\nEu conheço seu módulo, suas aulas, seus erros e ' +
        'seus projetos.\n\n' + help());
    }
    const input = document.getElementById('tutor-input');
    if (input) input.focus();
  }

  function close() {
    document.getElementById('tutor-panel').hidden = true;
    document.getElementById('tutor-fab').setAttribute('aria-expanded', 'false');
    document.getElementById('tutor-fab').focus();
  }

  function init() {
    const fab = document.getElementById('tutor-fab');
    const panel = document.getElementById('tutor-panel');
    fab.addEventListener('click', function () { panel.hidden ? open() : close(); });
    document.getElementById('tutor-close').addEventListener('click', close);
    document.getElementById('tutor-form').addEventListener('submit', function (event) {
      event.preventDefault();
      const input = document.getElementById('tutor-input');
      const text = input.value.trim();
      if (!text) return;
      push('user', text);
      input.value = '';
      const answer = respond(text);
      if (answer) push('tutor', answer);
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) close();
    });
  }

  MIA.tutor = { init: init, setContext: setContext, respond: respond, open: open };
})(window.MIA);
