/* ─────────────────────────────────────────────────────────────────────
   SIMULADOR DO RD — SÓ NO PREVIEW (GitHub Pages). NUNCA subir para produção.
   - lan4.com.br: o main.js chama window.LAN4_RD_SIMULADOR(envelope) no modo prévia.
   - lan4films: intercepta fetch para o rd-proxy (o envio NUNCA sai do navegador).
   Valida o payload contra rd-campos-snapshot.json (campos do RD Marketing
   lidos pela API) e responde como o RD responderia: 200 ou 400 com o motivo.
   Mostra cada envio num painel no canto da tela.
   ───────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var base = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');
  var campos = null, gerado = '';
  var pronto = fetch(base + 'rd-campos-snapshot.json').then(function (r) { return r.json(); })
    .then(function (j) { campos = j.campos; gerado = j.gerado_em; })
    .catch(function () { campos = null; });

  var PADRAO = ['conversion_identifier', 'email', 'name', 'job_title', 'state', 'city', 'country',
    'personal_phone', 'mobile_phone', 'twitter', 'facebook', 'linkedin', 'website', 'company_name',
    'company_site', 'company_address', 'client_tracking_id', 'traffic_source', 'traffic_medium',
    'traffic_campaign', 'traffic_value', 'tags', 'available_for_mailing', 'legal_bases'];

  function valida(p) {
    var erros = [];
    if (!p.conversion_identifier) erros.push('conversion_identifier ausente');
    if (!p.email && !p.mobile_phone) erros.push('sem email nem telefone: o RD não tem como identificar o contato');
    Object.keys(p).forEach(function (k) {
      if (PADRAO.indexOf(k) !== -1) return;
      if (k.indexOf('cf_') !== 0) { erros.push(k + ': campo desconhecido'); return; }
      if (!campos) return;
      if (!(k in campos)) { erros.push(k + ': campo NÃO existe no RD (crie em Campos personalizados)'); return; }
      var ops = campos[k];
      if (ops.length && ops.indexOf(String(p[k])) === -1) erros.push(k + ': INVALID_OPTION "' + p[k] + '" (aceita: ' + ops.join(' | ') + ')');
    });
    return erros;
  }

  function painel() {
    var el = document.getElementById('rd-sim');
    if (el) return el.querySelector('.rd-sim-log');
    el = document.createElement('div');
    el.id = 'rd-sim';
    el.style.cssText = 'position:fixed;z-index:100000;right:12px;bottom:12px;width:min(420px,calc(100vw - 24px));' +
      'max-height:60vh;overflow:auto;font:12px/1.4 system-ui,sans-serif;background:#0A1428;color:#fff;' +
      'border:1px solid #FFD900;border-radius:10px;padding:10px;box-shadow:0 8px 24px rgba(0,0,0,.4)';
    el.innerHTML = '<div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:6px">' +
      '<b>Simulador RD · nada é enviado</b><a href="#" style="color:#FFD900">fechar</a></div>' +
      '<div style="opacity:.7;margin-bottom:6px">Campos do RD de ' + (gerado || '?') + '</div><div class="rd-sim-log"></div>';
    el.querySelector('a').onclick = function (e) { e.preventDefault(); el.remove(); };
    document.body.appendChild(el);
    return el.querySelector('.rd-sim-log');
  }

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

  function registra(p, erros) {
    var log = painel();
    var ok = !erros.length;
    var d = document.createElement('details');
    d.style.cssText = 'border-top:1px solid #1e2a44;padding:6px 0';
    d.innerHTML = '<summary style="cursor:pointer"><b style="color:' + (ok ? '#5BE08A' : '#FF6B6B') + '">' +
      (ok ? '200 aceito' : '400 recusado') + '</b> · ' + esc(p.conversion_identifier || '?') +
      '<br>cf_form_variant: <b>' + esc(p.cf_form_variant || '(vazio)') + '</b> · cf_form_page: ' + esc(p.cf_form_page || '(vazio)') +
      '</summary>' + (ok ? '' : '<div style="color:#FF6B6B">' + erros.map(esc).join('<br>') + '</div>') +
      '<pre style="white-space:pre-wrap;word-break:break-all;margin:6px 0 0;opacity:.85">' + esc(JSON.stringify(p, null, 1)) + '</pre>';
    log.insertBefore(d, log.firstChild);
  }

  function simula(envelope) {
    return pronto.then(function () {
      var p = (envelope && envelope.payload) || {};
      var erros = valida(p);
      registra(p, erros);
      console.log('[Simulador RD]', erros.length ? 400 : 200, p, erros);
      var corpo = erros.length ? { errors: erros.map(function (m) { return { error_message: m }; }) } : { event_uuid: 'simulado' };
      return new Response(JSON.stringify(corpo), { status: erros.length ? 400 : 200, headers: { 'Content-Type': 'application/json' } });
    });
  }

  window.LAN4_RD_SIMULADOR = simula;

  /* lan4films (e qualquer outro fetch direto ao proxy): intercepta aqui. */
  var fetchOriginal = window.fetch;
  window.fetch = function (url, opts) {
    if (String(url).indexOf('rd-proxy') !== -1) {
      var env = {};
      try { env = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}
      return simula(env);
    }
    return fetchOriginal.apply(this, arguments);
  };
})();
