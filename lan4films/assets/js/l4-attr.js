/* ─────────────────────────────────────────────────────────────────────
   Lan4 Films — l4-attr.js (14/10/2026). Cópia LITERAL do bloco LAN4-ATTR de
   lan4.com.br (tracking-core.js/main.js): cookies de origem 1º/último toque
   (90 d) + click ids + os 2 campos do RD (cf_rastreamento_ids/_origem).
   Não carrega o loader do RD nem eventos de clique da LAN4. Ao mudar o bloco
   na LAN4, copiar de novo para cá.
   ───────────────────────────────────────────────────────────────────── */
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
