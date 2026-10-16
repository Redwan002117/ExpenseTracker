/* ==========================================================================
   App — routing, rendering and user interaction
   ========================================================================== */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const VIEWS = ['dashboard', 'transactions', 'reports', 'budget', 'settings'];
  const WARN_AT = 0.8;

  const ui = {
    view: 'dashboard',
    month: Store.monthKey(new Date()),
    filters: { search: '', type: 'all', category: 'all', month: Store.monthKey(new Date()) },
    form: { editingId: null, type: 'expense', category: null }
  };

  /* ---------- formatting ---------- */

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function money(n, { sign = false } = {}) {
    const cur = Store.settings().currency;
    const abs = Math.abs(n);
    const body = abs.toLocaleString('en-US', {
      minimumFractionDigits: abs % 1 ? 2 : 0,
      maximumFractionDigits: 2
    });
    const prefix = n < 0 ? '−' : (sign && n > 0 ? '+' : '');
    return `${prefix}${cur}${body}`;
  }

  function compactMoney(n) {
    const cur = Store.settings().currency;
    if (n >= 1e6) return cur + +(n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return cur + +(n / 1e3).toFixed(1) + 'k';
    return cur + Math.round(n);
  }

  function parseISO(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function monthName(key, style = 'long') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-US', style === 'long'
      ? { month: 'long', year: 'numeric' }
      : { month: 'short' });
  }

  function friendlyDate(iso) {
    const today = Store.todayISO();
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (iso === today) return 'Today';
    if (iso === Store.monthKey(y) + '-' + String(y.getDate()).padStart(2, '0')) return 'Yesterday';
    return parseISO(iso).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  function pct(ratio) { return Math.round(ratio * 100) + '%'; }

  /* ---------- small UI helpers ---------- */

  function toast(message, kind = 'success') {
    const icons = { success: 'i-check', warn: 'i-alert', danger: 'i-alert', info: 'i-sparkles' };
    const el = document.createElement('div');
    el.className = `toast toast-${kind}`;
    el.setAttribute('role', kind === 'danger' || kind === 'warn' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast-icon"><svg class="icon"><use href="#${icons[kind]}"/></svg></span><span>${escapeHtml(message)}</span>`;
    $('#toasts').appendChild(el);
    setTimeout(() => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 300);
    }, kind === 'warn' || kind === 'danger' ? 4500 : 2800);
  }

  function emojiBadge(cat) {
    return `<span class="tx-emoji" style="background:${cat.color}1f">${cat.emoji}</span>`;
  }

  function txRow(t) {
    const cat = Store.getCategory(t.type, t.category);
    const title = t.note ? escapeHtml(t.note) : cat.label;
    const sub = t.note ? `${cat.label} · ${friendlyDate(t.date)}` : friendlyDate(t.date);
    const amt = t.type === 'income' ? money(t.amount, { sign: true }) : money(-t.amount);
    return `<li><button class="tx" data-edit="${t.id}" aria-label="Edit ${escapeHtml(cat.label)} ${amt}">
      ${emojiBadge(cat)}
      <span class="tx-main"><span class="tx-title">${title}</span><span class="tx-sub">${sub}</span></span>
      <span class="tx-amount is-${t.type}">${amt}</span>
    </button></li>`;
  }

  function emptyState(emoji, title, text, withButton = true) {
    return `<div class="empty"><span class="empty-emoji">${emoji}</span><b>${title}</b>${text}
      ${withButton ? '<br><button class="btn btn-brand" data-action="add"><svg class="icon"><use href="#i-plus"/></svg>Add transaction</button>' : ''}</div>`;
  }

  function setBar(el, ratio) {
    el.style.width = Math.min(100, ratio * 100) + '%';
    el.classList.toggle('is-warn', ratio >= WARN_AT && ratio < 1);
    el.classList.toggle('is-over', ratio >= 1);
  }

  /** Groups the smallest categories into "Others" so charts stay readable. */
  function topSlices(cats, max = 5) {
    if (cats.length <= max) return cats;
    const head = cats.slice(0, max - 1);
    const rest = cats.slice(max - 1).reduce((s, c) => s + c.value, 0);
    return [...head, { id: '_rest', label: 'Others', emoji: '•', color: '#cbd5e1', value: rest }];
  }

  function legendHtml(slices, total, wide = false) {
    if (!slices.length) return `<li class="muted-note">No expenses yet</li>`;
    return slices.map(s => `<li><span class="dot" style="background:${s.color}"></span>
      <span class="lg-name">${wide ? s.emoji + ' ' : ''}${escapeHtml(s.label)}</span>
      <span class="lg-val">${wide ? money(s.value) + ' · ' : ''}${pct(s.value / total)}</span></li>`).join('');
  }

  function daysElapsed(key) {
    const now = Store.monthKey(new Date());
    if (key === now) return new Date().getDate();
    if (key < now) return Store.daysInMonth(key);
    return 0;
  }

  /* ---------- routing ---------- */

  function route() {
    const name = location.hash.replace('#', '');
    const view = VIEWS.includes(name) ? name : 'dashboard';
    ui.view = view;
    VIEWS.forEach(v => { $('#view-' + v).hidden = v !== view; });
    $$('[data-nav]').forEach(a => {
      const active = a.dataset.nav === view;
      a.classList.toggle('is-active', active);
      if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = `${$('#view-' + view).dataset.title} · ExpenseTracker`;
    render();
    window.scrollTo({ top: 0 });
  }

  function render() {
    $$('[data-month-label]').forEach(el => { el.textContent = monthName(ui.month); });
    $$('[data-currency]').forEach(el => { el.textContent = Store.settings().currency; });
    ({
      dashboard: renderDashboard,
      transactions: renderTransactions,
      reports: renderReports,
      budget: renderBudget,
      settings: renderSettings
    })[ui.view]();
  }

  /* ---------- dashboard ---------- */

  function renderDashboard() {
    const s = Store.settings();
    const list = Store.inMonth(ui.month);
    const t = Store.totals(list);

    const h = new Date().getHours();
    const hello = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    $('#greeting').textContent = s.name ? `${hello}, ${s.name}` : hello;
    $('#today-label').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' });

    // hero
    const hero = $('#hero');
    const ratio = s.budget > 0 ? t.expense / s.budget : 0;
    hero.dataset.state = s.budget > 0 ? (ratio >= 1 ? 'over' : ratio >= WARN_AT ? 'warn' : 'ok') : 'ok';
    $('#hero-amount').textContent = money(t.balance);
    let text;
    if (!list.length) text = `No transactions in ${monthName(ui.month)} yet. Add one to see your balance.`;
    else if (s.budget > 0 && ratio >= 1) text = `You’re ${money(t.expense - s.budget)} over your ${money(s.budget)} budget this month. Time to slow down.`;
    else if (s.budget > 0 && ratio >= WARN_AT) text = `Heads up — you’ve used ${pct(ratio)} of your budget. Only ${money(s.budget - t.expense)} left.`;
    else if (s.budget > 0) text = `You’ve used ${pct(ratio)} of your budget. ${money(s.budget - t.expense)} left to spend — nice pace.`;
    else text = `You earned ${money(t.income)} and spent ${money(t.expense)} in ${monthName(ui.month)}.`;
    $('#hero-text').textContent = text;

    // stats
    const days = daysElapsed(ui.month);
    $('#stat-income').textContent = money(t.income);
    $('#stat-expense').textContent = money(t.expense);
    $('#stat-daily').textContent = days ? money(Store.round2(t.expense / days)) : '—';

    // recent
    $('#recent-list').innerHTML = list.length
      ? list.slice(0, 5).map(txRow).join('')
      : `<li>${emptyState('🧾', 'Nothing here yet', 'Your latest transactions will show up here.', false)}</li>`;

    renderInsight(list, t);

    // budget card
    $('#dash-budget-title').textContent = s.budget > 0 ? `${money(s.budget)} limit` : 'No budget set';
    setBar($('#dash-budget-bar'), ratio);
    $('#dash-budget-spent').textContent = `${money(t.expense)} spent`;
    $('#dash-budget-left').textContent = s.budget > 0
      ? (ratio >= 1 ? `${money(t.expense - s.budget)} over` : `${money(s.budget - t.expense)} left`)
      : 'Set one on the Budget page';

    // donut
    const slices = topSlices(Store.byCategory(list));
    Charts.donut($('#dash-donut'), slices, { label: 'Spent', value: compactMoney(t.expense) });
    $('#dash-legend').innerHTML = legendHtml(slices, t.expense);
  }

  function renderInsight(list, t) {
    const s = Store.settings();
    const cats = Store.byCategory(list);
    const titleEl = $('#insight-title'), textEl = $('#insight-text'), tipEl = $('#insight-tip');

    if (!cats.length) {
      titleEl.textContent = 'Nothing to analyse yet';
      textEl.textContent = `Once you add a few expenses for ${monthName(ui.month)}, you’ll see where your money goes.`;
      tipEl.textContent = Store.all().length
        ? 'Use the arrows at the top to check another month.'
        : 'New here? Load the sample data from Settings to explore the app.';
      return;
    }

    const top = cats[0];
    const share = top.value / t.expense;
    titleEl.textContent = `${top.label} is your biggest spend`;

    let text = `${top.emoji} ${top.label} took ${pct(share)} of your spending (${money(top.value)}) this month.`;
    const prev = Store.totals(Store.inMonth(Store.shiftMonth(ui.month, -1))).expense;
    if (prev > 0) {
      const diff = (t.expense - prev) / prev;
      if (Math.abs(diff) >= 0.01) text += ` Overall you’re spending ${pct(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than last month.`;
      else text += ' That’s about the same as last month.';
    }
    textEl.textContent = text;

    let tip;
    const limit = s.categoryBudgets[top.id];
    if (s.budget > 0 && t.expense >= s.budget) {
      tip = `You’re over budget. Pause non-essential spending like ${cats.find(c => ['entertainment', 'shopping'].includes(c.id))?.label.toLowerCase() || 'shopping'} until next month.`;
    } else if (limit && top.value > limit) {
      tip = `${top.label} is ${money(top.value - limit)} over its limit. Try cheaper alternatives for the rest of the month.`;
    } else if (share >= 0.35 && !limit) {
      tip = `Set a ${top.label.toLowerCase()} limit on the Budget page — cutting it by 10% saves ${money(Store.round2(top.value * 0.1))} a month.`;
    } else if (t.income > 0) {
      const rate = (t.income - t.expense) / t.income;
      tip = rate >= 0.2
        ? `You’re saving ${pct(rate)} of your income. Great job — keep it up!`
        : `You’re saving ${pct(Math.max(0, rate))} of your income. Aiming for 20% builds a healthy safety net.`;
    } else {
      tip = 'Log your income too, so the app can work out your savings rate.';
    }
    tipEl.textContent = tip;
  }

  /* ---------- transactions ---------- */

  function fillFilterOptions() {
    // months
    const months = new Set(Store.all().map(t => t.date.slice(0, 7)));
    months.add(Store.monthKey(new Date()));
    if (ui.filters.month !== 'all') months.add(ui.filters.month);
    const monthSel = $('#f-month');
    monthSel.innerHTML = '<option value="all">All months</option>' +
      [...months].sort().reverse().map(m => `<option value="${m}">${monthName(m)}</option>`).join('');
    monthSel.value = ui.filters.month;

    // categories (depends on type filter)
    const catSel = $('#f-category');
    const types = ui.filters.type === 'all' ? ['expense', 'income'] : [ui.filters.type];
    catSel.innerHTML = '<option value="all">All categories</option>' + types.map(type =>
      `<optgroup label="${type === 'expense' ? 'Expenses' : 'Income'}">` +
      Store.CATEGORIES[type].map(c => `<option value="${type}:${c.id}">${c.emoji} ${c.label}</option>`).join('') +
      '</optgroup>').join('');
    if (![...catSel.options].some(o => o.value === ui.filters.category)) ui.filters.category = 'all';
    catSel.value = ui.filters.category;
  }

  function filteredTransactions() {
    const f = ui.filters;
    const q = f.search.trim().toLowerCase();
    return Store.all().filter(t => {
      if (f.type !== 'all' && t.type !== f.type) return false;
      if (f.month !== 'all' && !t.date.startsWith(f.month)) return false;
      if (f.category !== 'all') {
        const [type, id] = f.category.split(':');
        if (t.type !== type || t.category !== id) return false;
      }
      if (q) {
        const cat = Store.getCategory(t.type, t.category);
        const hay = `${t.note} ${cat.label} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTransactions() {
    fillFilterOptions();
    $$('#f-type .pill').forEach(p => p.classList.toggle('is-active', p.dataset.type === ui.filters.type));

    const list = filteredTransactions();
    const t = Store.totals(list);
    $('#tx-summary').innerHTML = `
      <span class="chip">${list.length} transaction${list.length === 1 ? '' : 's'}</span>
      <span class="chip chip-income">In ${money(t.income)}</span>
      <span class="chip chip-expense">Out ${money(t.expense)}</span>`;

    if (!list.length) {
      const anyData = Store.all().length > 0;
      $('#tx-groups').innerHTML = `<div class="card">${anyData
        ? emptyState('🔍', 'No matches', 'Try a different search or filter.', false)
        : emptyState('🧾', 'No transactions yet', 'Add your first income or expense to get started.')}</div>`;
      return;
    }

    const groups = [];
    list.forEach(tx => {
      const last = groups[groups.length - 1];
      if (last && last.date === tx.date) last.items.push(tx);
      else groups.push({ date: tx.date, items: [tx] });
    });

    $('#tx-groups').innerHTML = groups.map(g => {
      const net = Store.totals(g.items).balance;
      return `<div class="tx-group">
        <div class="tx-group-head"><span class="micro">${friendlyDate(g.date)}</span><span class="tx-group-total">${money(net, { sign: true })}</span></div>
        <div class="card"><ul class="tx-list">${g.items.map(txRow).join('')}</ul></div>
      </div>`;
    }).join('');
  }

  /* ---------- reports ---------- */

  function renderReports() {
    const list = Store.inMonth(ui.month);
    const t = Store.totals(list);
    const cats = Store.byCategory(list);

    $('#r-income').textContent = money(t.income);
    $('#r-expense').textContent = money(t.expense);
    $('#r-rate').textContent = t.income > 0 ? pct((t.income - t.expense) / t.income) : '—';
    const biggest = list.filter(x => x.type === 'expense').sort((a, b) => b.amount - a.amount)[0];
    $('#r-biggest').textContent = biggest ? money(biggest.amount) : '—';
    $('#r-biggest').title = biggest ? (biggest.note || Store.getCategory('expense', biggest.category).label) : '';

    Charts.donut($('#r-donut'), cats, { label: 'Total spent', value: compactMoney(t.expense) });
    $('#r-legend').innerHTML = legendHtml(cats, t.expense, true);

    const rows = [];
    for (let i = 5; i >= 0; i--) {
      const key = Store.shiftMonth(ui.month, -i);
      const mt = Store.totals(Store.inMonth(key));
      rows.push({ label: monthName(key, 'short'), income: mt.income, expense: mt.expense });
    }
    Charts.bars($('#r-bars'), rows, compactMoney);

    $('#r-rank').innerHTML = cats.length ? cats.slice(0, 5).map(c => `
      <li class="rank-row">${emojiBadge(c)}
        <div class="rank-body">
          <div class="rank-top"><span>${escapeHtml(c.label)}</span><span>${money(c.value)}</span></div>
          <div class="progress"><span style="width:${(c.value / cats[0].value) * 100}%;background:${c.color}"></span></div>
        </div>
      </li>`).join('') : `<li>${emptyState('📊', 'No expenses this month', 'Pick another month or add a transaction.', false)}</li>`;
  }

  /* ---------- budget ---------- */

  function renderBudget() {
    const s = Store.settings();
    const list = Store.inMonth(ui.month);
    const t = Store.totals(list);
    const spentBy = Object.fromEntries(Store.byCategory(list).map(c => [c.id, c.value]));

    const ratio = s.budget > 0 ? t.expense / s.budget : 0;
    $('#budget-pct').textContent = s.budget > 0 ? pct(ratio) : '—';
    $('#budget-hero-text').textContent = s.budget > 0
      ? (ratio >= 1
        ? `${money(t.expense)} spent — ${money(t.expense - s.budget)} over your ${money(s.budget)} limit.`
        : `${money(t.expense)} of ${money(s.budget)} spent in ${monthName(ui.month)}. ${money(s.budget - t.expense)} to go.`)
      : 'Set a monthly limit below to start tracking.';
    setBar($('#budget-hero-bar'), ratio);
    if (document.activeElement !== $('#budget-input')) $('#budget-input').value = s.budget || '';

    $('#cat-budgets').innerHTML = Store.CATEGORIES.expense.map(c => {
      const limit = s.categoryBudgets[c.id] || 0;
      const spent = spentBy[c.id] || 0;
      const r = limit ? spent / limit : 0;
      const cls = r >= 1 ? 'is-over' : r >= WARN_AT ? 'is-warn' : '';
      return `<li class="cat-budget">
        ${emojiBadge(c)}
        <div class="cat-budget-info">
          <div class="cat-budget-top">
            <span class="cat-budget-name">${c.label}</span>
            <span class="cat-budget-spent">${money(spent)}${limit ? ' / ' + money(limit) : ' spent'}</span>
          </div>
          <label class="input-affix"><span class="affix">${escapeHtml(s.currency)}</span>
            <span class="sr-only">${c.label} limit</span>
            <input type="number" min="0" step="1" inputmode="decimal" placeholder="No limit" data-cat-limit="${c.id}" value="${limit || ''}">
          </label>
        </div>
        <div class="progress"><span class="${cls}" style="width:${Math.min(100, r * 100)}%"></span></div>
      </li>`;
    }).join('');
  }

  /* ---------- settings ---------- */

  function renderSettings() {
    const s = Store.settings();
    $('#s-name').value = s.name;
    const cur = $('#s-currency');
    cur.innerHTML = Store.CURRENCIES.map(c => `<option value="${c.symbol}">${c.symbol}  ${c.label}</option>`).join('');
    cur.value = s.currency;
    $$('#s-theme button').forEach(b => b.classList.toggle('is-active', b.dataset.themeChoice === s.theme));
    $('#s-accent').innerHTML = Store.ACCENTS.map(a => {
      const on = a.id === s.accent;
      return `<button type="button" class="swatch${on ? ' is-active' : ''}" role="radio" aria-checked="${on}" data-accent="${a.id}">
        <span class="swatch-dot" style="--sw:${a.color};--sw-soft:${a.soft}"><svg class="icon"><use href="#i-check"/></svg></span>
        <span>${a.label}</span>
      </button>`;
    }).join('');
  }

  /* ---------- theme ---------- */

  const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function isDark() {
    const attr = document.documentElement.getAttribute('data-theme');
    return attr ? attr === 'dark' : darkQuery.matches;
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    const dark = isDark();
    $$('.icon-theme use').forEach(u => u.setAttribute('href', dark ? '#i-sun' : '#i-moon'));
    $('meta[name="theme-color"]').setAttribute('content', dark ? '#0b1120' : '#f8fafc');
  }

  function applyAccent(accent) {
    document.documentElement.setAttribute('data-accent', accent);
  }

  function setAccent(accent) {
    Store.setSettings({ accent });
    applyAccent(accent);
    render();
    toast(`${Store.ACCENTS.find(a => a.id === accent).label} theme applied`);
  }

  function setTheme(theme) {
    Store.setSettings({ theme });
    applyTheme(theme);
    render();
  }

  darkQuery.addEventListener('change', () => {
    if (Store.settings().theme === 'system') { applyTheme('system'); render(); }
  });

  /* ---------- transaction modal ---------- */

  let lastFocus = null;

  function openModal(id) {
    lastFocus = document.activeElement;
    $('#' + id).hidden = false;
    document.body.style.overflow = 'hidden';
    syncViewport();
  }

  /** Keeps open sheets inside the part of the screen the on-screen keyboard leaves visible. */
  function syncViewport() {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    root.setProperty('--vv-top', vv.offsetTop + 'px');
    root.setProperty('--vv-height', vv.height + 'px');
  }

  function keepFieldVisible(e) {
    const field = e.target.closest('input, select, textarea');
    if (!field || !field.closest('.sheet')) return;
    // wait for the keyboard animation, then bring the field into the visible part of the sheet
    setTimeout(() => field.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
  }

  function closeModal(id) {
    $('#' + id).hidden = true;
    if ($$('.modal').every(m => m.hidden)) document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderCategoryChips() {
    $('#tx-categories').innerHTML = Store.CATEGORIES[ui.form.type].map(c => `
      <button type="button" class="cat-chip${c.id === ui.form.category ? ' is-active' : ''}" role="radio"
        aria-checked="${c.id === ui.form.category}" data-cat="${c.id}">
        <span>${c.emoji}</span><span>${c.label}</span>
      </button>`).join('');
  }

  function setFormType(type) {
    if (ui.form.type !== type) ui.form.category = null;
    ui.form.type = type;
    $$('#tx-type button').forEach(b => b.classList.toggle('is-active', b.dataset.type === type));
    renderCategoryChips();
  }

  function clearErrors() {
    $$('#tx-form .field').forEach(f => f.classList.remove('has-error'));
    $$('#tx-form .field-error').forEach(e => { e.textContent = ''; });
  }

  function showError(key, msg) {
    const el = $('#err-' + key);
    el.textContent = msg;
    el.closest('.field').classList.add('has-error');
  }

  function openTxModal(id = null) {
    const tx = id ? Store.get(id) : null;
    ui.form.editingId = tx ? tx.id : null;
    ui.form.category = tx ? tx.category : null;
    ui.form.type = tx ? tx.type : 'expense';
    setFormType(ui.form.type);
    clearErrors();

    const thisMonth = Store.monthKey(new Date());
    const defaultDate = ui.month === thisMonth ? Store.todayISO() : `${ui.month}-01`;
    $('#tx-amount').value = tx ? tx.amount : '';
    $('#tx-date').value = tx ? tx.date : defaultDate;
    $('#tx-note').value = tx ? tx.note : '';
    $('#tx-modal-title').textContent = tx ? 'Edit transaction' : 'New transaction';
    $('#tx-submit-label').textContent = tx ? 'Save changes' : 'Add transaction';
    $('#tx-delete').hidden = !tx;
    $$('[data-currency]').forEach(el => { el.textContent = Store.settings().currency; });

    openModal('tx-modal');
    if (window.matchMedia('(pointer: fine)').matches) setTimeout(() => $('#tx-amount').focus({ preventScroll: true }), 60);
  }

  /** Spending ratios for a month, used to detect budget threshold crossings. */
  function budgetRatios(key) {
    const s = Store.settings();
    const list = Store.inMonth(key);
    const out = { overall: s.budget > 0 ? Store.totals(list).expense / s.budget : 0, cats: {} };
    Store.byCategory(list).forEach(c => {
      const limit = s.categoryBudgets[c.id];
      if (limit) out.cats[c.id] = c.value / limit;
    });
    return out;
  }

  function alertCrossings(before, after) {
    const crossed = (a, b, at) => a < at && b >= at;
    if (crossed(before.overall, after.overall, 1)) return toast(`You’ve gone over your monthly budget.`, 'danger');
    if (crossed(before.overall, after.overall, WARN_AT)) return toast(`You’ve used ${pct(after.overall)} of your monthly budget.`, 'warn');
    for (const [id, r] of Object.entries(after.cats)) {
      const label = Store.getCategory('expense', id).label;
      const prev = before.cats[id] || 0;
      if (crossed(prev, r, 1)) return toast(`${label} is over its limit.`, 'danger');
      if (crossed(prev, r, WARN_AT)) return toast(`${label} is at ${pct(r)} of its limit.`, 'warn');
    }
  }

  function submitTx(e) {
    e.preventDefault();
    clearErrors();
    const amount = Number($('#tx-amount').value);
    const date = $('#tx-date').value;
    const note = $('#tx-note').value.trim();
    let ok = true;

    if (!$('#tx-amount').value || !Number.isFinite(amount) || amount <= 0) { showError('amount', 'Enter an amount greater than 0.'); ok = false; }
    else if (amount > 1e9) { showError('amount', 'That amount is too large.'); ok = false; }
    if (!ui.form.category) { showError('category', 'Pick a category.'); ok = false; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showError('date', 'Pick a valid date.'); ok = false; }
    if (!ok) { $('#tx-form .has-error input, #tx-form .has-error button')?.focus(); return; }

    const data = { type: ui.form.type, amount, category: ui.form.category, date, note };
    const key = date.slice(0, 7);
    const before = budgetRatios(key);
    if (ui.form.editingId) {
      Store.update(ui.form.editingId, data);
      toast('Transaction updated');
    } else {
      Store.add(data);
      toast(data.type === 'income' ? `Income of ${money(amount)} added` : `Expense of ${money(amount)} added`);
    }
    if (data.type === 'expense') alertCrossings(before, budgetRatios(key));

    closeModal('tx-modal');
    render();
  }

  /* ---------- confirm dialog ---------- */

  function confirmDialog({ title, text, yes = 'Delete' }) {
    return new Promise(resolve => {
      $('#confirm-title').textContent = title;
      $('#confirm-text').textContent = text;
      $('#confirm-yes').textContent = yes;
      openModal('confirm-modal');
      setTimeout(() => $('#confirm-modal [data-confirm="no"]').focus(), 50);
      const modal = $('#confirm-modal');
      function done(answer) {
        modal.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        closeModal('confirm-modal');
        resolve(answer);
      }
      function onClick(ev) {
        const btn = ev.target.closest('[data-confirm]');
        if (btn) done(btn.dataset.confirm === 'yes');
        else if (ev.target === modal) done(false);
      }
      function onKey(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); done(false); } }
      modal.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
    });
  }

  /* ---------- import / export ---------- */

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;  // stop spreadsheet formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCSV(list) {
    if (!list.length) return toast('There is nothing to export yet.', 'info');
    const rows = [['Date', 'Type', 'Category', 'Amount', 'Note']];
    list.forEach(t => rows.push([t.date, t.type, Store.getCategory(t.type, t.category).label, t.amount, t.note]));
    const csv = '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
    download(`expenses-${Store.todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
    toast(`Exported ${list.length} transaction${list.length === 1 ? '' : 's'}`);
  }

  /* ---------- events ---------- */

  function bindEvents() {
    window.addEventListener('hashchange', route);

    document.addEventListener('click', async e => {
      const stepBtn = e.target.closest('[data-month-step]');
      if (stepBtn) { ui.month = Store.shiftMonth(ui.month, Number(stepBtn.dataset.monthStep)); render(); return; }

      const editBtn = e.target.closest('[data-edit]');
      if (editBtn) { openTxModal(editBtn.dataset.edit); return; }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      switch (btn.dataset.action) {
        case 'add': openTxModal(); break;
        case 'close-modal': closeModal('tx-modal'); break;
        case 'toggle-theme': setTheme(isDark() ? 'light' : 'dark'); break;
        case 'export-csv': exportCSV(filteredTransactions()); break;
        case 'export-csv-all': exportCSV(Store.all()); break;
        case 'backup':
          download(`expensetracker-backup-${Store.todayISO()}.json`, Store.exportJSON(), 'application/json');
          toast('Backup downloaded');
          break;
        case 'sample': {
          if (Store.all().length && !(await confirmDialog({
            title: 'Replace your data?',
            text: 'Loading sample data will replace all your current transactions.',
            yes: 'Replace'
          }))) return;
          Store.loadSample();
          ui.month = Store.monthKey(new Date());
          toast('Sample data loaded', 'info');
          location.hash = '#dashboard';
          render();
          break;
        }
        case 'clear': {
          if (!(await confirmDialog({
            title: 'Delete everything?',
            text: 'All transactions and budgets on this device will be removed. Download a backup first if you want to keep them.',
            yes: 'Delete all'
          }))) return;
          Store.clearAll();
          toast('All data deleted', 'danger');
          render();
          break;
        }
      }
    });

    // transaction modal
    $('#tx-modal').addEventListener('click', e => { if (e.target.id === 'tx-modal') closeModal('tx-modal'); });
    $('#tx-type').addEventListener('click', e => {
      const b = e.target.closest('[data-type]');
      if (b) setFormType(b.dataset.type);
    });
    $('#tx-categories').addEventListener('click', e => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      ui.form.category = b.dataset.cat;
      renderCategoryChips();
      $('#err-category').textContent = '';
      $('#tx-categories').closest('.field').classList.remove('has-error');
    });
    $('#tx-form').addEventListener('submit', submitTx);
    $('#tx-delete').addEventListener('click', async () => {
      const id = ui.form.editingId;
      if (!id) return;
      if (!(await confirmDialog({ title: 'Delete transaction?', text: 'This transaction will be removed permanently.' }))) return;
      Store.remove(id);
      closeModal('tx-modal');
      toast('Transaction deleted', 'danger');
      render();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('#tx-modal').hidden) closeModal('tx-modal');
      const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (!typing && e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && $$('.modal').every(m => m.hidden)) {
        e.preventDefault();
        openTxModal();
      }
    });

    // filters
    let searchTimer;
    $('#f-search').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { ui.filters.search = e.target.value; renderTransactions(); }, 120);
    });
    $('#f-type').addEventListener('click', e => {
      const p = e.target.closest('[data-type]');
      if (!p) return;
      ui.filters.type = p.dataset.type;
      renderTransactions();
    });
    $('#f-category').addEventListener('change', e => { ui.filters.category = e.target.value; renderTransactions(); });
    $('#f-month').addEventListener('change', e => { ui.filters.month = e.target.value; renderTransactions(); });

    // budget
    $('#budget-form').addEventListener('submit', e => {
      e.preventDefault();
      const input = $('#budget-input');
      const v = input.value === '' ? 0 : Number(input.value);
      if (!Number.isFinite(v) || v < 0) return toast('Enter a budget of 0 or more.', 'warn');
      Store.setSettings({ budget: Store.round2(v) });
      input.blur();
      toast(v ? `Monthly budget set to ${money(v)}` : 'Monthly budget removed');
      render();
    });
    $('#cat-budget-form').addEventListener('submit', e => {
      e.preventDefault();
      const limits = {};
      for (const input of $$('[data-cat-limit]')) {
        if (input.value === '') continue;
        const v = Number(input.value);
        if (!Number.isFinite(v) || v < 0) { input.focus(); return toast('Limits must be 0 or more.', 'warn'); }
        if (v > 0) limits[input.dataset.catLimit] = Store.round2(v);
      }
      Store.setSettings({ categoryBudgets: limits });
      toast('Category limits saved');
      render();
    });

    // settings
    $('#profile-form').addEventListener('submit', e => {
      e.preventDefault();
      Store.setSettings({ name: $('#s-name').value.trim().slice(0, 30), currency: $('#s-currency').value });
      toast('Profile saved');
      render();
    });
    $('#s-theme').addEventListener('click', e => {
      const b = e.target.closest('[data-theme-choice]');
      if (b) setTheme(b.dataset.themeChoice);
    });
    $('#s-accent').addEventListener('click', e => {
      const b = e.target.closest('[data-accent]');
      if (b && b.dataset.accent !== Store.settings().accent) setAccent(b.dataset.accent);
    });
    $('#restore-input').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        JSON.parse(text); // fail fast on a broken file before asking
        if (!(await confirmDialog({ title: 'Restore backup?', text: 'Your current data will be replaced with the backup.', yes: 'Restore' }))) return;
        const n = Store.importJSON(text);
        applyTheme(Store.settings().theme);
        applyAccent(Store.settings().accent);
        toast(`Restored ${n} transaction${n === 1 ? '' : 's'}`);
        render();
      } catch (err) {
        toast(err instanceof SyntaxError ? 'That file isn’t valid JSON.' : err.message, 'danger');
      }
    });

    // on-screen keyboard
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncViewport);
      window.visualViewport.addEventListener('scroll', syncViewport);
    }
    document.addEventListener('focusin', keepFieldVisible);

    // redraw charts on resize
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (ui.view === 'dashboard' || ui.view === 'reports') render(); }, 150);
    });

    // re-render charts once the web font is ready so canvas text uses Nunito
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
  }

  /* ---------- start ---------- */
  applyTheme(Store.settings().theme);
  applyAccent(Store.settings().accent);
  bindEvents();
  route();
})();
