/* Nosso Bolso — controle de gastos do casal
 * App 100% no navegador: os dados ficam no localStorage.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'nosso-bolso:v1';

  // ---------------------------------------------------------------- Defaults
  const DEFAULT_CATEGORIES = [
    // Custos fixos
    ['moradia', '🏠', 'Moradia (aluguel/financiamento)', 'fixo', '#4f46e5'],
    ['contas', '💡', 'Contas da casa (luz, água, gás)', 'fixo', '#0891b2'],
    ['internet', '📶', 'Internet e celular', 'fixo', '#0284c7'],
    ['saude', '🏥', 'Plano de saúde', 'fixo', '#059669'],
    ['educacao', '🎓', 'Educação', 'fixo', '#7c3aed'],
    ['assinaturas', '📺', 'Assinaturas e streaming', 'fixo', '#9333ea'],
    ['seguros', '🛡️', 'Seguros', 'fixo', '#475569'],
    // Gastos variáveis
    ['mercado', '🛒', 'Mercado', 'variavel', '#16a34a'],
    ['restaurantes', '🍽️', 'Restaurantes e delivery', 'variavel', '#ea580c'],
    ['transporte', '⛽', 'Transporte e combustível', 'variavel', '#ca8a04'],
    ['lazer', '🎉', 'Lazer', 'variavel', '#db2777'],
    ['vestuario', '👕', 'Vestuário', 'variavel', '#c026d3'],
    ['farmacia', '💊', 'Farmácia', 'variavel', '#dc2626'],
    ['pets', '🐾', 'Pets', 'variavel', '#a16207'],
    ['viagens', '✈️', 'Viagens', 'variavel', '#0d9488'],
    ['presentes', '🎁', 'Presentes', 'variavel', '#e11d48'],
    ['outros', '📦', 'Outros', 'variavel', '#64748b'],
    // Receitas
    ['salario', '💼', 'Salário', 'receita', '#15803d'],
    ['extra', '💻', 'Renda extra', 'receita', '#65a30d'],
    ['outras-receitas', '💰', 'Outras receitas', 'receita', '#0f766e'],
  ].map(([id, icon, name, nature, color]) => ({ id, icon, name, nature, color, budget: 0 }));

  const defaultState = () => ({
    version: 1,
    settings: { p1: 'Pessoa 1', p2: 'Pessoa 2', splitMode: 'igual', inc1: 0, inc2: 0, pct1: 50 },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    transactions: [],
  });

  // ---------------------------------------------------------------- State
  let state = load();
  const today = new Date();
  let cursor = { y: today.getFullYear(), m: today.getMonth() }; // m: 0-11
  let editingTxId = null;
  let editingCatId = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* armazenamento indisponível ou corrompido */ }
    return defaultState();
  }

  function normalize(data) {
    const base = defaultState();
    if (!data || typeof data !== 'object') return base;
    return {
      version: 1,
      settings: { ...base.settings, ...(data.settings || {}) },
      categories: Array.isArray(data.categories) && data.categories.length ? data.categories : base.categories,
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
    };
  }

  function saveLocal() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('Não foi possível salvar neste navegador.'); }
  }

  // ---------------------------------------------------------------- Nuvem (opcional)
  let cloud = null;      // cliente da nuvem (null = modo local)
  let hid = null;        // id do espaço do casal
  let account = null;    // { userId, email, inviteCode, members }
  let pendingWrites = 0;
  let recovering = false; // usuário abriu o link de "esqueci minha senha"

  /** Salva uma alteração: no aparelho (modo local) ou na nuvem (modo casal). */
  function persist(cloudOp) {
    if (!cloud) { saveLocal(); return; }
    if (!hid) return;
    const h = hid;
    pendingWrites++;
    setSync('saving');
    Promise.resolve()
      .then(() => cloudOp(cloud, h))
      .then(() => setSync(navigator.onLine === false ? 'offline' : 'ok'))
      .catch((err) => {
        setSync('error');
        toast('Não foi possível sincronizar: ' + err.message);
        scheduleReload(1500);
      })
      .finally(() => { pendingWrites--; });
  }

  // ---------------------------------------------------------------- Utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const money = (v) => brl.format(v || 0);
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const ymKey = (y, m) => `${y}-${pad(m + 1)}`;
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const monthName = (y, m, opts = { month: 'long', year: 'numeric' }) =>
    new Date(y, m, 1).toLocaleDateString('pt-BR', opts);
  const shiftMonth = ({ y, m }, delta) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; };
  const name = (p) => (p === 'p1' ? state.settings.p1 : state.settings.p2);
  const cat = (id) => state.categories.find((c) => c.id === id);
  const natureOf = (t) => (t.type === 'despesa' ? (cat(t.categoryId)?.nature || 'variavel') : t.type);

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /** Participação da pessoa 1 nas despesas compartilhadas (0–1). */
  function ratio1() {
    const s = state.settings;
    if (s.splitMode === 'proporcional') {
      const a = +s.inc1 || 0, b = +s.inc2 || 0;
      return a + b > 0 ? a / (a + b) : 0.5;
    }
    if (s.splitMode === 'personalizado') return Math.min(100, Math.max(0, +s.pct1 || 0)) / 100;
    return 0.5;
  }

  const txOfMonth = (y, m) => state.transactions.filter((t) => t.date.startsWith(ymKey(y, m)));

  function monthTotals(y, m) {
    const txs = txOfMonth(y, m);
    const sum = (f) => round2(txs.filter(f).reduce((a, t) => a + t.amount, 0));
    return {
      income: sum((t) => t.type === 'receita'),
      expense: sum((t) => t.type === 'despesa'),
      fixed: sum((t) => t.type === 'despesa' && natureOf(t) === 'fixo'),
      variable: sum((t) => t.type === 'despesa' && natureOf(t) === 'variavel'),
      txs,
    };
  }

  /** Quanto cada um pagou e quanto deveria ter pago, até o fim do mês informado. */
  function settlement(y, m) {
    const limit = ymKey(y, m) + '-31';
    const r1 = ratio1();
    const paid = { p1: 0, p2: 0 }, owed = { p1: 0, p2: 0 };
    for (const t of state.transactions) {
      if (t.date > limit) continue;
      if (t.type === 'despesa') {
        paid[t.paidBy] += t.amount;
        if (t.split === 'p1') owed.p1 += t.amount;
        else if (t.split === 'p2') owed.p2 += t.amount;
        else { owed.p1 += t.amount * r1; owed.p2 += t.amount * (1 - r1); }
      } else if (t.type === 'acerto') {
        paid[t.paidBy] += t.amount;
        owed[t.to] += t.amount;
      }
    }
    const net1 = round2(paid.p1 - owed.p1); // >0: p2 deve a p1
    return { net1 };
  }

  function monthContribution(y, m) {
    const r1 = ratio1();
    const res = { p1: { paid: 0, share: 0 }, p2: { paid: 0, share: 0 } };
    for (const t of txOfMonth(y, m)) {
      if (t.type !== 'despesa') continue;
      res[t.paidBy].paid += t.amount;
      if (t.split === 'p1') res.p1.share += t.amount;
      else if (t.split === 'p2') res.p2.share += t.amount;
      else { res.p1.share += t.amount * r1; res.p2.share += t.amount * (1 - r1); }
    }
    return res;
  }

  // ---------------------------------------------------------------- Render
  function render() {
    const s = state.settings;
    const ml = monthName(cursor.y, cursor.m);
    $('#month-label').textContent = ml.charAt(0).toUpperCase() + ml.slice(1);
    $('#couple-names').textContent = `${s.p1} & ${s.p2}`;
    renderDashboard();
    renderTransactions();
    renderBudget();
    renderSettings();
  }

  function renderDashboard() {
    const t = monthTotals(cursor.y, cursor.m);
    const bal = round2(t.income - t.expense);
    $('#stat-income').textContent = money(t.income);
    $('#stat-expense').textContent = money(t.expense);
    const balEl = $('#stat-balance');
    balEl.textContent = money(bal);
    balEl.className = bal >= 0 ? 'pos' : 'neg';

    // Orçamento
    const budgeted = state.categories.filter((c) => c.nature !== 'receita' && c.budget > 0);
    const totalBudget = budgeted.reduce((a, c) => a + +c.budget, 0);
    const spentInBudgeted = t.txs.filter((x) => x.type === 'despesa' && budgeted.some((c) => c.id === x.categoryId))
      .reduce((a, x) => a + x.amount, 0);
    const pct = totalBudget ? (spentInBudgeted / totalBudget) * 100 : 0;
    $('#stat-budget').textContent = totalBudget ? `${pct.toFixed(0)}% de ${money(totalBudget)}` : 'Não definido';
    setBar($('#stat-budget-bar'), pct);

    // Fixos x variáveis
    const ns = $('#nature-split');
    if (!t.expense) {
      ns.innerHTML = '<p class="empty">Nenhuma despesa neste mês.</p>';
    } else {
      const fp = (t.fixed / t.expense) * 100, vp = 100 - fp;
      const incomeShare = (v) => (t.income ? ` · ${((v / t.income) * 100).toFixed(0)}% da renda` : '');
      ns.innerHTML = `
        <div class="bar"><span style="width:${fp}%;background:var(--fixed)"></span><span style="width:${vp}%;background:var(--variable)"></span></div>
        <div class="nature-row"><span><i class="dot" style="background:var(--fixed)"></i>Custos fixos <span class="muted small">${fp.toFixed(0)}%${incomeShare(t.fixed)}</span></span><b>${money(t.fixed)}</b></div>
        <div class="nature-row"><span><i class="dot" style="background:var(--variable)"></i>Gastos variáveis <span class="muted small">${vp.toFixed(0)}%${incomeShare(t.variable)}</span></span><b>${money(t.variable)}</b></div>`;
    }

    renderSettlement();
    renderDonut(t.txs);
    renderBars();

    const recent = [...t.txs].sort(byDateDesc).slice(0, 6);
    $('#recent-list').innerHTML = recent.length ? recent.map(txItem).join('') : '<li class="empty">Nenhum lançamento neste mês. Toque em “Novo lançamento” para começar.</li>';
  }

  function renderSettlement() {
    const c = monthContribution(cursor.y, cursor.m);
    const { net1 } = settlement(cursor.y, cursor.m);
    const r1 = ratio1();
    const person = (p) => `
      <div class="person">
        <b>${esc(name(p))}</b>
        <small>Pagou no mês: <b>${money(c[p].paid)}</b></small>
        <small>Parte justa: ${money(c[p].share)}</small>
      </div>`;
    let box;
    if (Math.abs(net1) < 0.01) {
      box = '<span>✅ Tudo certo! Ninguém deve nada.</span>';
    } else {
      const debtor = net1 > 0 ? 'p2' : 'p1', creditor = net1 > 0 ? 'p1' : 'p2';
      box = `<span><b>${esc(name(debtor))}</b> deve <b>${money(Math.abs(net1))}</b> para <b>${esc(name(creditor))}</b></span>
        <button class="btn small primary" data-settle="${debtor}" data-amount="${Math.abs(net1)}">Registrar acerto</button>`;
    }
    $('#settlement').innerHTML = `
      <div class="people">${person('p1')}${person('p2')}</div>
      <div class="settle-box">${box}</div>
      <p class="muted small">Divisão das despesas compartilhadas: ${esc(state.settings.p1)} ${(r1 * 100).toFixed(0)}% · ${esc(state.settings.p2)} ${((1 - r1) * 100).toFixed(0)}%. Saldo acumulado até o fim do mês selecionado.</p>`;
  }

  function renderDonut(txs) {
    const byCat = new Map();
    txs.filter((t) => t.type === 'despesa').forEach((t) => byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + t.amount));
    const rows = [...byCat.entries()].map(([id, v]) => ({ c: cat(id) || { name: 'Sem categoria', icon: '❔', color: '#94a3b8' }, v }))
      .sort((a, b) => b.v - a.v);
    const total = rows.reduce((a, r) => a + r.v, 0);
    if (!total) {
      $('#donut').innerHTML = '';
      $('#donut-legend').innerHTML = '<li class="empty" style="border:0">Sem despesas para exibir.</li>';
      return;
    }
    const R = 70, C = 2 * Math.PI * R;
    let offset = 0;
    const arcs = rows.map((r) => {
      const len = (r.v / total) * C;
      const el = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${esc(r.c.color)}" stroke-width="28"
        stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 90 90)"><title>${esc(r.c.name)}: ${money(r.v)}</title></circle>`;
      offset += len;
      return el;
    }).join('');
    $('#donut').innerHTML = `<svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="Gráfico de despesas por categoria">${arcs}
      <text x="90" y="86" text-anchor="middle">Total</text>
      <text x="90" y="104" text-anchor="middle" style="fill:var(--text);font-weight:700;font-size:13px">${money(total)}</text></svg>`;
    $('#donut-legend').innerHTML = rows.slice(0, 8).map((r) => `
      <li><span><i class="dot" style="background:${esc(r.c.color)}"></i>${esc(r.c.icon)} ${esc(r.c.name)}</span>
      <span>${money(r.v)}<span class="pct">${((r.v / total) * 100).toFixed(0)}%</span></span></li>`).join('')
      + (rows.length > 8 ? `<li><span class="muted">+ ${rows.length - 8} outras</span><span>${money(rows.slice(8).reduce((a, r) => a + r.v, 0))}</span></li>` : '');
  }

  function renderBars() {
    const months = [];
    for (let i = 5; i >= 0; i--) months.push(shiftMonth(cursor, -i));
    const data = months.map(({ y, m }) => ({ y, m, ...monthTotals(y, m) }));
    const max = Math.max(1, ...data.map((d) => Math.max(d.income, d.expense)));
    const W = 480, H = 200, padB = 24, padT = 10, gw = W / data.length, bw = Math.min(26, gw / 3);
    const h = (v) => ((H - padB - padT) * v) / max;
    const bars = data.map((d, i) => {
      const x = i * gw + gw / 2;
      const isCur = d.y === cursor.y && d.m === cursor.m;
      return `
        <rect x="${x - bw - 2}" y="${H - padB - h(d.income)}" width="${bw}" height="${h(d.income)}" rx="4" fill="var(--income)" opacity="${isCur ? 1 : .6}"><title>Receitas: ${money(d.income)}</title></rect>
        <rect x="${x + 2}" y="${H - padB - h(d.expense)}" width="${bw}" height="${h(d.expense)}" rx="4" fill="var(--expense)" opacity="${isCur ? 1 : .6}"><title>Despesas: ${money(d.expense)}</title></rect>
        <text x="${x}" y="${H - 6}" text-anchor="middle" style="${isCur ? 'font-weight:700;fill:var(--text)' : ''}">${monthName(d.y, d.m, { month: 'short' }).replace('.', '')}</text>`;
    }).join('');
    $('#bars').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Receitas e despesas dos últimos 6 meses">
      <line x1="0" x2="${W}" y1="${H - padB}" y2="${H - padB}" stroke="var(--border)"/>${bars}</svg>
      <div class="muted small" style="display:flex;gap:16px;justify-content:center">
        <span><i class="dot" style="background:var(--income)"></i>Receitas</span>
        <span><i class="dot" style="background:var(--expense)"></i>Despesas</span></div>`;
  }

  const byDateDesc = (a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1);

  function txItem(t) {
    let icon, color, meta = [], sign, cls;
    if (t.type === 'acerto') {
      icon = '🤝'; color = '#0f766e'; sign = ''; cls = '';
      meta.push(`${esc(name(t.paidBy))} → ${esc(name(t.to))}`);
    } else {
      const c = cat(t.categoryId) || { icon: '❔', color: '#94a3b8', name: 'Sem categoria', nature: 'variavel' };
      icon = c.icon; color = c.color;
      meta.push(`<span>${esc(c.name)}</span>`);
      if (t.type === 'despesa') {
        meta.push(`<span class="tag ${c.nature}">${c.nature === 'fixo' ? 'Fixo' : 'Variável'}</span>`);
        meta.push(`<span>pago por ${esc(name(t.paidBy))}</span>`);
        meta.push(`<span class="tag">${t.split === 'shared' ? 'Compartilhado' : 'Só ' + esc(name(t.split))}</span>`);
        sign = '−'; cls = 'neg';
      } else {
        meta.push(`<span>${esc(name(t.paidBy))}</span>`);
        sign = '+'; cls = 'pos';
      }
    }
    const [y, mo, d] = t.date.split('-');
    return `<li class="tx" data-tx="${esc(t.id)}" tabindex="0">
      <span class="tx-icon" style="background:${esc(color)}22">${esc(icon)}</span>
      <span class="tx-main"><div class="tx-desc">${esc(t.description)}</div>
        <div class="tx-meta"><span>${d}/${mo}</span>${meta.join('')}</div></span>
      <span class="tx-amount ${cls}">${sign} ${money(t.amount)}</span></li>`;
  }

  function renderTransactions() {
    const fType = $('#f-type').value, fNat = $('#f-nature').value, fCat = $('#f-category').value,
      fPer = $('#f-person').value, q = $('#f-search').value.trim().toLowerCase();

    // opções dos filtros
    fillSelect($('#f-category'), [['', 'Todas as categorias'], ...state.categories.map((c) => [c.id, `${c.icon} ${c.name}`])], fCat);
    fillSelect($('#f-person'), [['', 'Ambos'], ['p1', state.settings.p1], ['p2', state.settings.p2]], fPer);

    const list = txOfMonth(cursor.y, cursor.m).filter((t) =>
      (!fType || t.type === fType) &&
      (!fNat || (t.type === 'despesa' && natureOf(t) === fNat)) &&
      (!fCat || t.categoryId === fCat) &&
      (!fPer || t.paidBy === fPer || t.split === fPer || t.to === fPer) &&
      (!q || t.description.toLowerCase().includes(q) || (t.note || '').toLowerCase().includes(q))
    ).sort(byDateDesc);

    const total = list.reduce((a, t) => a + (t.type === 'receita' ? t.amount : t.type === 'despesa' ? -t.amount : 0), 0);
    $('#tx-count').textContent = `${list.length} lançamento${list.length === 1 ? '' : 's'} · ${money(total)}`;

    if (!list.length) {
      $('#tx-list').innerHTML = '<li class="empty">Nenhum lançamento encontrado.</li>';
      return;
    }
    let html = '', lastDate = '';
    for (const t of list) {
      if (t.date !== lastDate) {
        const [y, m, d] = t.date.split('-').map(Number);
        html += `<li class="day-header">${new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</li>`;
        lastDate = t.date;
      }
      html += txItem(t);
    }
    $('#tx-list').innerHTML = html;
  }

  function renderBudget() {
    const txs = txOfMonth(cursor.y, cursor.m).filter((t) => t.type === 'despesa');
    const spent = (id) => txs.filter((t) => t.categoryId === id).reduce((a, t) => a + t.amount, 0);
    const section = (nature, title) => {
      const cats = state.categories.filter((c) => c.nature === nature);
      if (!cats.length) return '';
      return `<li class="budget-section">${title}</li>` + cats.map((c) => {
        const s = spent(c.id), b = +c.budget || 0, pct = b ? (s / b) * 100 : 0;
        const info = b
          ? (s > b ? `<span class="neg">Ultrapassou ${money(s - b)}</span>` : `Restam ${money(b - s)}`) + ` · ${money(s)} de ${money(b)} (${pct.toFixed(0)}%)`
          : `${money(s)} gastos · sem limite definido`;
        return `<li class="budget-item">
          <span class="budget-name">${esc(c.icon)} ${esc(c.name)}</span>
          <div class="progress"><div style="width:${Math.min(100, pct)}%" class="${pct >= 100 ? 'over' : pct >= 80 ? 'warn' : ''}"></div></div>
          <span class="budget-info">${info}</span>
          <input type="number" min="0" step="10" placeholder="Limite R$" value="${b || ''}" data-budget="${esc(c.id)}" aria-label="Orçamento de ${esc(c.name)}">
        </li>`;
      }).join('');
    };
    $('#budget-list').innerHTML = section('fixo', 'Custos fixos') + section('variavel', 'Gastos variáveis');
    const totalB = state.categories.filter((c) => c.nature !== 'receita').reduce((a, c) => a + (+c.budget || 0), 0);
    $('#budget-total').textContent = totalB ? `Total planejado: ${money(totalB)}` : '';
  }

  function renderSettings() {
    const s = state.settings;
    const form = $('#couple-form');
    if (!form.contains(document.activeElement)) {
      $('#s-p1').value = s.p1; $('#s-p2').value = s.p2;
      $('#s-inc1').value = s.inc1 || ''; $('#s-inc2').value = s.inc2 || '';
      $('#s-pct1').value = s.pct1;
      $$('input[name="splitMode"]').forEach((r) => (r.checked = r.value === s.splitMode));
    }
    updateSplitUI();

    const group = (nature, label) => state.categories.filter((c) => c.nature === nature).map((c) => `
      <li class="cat-chip" data-cat="${esc(c.id)}" tabindex="0">
        <span class="tx-icon" style="background:${esc(c.color)}22">${esc(c.icon)}</span>
        <span><b>${esc(c.name)}</b><small>${label}${c.budget ? ' · limite ' + money(c.budget) : ''}</small></span>
      </li>`).join('');
    $('#category-list').innerHTML = group('fixo', 'Custo fixo') + group('variavel', 'Gasto variável') + group('receita', 'Receita');
    renderAccount();
  }

  function renderAccount() {
    const on = !!(cloud && account && hid);
    $('#account-local').classList.toggle('hidden', on);
    $('#account-cloud').classList.toggle('hidden', !on);
    $('#sync-status').classList.toggle('hidden', !on);
    $('#data-hint').textContent = on
      ? 'Os dados ficam na nuvem e sincronizam automaticamente entre vocês dois. Ainda assim, exporte um backup de vez em quando.'
      : 'Os dados ficam salvos apenas neste navegador. Faça backups periódicos e use a importação para levar os dados a outro aparelho.';
    if (!on) return;
    $('#acc-email').textContent = account.email || '';
    $('#acc-code').textContent = account.inviteCode || '';
    const others = account.members.filter((m) => !m.me);
    $('#acc-members').textContent = others.length
      ? `Vocês dois estão conectados (${others.map((m) => m.email).join(', ')}). Tudo o que um lança aparece para o outro.`
      : 'Aguardando seu par: peça para criar uma conta e entrar com o código acima.';
  }

  function updateSplitUI() {
    const mode = ($('input[name="splitMode"]:checked') || {}).value || 'igual';
    const n1 = $('#s-p1').value || 'Pessoa 1', n2 = $('#s-p2').value || 'Pessoa 2';
    $('#split-proportional').classList.toggle('show', mode === 'proporcional');
    $('#split-custom').classList.toggle('show', mode === 'personalizado');
    $('#lbl-inc1').textContent = `Renda mensal de ${n1}`;
    $('#lbl-inc2').textContent = `Renda mensal de ${n2}`;
    $('#lbl-pct1').textContent = `Percentual de ${n1}`;
    const p = +$('#s-pct1').value;
    $('#pct-out').textContent = `${n1}: ${p}% · ${n2}: ${100 - p}%`;
    let r = 0.5;
    if (mode === 'proporcional') {
      const a = +$('#s-inc1').value || 0, b = +$('#s-inc2').value || 0;
      r = a + b > 0 ? a / (a + b) : 0.5;
    } else if (mode === 'personalizado') r = p / 100;
    $('#split-preview').textContent = `Numa conta compartilhada de R$ 100,00: ${n1} paga ${money(100 * r)} e ${n2} paga ${money(100 * (1 - r))}.`;
  }

  function setBar(el, pct) {
    el.style.width = Math.min(100, pct) + '%';
    el.className = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
  }

  function fillSelect(sel, options, value) {
    sel.innerHTML = options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    if (value !== undefined && options.some(([v]) => v === value)) sel.value = value;
  }

  // ---------------------------------------------------------------- Transaction dialog
  const txDialog = $('#tx-dialog'), txForm = $('#tx-form');

  function openTx(tx, preset = {}) {
    editingTxId = tx ? tx.id : null;
    const data = tx || {
      type: 'despesa', description: '', amount: '', categoryId: '', paidBy: 'p1', split: 'shared', to: 'p2', note: '',
      date: defaultDate(), ...preset,
    };
    $('#tx-title').textContent = tx ? 'Editar lançamento' : 'Novo lançamento';
    $('#tx-delete').classList.toggle('hidden', !tx);
    txForm.type.value = data.type;
    txForm.description.value = data.description;
    txForm.amount.value = data.amount;
    txForm.date.value = data.date;
    txForm.note.value = data.note || '';
    const people = [['p1', state.settings.p1], ['p2', state.settings.p2]];
    fillSelect(txForm.paidBy, people, data.paidBy);
    fillSelect(txForm.to, people, data.to || (data.paidBy === 'p1' ? 'p2' : 'p1'));
    fillSelect(txForm.split, [['shared', 'Do casal (compartilhado)'], ['p1', `Só de ${state.settings.p1}`], ['p2', `Só de ${state.settings.p2}`]], data.split || 'shared');
    syncTxForm(data.categoryId);
    txDialog.showModal();
    if (!tx) setTimeout(() => (data.type === 'acerto' ? txForm.amount : txForm.description).focus(), 50);
  }

  function defaultDate() {
    const isCurrent = cursor.y === today.getFullYear() && cursor.m === today.getMonth();
    return isCurrent ? isoDate(today) : `${ymKey(cursor.y, cursor.m)}-01`;
  }

  function syncTxForm(keepCategory) {
    const type = txForm.type.value;
    const nature = type === 'receita' ? ['receita'] : ['fixo', 'variavel'];
    const current = keepCategory ?? txForm.categoryId.value;
    const opts = [];
    const groups = { fixo: 'Custos fixos', variavel: 'Gastos variáveis', receita: 'Receitas' };
    let html = '';
    nature.forEach((n) => {
      const cs = state.categories.filter((c) => c.nature === n);
      if (!cs.length) return;
      html += `<optgroup label="${groups[n]}">` + cs.map((c) => { opts.push(c.id); return `<option value="${esc(c.id)}">${esc(c.icon)} ${esc(c.name)}</option>`; }).join('') + '</optgroup>';
    });
    txForm.categoryId.innerHTML = html;
    if (opts.includes(current)) txForm.categoryId.value = current;
    else if (type === 'despesa' && opts.includes('mercado')) txForm.categoryId.value = 'mercado';

    $('.for-cat', txForm).classList.toggle('hidden', type === 'acerto');
    $('.for-split', txForm).classList.toggle('hidden', type !== 'despesa');
    $('.for-acerto-to', txForm).classList.toggle('hidden', type !== 'acerto');
    $('.lbl-paid', txForm).textContent = type === 'receita' ? 'Quem recebeu?' : 'Quem pagou?';
    txForm.categoryId.required = type !== 'acerto';
    if (type === 'acerto' && !txForm.description.value) txForm.description.value = 'Acerto de contas';
    updateTxHint();
  }

  function updateTxHint() {
    const type = txForm.type.value, amount = +txForm.amount.value || 0;
    let hint = '';
    if (type === 'despesa' && amount) {
      const split = txForm.split.value;
      if (split === 'shared') {
        const r = ratio1();
        hint = `Divisão: ${state.settings.p1} ${money(amount * r)} · ${state.settings.p2} ${money(amount * (1 - r))}`;
      } else if (split !== txForm.paidBy.value) {
        hint = `${name(split)} ficará devendo ${money(amount)} para ${name(txForm.paidBy.value)}.`;
      }
    } else if (type === 'acerto') {
      hint = 'Use para registrar quando um transfere dinheiro ao outro para zerar a diferença. Não conta como despesa.';
    }
    $('#tx-hint').textContent = hint;
  }

  txForm.addEventListener('change', (e) => {
    if (e.target.name === 'type') {
      if (e.target.value !== 'acerto' && txForm.description.value === 'Acerto de contas') txForm.description.value = '';
      syncTxForm();
    } else if (e.target.name === 'paidBy' && txForm.type.value === 'acerto' && txForm.to.value === txForm.paidBy.value) {
      txForm.to.value = txForm.paidBy.value === 'p1' ? 'p2' : 'p1';
    } else if (e.target.name === 'to' && txForm.paidBy.value === txForm.to.value) {
      txForm.paidBy.value = txForm.to.value === 'p1' ? 'p2' : 'p1';
    }
    updateTxHint();
  });
  txForm.addEventListener('input', updateTxHint);

  txForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const type = txForm.type.value;
    const amount = round2(parseFloat(txForm.amount.value));
    if (!(amount > 0)) { toast('Informe um valor maior que zero.'); return; }
    const tx = {
      id: editingTxId || uid(),
      type,
      description: txForm.description.value.trim(),
      amount,
      date: txForm.date.value,
      categoryId: type === 'acerto' ? null : txForm.categoryId.value,
      paidBy: txForm.paidBy.value,
      split: type === 'despesa' ? txForm.split.value : null,
      to: type === 'acerto' ? txForm.to.value : null,
      note: txForm.note.value.trim(),
    };
    if (type === 'acerto' && tx.to === tx.paidBy) { toast('Escolha pessoas diferentes para o acerto.'); return; }
    if (editingTxId) {
      const i = state.transactions.findIndex((t) => t.id === editingTxId);
      tx.createdAt = state.transactions[i]?.createdAt;
      state.transactions[i] = tx;
    } else {
      tx.createdAt = Date.now();
      state.transactions.push(tx);
    }
    const savedTx = tx;
    persist((c, h) => c.upsertTxs(h, [savedTx]));
    txDialog.close();
    // leva a visualização para o mês do lançamento
    const [y, m] = tx.date.split('-').map(Number);
    cursor = { y, m: m - 1 };
    render();
    toast(editingTxId ? 'Lançamento atualizado.' : 'Lançamento adicionado!');
  });

  $('#tx-delete').addEventListener('click', () => {
    if (!editingTxId || !confirm('Excluir este lançamento?')) return;
    const removedId = editingTxId;
    state.transactions = state.transactions.filter((t) => t.id !== removedId);
    persist((c, h) => c.deleteTx(h, removedId));
    txDialog.close(); render(); toast('Lançamento excluído.');
  });

  // ---------------------------------------------------------------- Category dialog
  const catDialog = $('#cat-dialog'), catForm = $('#cat-form');

  function openCat(c) {
    editingCatId = c ? c.id : null;
    $('#cat-title').textContent = c ? 'Editar categoria' : 'Nova categoria';
    $('#cat-delete').classList.toggle('hidden', !c);
    catForm.icon.value = c?.icon || '🏷️';
    catForm.name.value = c?.name || '';
    catForm.color.value = c?.color || '#0f766e';
    catForm.nature.value = c?.nature || 'variavel';
    catForm.budget.value = c?.budget || '';
    syncCatForm();
    catDialog.showModal();
  }
  const syncCatForm = () => $('.for-budget', catForm).classList.toggle('hidden', catForm.nature.value === 'receita');
  catForm.nature.addEventListener('change', syncCatForm);

  catForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      icon: catForm.icon.value.trim() || '🏷️',
      name: catForm.name.value.trim(),
      color: catForm.color.value,
      nature: catForm.nature.value,
      budget: catForm.nature.value === 'receita' ? 0 : round2(+catForm.budget.value || 0),
    };
    let saved;
    if (editingCatId) saved = Object.assign(cat(editingCatId), data);
    else state.categories.push((saved = { id: uid(), ...data }));
    persist((cl, h) => cl.upsertCats(h, [saved], state.categories));
    catDialog.close(); render(); toast('Categoria salva.');
  });

  $('#cat-delete').addEventListener('click', () => {
    const c = cat(editingCatId);
    if (!c) return;
    const used = state.transactions.filter((t) => t.categoryId === c.id).length;
    if (used) { toast(`Categoria em uso por ${used} lançamento(s). Altere-os antes de excluir.`); return; }
    if (!confirm(`Excluir a categoria “${c.name}”?`)) return;
    state.categories = state.categories.filter((x) => x.id !== c.id);
    persist((cl, h) => cl.deleteCat(h, c.id));
    catDialog.close(); render(); toast('Categoria excluída.');
  });

  $$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));

  // ---------------------------------------------------------------- Global events
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => goto(tab.dataset.view)));
  function goto(view) {
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
    window.scrollTo({ top: 0 });
  }

  $('#prev-month').addEventListener('click', () => { cursor = shiftMonth(cursor, -1); render(); });
  $('#next-month').addEventListener('click', () => { cursor = shiftMonth(cursor, 1); render(); });
  $('#fab').addEventListener('click', () => openTx(null));

  document.addEventListener('click', (e) => {
    const txEl = e.target.closest('[data-tx]');
    if (txEl) return openTx(state.transactions.find((t) => t.id === txEl.dataset.tx));
    const catEl = e.target.closest('[data-cat]');
    if (catEl) return openCat(cat(catEl.dataset.cat));
    const go = e.target.closest('[data-goto]');
    if (go) return goto(go.dataset.goto);
    const settle = e.target.closest('[data-settle]');
    if (settle) {
      const from = settle.dataset.settle;
      return openTx(null, { type: 'acerto', paidBy: from, to: from === 'p1' ? 'p2' : 'p1', amount: round2(+settle.dataset.amount), description: 'Acerto de contas' });
    }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-tx],[data-cat]')) { e.preventDefault(); e.target.click(); }
  });

  ['#f-search', '#f-type', '#f-nature', '#f-category', '#f-person'].forEach((s) =>
    $(s).addEventListener('input', renderTransactions));

  $('#budget-list').addEventListener('change', (e) => {
    const id = e.target.dataset.budget;
    if (!id) return;
    const c = cat(id);
    c.budget = Math.max(0, round2(+e.target.value || 0));
    persist((cl, h) => cl.upsertCats(h, [c], state.categories));
    render(); toast('Orçamento atualizado.');
  });

  $('#couple-form').addEventListener('input', updateSplitUI);
  $('#couple-form').addEventListener('submit', (e) => {
    e.preventDefault();
    Object.assign(state.settings, {
      p1: $('#s-p1').value.trim() || 'Pessoa 1',
      p2: $('#s-p2').value.trim() || 'Pessoa 2',
      splitMode: ($('input[name="splitMode"]:checked') || {}).value || 'igual',
      inc1: +$('#s-inc1').value || 0,
      inc2: +$('#s-inc2').value || 0,
      pct1: +$('#s-pct1').value,
    });
    const settings = { ...state.settings };
    persist((c, h) => c.saveSettings(h, settings));
    document.activeElement.blur(); render(); toast('Configurações salvas.');
  });

  $('#add-category').addEventListener('click', () => openCat(null));

  $('#copy-fixed').addEventListener('click', () => {
    const prev = shiftMonth(cursor, -1);
    const current = txOfMonth(cursor.y, cursor.m);
    const lastDay = new Date(cursor.y, cursor.m + 1, 0).getDate();
    const toCopy = txOfMonth(prev.y, prev.m).filter((t) => t.type === 'despesa' && natureOf(t) === 'fixo' &&
      !current.some((c) => c.categoryId === t.categoryId && c.description === t.description));
    if (!toCopy.length) { toast('Nenhum custo fixo novo para copiar do mês anterior.'); return; }
    const copies = toCopy.map((t, i) => {
      const day = Math.min(+t.date.slice(8, 10), lastDay);
      return { ...t, id: uid(), createdAt: Date.now() + i, date: `${ymKey(cursor.y, cursor.m)}-${pad(day)}` };
    });
    state.transactions.push(...copies);
    persist((c, h) => c.upsertTxs(h, copies));
    render(); toast(`${toCopy.length} custo(s) fixo(s) copiado(s). Ajuste os valores se necessário.`);
  });

  // ---------------------------------------------------------------- Import / export
  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  $('#export-json').addEventListener('click', () =>
    download(`nosso-bolso-backup-${isoDate(new Date())}.json`, JSON.stringify(state, null, 2), 'application/json'));

  $('#import-json').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.transactions)) throw new Error('formato');
      if (!confirm('Substituir os dados atuais pelo backup importado?')) return;
      state = normalize(data); persistAll(); render(); toast('Backup importado com sucesso!');
    } catch (err) { toast('Arquivo inválido. Use um backup exportado pelo Nosso Bolso.'); }
  });

  $('#export-csv').addEventListener('click', () => {
    const num = (v) => v.toFixed(2).replace('.', ',');
    const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
    const head = ['Data', 'Tipo', 'Descrição', 'Categoria', 'Natureza', 'Valor', 'Pago/recebido por', 'De quem é', 'Para quem', 'Observação'];
    const rows = [...state.transactions].sort((a, b) => (a.date < b.date ? -1 : 1)).map((t) => {
      const c = cat(t.categoryId);
      const nat = t.type === 'despesa' ? (natureOf(t) === 'fixo' ? 'Custo fixo' : 'Gasto variável') : '';
      return [t.date.split('-').reverse().join('/'), t.type, t.description, c ? c.name : '', nat, num(t.amount),
        name(t.paidBy), t.split ? (t.split === 'shared' ? 'Casal' : name(t.split)) : '', t.to ? name(t.to) : '', t.note || ''].map(q).join(';');
    });
    download(`nosso-bolso-lancamentos-${isoDate(new Date())}.csv`, '﻿' + [head.map(q).join(';'), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
  });

  $('#reset-all').addEventListener('click', () => {
    const msg = cloud ? 'Apagar TODOS os lançamentos, categorias e configurações do casal (para vocês dois)? Esta ação não pode ser desfeita.'
      : 'Apagar TODOS os lançamentos, categorias e configurações? Esta ação não pode ser desfeita.';
    if (!confirm(msg)) return;
    state = defaultState(); persistAll(); render(); toast('Dados apagados.');
  });

  $('#load-demo').addEventListener('click', () => {
    if (state.transactions.length && !confirm('Substituir os dados atuais por dados de exemplo?')) return;
    state = demoState(); persistAll();
    cursor = { y: today.getFullYear(), m: today.getMonth() };
    render(); goto('dashboard'); toast('Dados de exemplo carregados.');
  });

  function persistAll() {
    const snapshot = state;
    persist((c) => c.replaceAll(snapshot));
  }

  function demoState() {
    const s = defaultState();
    s.settings = { p1: 'Ana', p2: 'Bruno', splitMode: 'proporcional', inc1: 6000, inc2: 4500, pct1: 50 };
    const budgets = { moradia: 2200, contas: 450, internet: 200, saude: 900, assinaturas: 120, mercado: 1400, restaurantes: 600, transporte: 500, lazer: 400, farmacia: 150 };
    s.categories.forEach((c) => (c.budget = budgets[c.id] || 0));
    const add = (mo, day, type, description, amount, categoryId, paidBy, split = 'shared', extra = {}) => {
      const d = shiftMonth({ y: today.getFullYear(), m: today.getMonth() }, mo);
      const last = new Date(d.y, d.m + 1, 0).getDate();
      const date = `${ymKey(d.y, d.m)}-${pad(Math.min(day, last))}`;
      if (mo === 0 && date > isoDate(today)) return;
      s.transactions.push({ id: uid(), createdAt: Date.now() + s.transactions.length, type, description, amount, date,
        categoryId, paidBy, split: type === 'despesa' ? split : null, to: null, note: '', ...extra });
    };
    const vary = (base, i) => round2(base * (0.85 + ((i * 37) % 30) / 100));
    for (let mo = -5; mo <= 0; mo++) {
      const i = mo + 6;
      add(mo, 5, 'receita', 'Salário Ana', 6000, 'salario', 'p1');
      add(mo, 5, 'receita', 'Salário Bruno', 4500, 'salario', 'p2');
      if (i % 2) add(mo, 18, 'receita', 'Freela de design', vary(800, i), 'extra', 'p1');
      add(mo, 1, 'despesa', 'Aluguel', 2200, 'moradia', 'p1');
      add(mo, 10, 'despesa', 'Conta de luz', vary(210, i), 'contas', 'p2');
      add(mo, 12, 'despesa', 'Conta de água', vary(95, i + 3), 'contas', 'p2');
      add(mo, 8, 'despesa', 'Internet fibra', 119.9, 'internet', 'p2');
      add(mo, 8, 'despesa', 'Plano de saúde', 860, 'saude', 'p1');
      add(mo, 15, 'despesa', 'Streaming', 55.9, 'assinaturas', 'p1');
      add(mo, 3, 'despesa', 'Mercado do mês', vary(780, i), 'mercado', 'p1');
      add(mo, 17, 'despesa', 'Feira e hortifrúti', vary(190, i + 1), 'mercado', 'p2');
      add(mo, 24, 'despesa', 'Mercado reposição', vary(320, i + 2), 'mercado', 'p2');
      add(mo, 7, 'despesa', 'Jantar fora', vary(180, i), 'restaurantes', 'p2');
      add(mo, 21, 'despesa', 'Delivery pizza', vary(85, i + 4), 'restaurantes', 'p1');
      add(mo, 6, 'despesa', 'Combustível', vary(260, i), 'transporte', 'p2');
      add(mo, 13, 'despesa', 'Cinema', vary(90, i + 5), 'lazer', 'p1');
      add(mo, 19, 'despesa', 'Academia Bruno', 99.9, 'saude', 'p2', 'p2');
      if (i % 3 === 0) add(mo, 22, 'despesa', 'Roupa nova', vary(250, i), 'vestuario', 'p1', 'p1');
      add(mo, 14, 'despesa', 'Farmácia', vary(70, i + 2), 'farmacia', 'p2');
      add(mo, 26, 'despesa', 'Ração e petshop', vary(160, i), 'pets', 'p1');
    }
    // acertos no fim de cada mês passado, para o saldo ficar realista
    for (let mo = -5; mo < 0; mo++) {
      const d = shiftMonth({ y: today.getFullYear(), m: today.getMonth() }, mo);
      s.transactions.push({ id: uid(), createdAt: 0, type: 'acerto', description: 'Acerto de contas', amount: 0,
        date: `${ymKey(d.y, d.m)}-28`, categoryId: null, paidBy: 'p2', split: null, to: 'p1', note: '' });
      const prev = state; state = s;
      const { net1 } = settlement(d.y, d.m);
      state = prev;
      const t = s.transactions[s.transactions.length - 1];
      t.amount = Math.abs(net1); t.paidBy = net1 > 0 ? 'p2' : 'p1'; t.to = net1 > 0 ? 'p1' : 'p2';
    }
    return s;
  }

  // ---------------------------------------------------------------- Login e espaço do casal
  const gates = ['#auth-screen', '#household-screen', '#loading'];
  function showGate(id) { gates.forEach((g) => $(g).classList.toggle('hidden', g !== id)); }

  function setSync(status) {
    const el = $('#sync-status');
    el.dataset.status = status;
    el.textContent = { ok: '☁️ Sincronizado', saving: '⏳ Salvando…', error: '⚠️ Erro ao sincronizar', offline: '📴 Sem internet' }[status] || '';
  }
  window.addEventListener('offline', () => cloud && setSync('offline'));
  window.addEventListener('online', () => { if (cloud && hid) { setSync('ok'); scheduleReload(100); } });

  let reloadTimer = null;
  function scheduleReload(delay = 400) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      if (pendingWrites > 0) return scheduleReload(400); // espera as gravações terminarem
      reloadCloud().catch((err) => { setSync('error'); console.error(err); });
    }, delay);
  }

  async function reloadCloud() {
    if (!cloud || !account) return;
    const data = await cloud.load();
    if (!data) { leaveCloudData(); showHousehold(); return; }
    hid = data.householdId;
    account.inviteCode = data.inviteCode;
    account.members = data.members;
    state = normalize({ settings: data.settings, categories: data.categories, transactions: data.transactions });
    setSync(navigator.onLine === false ? 'offline' : 'ok');
    render();
  }

  function leaveCloudData() {
    cloud && cloud.unsubscribe();
    hid = null;
    state = defaultState();
    render();
  }

  async function enter(session) {
    if (account && account.userId === session.user.id && hid) return;
    account = { userId: session.user.id, email: session.user.email, inviteCode: '', members: [] };
    showGate('#loading');
    try {
      const data = await cloud.load();
      if (!data) { showHousehold(); return; }
      await reloadCloud();
      cloud.subscribe(() => scheduleReload());
      if (recovering) showAuth('recovery', 'Digite sua nova senha.', true);
      else showGate(null);
    } catch (err) {
      account = null;
      showAuth('signin', 'Não foi possível carregar os dados: ' + err.message);
    }
  }

  // ----- Tela de login
  const authForm = $('#auth-form');
  let authMode = 'signin';
  function showAuth(mode = 'signin', msg = '', ok = false) {
    authMode = mode;
    const r = $(`input[name="authMode"][value="${mode}"]`);
    if (r) r.checked = true;
    $('#auth-tabs').classList.toggle('hidden', mode === 'forgot' || mode === 'recovery');
    $('.for-email', authForm).classList.toggle('hidden', mode === 'recovery');
    $('.for-password', authForm).classList.toggle('hidden', mode === 'forgot');
    authForm.email.required = mode !== 'recovery';
    authForm.password.required = mode !== 'forgot';
    authForm.password.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    $('.for-password', authForm).firstChild.textContent = mode === 'recovery' ? 'Nova senha' : 'Senha';
    $('#auth-submit').textContent = { signin: 'Entrar', signup: 'Criar conta', forgot: 'Enviar link de recuperação', recovery: 'Salvar nova senha' }[mode];
    $('#forgot-btn').textContent = mode === 'forgot' ? '← Voltar para o login' : 'Esqueci minha senha';
    $('#forgot-btn').classList.toggle('hidden', mode === 'recovery');
    authMsg(msg, ok);
    showGate('#auth-screen');
  }
  const authMsg = (msg, ok) => { const el = $('#auth-msg'); el.textContent = msg || ''; el.classList.toggle('ok', !!ok); };

  $('#auth-tabs').addEventListener('change', (e) => showAuth(e.target.value));
  $('#forgot-btn').addEventListener('click', () => showAuth(authMode === 'forgot' ? 'signin' : 'forgot'));

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = authForm.email.value.trim(), password = authForm.password.value;
    const btn = $('#auth-submit');
    btn.disabled = true; authMsg('Aguarde…', true);
    try {
      if (authMode === 'signin') {
        const { session } = await cloud.signIn(email, password);
        authForm.password.value = '';
        await enter(session);
      } else if (authMode === 'signup') {
        const { session } = await cloud.signUp(email, password);
        authForm.password.value = '';
        if (session) await enter(session);
        else showAuth('signin', `Quase lá! Enviamos um link de confirmação para ${email}. Confirme e depois entre aqui.`, true);
      } else if (authMode === 'forgot') {
        await cloud.resetPassword(email);
        showAuth('signin', 'Se o e-mail tiver conta, você receberá um link para criar uma nova senha.', true);
      } else if (authMode === 'recovery') {
        await cloud.updatePassword(password);
        recovering = false;
        authForm.password.value = '';
        toast('Senha alterada com sucesso!');
        const session = await cloud.session();
        if (session) { account = null; await enter(session); }
        else showAuth('signin', 'Senha alterada. Entre com a nova senha.', true);
      }
    } catch (err) {
      authMsg(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  // ----- Tela do espaço do casal
  function showHousehold(msg = '') {
    $('#hh-email').textContent = account ? account.email : '';
    $('#hh-msg').textContent = msg;
    showGate('#household-screen');
  }

  $('#hh-create').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const local = load();
    let initial = defaultState();
    if (local.transactions.length && confirm(`Encontramos ${local.transactions.length} lançamento(s) salvos neste aparelho. Deseja levá-los para o espaço do casal?`)) {
      initial = local;
    }
    btn.disabled = true;
    try {
      await cloud.createHousehold(initial.settings);
      await cloud.replaceAll(initial);
      hid = null;
      await enter({ user: { id: account.userId, email: account.email } });
      goto('settings');
      toast('Espaço criado! Compartilhe o código de convite com seu par.');
    } catch (err) { $('#hh-msg').textContent = err.message; }
    finally { btn.disabled = false; }
  });

  $('#hh-join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget, code = form.code.value.trim().toUpperCase();
    try {
      await cloud.joinHousehold(code);
      form.reset();
      hid = null;
      await enter({ user: { id: account.userId, email: account.email } });
      toast('Pronto! Agora vocês compartilham os mesmos dados.');
    } catch (err) { $('#hh-msg').textContent = err.message; }
  });

  async function signOut() {
    try { await cloud.signOut(); } catch (err) { /* sai localmente mesmo sem conexão */ }
    account = null; leaveCloudData(); showAuth('signin');
  }
  $('#hh-signout').addEventListener('click', signOut);
  $('#acc-signout').addEventListener('click', signOut);

  $('#acc-leave').addEventListener('click', async () => {
    const alone = account.members.length < 2;
    const msg = alone
      ? 'Sair do espaço? Como você é a única pessoa nele, TODOS os dados serão apagados.'
      : 'Sair do espaço do casal? Os dados continuam disponíveis para seu par.';
    if (!confirm(msg)) return;
    try { await cloud.leaveHousehold(); leaveCloudData(); showHousehold(); }
    catch (err) { toast(err.message); }
  });

  $('#copy-code').addEventListener('click', async () => {
    const code = account && account.inviteCode;
    try { await navigator.clipboard.writeText(code); toast('Código copiado!'); }
    catch (e) { toast(`Código de convite: ${code}`); }
  });

  // ---------------------------------------------------------------- Init
  const CONFIG = window.NOSSO_BOLSO_CONFIG || {};
  if (window.NBCloud && window.NBCloud.isConfigured(CONFIG)) {
    cloud = window.NBCloud.create(CONFIG);
    state = defaultState();
    render();
    showGate('#loading');
    cloud.onAuth((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { recovering = true; showAuth('recovery', 'Digite sua nova senha.', true); }
      else if (event === 'SIGNED_OUT' && account) { account = null; leaveCloudData(); showAuth('signin'); }
    });
    cloud.session()
      .then((session) => (session ? enter(session) : showAuth('signin')))
      .catch((err) => showAuth('signin', err.message));
  } else {
    render();
  }
})();
