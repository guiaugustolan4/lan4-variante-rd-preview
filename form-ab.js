/* ─────────────────────────────────────────────────────────────────────
   LAN4 — Mecanismo de teste A/B/C do formulário — RODADA 2
   Carrega ANTES de main.js. Sem dependência.

   MUDANÇA vs. rodada 1:
   - Split de 2 (A|B) para 3 braços: B | C | D, 33/33/33.
     A Variante A foi removida (perdeu a rodada 1).
       B = 3 micro-etapas: qualificacao -> contato -> servico   (vencedor provisório)
       C = 3 micro-etapas: servico -> qualificacao -> contato   (antagônica "serviço primeiro")
       D = 1 etapa corrida, todos os campos visíveis            (antagônica "sem etapas")
   - Em C e D a etapa `contato` é a ÚLTIMA (ou única) -> o main.js NÃO
     dispara lead_partial_submit sozinho (ele só dispara ao SAIR da etapa
     `contato`). Este arquivo passa a disparar o parcial quando
     nome+email+telefone da etapa `contato` ficam válidos — mesmo evento
     `lead_partial_submit`, mesmo trigger 109 no GTM. Guard por variante.

   Contrato de marcação nas páginas:
     <form id="lf" ...>
       <div data-fv-progress="B"> ...barra da B... </div>
       <div data-fv-progress="C"> ...barra da C... </div>
       <!-- D não tem barra de progresso (1 etapa) -->
       <fieldset class="lf-step" data-fv="B" data-step-name="qualificacao" ...>
       <fieldset class="lf-step" data-fv="B" data-step-name="contato" ...>
       <fieldset class="lf-step" data-fv="B" data-step-name="servico" ...>
       <fieldset class="lf-step" data-fv="C" data-step-name="servico" ...>
       <fieldset class="lf-step" data-fv="C" data-step-name="qualificacao" ...>
       <fieldset class="lf-step" data-fv="C" data-step-name="contato" ...>
       <fieldset class="lf-step" data-fv="D" data-step-name="contato" ...>   (única, tudo dentro)
     Fieldsets sem data-fv ficam intactos.

   Override QA:  ?fv=B  |  ?fv=C  |  ?fv=D  (não grava cookie)
   Preview (seletor visível):  window.LAN4_AB_PREVIEW = true
   ───────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var COOKIE = 'lan4_fv';
  var VISITOR = 'lan4_vid';
  var DAYS90 = 60 * 60 * 24 * 90;
  var VARIANTS = ['B', 'C', 'D'];

  window.dataLayer = window.dataLayer || [];

  function readCookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }
  function writeCookie(name, value) {
    try {
      document.cookie = name + '=' + encodeURIComponent(value) +
        ';path=/;max-age=' + DAYS90 + ';SameSite=Lax';
    } catch (e) {}
  }

  function makeVisitorId() {
    if (window.crypto && crypto.getRandomValues) {
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var h = [];
      for (var i = 0; i < 16; i++) h.push((b[i] + 0x100).toString(16).slice(1));
      return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' +
             h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' +
             h.slice(10, 16).join('');
    }
    return 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* FNV-1a 32-bit -> inteiro estável. 3 faixas iguais de ~33: <33 B, <66 C, resto D.
     Determinístico: o MESMO visitorId sempre cai no MESMO braço. */
  function hashPercent(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h % 99; // 0..98 -> 3 faixas exatas de 33
  }
  function bucket(pct) {
    if (pct < 33) return 'B';
    if (pct < 66) return 'C';
    return 'D';
  }

  function resolveVariant() {
    try {
      var q = new URLSearchParams(location.search).get('fv');
      if (VARIANTS.indexOf(q) !== -1) return { v: q, source: 'url' };
    } catch (e) {}

    var cached = readCookie(COOKIE);
    if (VARIANTS.indexOf(cached) !== -1) return { v: cached, source: 'cookie' };

    var vid = readCookie(VISITOR);
    if (!vid) { vid = makeVisitorId(); writeCookie(VISITOR, vid); }
    var v = bucket(hashPercent(vid));
    writeCookie(COOKIE, v);
    return { v: v, source: 'hash' };
  }

  var picked = resolveVariant();
  var VARIANT = picked.v;
  window.LAN4_FORM_VARIANT = VARIANT;

  /* NOVO 2026-10: lan4_page_meta tem de ser o 1º push da página e o
     form-ab.js roda antes do main.js — então ele empurra aqui (mesma regra
     de page_type do main.js; o main.js não repete por causa da flag). */
  if (!window.LAN4_PAGE_META_SENT) {
    window.LAN4_PAGE_META_SENT = true;
    var path = location.pathname, pt = window.LAN4_PAGE_TYPE;
    if (!pt) {
      if (path === '/' || path === '/index.html') pt = 'home';
      else if (/^\/engine(\/|$)/.test(path)) pt = 'engine';
      else if (/^\/s\/(diagnostico|solucao|vsl)(\/|$)/.test(path)) pt = 'lp';
      else if (/^\/s\//.test(path)) pt = 'servico';
      else if (/^\/blog(\/|$)/.test(path)) pt = 'blog';
      else if (/^\/links(\/|$)/.test(path)) pt = 'links';
      else if (/^\/politica-de-privacidade(\/|$)/.test(path)) pt = 'politica';
      else pt = '404';
    }
    window.dataLayer.push({ event: 'lan4_page_meta', page_type: pt, site: 'lan4' });
  }

  window.dataLayer.push({
    event: 'form_variant_assigned',
    form_variant: VARIANT,
    form_variant_source: picked.source
  });
  window.dataLayer.push({ form_variant: VARIANT });

  /* ── Poda do DOM: remove os fieldsets/barras das variantes NÃO escolhidas ── */
  function prune() {
    var keep = VARIANT;
    var all = document.querySelectorAll('[data-fv], [data-fv-progress]');
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      var tag = n.getAttribute('data-fv') || n.getAttribute('data-fv-progress');
      if (tag && tag !== keep && n.parentNode) n.parentNode.removeChild(n);
    }
    var forms = document.querySelectorAll('form#lf, form[data-rd-id]');
    for (var j = 0; j < forms.length; j++) forms[j].setAttribute('data-fv-active', VARIANT);
    document.documentElement.setAttribute('data-fv', VARIANT);
    if (window.LAN4_AB_PREVIEW) mountPreviewSwitcher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', prune);
  } else {
    prune();
  }

  /* ─────────────────────────────────────────────────────────────────
     PARCIAL EM C e D — dispara lead_partial_submit quando nome+email+
     telefone da etapa `contato` ficam válidos, SEM depender de troca de
     etapa (que em C/D não acontece: contato é a última/única tela).
     Em B, o main.js já cuida disso ao SAIR da etapa `contato` — aqui
     não fazemos nada para B.
     ───────────────────────────────────────────────────────────────── */
  (function partialForCD() {
    if (VARIANT !== 'C' && VARIANT !== 'D') return;

    function val(form, name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? String(el.value || '').trim() : '';
    }
    function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }
    /* EXATAMENTE o contrato do main.js: 11 dígitos nacionais (DDD + 9XXXXXXXX)
       que passam em lan4CelularValido (DDD real + 9 + 8 finais não-repetidos).
       NÃO descasca DDI 55 nem adivinha — o campo é nacional-only (máscara
       "(11) 99999-9999") e o submit final barra "55…" com mensagem clara.
       Antes era `length >= 10`: deixava telefone incompleto/malformado
       disparar o parcial de C/D (bug 2026-09-09, lead cineschool.workshop).
       Usa a função do main.js (ordem de <script> garante que já carregou);
       fallback com a mesma regra caso raríssimo de ainda não ter carregado. */
    function telOk(v) {
      var d = v.replace(/\D/g, '');
      if (d.length !== 11) return false;
      if (typeof window.lan4CelularValido === 'function') return window.lan4CelularValido(d);
      var DDDS = ',11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,'
        + '41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,'
        + '71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99,';
      return DDDS.indexOf(',' + d.slice(0, 2) + ',') !== -1
        && d.charAt(2) === '9'
        && !/^(\d)\1{7}$/.test(d.slice(3));
    }

    function tryFire(form) {
      if (form.lan4ContatoParcialEnviado) return;
      var nome = val(form, 'nome');
      var email = val(form, 'email');
      var telRaw = val(form, 'telefone');
      if (!nome || !emailOk(email) || !telOk(telRaw)) return;
      /* 11 dígitos nacionais sem máscara — lan4PushLead/lan4PhoneDigits
         reanexam o "55" e revalidam. telOk acima já garantiu length===11. */
      var tel = telRaw.replace(/\D/g, '');

      form.lan4ContatoParcialEnviado = true;
      var rdId = form.getAttribute('data-rd-id') || 'lan4-contato-site';

      /* O evento lead_partial_submit tem 3 tags no GTM (trigger 109):
           81  Meta Pixel Lead  → precisa de user_data (advanced matching + eventID)
           110 GA4 generate_lead → precisa de form_identifier + event_id
           112 GAds Conv. Parcial (Enhanced Conversions) → precisa de user_data
         Então NÃO empurramos um evento "cru": usamos lan4PushLead, que monta
         user_data (email/phone/first/last) + event_id igual ao B. Passamos o
         telefone JÁ SEM MÁSCARA (tratado acima).

         Mas NÃO chamamos lan4EnviaContatoParcial (o POST parcial ao RD):
           1) em C/D a etapa `contato` é a última/única — o submit completo,
              a um clique de distância, já cria o card com TODOS os campos.
           2) lan4EnviaContatoParcial() passa por lan4EnviaRd(), que grava
              `lan4_ultimo_envio` e liga o rate-limit de 4s. Se o usuário
              concluir em < 4s (comum, mesma tela), lan4PareceBot() bloquearia
              SILENCIOSAMENTE o POST final ao RD → card sem qualificação.
           3) lan4EnviaContatoParcial() ainda empurra seu PRÓPRIO
              lead_partial_submit no sucesso → duplicaria o evento.
         B não tem nada disso: lá o parcial dispara ao SAIR da etapa `contato`,
         segundos antes do submit, e o POST parcial ao RD faz sentido (safety
         net de quem abandona no meio). */
      /* NOVO 2026-10 (contrato): lead_partial_submit SÓ no 2xx do proxy e
         com event_id. Então C/D agora também mandam o parcial ao RD, via
         lan4EnviaContatoParcial do main.js, com semRateLimit (não grava nem
         lê o rate-limit de 4s — o problema 2 acima deixa de existir). O
         evento é empurrado pelo próprio main.js no 2xx (sem duplicar).
         Sem main.js carregado: não empurra nada (melhor perder um parcial do
         que contar conversão sem lead no RD). */
      if (typeof window.lan4EnviaContatoParcial === 'function') {
        try { window.lan4EnviaContatoParcial(form, rdId, { semRateLimit: true }); } catch (e) {}
      }
    }

    /* FIX 2026-10-13 (QA final, obs. O1): em form de ETAPA ÚNICA (Variante D)
       o blur do último campo acontece no mesmo clique do "Enviar" → parcial e
       final saíam juntos (2 POSTs ao RD, Ads parcial + completo, LeadParcial +
       Lead). Agora, em etapa única, o parcial fica PENDENTE por PARCIAL_ESPERA_MS
       e é cancelado se o submit acontecer antes. Só sai se a pessoa parar
       (ex.: não clicou em enviar) ou sair da página (pagehide/aba oculta).
       Se o submit falhar (validação/erro) e o form não concluir, rearma. */
    var PARCIAL_ESPERA_MS = 2500;
    function etapaUnica(form) {
      var steps = form.querySelectorAll('.lf-step');
      return steps.length <= 1;
    }
    function cancelaPendente(form) {
      if (form.lan4ParcialTimer) { clearTimeout(form.lan4ParcialTimer); form.lan4ParcialTimer = null; }
    }
    function agenda(form) {
      if (form.lan4ContatoParcialEnviado || form.lan4Concluido || form.lan4SubmitEmCurso) return;
      cancelaPendente(form);
      form.lan4ParcialTimer = setTimeout(function () {
        form.lan4ParcialTimer = null;
        if (!form.lan4Concluido && !form.lan4SubmitEmCurso) tryFire(form);
      }, PARCIAL_ESPERA_MS);
    }
    function bindEtapaUnica(form) {
      var marcaSubmit = function () {
        cancelaPendente(form);
        form.lan4SubmitEmCurso = true;
        /* rearma se o envio final não concluir (validação falhou / erro de rede) */
        setTimeout(function chk() {
          var btn = form.querySelector('button[type="submit"]');
          if (form.lan4Concluido) return;
          if (btn && btn.disabled) { setTimeout(chk, 2000); return; } // ainda enviando
          form.lan4SubmitEmCurso = false;
          agenda(form); // não concluiu: volta a valer o parcial pendente
        }, 1500);
      };
      form.addEventListener('submit', marcaSubmit, true);
      /* mousedown/touchstart no botão vêm ANTES do blur do campo → cancela já ali */
      ['mousedown', 'touchstart'].forEach(function (evt) {
        form.addEventListener(evt, function (e) {
          var b = e.target && e.target.closest && e.target.closest('button[type="submit"]');
          if (b) { cancelaPendente(form); form.lan4SubmitEmCurso = true; setTimeout(function () { if (!form.lan4Concluido) { var bt = form.querySelector('button[type="submit"]'); if (!bt || !bt.disabled) { form.lan4SubmitEmCurso = false; agenda(form); } } }, 1500); }
        }, true);
      });
      var saindo = function () {
        if (form.lan4ParcialTimer && !form.lan4Concluido && !form.lan4SubmitEmCurso) { cancelaPendente(form); tryFire(form); }
      };
      window.addEventListener('pagehide', saindo);
      document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') saindo(); });
    }

    function bind() {
      var forms = document.querySelectorAll('form#lf, form[data-rd-id]');
      for (var i = 0; i < forms.length; i++) {
        /* Respeita o mesmo contrato do main.js: se a etapa `contato` estiver
           marcada com [data-no-partial] (Engine — otimiza só no submit final,
           trigger GTM 117, sem trigger de lead_partial_submit), NÃO dispara o
           parcial em C/D. Sem isso, o form-ab.js empurraria um lead_partial_submit
           órfão (sem tag) no DebugView do Engine. */
        if (forms[i].querySelector('[data-step-name="contato"][data-no-partial]')) continue;
        (function (form) {
          var unica = etapaUnica(form);
          if (unica) bindEtapaUnica(form);
          ['blur', 'change'].forEach(function (evt) {
            form.addEventListener(evt, function (e) {
              var t = e.target;
              if (t && (t.name === 'nome' || t.name === 'email' || t.name === 'telefone')) {
                if (unica) agenda(form); else tryFire(form);
              }
            }, true);
          });
        })(forms[i]);
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bind);
    } else { bind(); }
  })();

  /* ── UX (nos 3 braços): typo no domínio do e-mail, no blur ── */
  (function () {
    var CORRECOES = {
      'gmial.com': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.co': 'gmail.com',
      'gmail.cm': 'gmail.com', 'gnail.com': 'gmail.com',
      'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmai.com': 'hotmail.com',
      'outlok.com': 'outlook.com', 'outlook.con': 'outlook.com',
      'yahoo.con': 'yahoo.com', 'yaho.com': 'yahoo.com',
      'uol.com': 'uol.com.br', 'bol.com': 'bol.com.br'
    };
    document.addEventListener('blur', function (e) {
      var el = e.target;
      if (!el || el.name !== 'email' || !el.value) return;
      var parts = el.value.trim().split('@');
      var hint = el.parentNode && el.parentNode.querySelector('.lf-email-typo');
      if (!hint) return;
      if (parts.length !== 2) { hint.hidden = true; return; }
      var sug = CORRECOES[parts[1].toLowerCase()];
      if (sug) {
        hint.textContent = 'Você quis dizer ' + parts[0] + '@' + sug + '?';
        hint.hidden = false;
        hint.style.cursor = 'pointer';
        hint.onclick = function () {
          el.value = parts[0] + '@' + sug;
          hint.hidden = true;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
      } else {
        hint.hidden = true;
      }
    }, true);
  })();

  /* ── Máscara de telefone — formata ENQUANTO digita, PURAMENTE COSMÉTICA ─
     O usuário digita corrido (placeholder "(11) 99999-9999") e o campo vai
     virando "(11) 99999-9999" a cada tecla — boa prática: a pessoa confere
     o número de bater o olho. O que chega ao RD Station e às plataformas
     NÃO muda: main.js normaliza com lan4PhoneDigits() (RD, Meta, Google) e
     valida com lan4ValidaTelefone() — as duas já removem qualquer caractere
     não-numérico antes de usar o valor (ver patch no main.js do validador).
     Então a máscara pode ficar no .value sem risco: submit, autoavanço de
     etapa, payload do RD e hashing Meta/Google recebem os mesmos dígitos de
     hoje (DDD + 9, com DDI 55 acrescentado onde já era). */
  (function () {
    function formata(d) {
      d = d.replace(/\D/g, '').slice(0, 11);
      if (d.length <= 2)  return d.length ? '(' + d : '';
      if (d.length <= 6)  return '(' + d.slice(0, 2) + ') ' + d.slice(2);
      if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
      return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
    }
    function aplica(el) {
      if (!el || el.name !== 'telefone') return;
      var antesLen = el.value.length;
      var caret = el.selectionStart;
      var novo = formata(el.value);
      if (novo === el.value) return;
      el.value = novo;
      /* reposiciona o cursor de forma aproximada quando editando no meio */
      if (caret != null && caret < antesLen) {
        var delta = novo.length - antesLen;
        try { el.setSelectionRange(caret + delta, caret + delta); } catch (e) {}
      }
    }
    document.addEventListener('input', function (e) { aplica(e.target); }, true);
    /* blur: se ficou incompleto (< 10 dígitos), volta a só dígitos pra não
       deixar um "(11) 9" solto atrapalhando; senão mantém formatado */
    document.addEventListener('blur', function (e) {
      var el = e.target;
      if (!el || el.name !== 'telefone' || !el.value) return;
      if (el.value.replace(/\D/g, '').length < 10) el.value = el.value.replace(/\D/g, '');
      else aplica(el);
    }, true);
  })();

  /* ── Seletor visível B|C|D — só no preview, nunca em prod ── */
  function mountPreviewSwitcher() {
    if (document.getElementById('lan4-ab-switch')) return;
    var bar = document.createElement('div');
    bar.id = 'lan4-ab-switch';
    bar.style.cssText = 'position:fixed;z-index:99999;left:12px;bottom:12px;' +
      'font:600 12px/1.2 system-ui,sans-serif;background:#0A1428;color:#fff;' +
      'border:1px solid #FFD900;border-radius:10px;padding:8px 10px;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;gap:6px;align-items:center';
    function pill(v, label) {
      return '<a href="?fv=' + v + '" style="padding:4px 9px;border-radius:6px;text-decoration:none;' +
        (VARIANT === v ? 'background:#FFD900;color:#0A1428' : 'background:#1e2a44;color:#fff') +
        '">' + label + '</a>';
    }
    bar.innerHTML = '<span style="opacity:.7">Variante:</span>' +
      pill('B', 'B · qualif→contato→serviço') +
      pill('C', 'C · serviço→qualif→contato') +
      pill('D', 'D · 1 etapa');
    document.body.appendChild(bar);
  }
})();
