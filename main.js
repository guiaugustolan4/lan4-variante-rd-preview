/**
 * main.js — Liveblocks clone interactions
 * Replica os comportamentos do site original: dropdowns, mobile menu,
 * pointer glow, cursor animations, header scroll state.
 */

/* ─── Utils ─────────────────────────────────────────────────────────── */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ─── LAN4 Tracking Layer (GTM dataLayer) ───────────────────────────────
   Empurra eventos padronizados pro GTM: lead_form_submit (conversão),
   form_start e cta_click. user_data vai em claro e normalizado — o
   Google tag e o Meta Pixel hasheiam (SHA-256) no navegador antes de
   enviar (Enhanced Conversions / Advanced Matching). */
window.dataLayer = window.dataLayer || [];

/* ─── Código de monitoramento RD Station (Path B, 2026-09-03) ───────────
   Rastreador nativo do RD — grava o cookie __trf.src e faz a atribuição
   de origem do lead (orgânico/direto/referral/paga), que a API de
   conversão sozinha não cobre quando não há UTM na URL. Só carrega em
   produção (fora do modo prévia).

   >>> AÇÃO NECESSÁRIA: substituir LAN4_RD_LOADER_ID pelo ID da conta.
   RD Station Marketing → Configurações → Código de monitoramento →
   "Copiar código". O src é do tipo:
   https://d335luupugsy2.cloudfront.net/js/loader-scripts/<UUID>-loader.js
   Cole só o <UUID> abaixo. Enquanto estiver 'COLE-O-ID-DA-CONTA-AQUI'
   o script não carrega (no-op seguro). */
var LAN4_RD_LOADER_ID = 'c6fb78de-10d6-4e17-8ad6-85f5e6ba1008';
if (!window.LAN4_PREVIEW && !window.LAN4_RD_LOADER_ADDED && LAN4_RD_LOADER_ID && LAN4_RD_LOADER_ID.indexOf('COLE-O-ID') === -1) {
  window.LAN4_RD_LOADER_ADDED = true; /* tracking-core.js usa a mesma flag */
  (function () {
    var s = document.createElement('script');
    s.type = 'text/javascript';
    s.async = true;
    s.src = 'https://d335luupugsy2.cloudfront.net/js/loader-scripts/' + LAN4_RD_LOADER_ID + '-loader.js';
    (document.head || document.body).appendChild(s);
  })();
}

/* ─── NOVO TRACKING 2026-10 (contrato 00-contrato-eventos.md) ───────────
   event_id = UUID v4 de verdade (antes caía em 'evt-...' sem randomUUID).
   Gerado 1x no 2xx do proxy e reutilizado no dataLayer (Pixel/CAPI/GAds)
   e no RD (eid= dentro de cf_rastreamento_ids) — é a chave de dedup e de conversão offline. */
function lan4Uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  var b = new Uint8Array(16);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  var h = [];
  for (var j = 0; j < 16; j++) h.push((b[j] + 0x100).toString(16).slice(1));
  return h.slice(0, 4).join('') + '-' + h.slice(4, 6).join('') + '-' + h.slice(6, 8).join('') + '-' + h.slice(8, 10).join('') + '-' + h.slice(10).join('');
}
function lan4EventId() { return lan4Uuid(); }

/* LAN4-ATTR-START ─────────────────────────────────────────────────────
   Bloco de atribuição COMPARTILHADO: idêntico em main.js e tracking-core.js
   (copiar/colar entre os marcadores; o teste compara os dois). Funções
   puras (lan4AttrTouch, lan4AttrDecideUltimo, lan4AttrDecidePrimeiro,
   lan4AttrIdsStr, lan4AttrOrigemStr) não tocam DOM e são testáveis em node.
   Cookies 1st-party (domain=.lan4.com.br só em lan4.com.br; SameSite=Lax;
   Secure em https; 90 d):
     _l4_lt = ÚLTIMO TOQUE NÃO-DIRETO (JSON) — sobrescrito só por visita com
              utm_* / click id / referrer externo. Direto/interno não mexe.
     _l4_ft = PRIMEIRO TOQUE (JSON) — gravado 1x, nunca sobrescrito.
     _l4_lu = ÚLTIMO TOQUE COM UTM REAL OU CLICK ID (JSON) — fonte ÚNICA dos
              cf_utm_* / traffic_* enviados ao RD. Toque só de referrer
              (orgânico/social/referral) NÃO sobrescreve (fica só no _l4_lt
              → cf_rastreamento_origem). Motivo: a planilha de pacing lê
              cf_utm_medium e 'organic' viraria canal errado.
     _l4_gclid/_l4_gbraid/_l4_wbraid/_l4_fbc (90 d) e _l4_li_fat_id (30 d) — click
              IDs crus, last-click por parâmetro (nunca hash/caixa). */
function lan4GetCookie(name) {
  try {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name.replace(/\./g, '\\.') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  } catch (e) { return ''; }
}
function lan4SetCookie(name, value, days) {
  try {
    var dom = /(^|\.)lan4\.com\.br$/.test(location.hostname) ? ';domain=.lan4.com.br' : '';
    var sec = location.protocol === 'https:' ? ';Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) + ';path=/;max-age=' + (days * 86400) + dom + ';SameSite=Lax' + sec;
  } catch (e) {}
}
/* fbc no formato da Meta: fb.1.<timestamp ms>.<fbclid> — fbclid sem mudar caixa */
function lan4BuildFbc(fbclid, ms) {
  return fbclid ? 'fb.1.' + (ms || Date.now()) + '.' + fbclid : '';
}
/* _ga = GA1.1.<rand>.<ts> → client_id "<rand>.<ts>" */
function lan4GaClientId(ga) {
  var p = (ga || '').split('.');
  return p.length >= 4 ? p.slice(-2).join('.') : '';
}
function lan4AttrHoje(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
/* Referrer → {source, medium}: busca → organic · redes → social · outro
   domínio → referral · vazio / próprio domínio (*.lan4.com.br ou o host
   atual) → null (= visita direta/interna). */
function lan4RefOrigem(ref, ownHost) {
  if (!ref) return null;
  var host;
  try { host = new URL(ref).hostname.replace(/^www\./, '').toLowerCase(); }
  catch (e) { return null; }
  var own = (ownHost || (typeof location !== 'undefined' ? location.hostname : '')).replace(/^www\./, '').toLowerCase();
  if (!host || host === own || /(^|\.)lan4\.com\.br$/.test(host)) return null;
  var SEARCH = /(^|\.)(google|bing|yahoo|duckduckgo|ecosia|yandex)\./;
  var SOCIAL = /(^|\.)(instagram|facebook|fb|l\.facebook|lm\.facebook|linkedin|lnkd|youtube|youtu\.be|tiktok|t\.co|twitter|x|pinterest|reddit|threads)\.?/;
  if (SEARCH.test(host)) return { source: host.split('.').slice(-2, -1)[0] || host, medium: 'organic' };
  if (SOCIAL.test(host)) {
    var name = host.split('.').slice(-2, -1)[0] || host;
    if (name === 'fb' || host.indexOf('facebook') > -1) name = 'facebook';
    if (host === 't.co' || name === 'x') name = 'twitter';
    if (host.indexOf('youtube') > -1) name = 'youtube';
    return { source: name, medium: 'social' };
  }
  return { source: host, medium: 'referral' };
}
/* PURA. Classifica a visita. params = objeto {nome: valor} da query string.
   Retorna o toque (objeto) se a visita é NÃO-DIRETA, ou null se é direta/
   interna. Prioridade: utm_* > click id (gclid/gbraid/wbraid → google/cpc;
   fbclid → facebook/paid_social; li_fat_id → linkedin/paid_social) >
   referrer externo. lp = landing (origem+path+query, máx. 300). */
function lan4AttrTouch(params, referrer, landing, ownHost, hoje) {
  params = params || {};
  var g = function (k) { return params[k] || ''; };
  var t = { s: g('utm_source'), m: g('utm_medium'), c: g('utm_campaign'), t: g('utm_term'),
    ct: g('utm_content'), uid: g('utm_id'), as: g('adset_id'), ad: g('ad_id'), pl: g('placement'),
    lp: (landing || '').slice(0, 300), dt: hoje || lan4AttrHoje() };
  var temUtm = !!(t.s || t.m || t.c || t.t || t.ct || t.uid);
  var temClick = !!(g('gclid') || g('gbraid') || g('wbraid') || g('fbclid') || g('li_fat_id'));
  if (!temUtm && !temClick) {
    var ref = lan4RefOrigem(referrer, ownHost);
    if (!ref) return null;
    t.s = ref.source; t.m = ref.medium;
  } else if (!t.s) {
    if (g('gclid') || g('gbraid') || g('wbraid')) { t.s = 'google'; t.m = t.m || 'cpc'; }
    else if (g('fbclid')) { t.s = 'facebook'; t.m = t.m || 'paid_social'; }
    else if (g('li_fat_id')) { t.s = 'linkedin'; t.m = t.m || 'paid_social'; }
  }
  Object.keys(t).forEach(function (k) { if (!t[k]) delete t[k]; });
  return t;
}
/* PURA. A visita tem utm_* real ou click id? (= pode preencher cf_utm_*) */
function lan4AttrTemUtm(params) {
  params = params || {};
  return ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id',
    'gclid', 'gbraid', 'wbraid', 'fbclid', 'li_fat_id'].some(function (k) { return !!params[k]; });
}
/* PURA. Último toque: só troca quando a visita é não-direta. */
function lan4AttrDecideUltimo(atual, toque) { return toque ? toque : (atual || null); }
/* PURA. Primeiro toque: se já existe, nunca muda. Se não existe, grava o
   toque desta visita (ou "(direct)/(none)" quando a 1ª visita é direta). */
function lan4AttrDecidePrimeiro(atual, toque, landing, hoje) {
  if (atual && atual.s) return atual;
  if (toque) return { s: toque.s || '', m: toque.m || '', lp: toque.lp || '', dt: toque.dt || hoje || lan4AttrHoje() };
  return { s: '(direct)', m: '(none)', lp: (landing || '').slice(0, 300), dt: hoje || lan4AttrHoje() };
}
function lan4AttrLe(nome) {
  try { var v = lan4GetCookie(nome); return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
var LAN4_ATTR_MAX = 1000;
function lan4AttrJunta(pares, sep) {
  return pares.filter(function (p) { return p[1]; }).map(function (p) { return p[0] + '=' + p[1]; }).join(sep || '|');
}
/* PURA. cf_rastreamento_ids: gclid=…|gbraid=…|wbraid=…|fbc=…|fbp=…|li=…|ga=…|eid=…
   (vazios omitidos; valores crus). Limite 1000 caracteres (corta o fim). */
function lan4AttrIdsStr(ids) {
  ids = ids || {};
  return lan4AttrJunta([['gclid', ids.gclid], ['gbraid', ids.gbraid], ['wbraid', ids.wbraid],
    ['fbc', ids.fbc], ['fbp', ids.fbp], ['li', ids.li], ['ga', ids.ga], ['eid', ids.eid]]).slice(0, LAN4_ATTR_MAX);
}
/* PURA. cf_rastreamento_origem — TEXTO LEGÍVEL em português (para pessoas):
   ÚLTIMO CONTATO (12/10/2026): Instagram · Anúncio pago · Campanha: x · Conjunto: y ·
   Anúncio: z · Posição: Instagram Reels · Entrou em: /s/diagnostico/ ||
   PRIMEIRO CONTATO (01/10/2026): Google · Busca orgânica · Entrou em: /blog/x/ ||
   WhatsApp: L4-7KQ2 || IDs: campanha 123 · conjunto 456 · anúncio 789
   Partes vazias omitidas. Códigos desconhecidos aparecem crus. Página = só o
   caminho (sem domínio/query). Se passar de 1000, encurta primeiro os
   caminhos, depois corta o fim. NÃO é para máquina ler (n8n usa cf_utm_*). */
var LAN4_ATTR_FONTES = { fb: 'Facebook', facebook: 'Facebook', ig: 'Instagram', instagram: 'Instagram',
  an: 'Audience Network', msg: 'Messenger', google: 'Google', bing: 'Bing', linkedin: 'LinkedIn',
  youtube: 'YouTube', '(direct)': 'Acesso direto (digitou o endereço)' };
var LAN4_ATTR_MEIOS = { paid_social: 'Anúncio pago', cpc: 'Anúncio pago', ppc: 'Anúncio pago', paid: 'Anúncio pago',
  organic: 'Busca orgânica', social: 'Rede social (orgânico)', referral: 'Indicação de outro site',
  bio: 'Link da bio', email: 'E-mail', '(none)': '' };
function lan4AttrTraduz(mapa, v) {
  if (!v) return '';
  var k = String(v).toLowerCase();
  return Object.prototype.hasOwnProperty.call(mapa, k) ? mapa[k] : String(v);
}
function lan4AttrData(dt) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dt || '');
  return m ? m[3] + '/' + m[2] + '/' + m[1] : (dt || '');
}
function lan4AttrCaminho(lp) {
  if (!lp) return '';
  var s = String(lp).split('#')[0].split('?')[0];
  var m = /^[a-z][a-z0-9+.-]*:\/\/[^\/]*(\/.*)?$/i.exec(s);
  if (m) s = m[1] || '/';
  return s;
}
function lan4AttrOrigemStr(u, f, wa) {
  function bloco(rotulo, t, completo, lpMax) {
    if (!t || !(t.s || t.m || t.lp)) return '';
    var p = [lan4AttrTraduz(LAN4_ATTR_FONTES, t.s), lan4AttrTraduz(LAN4_ATTR_MEIOS, t.m)];
    if (completo) {
      if (t.c) p.push('Campanha: ' + t.c);
      if (t.t) p.push('Conjunto: ' + t.t);
      if (t.ct) p.push('Anúncio: ' + t.ct);
      if (t.pl) p.push('Posição: ' + String(t.pl).replace(/_/g, ' '));
    }
    var cam = lan4AttrCaminho(t.lp).slice(0, lpMax);
    if (cam) p.push('Entrou em: ' + cam);
    var dt = lan4AttrData(t.dt);
    return rotulo + (dt ? ' (' + dt + ')' : '') + ': ' + p.filter(Boolean).join(' · ');
  }
  function monta(lpMax) {
    var partes = [bloco('ÚLTIMO CONTATO', u, true, lpMax), bloco('PRIMEIRO CONTATO', f, false, lpMax)];
    if (wa) partes.push('WhatsApp: ' + wa);
    if (u) {
      var ids = [];
      if (u.uid) ids.push('campanha ' + u.uid);
      if (u.as) ids.push('conjunto ' + u.as);
      if (u.ad) ids.push('anúncio ' + u.ad);
      if (ids.length) partes.push('IDs: ' + ids.join(' · '));
    }
    return partes.filter(Boolean).join(' || ');
  }
  var lp = 300, s = monta(lp);
  while (s.length > LAN4_ATTR_MAX && lp > 0) { lp = Math.max(0, lp - 50); s = monta(lp); }
  return s.slice(0, LAN4_ATTR_MAX);
}
/* Captura (DOM): roda 1x por página, em main.js OU tracking-core.js. */
function lan4CapturaAtribuicao() {
  if (window.LAN4_ATTR_CAPTURED) return;
  window.LAN4_ATTR_CAPTURED = true;
  try {
    var qs = new URLSearchParams(location.search), params = {};
    qs.forEach(function (v, k) { if (v && !params[k]) params[k] = v; });
    [['gclid', '_l4_gclid', 90], ['gbraid', '_l4_gbraid', 90], ['wbraid', '_l4_wbraid', 90],
     ['li_fat_id', '_l4_li_fat_id', 30]].forEach(function (c) { if (params[c[0]]) lan4SetCookie(c[1], params[c[0]], c[2]); });
    if (params.fbclid) {
      /* se o pixel já gravou _fbc com ESSE fbclid, reaproveita (mesmo timestamp) */
      var fbcPixel = lan4GetCookie('_fbc');
      lan4SetCookie('_l4_fbc', (fbcPixel && fbcPixel.slice(-params.fbclid.length) === params.fbclid) ? fbcPixel : lan4BuildFbc(params.fbclid), 90);
    }
    var landing = location.origin + location.pathname + location.search;
    var toque = lan4AttrTouch(params, document.referrer || '', landing, location.hostname);
    if (toque) lan4SetCookie('_l4_lt', JSON.stringify(lan4AttrDecideUltimo(lan4AttrLe('_l4_lt'), toque)), 90);
    if (toque && lan4AttrTemUtm(params)) lan4SetCookie('_l4_lu', JSON.stringify(toque), 90);
    var ft = lan4AttrLe('_l4_ft');
    if (!ft || !ft.s) lan4SetCookie('_l4_ft', JSON.stringify(lan4AttrDecidePrimeiro(ft, toque, landing)), 90);
  } catch (e) {}
}
/* Último toque COM UTM/click id (_l4_lu) no formato utm_* — alimenta
   cf_utm_* e traffic_*. Orgânico/referral sem UTM não entra aqui. */
function lan4GetUtms() {
  var u = lan4AttrLe('_l4_lu') || {}, o = {};
  if (u.s) o.utm_source = u.s;
  if (u.m) o.utm_medium = u.m;
  if (u.c) o.utm_campaign = u.c;
  if (u.t) o.utm_term = u.t;
  if (u.ct) o.utm_content = u.ct;
  return o;
}
/* Os 2 campos consolidados p/ o RD (lidos dos cookies na hora do envio). */
function lan4AtribuicaoRd(eventId, waRef) {
  var p = {
    cf_rastreamento_ids: lan4AttrIdsStr({
      gclid: lan4GetCookie('_l4_gclid'), gbraid: lan4GetCookie('_l4_gbraid'), wbraid: lan4GetCookie('_l4_wbraid'),
      fbc: lan4GetCookie('_l4_fbc') || lan4GetCookie('_fbc'), fbp: lan4GetCookie('_fbp'),
      li: lan4GetCookie('_l4_li_fat_id'), ga: lan4GaClientId(lan4GetCookie('_ga')), eid: eventId || ''
    }),
    cf_rastreamento_origem: lan4AttrOrigemStr(lan4AttrLe('_l4_lt'), lan4AttrLe('_l4_ft'), waRef || '')
  };
  Object.keys(p).forEach(function (k) { if (!p[k]) delete p[k]; });
  return p;
}
/* LAN4-ATTR-END ───────────────────────────────────────────────────── */
lan4CapturaAtribuicao();

/* lan4_page_meta — 1º push "nosso" da página. page_type: window.LAN4_PAGE_TYPE
   (se a página fixar) ou derivado do path. */
function lan4PageType(path) {
  path = path || location.pathname;
  if (window.LAN4_PAGE_TYPE) return window.LAN4_PAGE_TYPE;
  if (path === '/' || path === '/index.html') return 'home';
  if (/^\/engine(\/|$)/.test(path)) return 'engine';
  if (/^\/s\/(diagnostico|solucao|vsl)(\/|$)/.test(path)) return 'lp';
  if (/^\/s\//.test(path)) return 'servico';
  if (/^\/blog(\/|$)/.test(path)) return 'blog';
  if (/^\/links(\/|$)/.test(path)) return 'links';
  if (/^\/politica-de-privacidade(\/|$)/.test(path)) return 'politica';
  return '404';
}
function lan4PushPageMeta() {
  if (window.LAN4_PAGE_META_SENT) return;
  window.LAN4_PAGE_META_SENT = true;
  window.dataLayer.push({ event: 'lan4_page_meta', page_type: lan4PageType(), site: 'lan4' });
}
lan4PushPageMeta();

/* wa_ref: código curto p/ casar a conversa do WhatsApp com o lead (L4-XXXX,
   sem 0/O/1/I para não confundir na leitura). */
function lan4WaRef() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s = '';
  var b = new Uint8Array(4);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (var i = 0; i < 4; i++) b[i] = Math.floor(Math.random() * 256);
  for (var j = 0; j < 4; j++) s += abc.charAt(b[j] % abc.length);
  return 'L4-' + s;
}
function lan4FormVariant() { return window.LAN4_FORM_VARIANT || ''; }

/* Mesmas 8 opções de serviço do form principal da home (index.html,
   fieldset "servico_interesse", ~linha 963) + "Nenhum" — usado nos
   seletores <select> do pop-up de material isca e do modal de WhatsApp
   pra manter o mesmo vocabulário de cf_servico_de_interesse em todo o
   site (identificador correto, COM "de" — ver nota extensa ~linha 128,
   NÃO reabrir essa investigação). "Nenhum" existe pra despriorizar
   lead sem interesse real
   (crianças, candidatos a emprego etc.) sem forçar a pessoa a escolher
   um serviço que não corresponde à intenção dela. */
var LAN4_SERVICO_OPTIONS = [
  'Engine (Solução 360°)',
  'Vendas e CRM',
  'Marketing Digital',
  'Mídia Paga',
  'Gestão de Redes Sociais',
  'Audiovisual e Conteúdo',
  'Eventos Corporativos',
  'Recrutamento e Seleção',
  'Nenhum'
];
var LAN4_SERVICO_OPTIONS_HTML = LAN4_SERVICO_OPTIONS.map(function (nome) {
  return '<option value="' + nome + '" style="color:#fff;background:#0d2149;">' + nome + '</option>';
}).join('');

/* Visual do <select> de serviço nos pop-ups (isca + modal WhatsApp) —
   mesmo padrão da calculadora do Engine (engine/index.html #calculadora,
   CSS em css/components.css ".engine-calc-preview .field select"):
   appearance nativo removido, seta SVG amarela customizada, foco amarelo.
   Injetado 1x, compartilhado pelos dois pop-ups. */
(function () {
  var style = document.createElement('style');
  style.textContent = '.lan4-servico-select{'
    + 'appearance:none;-webkit-appearance:none;'
    + 'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\' viewBox=\'0 0 12 8\' fill=\'none\'%3E%3Cpath d=\'M1 1.5L6 6.5L11 1.5\' stroke=\'%23FFD900\' stroke-width=\'1.6\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/%3E%3C/svg%3E");'
    + 'background-repeat:no-repeat;background-position:right 14px center;'
    + 'padding-right:34px;cursor:pointer;}'
    + '.lan4-servico-select:hover{border-color:rgba(255,255,255,.32) !important;}'
    + '.lan4-servico-select:focus{outline:none;border-color:#FFD900 !important;background-color:rgba(255,217,0,.06) !important;box-shadow:0 0 0 3px rgba(255,217,0,.18);}';
  document.head.appendChild(style);
})();

function lan4NormalizeEmail(raw) {
  return (raw || '').trim().toLowerCase();
}

/* ─── DDDs válidos do Brasil (67, fonte ANATEL / plano de numeração) ─────
   Lista fechada em vez de faixa "11..99": ~30 combinações de dois dígitos
   nessa faixa NUNCA foram atribuídas (20, 23, 25, 26, 29, 30, 36, 39, 40,
   50, 52, 56–60, 70, 72, 76, 78, 80, 90…). Aceitar essas faixas deixava
   passar telefone digitado errado com "cara" de DDD. Se a ANATEL criar um
   DDD novo (raríssimo — o último foi em 2001), basta adicionar aqui. */
var LAN4_DDDS_VALIDOS = {
  11:1,12:1,13:1,14:1,15:1,16:1,17:1,18:1,19:1,
  21:1,22:1,24:1,27:1,28:1,
  31:1,32:1,33:1,34:1,35:1,37:1,38:1,
  41:1,42:1,43:1,44:1,45:1,46:1,47:1,48:1,49:1,
  51:1,53:1,54:1,55:1,
  61:1,62:1,63:1,64:1,65:1,66:1,67:1,68:1,69:1,
  71:1,73:1,74:1,75:1,77:1,79:1,
  81:1,82:1,83:1,84:1,85:1,86:1,87:1,88:1,89:1,
  91:1,92:1,93:1,94:1,95:1,96:1,97:1,98:1,99:1
};

/* Núcleo único de validação de celular BR. Recebe SÓ dígitos (11 esperados:
   DDD + 9XXXXXXXX). Retorna true só se: DDD na lista fechada acima + 9º
   dígito começando com "9" + os 8 finais não sendo um bloco repetido
   (99999999, 00000000 etc. — número de teste/placeholder). É a mesma regra
   que a máscara, o validador visível e o normalizador de plataforma usam,
   pra não haver caminho que aceite o que outro rejeita (defense-in-depth:
   toda camada aplica O MESMO contrato). */
function lan4CelularValido(d11) {
  if (!/^\d{11}$/.test(d11)) return false;
  if (!LAN4_DDDS_VALIDOS[parseInt(d11.slice(0, 2), 10)]) return false;
  if (d11.charAt(2) !== '9') return false;
  var assinante = d11.slice(3); // 8 dígitos após o "9"
  if (/^(\d)\1{7}$/.test(assinante)) return false; // 8 dígitos iguais → placeholder
  return true;
}

/* Telefone cru → "55" + 11 dígitos NACIONAIS válidos, ou ''.

   Exige EXATAMENTE 11 dígitos na entrada (DDD + 9XXXXXXXX). Não tenta
   descascar DDI 55 nem adivinhar: o campo de telefone do site é
   nacional-only (máscara e placeholder "(11) 99999-9999") e
   lan4ValidaTelefone já barra no campo qualquer coisa com 55 na frente,
   com mensagem explícita. Aceitar 13 dígitos "55…" aqui era a porta de
   dois bugs — 2026-07-30 (10 díg viravam DDD inventado ao prefixar 55) e
   2026-09-09 (13 díg "55" + 11 dígitos quaisquer passavam sem validar e o
   RD lia o "55" como DDD → "(55) 11914-7068"). Qualquer entrada que não
   seja 11 dígitos que passem em lan4CelularValido retorna '' — nunca PII
   incorreta nas plataformas. */
function lan4PhoneDigits(raw) {
  var d = (raw || '').replace(/\D/g, '');
  if (d.length !== 11) return '';
  return lan4CelularValido(d) ? '55' + d : '';
}
/* Google Ads Enhanced Conversions: E.164 com '+' */
function lan4NormalizePhoneGoogle(raw) {
  var d = lan4PhoneDigits(raw);
  return d ? '+' + d : '';
}
/* Meta Advanced Matching / CAPI: só dígitos, sem '+' (doc oficial da Meta) */
function lan4NormalizePhoneMeta(raw) {
  return lan4PhoneDigits(raw);
}

function lan4SplitName(nome) {
  var parts = (nome || '').trim().split(/\s+/);
  return {
    first: (parts[0] || '').toLowerCase(),
    last: (parts.length > 1 ? parts[parts.length - 1] : '').toLowerCase()
  };
}

/* Chamar APENAS no callback de sucesso do envio ao RD Station.
   eventName distingue o formulário real (lead_form_submit, alimenta a
   conversão "Lead Form" do Google Ads) dos fluxos secundários
   (WhatsApp, material isca), que usam seu próprio nome de evento para
   não contaminar essa conversão — mesmo padrão já aplicado no Meta
   Pixel (trackCustom em vez de standard Lead) para esses fluxos. */
/* NOVO 2026-10: eventId vem de quem enviou ao RD (o MESMO que foi em
   cf_event_id); extra = params adicionais do contrato. user_data.phone =
   só dígitos com 55 (contrato) e user_data é limpo logo após o push. */
function lan4PushLead(identificador, p, eventName, eventId, extra) {
  var name = lan4SplitName(p.nome);
  var ev = Object.assign({
    event: eventName || 'lead_form_submit',
    form_id: identificador,
    form_identifier: identificador, /* legado — GTM antigo; pode sair depois */
    form_variant: lan4FormVariant(),
    event_id: eventId || lan4EventId(),
    lead: {
      cargo: p.cargo || '',
      faturamento: p.faturamento || '',
      servico: p.servico || '',
      company: p.empresa || ''
    },
    user_data: {
      email: lan4NormalizeEmail(p.email),
      phone: lan4PhoneDigits(p.telefone),
      first_name: name.first,
      last_name: name.last,
      company: p.empresa || ''
    }
  }, extra || {});
  window.dataLayer.push(ev);
  window.dataLayer.push({ user_data: undefined });
}

/* ─── UTMs → RD Station ─────────────────────────────────────────────────
   Captura os UTMs na entrada, persiste na sessão (sobrevive à navegação
   na página) e injeta no payload da conversão do RD. O comercial recebe
   o serviço de interesse via cf_servico_de_interesse (derivado do
   utm_content prefixado das campanhas de Search; utm_term NÃO entra).

   ═══════════════════════════════════════════════════════════════
   ⚠️  IDENTIFICADOR CORRETO E DEFINITIVO (confirmado 07/08/2026,
       teste A/B lado a lado, NÃO reabrir esta investigação):
       cf_servico_de_interesse — COM "de".
   ═══════════════════════════════════════════════════════════════
   A tela de edição do campo no RD (Configurações → Campos
   personalizados → Serviço de interesse → Editar → "Enunciado do
   campo") mostra "cf_servico_interesse" (SEM "de") — esse texto é
   ENGANOSO/desatualizado em relação ao que a API de conversão
   (app.rdstation.com.br/api/1.3/conversions) realmente aceita e
   persiste. Comprovado por teste A/B controlado: dois leads de
   teste, payload idêntico exceto o nome do campo — o valor enviado
   como "cf_servico_interesse" (sem "de") nunca apareceu no card do
   lead nem na tela de edição (mesmo aparecendo no e-mail cru de
   notificação "Novo lead!", que só ecoa o payload recebido sem
   validar contra o schema real); o valor enviado como
   "cf_servico_de_interesse" (com "de") persistiu corretamente em
   ambos os lugares. Testado com payload minimalista (sem acentos,
   sem caracteres especiais) e via conversão real do site (não só
   API de teste) — não é questão de encoding nem de payload
   incompleto. Se precisar reconfirmar, repita esse teste A/B antes
   de acreditar em qualquer tela do RD que mostre o nome do campo. */
/* UTMs/referrer: antes em sessionStorage (perdia a origem entre visitas).
   Desde 2026-10-13 vêm do ÚLTIMO TOQUE COM UTM/click id (cookie _l4_lu) —
   ver bloco LAN4-ATTR no topo. lan4GetUtms()/lan4RefOrigem() estão lá. */

function lan4ServicoInteresse(utms) {
  var mapa = {
    vendas: 'Vendas e CRM', social: 'Gestão de Redes Sociais',
    recrut: 'Recrutamento e Seleção', midia: 'Mídia Paga',
    audio: 'Audiovisual e Conteúdo', eventos: 'Eventos Corporativos',
    mkt: 'Marketing Digital', nicho: 'Nichos', ia: 'Inteligência Artificial',
    engine: 'Engine', films: 'Lan4Films',
    marca: 'Marca/Institucional', 'material-isca': 'Isca/Material Rico'
  };
  var c = (utms.utm_content || '').toLowerCase();
  for (var k in mapa) { if (c.indexOf(k) === 0) return mapa[k]; }
  /* Fix QA 2026-10-13: removida a regra antiga "Meta: conjunto = serviço"
     (return utm_term || utm_content). No esquema novo utm_term = nome do
     conjunto e utm_content = criativo, não serviço. Sem prefixo do mapa:
     vazio (o serviço vem da página/form). */
  return '';
}

/* Cookie __trf.src — gravado pelo código de monitoramento nativo do RD
   (Path B). É a fonte de verdade de atribuição do RD (cobre orgânico/
   direto/referral, não só quando há UTM). Se presente, mandamos ele em
   traffic_source e o RD resolve "Origem"/"Fonte" a partir dele. */
function lan4TrfSrc() {
  try {
    var m = document.cookie.match(/(?:^|;\s*)__trf\.src=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  } catch (e) { return ''; }
}

/* Monta os campos de atribuição (traffic_*) para a API de conversão v2 do
   RD — é ISSO que popula os campos nativos "Origem" e "Fonte" no card do
   lead (a API v1.3 antiga ignorava traffic_source; só os cf_utm_* apareciam,
   sem virar atribuição). Os cf_utm_* continuam indo em paralelo como
   histórico/fallback. Regra da LAN4 mantida: só anexa origem se houver
   dado real (UTM na URL de entrada OU cookie __trf.src do rastreador RD) —
   nunca inventa origem de mídia paga. */
function lan4RdUtmPayload() {
  var u = lan4GetUtms();
  var trf = lan4TrfSrc();
  var p = {};
  /* Prioridade de atribuição (2026-10-13):
     1. ÚLTIMO TOQUE COM UTM/CLICK ID persistido (_l4_lu; orgânico/referral não entra)
     2. cookie __trf.src (rastreador nativo do RD), se não houver último toque */
  if (u.utm_source) {
    p.traffic_source   = u.utm_source;
    if (u.utm_medium)   p.traffic_medium   = u.utm_medium;
    if (u.utm_campaign) p.traffic_campaign = u.utm_campaign;
    if (u.utm_term)     p.traffic_value    = u.utm_term;
  } else if (trf) {
    p.traffic_source = trf;
  }
  /* cf_utm_* — histórico/fallback, texto livre no card (já funcionavam) */
  if (u.utm_source)   p.cf_utm_source   = u.utm_source;
  if (u.utm_medium)   p.cf_utm_medium   = u.utm_medium;
  if (u.utm_campaign) p.cf_utm_campaign = u.utm_campaign;
  if (u.utm_term)     p.cf_utm_term     = u.utm_term;
  if (u.utm_content)  p.cf_utm_content  = u.utm_content;
  /* cf_rastreamento_ids / cf_rastreamento_origem: montados em lan4EnviaRd
     (precisam do event_id e do wa_ref de cada envio). */
  /* Prioridade: window.LAN4_SERVICO_PAGINA primeiro — é fixo e correto pra
     página (/s/<slug>/, /engine/), não depende de UTM bater com o mapa.
     lan4ServicoInteresse(u) só entra como fallback pra páginas que não fixam
     a variável (ex.: Home via tráfego pago sem passar pelo seletor). Ordem
     antiga (UTM primeiro) tinha bug: a função sempre retornava ALGUM valor
     quando havia utm_term/utm_content (linha de fallback genérico), mesmo
     que o texto não fosse um serviço de verdade — isso sobrescrevia o
     LAN4_SERVICO_PAGINA correto da página com lixo de nome de criativo/adset
     sempre que o UTM não batia com nenhum prefixo do mapa. */
  var servico = window.LAN4_SERVICO_PAGINA || lan4ServicoInteresse(u) || '';
  if (servico) p.cf_servico_de_interesse = servico;
  return p;
}

/* ─── Validação de telefone (11 dígitos corridos: DDD + celular) ──────
   Retorna '' se válido, ou a mensagem de erro explicando o que corrigir.

   A máscara VISUAL de telefone do form-ab.js (rodada 2 do teste A/B) deixa
   "(11) 99999-9999" no campo. Esses caracteres de formatação — ( ) espaço
   - . — são tolerados aqui (removidos em silêncio antes de validar), do
   mesmo jeito que lan4PhoneDigits() já faz para o RD/Meta/Google. Qualquer
   OUTRO caractere não-numérico (letra, símbolo digitado à mão) continua
   sendo erro explícito. Assim o formulário não trava por causa da máscara,
   e o que chega ao RD/plataformas segue idêntico (só dígitos). */
function lan4ValidaTelefone(raw) {
  var val = (raw || '').trim().replace(/[()\s.\-]/g, '');
  if (!val) return 'Preencha o telefone (ex.: 11998765432).';
  var invalidos = val.replace(/[0-9]/g, '');
  if (invalidos) {
    var unicos = invalidos.split('').filter(function (c, i, a) { return a.indexOf(c) === i; })
      .map(function (c) { return c === ' ' ? 'espaço' : '\"' + c + '\"'; }).join(', ');
    return 'O telefone deve ter apenas números, sem ' + unicos + '. Digite DDD + celular corrido (ex.: 11998765432).';
  }
  if (val.length === 13 && val.indexOf('55') === 0) {
    return 'Digite sem o código do país (55): apenas DDD + celular, 11 dígitos (ex.: 11998765432).';
  }
  if (val.length !== 11) {
    return 'O telefone deve ter 11 dígitos (DDD + celular, ex.: 11998765432). Você digitou ' + val.length + '.';
  }
  /* comprimento OK: agora o conteúdo (DDD real + 9 + não-placeholder) —
     mesma regra do normalizador de plataforma (lan4CelularValido) */
  if (!LAN4_DDDS_VALIDOS[parseInt(val.slice(0, 2), 10)]) {
    return 'DDD inválido (' + val.slice(0, 2) + '). Confira os dois primeiros dígitos (ex.: 11998765432).';
  }
  if (val.charAt(2) !== '9') {
    return 'Número de celular começa com 9 após o DDD (ex.: 11 9XXXX-XXXX).';
  }
  if (/^(\d)\1{7}$/.test(val.slice(3))) {
    return 'Confira o número — os dígitos parecem repetidos/incompletos.';
  }
  return '';
}

/* Valor de um campo por name — cobre input/select, radio e checkbox.
   Checkbox de grupo (mais de um input com o mesmo name, ex.: servico_interesse
   multi-seleção): retorna todos os valores marcados juntos, separados por
   ", " — usado tanto na validação (não-vazio = pelo menos 1 marcado) quanto
   no payload do RD (RD aceita string livre no campo, mesmo que a UI dele
   seja seleção única — ver documentação de migração do campo). */
function lan4CampoValor(form, name) {
  var el = form.querySelector('[name="' + name + '"]');
  if (!el) return '';
  if (el.type === 'radio') {
    var marcado = form.querySelector('[name="' + name + '"]:checked');
    return marcado ? marcado.value : '';
  }
  if (el.type === 'checkbox') {
    var grupo = $$('[name="' + name + '"]', form);
    if (grupo.length > 1) {
      return grupo.filter(function (c) { return c.checked; })
                  .map(function (c) { return c.value; })
                  .join(', ');
    }
    return el.checked ? 'sim' : '';
  }
  return (el.value || '').trim();
}

/* Validação de campos obrigatórios — retorna '' ou mensagem com o campo faltante */
function lan4ValidaObrigatorios(form, campos) {
  for (var i = 0; i < campos.length; i++) {
    if (!lan4CampoValor(form, campos[i][0])) return 'Preencha o campo obrigatório: ' + campos[i][1] + '.';
  }
  return '';
}

/* Campos obrigatórios declarados no HTML: data-req="name:Rótulo,name:Rótulo" por etapa */
function lan4ReqEtapa(step) {
  return (step.getAttribute('data-req') || '').split(',').filter(Boolean).map(function (par) {
    var i = par.indexOf(':');
    return [par.slice(0, i).trim(), par.slice(i + 1).trim()];
  });
}

/* Todos os obrigatórios do form (união das etapas) — usado na validação do submit */
function lan4ReqDoForm(form) {
  var campos = [];
  $$('.lf-step', form).forEach(function (s) { campos = campos.concat(lan4ReqEtapa(s)); });
  return campos;
}

/* Identificador de conversão do RD por form: declarado em data-rd-id no <form>
   (páginas de serviço usam identificadores próprios, ex.: lan4-lp-redes-sociais).
   NUNCA cair em form.id: um form com id="lf" servido de cache antigo (sem o
   atributo data-rd-id) chegou a criar no RD um evento "lf" — identificador
   degradado. O pior caso agora é sempre 'lan4-contato-site', não o id do DOM. */
function lan4FormId(form, fallback) {
  return form.getAttribute('data-rd-id') || fallback || 'lan4-contato-site';
}

/* Campos extras específicos da página: grupos com data-rd-cf="cf_x" data-rd-name="name"
   entram no payload do RD sem mexer no JS — cada página declara os seus no HTML */
function lan4ExtrasRd(form) {
  var extras = {};
  $$('[data-rd-cf]', form).forEach(function (el) {
    var valor = lan4CampoValor(form, el.getAttribute('data-rd-name') || '');
    if (valor) extras[el.getAttribute('data-rd-cf')] = valor;
  });
  return extras;
}

/* ─── Sticky CTA mobile ────────────────────────────────────────────────
   Aparece após rolar a 1ª dobra e some quando o formulário de contato
   está visível (para não cobrir campos/botão de envio). Clique já é
   trackeado pelo listener global de data-cta. */
(function () {
  var bar = document.getElementById('sticky-cta');
  if (!bar) return;
  var contato = document.getElementById('contato');
  var formVisivel = false;

  function atualiza() {
    var mostrar = window.scrollY > 500 && !formVisivel;
    bar.classList.toggle('is-visible', mostrar);
    bar.setAttribute('aria-hidden', mostrar ? 'false' : 'true');
  }

  /* iOS Safari: a barra de ferramentas inferior do navegador expande ao
     arrastar para cima e cobre elementos fixados em bottom:0 (que ancoram
     no viewport de LAYOUT). Aqui a barra é recolada ao viewport VISUAL
     sempre que a UI do Safari cresce/encolhe. */
  function ajustaViewport() {
    var vv = window.visualViewport;
    if (!vv) return;
    var offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    bar.style.bottom = offset + 'px';
  }

  if (contato && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      formVisivel = entries[0].isIntersecting;
      atualiza();
    }, { rootMargin: '0px 0px -15% 0px' }).observe(contato);
  }

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', ajustaViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', ajustaViewport, { passive: true });
  }
  window.addEventListener('resize', ajustaViewport, { passive: true });
  window.addEventListener('scroll', atualiza, { passive: true });
  ajustaViewport();
  atualiza();
})();

/* form_start — primeira interação com cada formulário (1× por form) */
document.addEventListener('focusin', function (e) {
  var form = e.target && e.target.closest ? e.target.closest('form') : null;
  if (!form || form.dataset.lan4Started) return;
  form.dataset.lan4Started = '1';
  var fid = lan4FormId(form, form.id === 'lf' ? 'lan4-contato-site' : '');
  window.dataLayer.push({
    event: 'form_start',
    form_id: fid,
    form_identifier: fid,
    form_variant: lan4FormVariant()
  });
  window.LAN4_FORM_START = true;
  if (window.LAN4_ON_FORM_START_BEFORE_TIMER) window.LAN4_ON_FORM_START_BEFORE_TIMER();
  if (window.LAN4_ON_FORM_START) window.LAN4_ON_FORM_START();
});

/* ─── NOVO 2026-10: form_view + form_abandon ─────────────────────────────
   form_view: form visível ≥50% por 1s contínuo, 1x por form por página.
   form_abandon: pagehide ou visibilitychange=hidden com form iniciado e
   NÃO concluído (form.lan4Concluido = true no 2xx do envio final), 1x.
   last_field = name do último campo tocado; etapa = etapa ativa. */
function lan4EtapaAtual(form) {
  var steps = $$('.lf-step', form);
  var ativa = $('.lf-step.is-active', form) || steps[0];
  return {
    step_number: ativa ? steps.indexOf(ativa) + 1 : 1,
    step_name: ativa ? (ativa.getAttribute('data-step-name') || '') : ''
  };
}
function lan4FormsRastreados() {
  return $$('form#lf, form[data-rd-id]');
}
(function () {
  function setupView() {
    if (!('IntersectionObserver' in window)) return;
    lan4FormsRastreados().forEach(function (form) {
      var timer = null;
      var io = new IntersectionObserver(function (entries) {
        var e = entries[0];
        /* FIX 2026-10-28 (form_view baixo na D): a D mostra todos os campos
           numa tela só — no celular o form é mais alto que 2 telas e nunca
           fica 50% visível, então o form_view não disparava. Agora também
           conta como visto quando o form ocupa ≥50% da altura da tela. */
        var telaH = (e.rootBounds && e.rootBounds.height) || window.innerHeight || 0;
        var ocupaTela = telaH > 0 && e.intersectionRect.height >= telaH * 0.5;
        if (e.isIntersecting && (e.intersectionRatio >= 0.5 || ocupaTela)) {
          if (!timer) timer = setTimeout(function () {
            if (form.lan4ViewSent) return;
            form.lan4ViewSent = true;
            io.disconnect();
            window.dataLayer.push({ event: 'form_view', form_id: lan4FormId(form), form_variant: lan4FormVariant() });
          }, 1000);
        } else if (timer) { clearTimeout(timer); timer = null; }
      }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 1] });
      io.observe(form);
    });
  }
  /* form-ab.js poda o DOM no DOMContentLoaded; main.js é defer e roda antes
     disso, então espera o DOMContentLoaded para observar o form já podado. */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupView);
  else setupView();

  document.addEventListener('focusin', function (e) {
    var t = e.target, form = t && t.closest ? t.closest('form') : null;
    if (form && t.name && t.name !== 'website_hp') form.lan4LastField = t.name;
  });
  document.addEventListener('change', function (e) {
    var t = e.target, form = t && t.closest ? t.closest('form') : null;
    if (form && t.name && t.name !== 'website_hp') form.lan4LastField = t.name;
  });

  function abandono() {
    lan4FormsRastreados().forEach(function (form) {
      if (!form.dataset.lan4Started || form.lan4Concluido || form.lan4AbandonSent) return;
      form.lan4AbandonSent = true;
      var et = lan4EtapaAtual(form);
      window.dataLayer.push({
        event: 'form_abandon',
        form_id: lan4FormId(form),
        form_variant: lan4FormVariant(),
        step_number: et.step_number,
        step_name: et.step_name,
        last_field: form.lan4LastField || ''
      });
    });
  }
  window.addEventListener('pagehide', abandono);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') abandono();
  });
})();

/* cta_click — qualquer elemento com data-cta */
document.addEventListener('click', function (e) {
  var el = e.target && e.target.closest ? e.target.closest('[data-cta]') : null;
  if (!el) return;
  window.dataLayer.push({
    event: 'cta_click',
    cta_id: el.getAttribute('data-cta'),
    cta_text: (el.textContent || '').trim().slice(0, 80),
    cta_location: el.getAttribute('data-cta-location') || ''
  });
});

/* NOVO 2026-10: whatsapp_click — clique direto em link wa.me /
   api.whatsapp.com (sem modal). links_click — elementos com data-link-id
   (página /links), bio_source = utm_source da sessão. */
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
  if (a && /(^https?:\/\/)?(wa\.me|api\.whatsapp\.com|web\.whatsapp\.com)\//i.test(a.getAttribute('href'))) {
    window.dataLayer.push({
      event: 'whatsapp_click',
      cta_location: a.getAttribute('data-cta-location') || '',
      link_url: a.href
    });
  }
  var l = e.target && e.target.closest ? e.target.closest('[data-link-id]') : null;
  if (l) {
    window.dataLayer.push({
      event: 'links_click',
      link_id: l.getAttribute('data-link-id'),
      bio_source: lan4GetUtms().utm_source || ''
    });
  }
});
/* ─── Formulários multi-etapas ──────────────────────────────────────────
   Progress bar, validação por etapa e evento form_step no dataLayer —
   cada avanço válido vira um degrau do funil de abandono no GA4. */
function lan4MultiStep(form, identificador) {
  if (!form) return;
  var steps = $$('.lf-step', form);
  if (!steps.length) return;
  var segs  = $$('.lf-progress-seg', form);
  var count = $('[data-step-current]', form);
  /* Escopo por classe (.lf-progress-title), não só pelo atributo
     [data-step-title] — esse atributo também existe nos <fieldset>
     (fonte do rótulo por etapa), então um form sem a barra de progresso
     (ex.: engine/index.html, 1 etapa só) fazia o querySelector casar
     com o PRÓPRIO fieldset e o textContent seguinte apagava todos os
     campos do form (bug real, 2026-08-24: form do Engine sumia). */
  var title = $('.lf-progress-title[data-step-title]', form);
  var cur = 0;

  function mostra(i) {
    steps.forEach(function (s, j) { s.classList.toggle('is-active', j === i); });
    segs.forEach(function (s, j) {
      s.classList.toggle('is-done', j < i);
      s.classList.toggle('is-active', j === i);
    });
    if (count) count.textContent = String(i + 1);
    if (title) title.textContent = steps[i].getAttribute('data-step-title') || '';
    cur = i;
  }

  function validaEtapa(i) {
    var step = steps[i];
    var erro = lan4ValidaObrigatorios(form, lan4ReqEtapa(step));
    if (!erro && step.querySelector('[name="telefone"]')) erro = lan4ValidaTelefone(lan4CampoValor(form, 'telefone'));
    var m = $('.lf-step-msg', step);
    if (m) { m.style.display = erro ? 'flex' : 'none'; m.textContent = erro || ''; }
    return !erro;
  }

  /* Enter num input antes da última etapa avança em vez de submeter.
     Chama lan4GoToStep diretamente (não depende de existir botão .lf-next
     na etapa — etapas com autoavanço não têm mais esse botão). */
  form.lan4StepGuard = function () {
    if (cur >= steps.length - 1) return false;
    form.lan4GoToStep(cur + 2);
    return true;
  };
  form.lan4ValidaEtapaAtual = function () { return validaEtapa(cur); };
  form.lan4Reinicia = function () { mostra(0); };

  /* lan4GoToStep(form, stepNumber): navegação central de etapa, 1-based —
     reaproveitada tanto pelo clique manual em .lf-next quanto pelo
     autoavanço (lan4SetupAutoAdvance). Valida a etapa atual antes de
     avançar e dispara o mesmo evento form_step em ambos os casos. */
  form.lan4GoToStep = function (stepNumber) {
    var alvo = stepNumber - 1;
    if (alvo <= cur || alvo >= steps.length) return false;
    if (!validaEtapa(cur)) return false;
    var etapaSaindo = steps[cur];
    window.dataLayer.push({
      event: 'form_step',
      form_identifier: identificador,
      form_step_number: cur + 1,
      form_step_name: etapaSaindo.getAttribute('data-step-name') || '',
      form_step_total: steps.length,
      /* nomes do contrato 2026-10 (os form_step_* acima ficam como legado) */
      form_id: identificador,
      form_variant: lan4FormVariant(),
      step_number: cur + 1,
      step_name: etapaSaindo.getAttribute('data-step-name') || ''
    });
    /* Dispara a captura parcial ao SAIR da etapa "contato" — EXCETO se a
       etapa tiver [data-no-partial]. Usado no Engine na Variante B: como o
       Engine hoje otimiza a conversão pelo submit final (trigger GTM 117,
       lead_form_submit + form_identifier=lan4-lp-engine) e NÃO tem trigger
       de lead_partial_submit, deixar o parcial disparar ali criaria um
       evento sem tag. O flag mantém o Engine com o MESMO comportamento de
       tracking de hoje, sem precisar mexer no GTM. */
    if (etapaSaindo.getAttribute('data-step-name') === 'contato'
        && !etapaSaindo.hasAttribute('data-no-partial')
        && !form.lan4ContatoParcialEnviado) {
      form.lan4ContatoParcialEnviado = true;
      lan4EnviaContatoParcial(form, identificador);
    }
    mostra(alvo);
    return true;
  };

  $$('.lf-next', form).forEach(function (btn) {
    btn.addEventListener('click', function () { form.lan4GoToStep(cur + 2); });
  });

  $$('.lf-back', form).forEach(function (btn) {
    btn.addEventListener('click', function () { if (cur > 0) mostra(cur - 1); });
  });

  mostra(0);
  lan4SetupAutoAdvance(form, steps);
  lan4SetupSubstepTracking(form, steps, identificador);
}

/* ─── Sub-etapa: qualificação → contato dentro da etapa 1 ────────────────
   A etapa 1 (data-step-name="contato") agora junta dois blocos de natureza
   diferente: qualificação por toque (faturamento/cargo, sem digitar) e
   dados de contato (nome/email/telefone/empresa, exige digitação). Não dá
   pra medir esse drop pelo form_step (que só marca transição ENTRE
   etapas) — precisa de um evento GA4 puro (sem PII) disparado assim que
   faturamento+cargo forem preenchidos, ANTES do resto da etapa 1 estar
   completo. Isso permite comparar no GA4 quantas pessoas preenchem a
   parte "fácil" e nunca chegam a preencher a parte "de digitar" — sinal
   direto de que reordenar os campos (fácil primeiro) valeu a pena ou não. */
function lan4SetupSubstepTracking(form, steps, identificador) {
  /* A parte "fácil" (faturamento + cargo) pode estar:
     - na Variante A: dentro da etapa data-step-name="contato" (junto do resto)
     - na Variante B: numa etapa própria data-step-name="qualificacao"
     Procuramos os campos onde quer que estejam, sem depender do nome da etapa. */
  var etapaQualif = steps.filter(function (s) {
    return s.getAttribute('data-step-name') === 'qualificacao';
  })[0];
  var etapaFonte = etapaQualif ||
    steps.filter(function (s) { return s.getAttribute('data-step-name') === 'contato'; })[0];
  if (!etapaFonte) return;
  var faturamento = etapaFonte.querySelector('[name="faturamento"]');
  var cargo = etapaFonte.querySelector('[name="cargo"]');
  if (!faturamento || !cargo) return; // Engine/páginas sem esses campos
  var disparado = false;
  var checa = function () {
    if (disparado) return;
    if (!lan4CampoValor(form, 'faturamento') || !lan4CampoValor(form, 'cargo')) return;
    disparado = true;
    window.dataLayer.push({
      event: 'form_substep',
      form_identifier: identificador,
      form_substep_name: 'qualificacao'
    });
  };
  /* radio-cards disparam 'click', selects disparam 'change' — cobrir os dois */
  var evt = (faturamento.type === 'radio') ? 'click' : 'change';
  faturamento.addEventListener(evt, checa);
  cargo.addEventListener((cargo.type === 'radio') ? 'click' : 'change', checa);
  /* radios: escutar o grupo inteiro, não só o 1º elemento */
  if (faturamento.type === 'radio') {
    form.querySelectorAll('[name="faturamento"], [name="cargo"]').forEach(function (el) {
      el.addEventListener('click', checa);
    });
  }
}

/* ─── Autoavanço de etapa (sem clique em "Próximo") ─────────────────────
   Etapas 1→2 e 2→3: assim que o último campo obrigatório da etapa atual
   é preenchido (radio marcado ou select/input com valor), avança
   automaticamente via lan4GoToStep — reaproveita a mesma validação e o
   mesmo evento form_step do clique manual, sem duplicar navegação.
   Nunca autoavança a partir da última etapa (que tem botão de submit),
   EXCETO quando o form tem [data-autosubmit-last-step] (páginas de
   serviço /s/*, 2026-08-17): a etapa 1 (LGPD) exige clique manual em
   "Continuar" (data-no-autoadvance) — esse é o único gesto de
   consentimento necessário. A última etapa dessas páginas é só
   segmentação (2 radios, sem novo checkbox de consentimento), então
   preenchê-la já basta pra enviar automaticamente, sem exigir clique
   extra em "Enviar". Dispara form.requestSubmit() em vez de duplicar a
   lógica de envio — reaproveita 100% do handler de 'submit' existente
   (validação, POST ao RD, evento de conversão, caixa de obrigado). */
function lan4SetupAutoAdvance(form, steps) {
  var autosubmitUltimaEtapa = form.hasAttribute('data-autosubmit-last-step');
  steps.forEach(function (step, idx) {
    var ultimaEtapa = idx >= steps.length - 1;
    if (ultimaEtapa && !autosubmitUltimaEtapa) return; // última etapa não autoavança (padrão)
    if (step.hasAttribute('data-no-autoadvance')) return; // ex.: etapa de multi-seleção (checkbox), avanço é manual via .lf-next
    var campos = lan4ReqEtapa(step);
    if (!campos.length) return;
    var nomes = campos.map(function (c) { return c[0]; });
    var seletor = nomes.map(function (n) { return '[name="' + n + '"]'; }).join(',');
    var avancoAgendado = false;
    var checaEAvanca = function () {
      /* Guard contra disparo duplo: no clique em radio/checkbox, o navegador
         encaminha o clique do <label> pro <input> associado nativamente, e
         nós escutamos 'click' nos dois (ver comentário abaixo) — isso pode
         chamar checaEAvanca() duas vezes na mesma pilha de eventos síncrona
         (label primeiro, input logo em seguida via encaminhamento nativo).
         Sem esse guard, a 2ª chamada reexecutava form.requestSubmit() ou
         form.lan4GoToStep() ainda dentro do mesmo ciclo, duplicando o
         submit/avanço e, por consequência, os fluxos de automação do RD
         Station (2 entradas pro mesmo lead — bug real observado 2026-08-21,
         ver lan4-lp-redes-sociais).
         A checagem em si (nomes.every/lan4CampoValor) roda dentro do
         setTimeout(0), não síncrona no clique: no clique do <label>, o
         navegador ainda não aplicou :checked ao <input> associado nesse
         mesmo tick síncrono (aplica antes do reencaminhamento, mas depois
         do listener do label já ter rodado em alguns engines/automação de
         clique) — ler o valor síncrono demais podia achar o campo vazio
         mesmo com o clique certo, e o guard então bloqueava a 2ª chamada
         (do input, já com o valor certo) achando que era o disparo
         duplicado. Adiar a leitura pro próximo tick garante que :checked
         já está atualizado nas duas chamadas, então a 1ª que rodar (label
         ou input, tanto faz) já vê o valor certo — bug real observado
         2026-08-25 em teste automatizado do quiz de LP, mas o mesmo
         encadeamento de eventos pode ocorrer em cliques humanos rápidos. */
      if (avancoAgendado) return;
      avancoAgendado = true;
      setTimeout(function () {
        avancoAgendado = false;
        var completo = nomes.every(function (n) { return !!lan4CampoValor(form, n); });
        if (!completo) return;
        if (ultimaEtapa) { form.requestSubmit(); return; }
        form.lan4GoToStep(idx + 2); // idx é 0-based, step-alvo é 1-based
      }, 0);
    };
    $$(seletor, step).forEach(function (input) {
      /* 'change' só dispara quando o valor do input muda de fato — clicar
         de novo no MESMO radio já marcado (ex.: usuário voltou e re-clicou
         a mesma opção) não altera o estado, então 'change' nunca dispara e
         o autoavanço trava. 'click' no input cobre a maioria dos casos,
         mas o input é invisível (opacity:0, pointer-events:none) — o
         clique real acontece no <label> pai, que o navegador encaminha
         pro input via associação nativa; em alguns engines esse
         encaminhamento não dispara um 'click' script-visível no input de
         forma consistente. Por isso também escutamos 'click' no <label>
         (.lf-opt) diretamente, que sempre recebe o clique do usuário sem
         depender de reencaminhamento — cobre os dois caminhos (o guard em
         checaEAvanca acima colapsa os dois disparos em um só quando ambos
         acontecem). */
      var eventType = (input.type === 'radio' || input.type === 'checkbox') ? 'click' : 'change';
      input.addEventListener(eventType, checaEAvanca);
      if (eventType === 'click') {
        var label = input.closest('.lf-opt');
        if (label) label.addEventListener('click', checaEAvanca);
      }
    });
  });
}
(function () {
  var lf = document.getElementById('lf');
  if (lf) lan4MultiStep(lf, lan4FormId(lf, 'lan4-contato-site'));
})();

/* ─── Envio ao RD Station — API de conversão v2, com modo prévia ────────
   Fora de lan4.com.br (window.LAN4_PREVIEW, definido no index.html) o
   POST não acontece: simula sucesso p/ validar a UX sem criar lead.

   MIGRAÇÃO 2026-09-03 (v1.3 → v2): a API 1.3 (app.rdstation.com.br/api/
   1.3/conversions) NÃO usava traffic_source para popular os campos nativos
   "Origem"/"Fonte" do card — só os cf_utm_* apareciam (texto livre, sem
   virar atribuição). A API v2 (api.rd.services/platform/conversions, com
   envelope event_type/event_family=CDP) resolve "Origem"/"Fonte" a partir
   de traffic_source/traffic_medium/traffic_campaign/traffic_value —
   equivalente a session_source/session_medium do GA4.

   Esta função recebe o MESMO payload no formato antigo (token_rdstation +
   identificador + email + campos cf_ e traffic_) usado por todos os call
   sites e converte para o envelope v2 aqui, sem mexer nas chamadas. */
/* Proxy serverless (Vercel) que guarda a API Key do RD como env var, nunca
   exposta ao navegador — ver cerebro/clientes/lan4/tracking/rd-proxy/.
   Antes disso (até 2026-09-04) a chave ia direta no fetch do client, visível
   pra qualquer um no DevTools/aba Network; qualquer pessoa podia copiar e
   criar leads falsos ilimitados na conta do RD sem nem passar pelo form. */
var LAN4_RD_PROXY_URL = 'https://rd-proxy-delta.vercel.app/api/conversion';

function lan4RdV2Envelope(payload) {
  var p = Object.assign({}, payload);
  var identificador = p.identificador || p.conversion_identifier;
  delete p.identificador;
  delete p.token_rdstation;
  delete p.conversion_identifier;
  p.conversion_identifier = identificador;
  /* v1.3 usava 'nome'; a v2 espera 'name' */
  if (p.nome != null && p.name == null) { p.name = p.nome; }
  delete p.nome;
  /* remove chaves vazias — a v2 é mais estrita e pode rejeitar '' em
     campos como mobile_phone/name */
  Object.keys(p).forEach(function (k) {
    if (p[k] === '' || p[k] == null) delete p[k];
  });
  return { event_type: 'CONVERSION', event_family: 'CDP', payload: p };
}

/* ─── Proteção anti-bot (honeypot + tempo mínimo + rate-limit) ──────────
   Nenhuma delas bloqueia usuário real: honeypot é campo invisível
   (name="website_hp", ver CSS/HTML dos forms) que só bot/autofill agressivo
   preenche; tempo mínimo cobre o caso de scripts que já chegam com o form
   pronto e submetem em <1.5s (impossível digitar nome+email+telefone+
   empresa nesse tempo); rate-limit no sessionStorage trava rajada de
   conversões da mesma aba/sessão (visto na prática: 9 conversões do
   "David"/"lf" em 30s). Checado 1x aqui, ponto único por onde todo envio
   passa — não precisa duplicar em cada form. Falha SEMPRE silenciosa pro
   chamador (retorna Promise resolvida como se tivesse ido), pra nunca
   travar a UX nem entrar no fluxo de erro visível ao usuário. */
var LAN4_MARCA_CARREGAMENTO = Date.now();
var LAN4_TEMPO_MINIMO_MS = 1500;
var LAN4_RATE_LIMIT_MS = 4000;

function lan4PareceBot(semRateLimit) {
  var hp = document.querySelector('[name="website_hp"]');
  if (hp && (hp.value || '').trim()) return true; // honeypot preenchido
  if (Date.now() - LAN4_MARCA_CARREGAMENTO < LAN4_TEMPO_MINIMO_MS) return true;
  if (semRateLimit) return false; // parcial C/D (form-ab.js): não lê nem grava o rate-limit
  try {
    var ultimo = Number(sessionStorage.getItem('lan4_ultimo_envio') || 0);
    if (Date.now() - ultimo < LAN4_RATE_LIMIT_MS) return true;
    sessionStorage.setItem('lan4_ultimo_envio', String(Date.now()));
  } catch (e) { /* sessionStorage indisponível: não bloqueia por isso */ }
  return false;
}

/* 2 campos consolidados de atribuição (2026-10-13). Os chamadores seguem
   passando cf_event_id / cf_wa_ref no payload (chaves internas); aqui eles
   viram eid / wa dentro das strings e NÃO vão como campos próprios ao RD. */
var LAN4_RD_CF_NOVOS = ['cf_rastreamento_ids', 'cf_rastreamento_origem', 'cf_form_variant', 'cf_form_page'];

/* NOVO 2026-10-28: qual formulário/variante gerou a conversão — vai em TODO
   envio ao RD (parcial e completo), para o funil diário ler direto do RD.
   lan4-B|C|D = form principal (sorteio do form-ab.js, que NÃO muda);
   lan4-whatsapp / lan4-isca = modal de WhatsApp e material isca (não são
   o form A/B); lan4-desconhecida = form sem form-ab.js carregado. */
function lan4FormVariantRd(identificador) {
  var id = String(identificador || '');
  if (id.indexOf('lan4-whatsapp-click') === 0) return 'lan4-whatsapp';
  if (id.indexOf('lan4-material-isca') === 0) return 'lan4-isca';
  var v = window.LAN4_FORM_VARIANT;
  return (v === 'B' || v === 'C' || v === 'D') ? 'lan4-' + v : 'lan4-desconhecida';
}
function lan4AplicaRastreamento(payload) {
  var p = Object.assign({}, payload);
  var eid = p.cf_event_id || '', wa = p.cf_wa_ref || '';
  delete p.cf_event_id; delete p.cf_wa_ref;
  p.cf_form_variant = lan4FormVariantRd(p.identificador || p.conversion_identifier);
  p.cf_form_page = location.pathname;
  return Object.assign(p, lan4AtribuicaoRd(eid, wa));
}

function lan4EnviaRd(payload, opts) {
  opts = opts || {};
  payload = lan4AplicaRastreamento(payload);
  if (lan4PareceBot(opts.semRateLimit)) {
    console.warn('[RD Station] envio bloqueado (padrão de bot):', payload.identificador || payload.conversion_identifier);
    /* NOVO 2026-10: blocked=true faz os chamadores NÃO empurrarem conversão
       no dataLayer (antes um bot "convertia" no GA4/Meta/Ads). A UX segue
       igual (resposta ok). */
    return Promise.resolve({ ok: true, status: 200, lan4Blocked: true, json: function () { return Promise.resolve({ blocked: true }); } });
  }
  function post(pl) {
    /* Prévia (fora de lan4.com.br): nunca chega ao proxy. Se o simulador do
       preview estiver carregado (preview-rd-simulador.js, só no GitHub), ele
       valida o payload contra os campos do RD e responde como o RD faria. */
    if (window.LAN4_PREVIEW) {
      if (typeof window.LAN4_RD_SIMULADOR === 'function') return window.LAN4_RD_SIMULADOR(lan4RdV2Envelope(pl));
      return new Promise(function (res) {
        setTimeout(function () {
          res({ ok: true, status: 200, json: function () { return Promise.resolve({ preview: true }); } });
        }, 500);
      });
    }
    return fetch(LAN4_RD_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(lan4RdV2Envelope(pl))
    });
  }
  /* Rede de segurança (NOVO 2026-10): se o RD responder 4xx e o payload
     tiver cf_rastreamento_ids/cf_rastreamento_origem (que podem ainda não
     existir na conta), reenvia 1x SEM eles — o lead nunca se perde por causa
     de campo de atribuição (o event_id do dataLayer segue). */
  return post(payload).then(function (r) {
    if (r.ok || r.status < 400 || r.status >= 500) return r;
    var temNovos = LAN4_RD_CF_NOVOS.some(function (k) { return payload[k]; });
    if (!temNovos) return r;
    var limpo = Object.assign({}, payload);
    LAN4_RD_CF_NOVOS.forEach(function (k) { delete limpo[k]; });
    console.warn('[RD Station] ' + r.status + ' com cf_* novos — reenviando sem eles. Crie os campos no RD.');
    return post(limpo);
  });
}

/* ─── Captura parcial no RD Station (saída da etapa "contato") ──────────
   A etapa de contato virou a 1ª etapa do form (reordenação 2026-08-17) —
   nome/e-mail/telefone já existem e são válidos assim que o usuário
   avança para a etapa seguinte, mesmo que ele abandone antes do submit
   final. Cria/atualiza o lead no RD nesse momento (identificador próprio
   'lan4-contato-site-parcial', mesmo e-mail do envio final) para não
   perder quem preenche o contato e some depois. O RD casa pelo e-mail:
   o submit final (lan4EnviaRd em '.lf' submit, identificador
   'lan4-contato-site') atualiza o MESMO card com faturamento/cargo/
   serviço — não cria um segundo lead. Silencioso em caso de erro (não
   bloqueia a navegação do form; a captura completa no final continua
   sendo a fonte de verdade). */
/* opts.semRateLimit (NOVO 2026-10): usado pelo form-ab.js nas variantes C/D
   — o parcial agora também vai ao RD (contrato: lead_partial_submit só no
   2xx do proxy), mas sem acionar o rate-limit de 4s que bloquearia o
   submit final logo em seguida. */
/* Payload do parcial (função pura, testável em node). Só manda cargo/
   faturamento/serviço se já respondidos; serviço do form tem prioridade
   sobre o da página (cf_servico_de_interesse do lan4RdUtmPayload). */
function lan4MontaPayloadParcial(identificadorForm, lead, utmPayload, eventId) {
  var p = Object.assign({
    token_rdstation: 'proxied',
    identificador:   identificadorForm + '-parcial',
    email:           lead.email,
    nome:            lead.nome,
    mobile_phone:    lan4NormalizePhoneMeta(lead.telefone),
    cf_nome_da_empresa: lead.empresa
  }, utmPayload, { cf_event_id: eventId });
  if (lead.cargo) p.cf_cargo = lead.cargo;
  if (lead.faturamento) p.cf_faturamento_medio_mensal = lead.faturamento;
  if (lead.servico) p.cf_servico_de_interesse = lead.servico;
  return p;
}

function lan4EnviaContatoParcial(form, identificadorForm, opts) {
  opts = opts || { semRateLimit: true }; /* parcial nunca liga o rate-limit que travaria o envio final */
  var v = function (n) { return lan4CampoValor(form, n); };
  /* Fix QA 2026-10-13: cargo/faturamento/serviço já respondidos (passo 1
     de B, ou etapas anteriores em C) vão no dataLayer e no RD do parcial. */
  var lead = { nome: v('nome'), email: v('email'), telefone: v('telefone'), empresa: v('empresa'),
               cargo: v('cargo'), faturamento: v('faturamento'), servico: v('servico_interesse') };
  if (!lead.email) return; // etapa já validada antes de chamar, mas defensivo: sem e-mail não há o que casar no RD
  var eventId = lan4EventId();
  lan4EnviaRd(lan4MontaPayloadParcial(identificadorForm, lead, lan4RdUtmPayload(), eventId), opts)
  .then(function (r) {
    return r.json().then(function (data) {
      console.log('[RD Station][parcial] status:', r.status, 'response:', data);
      if (r.ok && !r.lan4Blocked) lan4PushLead(identificadorForm + '-parcial', lead, 'lead_partial_submit', eventId);
    });
  })
  .catch(function (err) { console.error('[RD Station][parcial] erro:', err); });
}

/* Selo visual do modo prévia */
if (window.LAN4_PREVIEW) {
  var lan4Badge = document.createElement('div');
  lan4Badge.className = 'lan4-preview-badge';
  lan4Badge.textContent = 'Prévia de validação · envios desativados';
  document.body.appendChild(lan4Badge);
}

/* ─── fim LAN4 Tracking Layer ───────────────────────────────────────── */

/* Firefox (Gecko/WebRender) reteselagem de clip-path com "round" animado
   é bem mais cara que no Chromium — usado pra simplificar essa animação
   só nesse motor (ver .servicos-section-bg / .problems-section-bg). */
const IS_FIREFOX = CSS.supports('-moz-appearance', 'none');

/* ─── Header scroll ──────────────────────────────────────────────────── */
const header = $('.header');

const COMPACT_THRESHOLD = 10;

const handleScroll = () => {
  if (!header) return; /* NOVO 2026-10: páginas sem .header (ex.: /links) não quebram o resto do script */
  const y = window.scrollY;
  header.classList.toggle('header--scrolled', y > 10);
  header.classList.toggle('header--compact',  y > COMPACT_THRESHOLD);
};

/* Agrupa todo trabalho de scroll (header + bg clip-path) num único rAF
   por frame — evita rodar leitura de layout + repaint a cada evento
   nativo de scroll, que pode disparar dezenas de vezes por frame. */
let scrollScheduled = false;
function onScroll(extra) {
  if (scrollScheduled) return;
  scrollScheduled = true;
  requestAnimationFrame(() => {
    scrollScheduled = false;
    handleScroll();
    extra?.forEach(fn => fn());
  });
}

const scrollCallbacks = [];
window.addEventListener('scroll', () => onScroll(scrollCallbacks), { passive: true });
handleScroll();

/* ─── Pointer glow (radial gradient seguindo o mouse) ───────────────── */
// Listener por botão (só roda enquanto o mouse está sobre ele) em vez de
// um mousemove global que reconsultava o DOM e recalculava a posição de
// TODOS os botões a cada pixel de movimento do mouse na página inteira.
$$('[data-pointer-glow]').forEach(btn => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    btn.style.setProperty('--px', `${e.clientX - rect.left}px`);
    btn.style.setProperty('--py', `${e.clientY - rect.top}px`);
  });
});

/* ─── Dropdown navigation ────────────────────────────────────────────── */
let closeTimer = null;

$$('.nav-item').forEach(item => {
  const btn      = item.querySelector('.nav-btn');
  const dropdown = item.querySelector('.dropdown');
  if (!btn || !dropdown) return;

  const open = () => {
    clearTimeout(closeTimer);
    // fecha outros dropdowns
    $$('.dropdown[data-state="open"]').forEach(d => {
      if (d !== dropdown) {
        d.dataset.state = 'closed';
        d.closest('.nav-item')?.querySelector('.nav-btn')?.removeAttribute('data-state');
      }
    });
    dropdown.dataset.state = 'open';
    btn.dataset.state = 'open';
    positionArrow(dropdown, btn);
  };

  const close = (delay = 120) => {
    closeTimer = setTimeout(() => {
      dropdown.dataset.state = 'closed';
      delete btn.dataset.state;
    }, delay);
  };

  btn.addEventListener('mouseenter', open);
  btn.addEventListener('focus',      open);
  btn.addEventListener('mouseleave', () => close());
  btn.addEventListener('blur',       () => close(200));

  dropdown.addEventListener('mouseenter', () => clearTimeout(closeTimer));
  dropdown.addEventListener('mouseleave', () => close());

  // Fecha com Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close(0);
  });
});

// Fecha ao clicar fora
document.addEventListener('click', e => {
  if (!e.target.closest('.nav-item')) {
    $$('.dropdown[data-state="open"]').forEach(d => {
      d.dataset.state = 'closed';
      d.closest('.nav-item')?.querySelector('.nav-btn')?.removeAttribute('data-state');
    });
  }
});

/**
 * Alinha a setinha do dropdown com o botão que o abriu.
 * O site original faz isso com JS para compensar o translate(-50%).
 */
function positionArrow(dropdown, btn) {
  const arrow = dropdown.querySelector('.dropdown-arrow');
  if (!arrow) return;
  const ddRect  = dropdown.getBoundingClientRect();
  const btnRect = btn.getBoundingClientRect();
  const btnMid  = btnRect.left + btnRect.width / 2;
  const ddMid   = ddRect.left  + ddRect.width  / 2;
  const offset  = btnMid - ddMid;
  dropdown.style.setProperty('--arrow-offset', `${offset}px`);
}

/* ─── Mobile menu (panel deslizante) ────────────────────────────────── */
const menuToggle  = $('.menu-toggle');
const mobilePanel = $('#mobilePanel');

if (menuToggle && mobilePanel) {
  let panelOpen = false;

  function openPanel() {
    panelOpen = true;
    mobilePanel.classList.add('is-open');
    menuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closePanel() {
    panelOpen = false;
    mobilePanel.classList.remove('is-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  menuToggle.addEventListener('click', () => panelOpen ? closePanel() : openPanel());

  $$('.mobile-panel-link', mobilePanel).forEach(link => {
    link.addEventListener('click', closePanel);
  });

  const panelCta = mobilePanel.querySelector('.mobile-panel-cta .btn');
  if (panelCta) panelCta.addEventListener('click', closePanel);
}

/* ─── Serviços — Carrossel infinito ─────────────────────────────────── */
(function () {
  const viewport = $('.servicos-carousel-viewport');
  const track    = $('.servicos-track');
  const prevBtn  = $('.servicos-arrow--prev');
  const nextBtn  = $('.servicos-arrow--next');
  if (!track || !viewport) return;

  function GAP() {
    return parseFloat(getComputedStyle(track).columnGap) || 20;
  }

  const origCards = [...track.children]; /* 6 cards reais */
  const N = origCards.length;

  /* Estrutura final: [clone1..N] [real1..N] [clone1..N]  (3N = 18 cards) */
  /* Prepend: clones em ordem dos originais */
  for (let i = N - 1; i >= 0; i--) {
    track.insertBefore(origCards[i].cloneNode(true), track.firstChild);
  }
  /* Append */
  origCards.forEach(c => track.appendChild(c.cloneNode(true)));

  let idx = N; /* começa no primeiro card real */
  let busy = false;

  function cardW() {
    return track.children[0]?.offsetWidth || 0;
  }

  /* No mobile (1 card por vez, mais estreito que o viewport) centraliza
     o card ativo, deixando os vizinhos espiarem nas duas laterais. */
  function centerOffset() {
    const vw = viewport.offsetWidth;
    const cw = cardW();
    return vw <= 500 ? (vw - cw) / 2 : 0;
  }

  /* Posiciona sem animação */
  function snap(i) {
    track.style.transition = 'none';
    track.style.transform  = `translateX(${centerOffset() - (i * (cardW() + GAP()))}px)`;
    void track.offsetWidth; /* force reflow */
    track.style.transition = '';
  }

  /* Posiciona com animação */
  function goTo(i) {
    if (busy) return;
    busy = true;
    idx = i;
    track.style.transform = `translateX(${centerOffset() - (idx * (cardW() + GAP()))}px)`;
  }

  track.addEventListener('transitionend', e => {
    if (e.target !== track) return;
    busy = false;
    if (idx < N)       { idx += N; snap(idx); }
    else if (idx >= N * 2) { idx -= N; snap(idx); }
  });

  /* Arrows sempre habilitadas (loop infinito) */
  [prevBtn, nextBtn].forEach(b => {
    b.disabled = false;
    b.classList.remove('is-disabled');
  });

  /* Auto-play — avança 1 card a cada 2 segundos, pausa no hover/foco */
  let autoTimer = null;

  function startAuto() {
    stopAuto();
    autoTimer = setInterval(() => goTo(idx + 1), 2000);
  }

  function stopAuto() {
    clearInterval(autoTimer);
  }

  const wrap = viewport.closest('.servicos-carousel-wrap') || viewport.parentElement;
  wrap.addEventListener('mouseenter', stopAuto);
  wrap.addEventListener('mouseleave', startAuto);
  wrap.addEventListener('focusin',    stopAuto);
  wrap.addEventListener('focusout',   startAuto);

  /* Pausa o autoplay fora da tela — sem isso ele fica avançando (e
     disparando transitionend) pra sempre, mesmo com o carrossel longe
     da viewport. */
  new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? startAuto() : stopAuto());
  }, { threshold: 0 }).observe(wrap);

  prevBtn.addEventListener('click', () => { stopAuto(); goTo(idx - 1); startAuto(); });
  nextBtn.addEventListener('click', () => { stopAuto(); goTo(idx + 1); startAuto(); });

  window.addEventListener('resize', () => snap(idx), { passive: true });

  requestAnimationFrame(() => requestAnimationFrame(() => { snap(idx); startAuto(); }));

  /* ── Drag / swipe — mouse e touch ── */
  let dragStartX = 0;
  let dragDeltaX = 0;
  let dragActive = false;

  /* ── Drag / swipe — sem setPointerCapture para não quebrar clicks ── */
  viewport.addEventListener('pointerdown', e => {
    dragStartX = e.clientX;
    dragDeltaX = 0;
    dragActive = true;
    track.style.transition = 'none';
    stopAuto();
  });

  window.addEventListener('pointermove', e => {
    if (!dragActive) return;
    dragDeltaX = e.clientX - dragStartX;
    track.style.transform = `translateX(${centerOffset() - (idx * (cardW() + GAP())) + dragDeltaX}px)`;
  });

  window.addEventListener('pointerup', () => {
    if (!dragActive) return;
    dragActive = false;
    track.style.transition = '';
    busy = false;
    if      (dragDeltaX < -50) goTo(idx + 1);
    else if (dragDeltaX >  50) goTo(idx - 1);
    else                        snap(idx);
    startAuto();
  });

  window.addEventListener('pointercancel', () => {
    if (!dragActive) return;
    dragActive = false;
    track.style.transition = '';
    snap(idx);
    startAuto();
  });

  /* Evita abrir popup quando o usuário estava arrastando */
  viewport.addEventListener('click', e => {
    if (Math.abs(dragDeltaX) > 10) e.stopPropagation();
  }, true);
})();

/* ─── Problemas — ticker JS-driven com drag ─────────────────────────── */
(function () {
  const wrap  = $('.problems-track-wrap');
  const track = $('.problems-track');
  if (!wrap || !track) return;

  /* Desativa animação CSS — controle total via JS */
  track.style.animation = 'none';

  const CYCLE_SECS = 34;
  let posX      = 0;
  let lastTs    = null;
  let hovering  = false;
  let dragging  = false;
  let dragStartX = 0;
  let dragPosX   = 0;
  let rafId     = null;

  function totalW() { return track.scrollWidth / 2; }

  function tick(ts) {
    if (lastTs !== null && !dragging && !hovering) {
      const dt    = Math.min((ts - lastTs) / 1000, 0.05); /* cap a 50ms */
      const tw    = totalW();
      const speed = tw / CYCLE_SECS;
      posX -= speed * dt;
      if (posX <= -tw) posX += tw;
    }
    lastTs = ts;
    track.style.transform = `translateX(${posX}px)`;
    rafId = requestAnimationFrame(tick);
  }

  /* Só anima enquanto a seção está visível — sem isso o loop rodava pra
     sempre desde o load, lendo scrollWidth (força layout) a cada frame
     em QUALQUER lugar da página, competindo por CPU com o resto do site. */
  const visibilityObs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting && rafId === null) {
        lastTs = null; /* evita salto de dt ao retomar depois de pausado */
        rafId = requestAnimationFrame(tick);
      } else if (!entry.isIntersecting && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });
  }, { threshold: 0 });
  visibilityObs.observe(wrap);

  /* Pausa no hover — apenas dispositivos com cursor real */
  wrap.addEventListener('mouseenter', () => { hovering = true;  });
  wrap.addEventListener('mouseleave', () => { hovering = false; });

  /* Drag */
  wrap.addEventListener('pointerdown', e => {
    dragging   = true;
    dragStartX = e.clientX;
    dragPosX   = posX;
  });

  window.addEventListener('pointermove', e => {
    if (!dragging) return;
    const tw = totalW();
    posX = dragPosX + (e.clientX - dragStartX);
    while (posX > 0)   posX -= tw;
    while (posX < -tw) posX += tw;
  });

  window.addEventListener('pointerup',     () => { dragging = false; });
  window.addEventListener('pointercancel', () => { dragging = false; });
})();

/* ─── Serviços — Background scroll-driven ───────────────────────────── */
(function () {
  const section = $('.servicos-section');
  const bg      = section?.querySelector('.servicos-section-bg');
  if (!section || !bg) return;

  let lastClip = null;

  function updateBg() {
    const vw   = window.innerWidth;
    const rect = section.getBoundingClientRect();
    const vh   = window.innerHeight;

    /* progress: 0 quando seção entra pela base, 1 quando topo chega a 25% do viewport */
    const progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh * 0.75)));

    const startHalf = vw > 640 ? 400 : 150; /* 800px desktop / 300px mobile dividido por 2 */
    const half      = startHalf + (vw / 2 - startHalf) * progress;
    const clip      = Math.round(Math.max(0, vw / 2 - half));

    /* O raio arredondado é a parte mais cara de recalcular a cada frame
       (o navegador retesela os cantos do clip-path). Zerando-o logo no
       início do trecho (35% do progresso) — em vez de ao longo de todo
       ele — mantém a mesma duração/distância de scroll, mas deixa a
       maior parte da transição usando só um clip retangular, bem mais
       leve de renderizar. */
    const radiusProgress = IS_FIREFOX ? 1 : Math.min(1, progress / 0.35);
    const radius = Math.round(44 * (1 - radiusProgress));

    const next = `inset(0 ${clip}px round ${radius}px)`;
    if (next === lastClip) return;
    lastClip = next;
    bg.style.clipPath = next;
  }

  scrollCallbacks.push(updateBg);
  window.addEventListener('resize', updateBg, { passive: true });
  updateBg();
})();

/* ─── Problemas — Background sólido preto, mesma animação de "pílula
   que expande" da seção de serviços ──────────────────────────────── */
(function () {
  const section = $('.problems-section');
  const bg      = section?.querySelector('.problems-section-bg');
  if (!section || !bg) return;

  let lastClip = null;

  function updateBg() {
    const vw   = window.innerWidth;
    const rect = section.getBoundingClientRect();
    const vh   = window.innerHeight;

    const progress = Math.max(0, Math.min(1, (vh - rect.top) / (vh * 0.75)));

    const startHalf = vw > 640 ? 400 : 150;
    const half      = startHalf + (vw / 2 - startHalf) * progress;
    const clip      = Math.round(Math.max(0, vw / 2 - half));

    const radiusProgress = IS_FIREFOX ? 1 : Math.min(1, progress / 0.35);
    const radius = Math.round(44 * (1 - radiusProgress));

    const next = `inset(0 ${clip}px round ${radius}px)`;
    if (next === lastClip) return;
    lastClip = next;
    bg.style.clipPath = next;
  }

  scrollCallbacks.push(updateBg);
  window.addEventListener('resize', updateBg, { passive: true });
  updateBg();
})();

/* ─── Lazy background-images ─────────────────────────────────────────
   Cards e popups usam data-bg em vez de background-image inline no HTML.
   Sem isso, o navegador baixava TODAS as imagens de fundo já no carregamento
   da página — incluindo as dos 14 popups de serviço, que ficam sempre no
   DOM (display:flex) e só viram invisíveis via opacity. Isso somava ~2MB
   de imagens de popups fechados baixadas antes de qualquer interação. */
function applyLazyBg(el) {
  if (!el.dataset.bg) return;
  el.style.backgroundImage = `url('${el.dataset.bg}')`;
  delete el.dataset.bg;
}

/* Cards: carregam ao chegar perto da viewport (scroll) */
const bgObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      applyLazyBg(entry.target);
      bgObserver.unobserve(entry.target);
    }
  });
}, { rootMargin: '300px' });

$$('.servico-card-img[data-bg], .operamos-tile[data-bg]').forEach(el => bgObserver.observe(el));

/* ─── Serviços — Popups ──────────────────────────────────────────────── */
let _lastFocused = null;

function openServicosPopup(popupId) {
  const popup = $('#' + popupId);
  if (!popup) return;
  /* Popups são fixed/inset:0 — IntersectionObserver os considera sempre
     visíveis mesmo fechados, então a imagem só pode ser carregada aqui,
     no momento real da abertura. */
  popup.querySelectorAll('[data-bg]').forEach(applyLazyBg);
  _lastFocused = document.activeElement;
  popup.classList.add('is-open');
  popup.removeAttribute('aria-hidden');
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => popup.querySelector('.servico-popup-close')?.focus());
}

function closeServicosPopup(popup) {
  popup.classList.remove('is-open');
  popup.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  _lastFocused?.focus();
}

$$('.servico-card, .bu-card').forEach(card => {
  const open = () => openServicosPopup(card.dataset.popup);
  card.addEventListener('click', open);
  card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
});

$$('.servico-popup-close').forEach(btn => {
  btn.addEventListener('click', () => closeServicosPopup(btn.closest('.servico-popup')));
});

/* Clique no backdrop (fora do card) fecha o popup */
$$('.servico-popup').forEach(popup => {
  popup.addEventListener('click', e => {
    if (!e.target.closest('.servico-popup-card')) closeServicosPopup(popup);
  });
});

/* CTA "Saiba mais" dentro do popup — fecha o popup antes de rolar até o form */
$$('.servico-popup-copy a[href^="#"]').forEach(link => {
  link.addEventListener('click', () => closeServicosPopup(link.closest('.servico-popup')));
});

/* Footer — botões que abrem popups de serviços */
$$('[data-popup-open]').forEach(btn => {
  btn.addEventListener('click', () => openServicosPopup(btn.dataset.popupOpen));
});

/* NOVO 2026-10: meeting_scheduled. A agenda do Google (appointment
   schedule embutida) NÃO expõe callback de confirmação para a página
   (não verificado nenhum postMessage oficial), então este evento fica
   disponível como função para quando houver ferramenta com callback
   (ex.: Calendly/Cal.com). Até lá, o agendamento vem do CRM via n8n. */
function lan4MeetingScheduled(dados) {
  dados = dados || {};
  var ev = { event: 'meeting_scheduled', meeting_tool: dados.meeting_tool || 'google_calendar', event_id: lan4EventId() };
  if (dados.email) ev.user_data = { email: lan4NormalizeEmail(dados.email) };
  window.dataLayer.push(ev);
  if (ev.user_data) window.dataLayer.push({ user_data: undefined });
}
window.lan4MeetingScheduled = lan4MeetingScheduled;

/* ─── Formulário de contato → RD Station ────────────────────────────── */
(function () {
  var form = document.getElementById('lf');
  var msg  = document.getElementById('lf-msg');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (form.lan4StepGuard && form.lan4StepGuard()) return; // Enter antes da última etapa só avança
    var v   = function (n) { return lan4CampoValor(form, n); };
    var btn = form.querySelector('button[type="submit"]');
    var btnTexto = btn.textContent;
    var identificador = lan4FormId(form, 'lan4-contato-site');

    // Validação: obrigatórios declarados em data-req + telefone 11 dígitos corridos
    var erro = lan4ValidaObrigatorios(form, lan4ReqDoForm(form)) || lan4ValidaTelefone(v('telefone'));
    if (erro) {
      msg.className = 'lf-msg err';
      msg.style.display = 'block';
      msg.textContent = erro;
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Enviando…';
    msg.style.display = 'none';

    // Captura os valores ANTES do fetch/reset — usados no tracking pós-sucesso
    var lead = {
      nome: v('nome'), email: v('email'), telefone: v('telefone'),
      cargo: v('cargo'), faturamento: v('faturamento'),
      servico: v('servico_interesse'), empresa: v('empresa')
    };

    /* Prioridade do serviço de interesse: seletor da Etapa 1 (v('servico_interesse'))
       > window.LAN4_SERVICO_PAGINA (páginas /s/ e /engine/) > mapeamento por UTM
       (lan4ServicoInteresse, fallback pra tráfego pago sem passar pelo seletor).
       lan4RdUtmPayload() já resolve os dois últimos; aqui sobrescrevemos só se
       o seletor tiver valor. */
    var extrasPayload = Object.assign({}, lan4ExtrasRd(form), lan4RdUtmPayload());
    if (lead.servico) extrasPayload.cf_servico_de_interesse = lead.servico;
    var eventId = lan4EventId(); /* 1 UUID por envio: eid= em cf_rastreamento_ids = event_id no dataLayer */
    extrasPayload.cf_event_id = eventId;

    lan4EnviaRd(Object.assign({
      token_rdstation:              'proxied',
      identificador:                identificador,
      email:                        lead.email,
      nome:                         lead.nome,
      mobile_phone:                 lan4NormalizePhoneMeta(lead.telefone),
      cf_cargo:                     lead.cargo,
      cf_faturamento_medio_mensal:  lead.faturamento,
      cf_nome_da_empresa:           lead.empresa
    }, extrasPayload))
    .then(function (r) {
      return r.json().then(function (data) {
        console.log('[RD Station] status:', r.status, 'response:', data);
        if (!r.ok) throw new Error(r.status + ' – ' + JSON.stringify(data));
        form.lan4Concluido = true; /* impede form_abandon */
        if (!r.lan4Blocked) lan4PushLead(identificador, lead, 'lead_form_submit', eventId, {
          lead_type: lan4PageType(),
          servico_interesse: extrasPayload.cf_servico_de_interesse || ''
        });
        form.reset();
        form.classList.add('is-sent');
        msg.className = 'lf-msg ok';
        msg.style.display = 'block';
        msg.innerHTML = '<div class="lf-msg-icon">&#10003;</div>'
          + '<div class="lf-msg-title">Recebemos suas informações!</div>'
          /* Segunda "H1" (mesmo tamanho do título) logo abaixo da
             confirmação — enquadra o agendamento como um adiantamento
             natural, não como uma etapa a mais. Copy do Lucas 2026-09-01. */
          + '<div class="lf-msg-title lf-msg-title-agenda">Agilize seu atendimento e agende uma call de 30 minutos com nosso especialista do time de vendas.</div>'
          + '<div class="lf-msg-body">Alguém do nosso time vai entrar em contato com você em breve pelo WhatsApp.</div>'
          + '<div class="lf-msg-ebook">Você recebeu um material inicial para identificar melhorias na engrenagem da sua empresa a curto prazo, enviado para <strong data-lf-email></strong></div>'
          /* Plus não-bloqueante (2026-09-01): agenda do Tiago embutida na
             caixa de conclusão. Puramente visual — roda DEPOIS de
             lan4PushLead/lan4EnviaRd já terem resolvido (linhas acima), não
             intercepta submit nem altera nenhum evento de conversão
             (GA4/Meta/Google Ads). O iframe é a URL de EMBED oficial do
             Google (/calendar/appointments/schedules/...?gv=true), que NÃO
             manda X-Frame-Options (diferente da short link
             calendar.app.google) e carrega dentro de lan4.com.br. Carrega
             só quando a caixa aparece (loading=lazy); se não pintar em 4s
             (rede/bloqueio de terceiro), lan4AgendaFallback() troca pelo
             botão que abre em nova aba. O match do agendamento com o card
             do lead no RD é feito por automação n8n (casa pelo e-mail do
             convidado), não daqui. */
          + '<div class="lf-msg-agenda">'
          + '  <div class="lf-msg-agenda-embed" data-lf-agenda-embed>'
          + '    <iframe title="Agenda do Tiago — escolher horário" loading="lazy" src="https://calendar.google.com/calendar/appointments/schedules/AcZssZ1Cqf4Jfj6tHo_vxnPDmXYZURdeMIC_9bw2_hUWWJnxueKHO8cIEM3C7GAIe1FV4MW57ulrpyV5?gv=true" style="border:0" width="100%" height="760" frameborder="0"></iframe>'
          + '  </div>'
          + '  <noscript><a class="lf-msg-agenda-btn" href="https://calendar.app.google/wJ6hmHugSuTyYm8HA" target="_blank" rel="noopener">Escolher horário com o Tiago</a></noscript>'
          + '</div>';
        var emailSpan = msg.querySelector('[data-lf-email]');
        if (emailSpan) emailSpan.textContent = lead.email; // textContent, não innerHTML — evita XSS via campo de e-mail do usuário
        /* Fallback: se o iframe da agenda não sinalizar 'load' em 4s
           (bloqueio de terceiro, rede lenta, mudança de header do Google),
           substitui pelo botão que abre a agenda em nova aba — o lead nunca
           fica olhando um espaço vazio. */
        (function () {
          var wrap = msg.querySelector('[data-lf-agenda-embed]');
          if (!wrap) return;
          var frame = wrap.querySelector('iframe');
          var ok = false;
          if (frame) frame.addEventListener('load', function () { ok = true; });
          setTimeout(function () {
            if (ok) return;
            wrap.innerHTML = '<a class="lf-msg-agenda-btn" href="https://calendar.app.google/wJ6hmHugSuTyYm8HA" target="_blank" rel="noopener" aria-label="Escolher horário com o Tiago (abre em nova aba)">'
              + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>'
              + 'Escolher horário com o Tiago</a>';
            var b = wrap.querySelector('.lf-msg-agenda-btn');
            if (b) b.addEventListener('click', function () {
              try {
                window.dataLayer = window.dataLayer || [];
                /* NOVO 2026-10: era agendamento_tiago_click → meeting_view (abriu a agenda em nova aba) */
                window.dataLayer.push({ event: 'meeting_view', meeting_tool: 'google_calendar', form_id: identificador, meeting_open: 'new_tab' });
              } catch (e) {}
            });
          }, 4000);
        })();
        /* Evento PRÓPRIO de "abriu a agenda" — fora do caminho de
           lead_form_submit (mesmo princípio de whatsapp_click). Não é
           conversão primária; serve só pra medir engajamento com o plus.
           Dispara quando o iframe carrega. Falha silenciosa sem dataLayer. */
        (function () {
          var frame = msg.querySelector('[data-lf-agenda-embed] iframe');
          if (!frame) return;
          frame.addEventListener('load', function () {
            try {
              window.dataLayer = window.dataLayer || [];
              /* NOVO 2026-10: era agendamento_tiago_view → meeting_view */
              window.dataLayer.push({ event: 'meeting_view', meeting_tool: 'google_calendar', form_id: identificador, meeting_open: 'embed' });
            } catch (e) {}
          }, { once: true });
        })();
      });
    })
    .catch(function (err) {
      console.error('[RD Station] erro:', err);
      msg.className = 'lf-msg err';
      msg.style.display = 'block';
      msg.textContent = 'Ocorreu um erro. Tente novamente ou fale pelo WhatsApp.';
    })
    .finally(function () {
      btn.disabled = false;
      btn.textContent = btnTexto;
    });
  });
})();

/* ─── Vídeos de fundo (hero + mandala) — <source src> direto no HTML,
   sem carregamento via JS. Carregar dinamicamente (data-src + load() +
   play() manual) é historicamente frágil pra autoplay no Safari/iOS —
   mesmo com muted+playsinline e múltiplos retries em eventos de
   prontidão, o autoplay não "pegava" de forma confiável. Como vídeo
   deve carregar sempre (decisão do usuário, inclusive mobile), o
   padrão nativo do navegador (autoplay+muted+playsinline no HTML) é
   mais robusto que qualquer replicação em JS. */
(function () {
  const videos = $$('.mandala-video, .hero-video-bg');
  if (!videos.length) return;

  /* Pausa vídeos em loop quando saem da tela (reduz decode simultâneo) —
     sem isso eles decodificam pra sempre, mesmo rolados pra fora da tela,
     competindo com todo o resto por CPU/GPU. */
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? entry.target.play().catch(() => {}) : entry.target.pause());
  }, { threshold: 0.1 });
  videos.forEach(v => obs.observe(v));

  /* O vídeo do hero já nasce visível na tela (diferente da mandala, que só
     recebe o primeiro play() do IntersectionObserver quando o usuário rola
     até ela — nesse ponto o Safari já "assentou" o carregamento da página).
     Pro hero, o autoplay nativo do HTML tem que funcionar sozinho logo no
     primeiro paint. Problema real encontrado: os listeners de evento
     (loadeddata/canplay) só disparam o retry SE registrados ANTES do
     evento acontecer — em conexão rápida/vídeo em cache, esses eventos já
     disparam antes do main.js (script deferred) rodar, então o listener
     nunca pega. E uma única tentativa de play() no momento errado (dado
     ainda não pronto) falha silenciosamente sem nova tentativa depois.
     Fix: retry ativo com setTimeout em vários instantes (não só reativo a
     eventos que podem já ter passado), parando assim que o vídeo
     realmente começa a tocar. */
  const hero = $('.hero-video-bg');
  if (hero) {
    const tentaPlay = () => hero.play().catch(() => {});
    tentaPlay();
    hero.addEventListener('loadeddata', tentaPlay);
    hero.addEventListener('canplay', tentaPlay);
    [50, 200, 500, 1000, 2000].forEach(ms => setTimeout(() => {
      if (hero.paused) tentaPlay();
    }, ms));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && hero.paused) tentaPlay();
    });
  }
})();

/* ─── FAQ accordion ──────────────────────────────────────────────────── */
$$('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    const answer = btn.nextElementSibling;

    // Fecha todos os outros
    $$('.faq-question').forEach(other => {
      if (other !== btn) {
        other.setAttribute('aria-expanded', 'false');
        other.nextElementSibling.classList.remove('is-open');
      }
    });

    // Alterna este
    btn.setAttribute('aria-expanded', String(!isOpen));
    answer.classList.toggle('is-open', !isOpen);
  });
});

/* ─── Scroll reveal (IntersectionObserver) ──────────────────────────── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

/* ─── Botão flutuante WhatsApp ───────────────────────────────────────
   Aparece após LAN4_WHATSAPP_DELAY_MS (50s desde 11/11/2026; antes 8s). Some ao
   primeiro form_start para não competir com quem já está preenchendo.
   Antes de abrir o WhatsApp, coleta nome/e-mail/telefone num modal leve
   e envia como lead real ao RD (identificador lan4-whatsapp-click) —
   pedido do Guilherme (23/07): sem isso o clique não vira lead
   rastreável no CRM, só um evento de analytics. Mensagem cita o serviço
   da página (LAN4_SERVICO_PAGINA) e anexa a origem só quando há UTM
   real na sessão — nunca alega mídia paga sem o dado vir da URL. */
(function () {
  var LAN4_WHATSAPP_NUMERO = '5511944877193';
  var LAN4_WHATSAPP_DELAY_MS = 50000; // 50s (era 8s) — pedido do Giovanny 11/11/2026
  var LAN4_WHATSAPP_IDENTIFICADOR = 'lan4-whatsapp-click';

  /* Foco amarelo (marca) nos campos do modal — inline style não suporta
     :focus, injeta uma vez só no <head>. */
  (function () {
    var style = document.createElement('style');
    style.textContent = '#lan4-whatsapp-modal-overlay *{box-sizing:border-box;max-width:100%;}'
      + '#lan4-whatsapp-form input:focus{outline:none;border-color:#FFD900 !important;background:rgba(255,217,0,.08) !important;}'
      + '#lan4-whatsapp-form input::placeholder{color:rgba(255,255,255,.4);}'
      + '#lan4-whatsapp-enviar:hover{background:#1EBE5B;}'
      + '#lan4-whatsapp-cancelar:hover{color:#fff;}';
    document.head.appendChild(style);
  })();

  /* Mesmo serviço do hero de cada página (ver upload/s/<slug>/index.html) —
     mantém a mensagem do WhatsApp consistente com o que a pessoa viu.
     Padrão: "Olá, me chamo [Nome]! Vim do site da LAN4 e tenho interesse em <frase>". */
  var LAN4_WHATSAPP_MSG_POR_SERVICO = {
    'Gestão de Redes Sociais':    'na gestão de redes sociais de vocês',
    'Vendas e CRM':               'na terceirização de vendas e CRM de vocês',
    'Mídia Paga':                 'na gestão de mídia paga de vocês',
    'Marketing Digital':          'no marketing digital de vocês',
    'Recrutamento e Seleção':     'no recrutamento e seleção de vocês',
    'Audiovisual e Conteúdo':     'na produção audiovisual de vocês',
    'Eventos Corporativos':       'na organização de eventos de vocês'
  };

  function lan4WhatsappMensagem(nome, waRef) {
    var servico = window.LAN4_SERVICO_PAGINA || '';
    var interesse = LAN4_WHATSAPP_MSG_POR_SERVICO[servico] || 'nas soluções de vocês';
    var saudacao = nome ? 'Olá, me chamo ' + nome + '! ' : 'Olá! ';
    /* NOVO 2026-10: código wa_ref no fim da mensagem (mesmo valor de wa= em cf_rastreamento_origem no RD) */
    return saudacao + 'Vim do site da LAN4 e tenho interesse ' + interesse + '.' + (waRef ? ' (cód. ' + waRef + ')' : '');
  }

  function lan4WhatsappLink(nome, waRef) {
    var msg = encodeURIComponent(lan4WhatsappMensagem(nome, waRef));
    return 'https://wa.me/' + LAN4_WHATSAPP_NUMERO + '?text=' + msg;
  }

  /* NOVO 2026-10: o push 'whatsapp_click' que vinha junto daqui foi
     removido — no contrato whatsapp_click é só clique direto em wa.me (sem
     modal); o lead do modal é whatsapp_lead_submit (Meta Contact). */
  function lan4WhatsappPushLead(lead, eventId, waRef) {
    lan4PushLead(LAN4_WHATSAPP_IDENTIFICADOR, lead, 'whatsapp_lead_submit', eventId, { wa_ref: waRef });
  }

  /* ─── Modal de captura (nome/e-mail/telefone) ───────────────────────── */
  function lan4CriaModalWhatsapp(opcoes) {
    var overlay = document.createElement('div');
    overlay.id = 'lan4-whatsapp-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);'
      + 'display:flex;align-items:center;justify-content:center;z-index:10001;'
      + 'padding:16px;box-sizing:border-box;';

    /* Cores da marca LAN4 (mesma paleta do site: index.html linhas 131/160/177):
       fundo #0A1428 (azul-marinho), destaque #FFD900 (amarelo), texto claro.
       max-width em calc() (não px fixo) evita extrapolar em telas estreitas
       (a largura já desconta o padding:16px do overlay dos dois lados). */
    var box = document.createElement('div');
    box.style.cssText = 'background:#0A1428;color:#fff;border-radius:14px;padding:28px 24px;'
      + 'width:100%;max-width:min(360px,calc(100vw - 32px));font-family:inherit;'
      + 'border:1px solid rgba(255,217,0,.25);box-shadow:0 20px 60px rgba(0,0,0,.5);'
      + 'box-sizing:border-box;';
    /* Div em vez de <form>: o listener global de focusin (linha ~233)
       dispara form_start em QUALQUER <form> da página — usar <form> aqui
       sujaria o dataLayer com um form_identifier espúrio e escondería o
       botão flutuante sem necessidade (window.LAN4_FORM_START). */
    box.innerHTML =
      '<h3 style="margin:0 0 4px;font-size:19px;color:#fff;">Antes de continuar</h3>'
      + '<p style="margin:0 0 18px;font-size:13px;color:rgba(255,255,255,.65);">Deixe seus dados pra já entrarmos em contato mesmo se a conversa cair.</p>'
      + '<div id="lan4-whatsapp-form" novalidate>'
      + '  <input name="nome" autocomplete="name" placeholder="Nome" required style="width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:10px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background:rgba(255,255,255,.06);color:#fff;">'
      + '  <input name="email" type="email" autocomplete="email" placeholder="Seu melhor e-mail" required style="width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:10px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background:rgba(255,255,255,.06);color:#fff;">'
      + '  <input name="telefone" type="tel" autocomplete="tel-national" placeholder="WhatsApp com DDD (ex.: 11998765432)" required style="width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:10px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background:rgba(255,255,255,.06);color:#fff;">'
      + '  <select name="faturamento" required class="lan4-servico-select" style="width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:10px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background-color:rgba(255,255,255,.06);color:#fff;"><option value="" disabled selected style="color:#fff;background:#0d2149;">Faturamento mensal da empresa</option><option value="Até 100k" style="color:#fff;background:#0d2149;">Menos de R$ 100 mil/mês</option><option value="100 - 300k" style="color:#fff;background:#0d2149;">R$ 100 a 300 mil</option><option value="300k - 1M" style="color:#fff;background:#0d2149;">R$ 300 mil a 1 milhão</option><option value="Acima de 1M" style="color:#fff;background:#0d2149;">Acima de R$ 1 milhão</option><option value="Não faturo" style="color:#fff;background:#0d2149;">Ainda não faturo</option></select>'
      + '  <select name="cargo" required class="lan4-servico-select" style="width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:10px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background-color:rgba(255,255,255,.06);color:#fff;"><option value="" disabled selected style="color:#fff;background:#0d2149;">Seu cargo</option><option value="Sócio" style="color:#fff;background:#0d2149;">Sócio</option><option value="CEO / Fundador" style="color:#fff;background:#0d2149;">CEO / Fundador</option><option value="Diretor" style="color:#fff;background:#0d2149;">Diretor</option><option value="Gerente" style="color:#fff;background:#0d2149;">Gerente</option><option value="Outro" style="color:#fff;background:#0d2149;">Outro</option></select>'
      + '  <select name="servico_interesse" required class="lan4-servico-select" style="width:100%;box-sizing:border-box;padding:11px 12px;margin-bottom:6px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background-color:rgba(255,255,255,.06);color:#fff;">'
      + '    <option value="" disabled selected style="color:#fff;background:#0d2149;">Qual serviço te interessa?</option>'
      + '    ' + LAN4_SERVICO_OPTIONS_HTML
      + '  </select>'
      + '  <div id="lan4-whatsapp-erro" style="color:#ff8a8a;font-size:12px;min-height:16px;margin-bottom:10px;"></div>'
      + '  <button type="button" id="lan4-whatsapp-enviar" style="width:100%;padding:13px;background:#25D366;color:#fff;border:none;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer;">Continuar no WhatsApp</button>'
      + '  <button type="button" id="lan4-whatsapp-cancelar" style="width:100%;padding:9px;background:transparent;color:rgba(255,255,255,.55);border:none;font-size:13px;cursor:pointer;margin-top:6px;">Cancelar</button>'
      + '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var form = box.querySelector('#lan4-whatsapp-form');
    var erroEl = box.querySelector('#lan4-whatsapp-erro');

    var ctaLocation = (opcoes && opcoes.cta_location) || 'whatsapp_float';
    var enviado = false;
    var parcialEnviado = false;
    window.dataLayer.push({ event: 'whatsapp_modal_open', cta_location: ctaLocation });

    /* NOVO 2026-10-14: lead PARCIAL do modal. Se a pessoa já preencheu nome +
       WhatsApp válido e desiste (Cancelar, clique fora, Esc ou sai da página),
       manda ao RD com identificador 'lan4-whatsapp-click-parcial' (mesmo padrão
       '-parcial' do formulário principal). Só 1x por modal e nunca depois do
       envio completo. E-mail/faturamento/cargo/serviço vão junto se preenchidos. */
    function enviaParcialWhatsapp() {
      if (enviado || parcialEnviado) return;
      var nome = lan4CampoValor(form, 'nome');
      var telefone = lan4CampoValor(form, 'telefone');
      if (!nome || lan4ValidaTelefone(telefone)) return;
      parcialEnviado = true;
      var email = lan4CampoValor(form, 'email');
      var faturamento = lan4CampoValor(form, 'faturamento');
      var cargo = lan4CampoValor(form, 'cargo');
      var servico = lan4CampoValor(form, 'servico_interesse');
      var eventId = lan4EventId();
      var payload = Object.assign({
        token_rdstation: 'proxied',
        identificador: LAN4_WHATSAPP_IDENTIFICADOR + '-parcial',
        nome: nome,
        mobile_phone: lan4NormalizePhoneMeta(telefone)
      }, lan4RdUtmPayload(), { cf_event_id: eventId });
      if (email && email.indexOf('@') !== -1) payload.email = email;
      if (faturamento) payload.cf_faturamento_medio_mensal = faturamento;
      if (cargo) payload.cf_cargo = cargo;
      if (servico) payload.cf_servico_de_interesse = servico;
      lan4EnviaRd(payload, { semRateLimit: true })
        .then(function (r) {
          if (r.ok && !r.lan4Blocked) {
            window.dataLayer.push({ event: 'whatsapp_lead_partial', cta_location: ctaLocation, event_id: eventId });
          } else if (!r.ok) console.error('[RD Station][whatsapp-parcial] status:', r.status);
        })
        .catch(function (err) { console.error('[RD Station][whatsapp-parcial] erro:', err); });
    }
    function saiuDaPagina() { if (overlay.parentNode) enviaParcialWhatsapp(); }
    window.addEventListener('pagehide', saiuDaPagina);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') saiuDaPagina(); });

    function fechaSemEnvio() {
      if (!overlay.parentNode) return;
      var hadInput = ['nome', 'email', 'telefone', 'faturamento', 'cargo', 'servico_interesse'].some(function (n) { return !!lan4CampoValor(form, n); });
      enviaParcialWhatsapp();
      overlay.remove();
      if (!enviado) window.dataLayer.push({ event: 'whatsapp_modal_close', cta_location: ctaLocation, had_input: hadInput });
    }
    function fecha() { overlay.remove(); }
    box.querySelector('#lan4-whatsapp-cancelar').addEventListener('click', fechaSemEnvio);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) fechaSemEnvio(); });
    document.addEventListener('keydown', function escFecha(e) {
      if (e.key === 'Escape') { fechaSemEnvio(); document.removeEventListener('keydown', escFecha); }
    });

    box.querySelector('#lan4-whatsapp-enviar').addEventListener('click', function (e) {
      e.preventDefault();
      var nome = lan4CampoValor(form, 'nome');
      var email = lan4CampoValor(form, 'email');
      var telefone = lan4CampoValor(form, 'telefone');
      var faturamento = lan4CampoValor(form, 'faturamento');
      var cargo = lan4CampoValor(form, 'cargo');
      var servico = lan4CampoValor(form, 'servico_interesse');

      if (!nome) { erroEl.textContent = 'Preencha seu nome.'; return; }
      if (!email || email.indexOf('@') === -1) { erroEl.textContent = 'Preencha um e-mail válido.'; return; }
      var erroTel = lan4ValidaTelefone(telefone);
      if (erroTel) { erroEl.textContent = erroTel; return; }
      if (!faturamento) { erroEl.textContent = 'Selecione o faturamento mensal.'; return; }
      if (!cargo) { erroEl.textContent = 'Selecione seu cargo.'; return; }
      if (!servico) { erroEl.textContent = 'Selecione um serviço de interesse.'; return; }

      var btn = box.querySelector('#lan4-whatsapp-enviar');
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      parcialEnviado = true; /* envio completo em andamento: o parcial não dispara (ex.: aba do WhatsApp esconde a página) */

      var lead = { nome: nome, email: email, telefone: telefone, faturamento: faturamento, cargo: cargo, servico: servico };

      var eventId = lan4EventId();
      var waRef = lan4WaRef();
      var extrasPayload = Object.assign({ cf_servico_de_interesse: lead.servico, cf_faturamento_medio_mensal: lead.faturamento, cf_cargo: lead.cargo }, lan4RdUtmPayload(),
        { cf_event_id: eventId, cf_wa_ref: waRef });

      /* NOVO 2026-10: antes o .then rodava mesmo com 4xx/5xx (fetch só
         rejeita em erro de rede) e o lead "convertia" no GA4/Meta/Ads sem
         chegar ao RD. Agora só empurra no 2xx. Em erro, o WhatsApp abre do
         mesmo jeito (a pessoa não fica travada), mas sem evento de lead. */
      lan4EnviaRd(Object.assign({
        token_rdstation: 'proxied',
        identificador: LAN4_WHATSAPP_IDENTIFICADOR,
        email: lead.email,
        nome: lead.nome,
        mobile_phone: lan4NormalizePhoneMeta(lead.telefone)
      }, extrasPayload))
      .then(function (r) {
        enviado = true;
        if (r.ok && !r.lan4Blocked) lan4WhatsappPushLead(lead, eventId, waRef);
        else if (!r.ok) console.error('[RD Station][whatsapp] status:', r.status);
        fecha();
        window.open(lan4WhatsappLink(nome.split(' ')[0], r.ok ? waRef : ''), '_blank', 'noopener');
      })
      .catch(function () {
        parcialEnviado = false; /* envio falhou: se a pessoa desistir agora, o parcial ainda vale */
        erroEl.textContent = 'Ocorreu um erro. Tente novamente.';
        btn.disabled = false;
        btn.textContent = 'Continuar no WhatsApp';
      });
    });

    form.querySelector('[name="nome"]').focus();
  }

  function lan4CriaBotaoWhatsapp() {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'lan4-whatsapp-float';
    btn.setAttribute('aria-label', 'Falar no WhatsApp');
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="32" height="32" fill="#fff" aria-hidden="true"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.2 4.74 1.2h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.03c-.24.68-1.4 1.32-1.93 1.4-.5.08-1.12.11-1.81-.11-.42-.13-.96-.31-1.65-.6-2.91-1.26-4.81-4.19-4.96-4.38-.14-.2-1.19-1.58-1.19-3.02s.75-2.15 1.02-2.44c.26-.29.57-.36.76-.36l.55.01c.17.01.41-.06.64.49.24.57.81 1.98.88 2.12.07.15.12.32.02.51-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.06.95 1.96 1.24 2.24 1.38.28.14.44.12.61-.07.16-.19.7-.82.89-1.1.19-.29.38-.24.63-.14.26.09 1.66.78 1.94.92.28.14.47.21.54.33.07.12.07.68-.17 1.36z"/></svg>';
    btn.style.cssText = 'position:fixed;right:20px;bottom:20px;width:60px;height:60px;'
      + 'display:flex;align-items:center;justify-content:center;border-radius:50%;'
      + 'background:linear-gradient(135deg,#25D366 0%,#1EBE5B 100%);border:none;cursor:pointer;'
      + 'box-shadow:0 6px 20px rgba(37,211,102,.45),0 2px 8px rgba(0,0,0,.2);'
      + 'z-index:9999;opacity:0;transform:translateY(12px);'
      + 'transition:opacity .3s ease,transform .3s ease,box-shadow .2s ease,bottom .25s ease;';
    btn.addEventListener('mouseenter', function () {
      btn.style.boxShadow = '0 8px 26px rgba(37,211,102,.6),0 2px 8px rgba(0,0,0,.25)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.boxShadow = '0 6px 20px rgba(37,211,102,.45),0 2px 8px rgba(0,0,0,.2)';
    });
    document.body.appendChild(btn);
    requestAnimationFrame(function () {
      btn.style.opacity = '1';
      btn.style.transform = 'translateY(0)';
    });

    /* Sobe o botão acima da sticky bar mobile quando ela estiver visível
       (evita sobrepor o CTA "Falar com a LAN4"). A sticky bar já reposiciona
       seu próprio "bottom" para o viewport visual do Safari (main.js ~L212) —
       aqui só reagimos à classe is-visible, sem duplicar essa lógica. */
    var stickyBar = document.getElementById('sticky-cta');
    if (stickyBar) {
      var ajustaBotaoWhatsapp = function () {
        var stickyVisivel = stickyBar.classList.contains('is-visible')
          && window.getComputedStyle(stickyBar).display !== 'none';
        btn.style.bottom = stickyVisivel
          ? (stickyBar.offsetHeight + 16) + 'px'
          : '20px';
      };
      new MutationObserver(ajustaBotaoWhatsapp)
        .observe(stickyBar, { attributes: true, attributeFilter: ['class'] });
      window.addEventListener('resize', ajustaBotaoWhatsapp, { passive: true });
      ajustaBotaoWhatsapp();
    }

    btn.addEventListener('click', function () {
      lan4CriaModalWhatsapp({ cta_location: 'whatsapp_float' });
    });

    return btn;
  }

  function lan4RemoveBotaoWhatsapp(btn) {
    if (!btn || !btn.parentNode) return;
    btn.style.opacity = '0';
    btn.style.transform = 'translateY(12px)';
    setTimeout(function () { btn.remove(); }, 300);
  }

  /* NOVO 2026-10: abre o modal a partir de qualquer elemento com
     [data-lan4-whatsapp-modal] (usado na página /links). */
  window.lan4AbreWhatsappModal = lan4CriaModalWhatsapp;
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-lan4-whatsapp-modal]') : null;
    if (!el) return;
    e.preventDefault();
    lan4CriaModalWhatsapp({ cta_location: el.getAttribute('data-cta-location') || 'whatsapp_modal_link' });
  });
  if (window.LAN4_DISABLE_WA_FLOAT) return; /* páginas sem botão flutuante (ex.: /links) */

  var lan4WhatsappTimer = setTimeout(function () {
    if (window.LAN4_FORM_START) return; // já iniciou o form antes do delay
    var btn = lan4CriaBotaoWhatsapp();
    window.LAN4_ON_FORM_START = function () { lan4RemoveBotaoWhatsapp(btn); };
  }, LAN4_WHATSAPP_DELAY_MS);

  window.LAN4_ON_FORM_START_BEFORE_TIMER = function () {
    clearTimeout(lan4WhatsappTimer);
  };
})();

$$('.reveal').forEach(el => revealObserver.observe(el));

/* ─── Vídeos abaixo da dobra: preload="none" + start só ao entrar
   na viewport (PageSpeed 2026-08-17: vídeo da mandala competia por
   banda com os scripts de tracking nos primeiros ~1,2s de carregamento,
   sem ganho real porque a seção só aparece depois de rolar a página). */
$$('video[data-lazy-autoplay]').forEach(function (video) {
  var lazyVideoObserver = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        var source = video.querySelector('source[data-src]');
        if (source) {
          source.src = source.dataset.src;
          source.removeAttribute('data-src');
          video.load();
        }
        video.play().catch(function () {});
        lazyVideoObserver.unobserve(video);
      }
    });
  }, { threshold: 0.1 });
  lazyVideoObserver.observe(video);
});

/* ─── Pop-up de saída — material isca (e-book "A Engrenagem") ────────
   Gatilho: exit-intent real (mouse saindo pelo topo/velocidade), com
   piso mínimo de sessão + scroll mínimo, no desktop; tempo fixo de 40s
   no mobile (não existe exit-intent em touch). Thresholds endurecidos
   em 2026-08-07 (piso de sessão 8s→30s, scroll mínimo 30%→50%, delay
   mobile 25s→40s) a pedido do cliente — volume alto de leads vindo do
   popup estava competindo com o protagonismo do formulário principal;
   valores alinhados ao benchmark de mercado 2026 (Wisepops/Omnisend:
   30s mínimo de leitura, Popupsmart: 30–50% de scroll). Ver comentários
   na seção "Gatilhos" mais abaixo.
   Mesmo padrão do modal de WhatsApp: nome/telefone/e-mail, envia como
   lead real ao RD com identificador PRÓPRIO (lan4-material-isca) —
   não entra no MQL automático (sem faturamento/ticket), é um lead de
   menor qualificação por natureza (baixa fricção proposital). O
   material é enviado manualmente pelo comercial via WhatsApp; ao
   enviar o form, abre o WhatsApp já com uma mensagem pré-pronta
   pedindo o material — reduz a espera percebida pelo usuário e não
   depende de resposta imediata do comercial pra criar valor. */
(function () {
  if (window.LAN4_DISABLE_ISCA) return; /* NOVO 2026-10: páginas sem pop-up de material (ex.: /links) */
  var LAN4_ISCA_IDENTIFICADOR = 'lan4-material-isca';
  var LAN4_ISCA_WHATSAPP_NUMERO = '5511944877193';
  var LAN4_ISCA_SESSION_KEY = 'lan4_isca_popup_shown';
  var LAN4_ISCA_COOLDOWN_KEY = 'lan4_isca_popup_last_shown';
  var LAN4_ISCA_COOLDOWN_DIAS = 7;       // não repete pro mesmo visitante por N dias, mesmo em nova sessão (OptinMonster/Unbounce)
  var LAN4_ISCA_MOBILE_DELAY_MS = 40000; // 40s (era 25s) — dar mais tempo de leitura antes da alternativa ao form principal aparecer no mobile, sem exit-intent disponível
  var LAN4_ISCA_MIN_SESSION_MS = 30000;  // piso de 30s (era 8s) antes de QUALQUER exit-intent poder disparar — alinhado ao benchmark 2026 (Wisepops/Omnisend: 30s mínimo de leitura), reduz protagonismo do popup frente ao form principal
  var LAN4_ISCA_MIN_SCROLL_PCT = 0.50;   // scroll mínimo de 50% da página (era 30% — Wisepops/Popupsmart 2026: 30–50% é a faixa, subimos pro teto pra exigir engajamento real com o conteúdo antes de cogitar o popup)
  var LAN4_ISCA_DEBOUNCE_MS = 600;       // permanência na "zona de saída" antes de confirmar (era 350 — ampliado a pedido do cliente pra dar mais folga a movimento lento/deliberado de leitura; cancela se o mouse voltar)

  /* Não repete na mesma sessão, nem pro mesmo visitante dentro do cooldown
     (localStorage sobrevive entre sessões/abas; sessionStorage cobre o
     caso do localStorage estar bloqueado). */
  function lan4IscaJaExibido() {
    try { if (sessionStorage.getItem(LAN4_ISCA_SESSION_KEY) === '1') return true; } catch (e) {}
    try {
      var ultima = localStorage.getItem(LAN4_ISCA_COOLDOWN_KEY);
      if (ultima && (Date.now() - Number(ultima)) < LAN4_ISCA_COOLDOWN_DIAS * 24 * 60 * 60 * 1000) return true;
    } catch (e) {}
    return false;
  }
  function lan4IscaMarcaExibido() {
    try { sessionStorage.setItem(LAN4_ISCA_SESSION_KEY, '1'); } catch (e) {}
    try { localStorage.setItem(LAN4_ISCA_COOLDOWN_KEY, String(Date.now())); } catch (e) {}
  }

  (function () {
    var style = document.createElement('style');
    style.textContent = '#lan4-isca-overlay *{box-sizing:border-box;max-width:100%;}'
      + '#lan4-isca-form input:focus{outline:none;border-color:#FFD900 !important;background:rgba(255,217,0,.08) !important;}'
      + '#lan4-isca-form input::placeholder{color:rgba(255,255,255,.4);}'
      + '#lan4-isca-enviar:hover{background:#FFE44D;}'
      + '#lan4-isca-cancelar:hover{color:#fff;}'
      + '@keyframes lan4IscaIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}';
    document.head.appendChild(style);
  })();

  function lan4IscaMensagemWhatsapp(nome) {
    var saudacao = nome ? 'Olá, me chamo ' + nome + '! ' : 'Olá! ';
    return saudacao + 'Preenchi o formulário no site da LAN4 pra receber o material "A Engrenagem que Faz Empresas Crescerem de Verdade". Pode me enviar?';
  }

  function lan4IscaWhatsappLink(nome) {
    var msg = encodeURIComponent(lan4IscaMensagemWhatsapp(nome));
    return 'https://wa.me/' + LAN4_ISCA_WHATSAPP_NUMERO + '?text=' + msg;
  }

  /* NOVO 2026-10: 'material_isca_lead' (sem user_data) foi removido; fica só
     material_isca_lead_submit com user_data + event_id + material_id. */
  function lan4IscaPushLead(lead, eventId) {
    lan4PushLead(LAN4_ISCA_IDENTIFICADOR, lead, 'material_isca_lead_submit', eventId, { material_id: 'a-engrenagem' });
  }

  /* Evento dedicado ao clique em "Falar com um consultor agora" na tela de
     confirmação pós-envio. Distinto de whatsapp_click/whatsapp_lead_submit
     (que pertencem ao modal de WhatsApp geral do site, main.js ~linha 1121)
     — não reaproveitar esses, são fluxos e triggers de GTM diferentes. */
  function lan4IscaPushWhatsappClick() {
    var utms = lan4GetUtms();
    window.dataLayer.push({
      event: 'material_isca_whatsapp_click',
      cf_utm_source: utms.utm_source || '',
      cf_utm_medium: utms.utm_medium || '',
      cf_utm_campaign: utms.utm_campaign || '',
      cf_servico_de_interesse: window.LAN4_SERVICO_PAGINA || lan4ServicoInteresse(utms) || ''
    });
  }

  function lan4FechaModalIsca(overlay) {
    overlay.style.opacity = '0';
    setTimeout(function () { overlay.remove(); }, 200);
  }

  /* Estado 2 do modal (pós-envio bem-sucedido): substitui o form pela
     confirmação de que o material chega por e-mail, com a opção de
     WhatsApp como ação secundária (não mais automática). Como o pop-up
     só aparece no exit-intent, mostrar essa confirmação aqui não compete
     com a navegação principal do site — a pessoa já estava saindo. */
  function lan4IscaMostraConfirmacao(box, overlay, primeiroNome) {
    var intro = box.querySelector('#lan4-isca-intro');
    if (intro) intro.style.display = 'none';
    box.querySelector('#lan4-isca-form').outerHTML =
      '<div id="lan4-isca-confirmacao" style="padding:26px 24px 24px;">'
      + '  <span style="display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#0A1428;background:#FFD900;border-radius:999px;padding:4px 10px;margin-bottom:14px;">Prontinho</span>'
      + '  <h3 style="margin:0 0 8px;font-size:19px;line-height:1.3;color:#fff;">Seu material chega no seu e-mail<br>em até 5 minutos.</h3>'
      + '  <p style="margin:0 0 20px;font-size:13.5px;line-height:1.5;color:rgba(255,255,255,.7);">Fique de olho na caixa de entrada (e no spam, por garantia).</p>'
      + '  <table border="0" cellpadding="0" cellspacing="0" role="presentation" width="100%" style="background:rgba(255,255,255,.06);border-radius:8px;margin-bottom:16px;"><tr><td style="padding:14px 16px;font-size:12.5px;line-height:1.5;color:rgba(255,255,255,.75);">Se alguma peça já te incomoda hoje, não precisa esperar a leitura terminar.</td></tr></table>'
      + '  <button type="button" id="lan4-isca-whatsapp" style="width:100%;padding:14px;background:#154CC4;color:#fff;border:none;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer;">Falar com um consultor agora</button>'
      + '  <button type="button" id="lan4-isca-confirmacao-fechar" style="width:100%;padding:9px;background:transparent;color:rgba(255,255,255,.5);border:none;font-size:12.5px;cursor:pointer;margin-top:4px;">Fechar</button>'
      + '</div>';

    box.querySelector('#lan4-isca-whatsapp').addEventListener('click', function () {
      lan4IscaPushWhatsappClick();
      window.open(lan4IscaWhatsappLink(primeiroNome), '_blank', 'noopener');
    });
    box.querySelector('#lan4-isca-confirmacao-fechar').addEventListener('click', function () {
      lan4FechaModalIsca(overlay);
    });
  }

  /* Checa dado real preenchido no form, não só "teve foco/interação
     recente" — o flag lan4IscaFormEngajado reseta sozinho após
     LAN4_ISCA_INATIVIDADE_MS (25s) parado, e minimizar o app no mobile
     (voltar depois de alguns minutos) também zera o activeElement.
     Bug real (2026-08-24): usuário selecionava faturamento/cargo,
     minimizava o navegador, e ao voltar o popup abria mesmo com
     progresso real salvo nos campos — os dois sinais de "engajamento"
     (flag + foco) já tinham expirado, mas os VALORES continuavam lá. */
  function lan4IscaFormTemDadoPreenchido() {
    var lf = document.getElementById('lf');
    if (!lf) return false;
    return $$('input, select', lf).some(function (el) {
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
      return !!(el.value || '').trim();
    });
  }

  function lan4IscaFormPreenchendo() {
    if (lan4IscaFormEngajado) return true;
    if (lan4IscaFormTemDadoPreenchido()) return true;
    var ativo = document.activeElement;
    return !!(ativo && ativo.closest && ativo.closest('#lf'));
  }

  function lan4AbreModalIsca() {
    if (lan4IscaJaExibido()) return;
    if (lan4IscaFormPreenchendo()) return;
    lan4IscaMarcaExibido();

    var overlay = document.createElement('div');
    overlay.id = 'lan4-isca-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);'
      + 'display:flex;align-items:center;justify-content:center;z-index:10002;'
      + 'padding:16px;box-sizing:border-box;opacity:1;transition:opacity .2s ease;';

    var box = document.createElement('div');
    box.style.cssText = 'background:'
        + 'radial-gradient(circle at 100% 0%, rgba(255,217,0,.16), transparent 45%),'
        + 'radial-gradient(circle at 0% 100%, rgba(255,217,0,.08), transparent 40%),'
        + '#0A1428;'
      + 'color:#fff;border-radius:16px;padding:0;'
      + 'width:100%;max-width:min(420px,calc(100vw - 32px));font-family:inherit;'
      + 'border:1px solid rgba(255,217,0,.3);box-shadow:0 24px 70px rgba(0,0,0,.55);'
      + 'box-sizing:border-box;overflow:hidden;animation:lan4IscaIn .25s ease;';

    box.innerHTML =
      '<button type="button" id="lan4-isca-x" aria-label="Fechar" style="position:absolute;top:14px;right:16px;background:none;border:none;color:rgba(255,255,255,.55);font-size:22px;line-height:1;cursor:pointer;padding:4px;">&times;</button>'
      + '<div id="lan4-isca-intro" style="padding:26px 24px 8px;">'
      + '  <span style="display:inline-block;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#0A1428;background:#FFD900;border-radius:999px;padding:4px 10px;margin-bottom:14px;">Material gratuito</span>'
      + '  <h3 style="margin:0 0 8px;font-size:20px;line-height:1.25;color:#fff;">Tenha acesso ao nosso guia<br><span style="color:#FFD900;white-space:nowrap;">"A&nbsp;Engrenagem"</span></h3>'
      + '  <p style="margin:0 0 18px;font-size:13.5px;line-height:1.5;color:rgba(255,255,255,.7);">O mapa das 7 peças que decidem se marketing e vendas geram receita — com autodiagnóstico e por onde começar em cada uma. Deixe seu e-mail profissional e WhatsApp: você receberá o material em até 5 minutos.</p>'
      + '</div>'
      + '<div id="lan4-isca-form" novalidate style="padding:0 24px 24px;">'
      + '  <input name="nome" autocomplete="name" placeholder="Nome" required style="width:100%;box-sizing:border-box;padding:12px 13px;margin-bottom:10px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background:rgba(255,255,255,.06);color:#fff;">'
      + '  <input name="email" type="email" autocomplete="email" placeholder="Seu melhor e-mail" required style="width:100%;box-sizing:border-box;padding:12px 13px;margin-bottom:10px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background:rgba(255,255,255,.06);color:#fff;">'
      + '  <input name="telefone" type="tel" autocomplete="tel-national" placeholder="WhatsApp com DDD (ex.: 11998765432)" required style="width:100%;box-sizing:border-box;padding:12px 13px;margin-bottom:10px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background:rgba(255,255,255,.06);color:#fff;">'
      + '  <input name="site" type="text" autocomplete="url" placeholder="Site da empresa" required style="width:100%;box-sizing:border-box;padding:12px 13px;margin-bottom:10px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background:rgba(255,255,255,.06);color:#fff;">'
      + '  <select name="servico_interesse" required class="lan4-servico-select" style="width:100%;box-sizing:border-box;padding:12px 13px;margin-bottom:6px;border:1.5px solid rgba(255,255,255,.15);border-radius:8px;font-size:14px;background-color:rgba(255,255,255,.06);color:#fff;">'
      + '    <option value="" disabled selected style="color:#fff;background:#0d2149;">Qual serviço te interessa?</option>'
      + '    ' + LAN4_SERVICO_OPTIONS_HTML
      + '  </select>'
      + '  <div id="lan4-isca-erro" style="color:#ff8a8a;font-size:12px;min-height:16px;margin-bottom:8px;"></div>'
      + '  <button type="button" id="lan4-isca-enviar" style="width:100%;padding:14px;background:#FFD900;color:#0A1428;border:none;border-radius:999px;font-size:15px;font-weight:800;cursor:pointer;">Quero receber o material</button>'
      + '  <button type="button" id="lan4-isca-cancelar" style="width:100%;padding:9px;background:transparent;color:rgba(255,255,255,.5);border:none;font-size:12.5px;cursor:pointer;margin-top:4px;">Não, obrigado</button>'
      + '</div>';

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    var form = box.querySelector('#lan4-isca-form');
    var erroEl = box.querySelector('#lan4-isca-erro');

    function fecha() { lan4FechaModalIsca(overlay); }
    box.querySelector('#lan4-isca-x').addEventListener('click', fecha);
    box.querySelector('#lan4-isca-cancelar').addEventListener('click', fecha);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) fecha(); });
    document.addEventListener('keydown', function escFechaIsca(e) {
      if (e.key === 'Escape') { fecha(); document.removeEventListener('keydown', escFechaIsca); }
    });

    box.querySelector('#lan4-isca-enviar').addEventListener('click', function (e) {
      e.preventDefault();
      var nome = lan4CampoValor(form, 'nome');
      var email = lan4CampoValor(form, 'email');
      var telefone = lan4CampoValor(form, 'telefone');
      var site = lan4CampoValor(form, 'site');
      var servico = lan4CampoValor(form, 'servico_interesse');

      if (!nome) { erroEl.textContent = 'Preencha seu nome.'; return; }
      if (!email || email.indexOf('@') === -1) { erroEl.textContent = 'Preencha um e-mail válido.'; return; }
      var erroTel = lan4ValidaTelefone(telefone);
      if (erroTel) { erroEl.textContent = erroTel; return; }
      if (!site) { erroEl.textContent = 'Preencha o site da empresa.'; return; }
      if (!servico) { erroEl.textContent = 'Selecione um serviço de interesse.'; return; }

      var btn = box.querySelector('#lan4-isca-enviar');
      btn.disabled = true;
      btn.textContent = 'Enviando…';

      var lead = { nome: nome, email: email, telefone: telefone, site: site, servico: servico };

      var eventId = lan4EventId();
      var extrasPayload = Object.assign({ cf_servico_de_interesse: lead.servico, site: lead.site }, lan4RdUtmPayload(),
        { cf_event_id: eventId });

      lan4EnviaRd(Object.assign({
        token_rdstation: 'proxied',
        identificador: LAN4_ISCA_IDENTIFICADOR,
        email: lead.email,
        nome: lead.nome,
        mobile_phone: lan4NormalizePhoneMeta(lead.telefone)
      }, extrasPayload))
      .then(function (r) {
        /* NOVO 2026-10: só confirma e empurra no 2xx (antes confirmava até em erro) */
        if (!r.ok) throw new Error('status ' + r.status);
        if (!r.lan4Blocked) lan4IscaPushLead(lead, eventId);
        lan4IscaMostraConfirmacao(box, overlay, nome.split(' ')[0]);
      })
      .catch(function () {
        erroEl.textContent = 'Ocorreu um erro. Tente novamente.';
        btn.disabled = false;
        btn.textContent = 'Quero receber o material';
      });
    });

    form.querySelector('[name="nome"]').focus();
  }

  /* ─── Gatilhos ────────────────────────────────────────────────────── */
  var LAN4_ISCA_MOBILE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var LAN4_ISCA_SESSION_START = Date.now();

  /* Engajamento com o formulário principal do site (#lf): enquanto o
     usuário estiver digitando ou tiver acabado de sair de um campo há pouco
     tempo, o pop-up de isca fica travado — em QUALQUER gatilho, inclusive
     o timer fixo do mobile, que antes abria por cima do form sem checar
     nada (bug relatado 29/07: pop-up abrindo durante preenchimento da
     etapa 3). Reativa sozinho após LAN4_ISCA_INATIVIDADE_MS sem interação
     (digitação parada ou blur sem voltar a interagir). */
  var LAN4_ISCA_INATIVIDADE_MS = 25000; // 25s parado no form principal reativa o gatilho
  var lan4IscaFormEngajado = false;
  var lan4IscaInatividadeTimer = null;

  function lan4IscaAgendaReativacao() {
    if (lan4IscaInatividadeTimer) clearTimeout(lan4IscaInatividadeTimer);
    lan4IscaInatividadeTimer = setTimeout(function () {
      lan4IscaInatividadeTimer = null;
      lan4IscaFormEngajado = false;
    }, LAN4_ISCA_INATIVIDADE_MS);
  }

  document.addEventListener('focusin', function (e) {
    if (!e.target.closest('#lf')) return;
    lan4IscaFormEngajado = true;
    if (!LAN4_ISCA_MOBILE) lan4IscaCancelaAgendamento();
    lan4IscaAgendaReativacao();
  });

  document.addEventListener('input', function (e) {
    if (!e.target.closest('#lf')) return;
    lan4IscaFormEngajado = true;
    if (!LAN4_ISCA_MOBILE) lan4IscaCancelaAgendamento();
    lan4IscaAgendaReativacao();
  });

  document.addEventListener('focusout', function (e) {
    if (!e.target.closest('#lf')) return;
    lan4IscaAgendaReativacao();
  });

  if (!LAN4_ISCA_MOBILE) {
    /* Desktop: só sinais de intenção real de saída (mouse), sem gatilhos
       baseados em tempo/inatividade (blur de janela e idle foram removidos
       a pedido do cliente — competiam com o formulário principal do site
       e o material é gratuito/baixa fricção, não precisa de rede de
       segurança agressiva). Calibrado com base em prática de mercado
       (OptinMonster, Unbounce, Omnisend, Popupsmart, HelloBar):
       - piso mínimo de permanência na sessão (8s) antes de QUALQUER
         exit-intent poder disparar — evita abrir na cara do usuário
         mal a página carrega;
       - scroll mínimo de 30% da página — só considera intenção de saída
         de quem já demonstrou algum engajamento com o conteúdo;
       - debounce de 600ms na "zona de saída" antes de confirmar o
         disparo, cancelável se o mouse voltar pra dentro da página —
         é o que resolve o bug relatado de abertura "rápida demais":
         antes, um único evento de mouseout/velocidade já disparava na
         hora, incluindo toques acidentais na borda superior (ampliado
         de 350ms a pedido do cliente pra dar mais folga a movimento
         lento/deliberado, como quem rola devagar lendo o conteúdo).
       Os listeners ficam no CAPTURE phase (3º argumento `true`) pra
       rodar antes de qualquer stopPropagation() de outro componente da
       página (ex.: o drag do carrossel de serviços) e nunca serem
       engolidos por ele.
       (1) mouseout/pointerout com clientY pequeno (raio 60px — 40px
           ainda pegava cursor subindo devagar pra ler perto do topo;
           8px era estreito demais: no instante em que o SO/navegador
           reduz a resolução de eventos perto da borda, o cursor às
           vezes "pula" de y=30 direto pra fora sem gerar evento com
           y≤8);
       (2) mouseleave/pointerleave no <html>, rede de segurança pro caso
           (1) falhar — cobre navegadores que só disparam leave e nunca
           out com clientY correto;
       (3) velocidade + direção do movimento, com throttle via rAF (em
           vez de a cada pixel) — conta se o mouse está subindo rápido
           DENTRO de uma zona mais estreita (80px do topo, era 120 —
           restrita a quem já está bem perto da borda, não a quem só
           passeia o cursor pela metade superior da tela).
       Fontes consultadas 2026-07-31 (Popup Maker docs, CrazyEgg,
       OptinMonster): pixel-radius do topo (EXIT_THRESHOLD) deve ficar
       BAIXO (5–10px é o "high sensitivity" recomendado por padrão;
       25–30px só em caso de fire rate baixo) — um raio maior na
       verdade AUMENTA falso positivo, não reduz, porque pega qualquer
       cursor passando perto do topo sem intenção real de sair. Por
       isso o raio ficou em 25px (não nos 60px cogitados inicialmente).
       Quem resolve leitura lenta/scroll é o debounce (delay) maior e a
       janela de graça pós-scroll, que É a alavanca certa segundo essas
       fontes (default de mercado: 350ms, "raise to 500–750ms" quando
       há reclamação de falso positivo — por isso os 600ms abaixo). */
    var LAN4_ISCA_EXIT_THRESHOLD = 25;  // px de folga a partir do topo (era 40; mercado recomenda raio BAIXO — não alto — pra reduzir falso positivo, ver nota acima)
    var LAN4_ISCA_VELOCITY_ZONE = 80;   // px do topo onde velocidade já conta (era 120 — zona mais estreita: só dispara perto o suficiente do topo pra ser saída real, não leitura)
    var LAN4_ISCA_VELOCITY_MIN = 25;    // px/frame subindo pra considerar "indo embora" (mantido — a ~1.500px/s já é bem acima do benchmark de mercado de ~200px/s citado por CrazyEgg/Wisepops; não era a causa do falso positivo)

    function lan4IscaScrollSuficiente() {
      var doc = document.documentElement;
      var alturaTotal = doc.scrollHeight - doc.clientHeight;
      if (alturaTotal <= 0) return true; // página sem scroll possível — não bloqueia
      return (window.scrollY / alturaTotal) >= LAN4_ISCA_MIN_SCROLL_PCT;
    }

    function lan4IscaCondicoesMinimas() {
      if (lan4IscaJaExibido()) return false;
      if (lan4IscaFormEngajado) return false;
      if ((Date.now() - LAN4_ISCA_SESSION_START) < LAN4_ISCA_MIN_SESSION_MS) return false;
      return lan4IscaScrollSuficiente();
    }

    /* Debounce: um sinal de saída agenda a abertura depois de
       LAN4_ISCA_DEBOUNCE_MS; se o mouse voltar pra dentro da página
       (mousemove com clientY fora da zona de saída) antes disso, o
       disparo é cancelado — era um movimento brusco, não saída real. */
    var lan4IscaDebounceTimer = null;

    /* Scroll recente (ex.: scrollIntoView do CTA "Continuar"/clique no
       menu, que rola a página até o formulário) reposiciona o conteúdo
       sob o cursor parado e pode gerar mouseout/pointerout/mouseleave
       sintéticos com clientY perto do topo — o mesmo bug de 25/07 já
       documentado para o gatilho de velocidade (mousemove), mas que só
       tinha proteção ali. Aqui cobre os 4 gatilhos de saída que não
       dependem de movimento real do mouse. */
    var LAN4_ISCA_SCROLL_GRACE_MS = 400;
    var lan4IscaUltimoScrollTs = 0;
    window.addEventListener('scroll', function () {
      lan4IscaUltimoScrollTs = Date.now();
    }, { passive: true });

    function lan4IscaAgendaAbertura() {
      if ((Date.now() - lan4IscaUltimoScrollTs) < LAN4_ISCA_SCROLL_GRACE_MS) return;
      if (!lan4IscaCondicoesMinimas()) return;
      if (lan4IscaDebounceTimer) return;
      lan4IscaDebounceTimer = setTimeout(function () {
        lan4IscaDebounceTimer = null;
        if (lan4IscaCondicoesMinimas()) lan4AbreModalIsca();
      }, LAN4_ISCA_DEBOUNCE_MS);
    }

    function lan4IscaCancelaAgendamento() {
      if (lan4IscaDebounceTimer) { clearTimeout(lan4IscaDebounceTimer); lan4IscaDebounceTimer = null; }
    }

    document.addEventListener('mouseout', function (e) {
      if (e.clientY <= LAN4_ISCA_EXIT_THRESHOLD && (!e.relatedTarget || e.relatedTarget.nodeName === 'HTML')) {
        lan4IscaAgendaAbertura();
      }
    }, true);

    document.addEventListener('pointerout', function (e) {
      if (e.clientY <= LAN4_ISCA_EXIT_THRESHOLD) lan4IscaAgendaAbertura();
    }, true);

    document.documentElement.addEventListener('mouseleave', lan4IscaAgendaAbertura);
    document.documentElement.addEventListener('pointerleave', lan4IscaAgendaAbertura);

    /* Velocidade: throttle por rAF em vez de processar todo mousemove —
       reduz custo por frame e evita competir com outros listeners de
       mousemove/pointermove da página (ex.: drag do carrossel), o que
       também ajuda o navegador a não atrasar a entrega desses eventos.
       BUG encontrado 25/07 (relato de usuário: popup abrindo ao rolar a
       página com o mouse parado perto do topo, sem exit-intent real):
       rolar com a roda do mouse reposiciona o conteúdo sob o cursor
       parado, e isso pode dar origem a um `mousemove`/`clientY` sintético
       do navegador com valor diferente do último lido — a checagem de
       velocidade não sabia distinguir isso de um movimento real do mouse.
       Correção: ignorar a leitura corrente se um scroll aconteceu no
       mesmo frame (ou no frame imediatamente anterior) — se o usuário só
       rolou a página, não houve intenção de sair. Este mousemove também
       cancela um disparo pendente do debounce quando o cursor volta pra
       uma posição segura, longe da zona de saída. */
    var lan4IscaUltimoY = null;
    var lan4IscaFramePendente = false;
    var lan4IscaYAtual = null;
    var lan4IscaUltimoScrollY = window.scrollY;
    var lan4IscaScrollouNesteFrame = false;

    window.addEventListener('scroll', function () {
      lan4IscaScrollouNesteFrame = true;
    }, { passive: true });

    function lan4IscaChecaVelocidade() {
      lan4IscaFramePendente = false;
      var scrollMudou = lan4IscaScrollouNesteFrame || window.scrollY !== lan4IscaUltimoScrollY;
      lan4IscaUltimoScrollY = window.scrollY;
      lan4IscaScrollouNesteFrame = false;
      if (lan4IscaJaExibido() || lan4IscaYAtual === null) return;
      if (lan4IscaYAtual > LAN4_ISCA_VELOCITY_ZONE) lan4IscaCancelaAgendamento();
      if (lan4IscaUltimoY !== null && !scrollMudou) {
        var subindoRapido = (lan4IscaUltimoY - lan4IscaYAtual) >= LAN4_ISCA_VELOCITY_MIN;
        if (subindoRapido && lan4IscaYAtual <= LAN4_ISCA_VELOCITY_ZONE) {
          lan4IscaAgendaAbertura();
        }
      }
      lan4IscaUltimoY = lan4IscaYAtual;
    }

    document.addEventListener('mousemove', function (e) {
      if (lan4IscaJaExibido()) return;
      lan4IscaYAtual = e.clientY;
      if (!lan4IscaFramePendente) {
        lan4IscaFramePendente = true;
        requestAnimationFrame(lan4IscaChecaVelocidade);
      }
    }, { passive: true, capture: true });
  } else {
    /* Mobile: sem exit-intent confiável (visibilitychange/pagehide só
       disparam depois que a pessoa já saiu — tarde demais pra mostrar UI).
       Dispara em tempo fixo, sem exigir scroll (exigir scroll faria o
       pop-up nunca aparecer pra quem sai cedo, que é justamente quem mais
       precisa ver o material antes de ir embora). 25s pra não competir
       com o formulário principal do site — tempo suficiente pra pessoa
       já ter decidido se vai preencher o form ou não antes do pop-up
       aparecer como alternativa. */
    setTimeout(function () {
      lan4AbreModalIsca();
    }, LAN4_ISCA_MOBILE_DELAY_MS);
  }
})();
