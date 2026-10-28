/*
 * Engine — Calculadora pública de ROI (prévia)
 * Extraído da calculadora interna original (index-calculadora.txt), sem alterar
 * nenhum valor numérico. Fonte de verdade: nichos-source.js (Task 8, retomada).
 *
 * PENDÊNCIA: ENGINE_BASE_POR_PORTE e CLT_EQUIVALENTE_POR_PORTE abaixo são
 * estimativas de referência do plano, NÃO confirmadas pelo usuário.
 * Ver relatório da Task 8 antes de qualquer deploy real.
 */

const NICHOS = {
  adv:{cplM:100,cplP:35,convM:.12,convP:.08,fech:.22,cont:300},
  saas:{cplM:90,cplP:25,convM:.18,convP:.12,fech:.17,cont:350},
  cli:{cplM:30,cplP:40,convM:.25,convP:.10,fech:.32,cont:280},
  odont:{cplM:25,cplP:35,convM:.28,convP:.12,fech:.38,cont:320},
  psico:{cplM:20,cplP:30,convM:.25,convP:.10,fech:.35,cont:280},
  fisio:{cplM:22,cplP:32,convM:.27,convP:.11,fech:.36,cont:290},
  ciru:{cplM:180,cplP:80,convM:.12,convP:.07,fech:.18,cont:250},
  nutri:{cplM:18,cplP:28,convM:.25,convP:.10,fech:.33,cont:300},
  lab:{cplM:35,cplP:45,convM:.20,convP:.09,fech:.30,cont:270},
  medtrab:{cplM:55,cplP:30,convM:.18,convP:.09,fech:.25,cont:280},
  trei:{cplM:20,cplP:30,convM:.18,convP:.10,fech:.22,cont:300},
  idiom:{cplM:15,cplP:25,convM:.22,convP:.10,fech:.28,cont:320},
  esc:{cplM:18,cplP:28,convM:.20,convP:.10,fech:.25,cont:310},
  coach:{cplM:50,cplP:30,convM:.18,convP:.12,fech:.25,cont:300},
  const:{cplM:120,cplP:60,convM:.10,convP:.06,fech:.28,cont:250},
  imob:{cplM:90,cplP:60,convM:.12,convP:.07,fech:.18,cont:270},
  arq:{cplM:70,cplP:45,convM:.15,convP:.08,fech:.25,cont:260},
  deco:{cplM:35,cplP:40,convM:.18,convP:.08,fech:.25,cont:280},
  tecb2b:{cplM:90,cplP:30,convM:.18,convP:.10,fech:.20,cont:320},
  ti:{cplM:60,cplP:30,convM:.18,convP:.10,fech:.22,cont:310},
  start:{cplM:70,cplP:30,convM:.20,convP:.12,fech:.18,cont:330},
  conta:{cplM:60,cplP:30,convM:.18,convP:.10,fech:.22,cont:300},
  rh:{cplM:55,cplP:30,convM:.20,convP:.12,fech:.22,cont:300},
  seg:{cplM:45,cplP:25,convM:.18,convP:.10,fech:.22,cont:300},
  inv:{cplM:80,cplP:35,convM:.15,convP:.09,fech:.20,cont:290},
  cred:{cplM:45,cplP:25,convM:.18,convP:.10,fech:.22,cont:310},
  fran:{cplM:120,cplP:60,convM:.12,convP:.07,fech:.18,cont:270},
  log:{cplM:70,cplP:35,convM:.15,convP:.08,fech:.22,cont:280},
  ind:{cplM:90,cplP:45,convM:.12,convP:.07,fech:.25,cont:250},
  agro:{cplM:100,cplP:55,convM:.12,convP:.07,fech:.28,cont:240},
  solar:{cplM:40,cplP:35,convM:.20,convP:.10,fech:.30,cont:300},
  secu:{cplM:60,cplP:35,convM:.15,convP:.08,fech:.25,cont:270},
  cond:{cplM:45,cplP:35,convM:.18,convP:.09,fech:.25,cont:280},
  prop:{cplM:65,cplP:40,convM:.17,convP:.09,fech:.22,cont:280},
  est:{cplM:20,cplP:30,convM:.30,convP:.12,fech:.37,cont:350},
  fit:{cplM:25,cplP:35,convM:.25,convP:.10,fech:.31,cont:320},
  pet:{cplM:18,cplP:30,convM:.28,convP:.10,fech:.35,cont:320},
  alim:{cplM:15,cplP:25,convM:.28,convP:.08,fech:.40,cont:300},
  var:{cplM:20,cplP:30,convM:.22,convP:.09,fech:.27,cont:280},
  ecom:{cplM:15,cplP:20,convM:.15,convP:.07,fech:.20,cont:350},
  auto:{cplM:30,cplP:35,convM:.20,convP:.09,fech:.28,cont:290},
  hot:{cplM:35,cplP:40,convM:.18,convP:.08,fech:.27,cont:270},
  autoesc:{cplM:12,cplP:20,convM:.25,convP:.10,fech:.35,cont:330},
  serdom:{cplM:15,cplP:25,convM:.22,convP:.08,fech:.30,cont:310},
};

// Labels em português (mesma ordem/valor usado no <select> original da calculadora interna)
const NICHO_LABELS = {
  adv:'Advocacia', saas:'SaaS', cli:'Clínicas médicas', odont:'Odontologia',
  psico:'Psicologia e Saúde Mental', fisio:'Fisioterapia e Reabilitação',
  ciru:'Cirurgia Plástica', nutri:'Nutrição e Bem-estar', lab:'Laboratórios',
  medtrab:'Medicina do Trabalho', trei:'Treinamento e Educação', idiom:'Escola de Idiomas',
  esc:'Escola Técnica e Cursos', coach:'Coaching e Mentoria', const:'Construção e Incorporação',
  imob:'Imobiliário', arq:'Arquitetura e Engenharia', deco:'Decoração e Casa',
  tecb2b:'Tecnologia B2B', ti:'TI e Suporte Técnico', start:'Startups',
  conta:'Contabilidade e Auditoria', rh:'RH e Consultoria', seg:'Seguros',
  inv:'Investimentos e Finanças', cred:'Crédito e Fintechs', fran:'Franquias',
  log:'Logística e Transporte', ind:'Indústria e Manufatura', agro:'Agronegócio',
  solar:'Energia Solar', secu:'Segurança e Vigilância', cond:'Condomínios e Administradoras',
  prop:'Proptech', est:'Estética e Beleza', fit:'Fitness e Academias',
  pet:'Pet (Veterinária e Pet Shop)', alim:'Alimentação e Gastronomia', var:'Varejo',
  ecom:'E-commerce e Moda', auto:'Automotivo', hot:'Hotelaria e Turismo',
  autoesc:'Auto-escola', serdom:'Serviços Domésticos'
};

// Valores derivados da calculadora interna real do Guilherme (index-calculadora.txt,
// 2026-08-04): ENGINE_VALUE é o mesmo BASE_ENG=15000 fixo da calculadora interna
// (o preço do ENGINE não escala por porte — só a composição CLT/fragmentado escala).
// CLT_EQUIVALENTE_POR_PORTE é a soma do bundle padrão (2 vendedores dedicados + verba
// de mídia + todo o time compartilhado + todas as ferramentas) nos valores clt[porte]
// da calculadora interna — não expor essa composição nesta página pública, só o total.
const ENGINE_VALUE = 15000;
const CLT_EQUIVALENTE_POR_PORTE = { p: 60664, m: 82515, g: 132289 };

// Anima a troca de um valor em R$ contando gradativamente do valor atual até o novo,
// em vez de simplesmente trocar o texto (efeito pedido pelo usuário para "Economia anual").
function animateCurrency(el, toValue) {
  const fromValue = parseFloat(el.dataset.rawValue || '0') || 0;
  if (fromValue === toValue) {
    el.textContent = 'R$ ' + Math.round(toValue).toLocaleString('pt-BR');
    el.dataset.rawValue = String(toValue);
    return;
  }
  el.dataset.rawValue = String(toValue);
  const duration = 500;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = fromValue + (toValue - fromValue) * eased;
    el.textContent = 'R$ ' + Math.round(current).toLocaleString('pt-BR');
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function calcPublicROI() {
  const porteEl = document.getElementById('calc-porte');
  const nichoEl = document.getElementById('calc-nicho');
  const ticketEl = document.getElementById('calc-ticket');
  const verbaEl = document.getElementById('calc-verba');
  const paybackEl = document.getElementById('calc-payback');
  const economiaEl = document.getElementById('calc-economia');

  if (!porteEl || !nichoEl || !ticketEl || !verbaEl || !paybackEl || !economiaEl) return;

  const porte = porteEl.value;
  const nichoKey = nichoEl.value;
  const nicho = NICHOS[nichoKey];
  if (!nicho) return;

  const ticket = parseFloat(ticketEl.value) || 0;
  const verba = parseFloat(verbaEl.value) || 0;

  const leadsM = nicho.cplM > 0 ? Math.round(verba / nicho.cplM) : 0;
  const reuM = Math.round(leadsM * nicho.convM);
  const vendasM = Math.max(1, Math.round(reuM * nicho.fech));
  const receitaMensal = vendasM * ticket;

  const paybackMeses = receitaMensal > 0 ? Math.ceil(ENGINE_VALUE / receitaMensal) : null;

  const economiaAnual = (CLT_EQUIVALENTE_POR_PORTE[porte] - ENGINE_VALUE) * 12;

  paybackEl.textContent = paybackMeses
    ? (paybackMeses === 1 ? '1º mês após início' : paybackMeses + 'º mês após início')
    : '—';
  animateCurrency(economiaEl, Math.round(economiaAnual));
}

function populateNichoSelect() {
  const select = document.getElementById('calc-nicho');
  if (!select) return;
  Object.entries(NICHO_LABELS).forEach(([key, label]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = label;
    select.appendChild(opt);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  populateNichoSelect();
  ['calc-porte', 'calc-nicho', 'calc-ticket', 'calc-verba'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calcPublicROI);
  });
  calcPublicROI();
});
