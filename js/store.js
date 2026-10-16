/* ==========================================================================
   Store — data model, localStorage persistence and query helpers
   ========================================================================== */

const Store = (() => {
  const STORAGE_KEY = 'expenseTracker.v1';

  const CATEGORIES = {
    expense: [
      { id: 'food',          label: 'Food',          emoji: '🍔', color: '#f43f5e' },
      { id: 'transport',     label: 'Transport',     emoji: '🚌', color: '#0ea5e9' },
      { id: 'education',     label: 'Education',     emoji: '📚', color: '#6366f1' },
      { id: 'bills',         label: 'Bills',         emoji: '💡', color: '#f59e0b' },
      { id: 'shopping',      label: 'Shopping',      emoji: '🛍️', color: '#a855f7' },
      { id: 'entertainment', label: 'Entertainment', emoji: '🎬', color: '#14b8a6' },
      { id: 'health',        label: 'Health',        emoji: '💊', color: '#10b981' },
      { id: 'other',         label: 'Other',         emoji: '📦', color: '#94a3b8' }
    ],
    income: [
      { id: 'allowance',   label: 'Allowance',   emoji: '👛', color: '#10b981' },
      { id: 'salary',      label: 'Salary',      emoji: '💼', color: '#0ea5e9' },
      { id: 'parttime',    label: 'Part-time',   emoji: '⏱️', color: '#6366f1' },
      { id: 'scholarship', label: 'Scholarship', emoji: '🎓', color: '#a855f7' },
      { id: 'gift',        label: 'Gift',        emoji: '🎁', color: '#f43f5e' },
      { id: 'other',       label: 'Other',       emoji: '✨', color: '#94a3b8' }
    ]
  };

  const CURRENCIES = [
    { symbol: '৳', label: 'BDT — Bangladeshi Taka' },
    { symbol: '$', label: 'USD — US Dollar' },
    { symbol: '€', label: 'EUR — Euro' },
    { symbol: '£', label: 'GBP — British Pound' },
    { symbol: '₹', label: 'INR — Indian Rupee' }
  ];

  const DEFAULT_SETTINGS = {
    name: '',
    currency: '৳',
    theme: 'system',      // 'light' | 'dark' | 'system'
    budget: 0,            // overall monthly budget, 0 = not set
    categoryBudgets: {}   // { categoryId: amount }
  };

  let state = load();

  /* ---------- persistence ---------- */

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fresh();
      return normalise(JSON.parse(raw));
    } catch (err) {
      console.warn('Could not read saved data, starting fresh.', err);
      return fresh();
    }
  }

  function fresh() {
    return { transactions: [], settings: { ...DEFAULT_SETTINGS, categoryBudgets: {} } };
  }

  function normalise(data) {
    const settings = { ...DEFAULT_SETTINGS, ...(data && data.settings) };
    settings.budget = toAmount(settings.budget);
    const cb = {};
    Object.entries(settings.categoryBudgets || {}).forEach(([k, v]) => {
      const n = toAmount(v);
      if (n > 0) cb[k] = n;
    });
    settings.categoryBudgets = cb;
    const transactions = Array.isArray(data && data.transactions)
      ? data.transactions.filter(isValidTransaction).map(t => ({
          id: String(t.id || uid()),
          type: t.type,
          amount: round2(Number(t.amount)),
          category: t.category,
          date: t.date,
          note: String(t.note || '').slice(0, 120)
        }))
      : [];
    return { transactions, settings };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.warn('Could not save data.', err);
      return false;
    }
  }

  /* ---------- validation & helpers ---------- */

  function isValidTransaction(t) {
    return t
      && (t.type === 'income' || t.type === 'expense')
      && Number.isFinite(Number(t.amount)) && Number(t.amount) > 0
      && typeof t.category === 'string'
      && /^\d{4}-\d{2}-\d{2}$/.test(t.date);
  }

  function toAmount(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? round2(n) : 0;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function monthKey(date) {
    if (typeof date === 'string') return date.slice(0, 7);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
  }

  function shiftMonth(key, step) {
    const [y, m] = key.split('-').map(Number);
    const d = new Date(y, m - 1 + step, 1);
    return monthKey(d);
  }

  function daysInMonth(key) {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }

  function getCategory(type, id) {
    const list = CATEGORIES[type] || [];
    return list.find(c => c.id === id) || list[list.length - 1];
  }

  /* ---------- transactions ---------- */

  function all() {
    return [...state.transactions].sort((a, b) =>
      b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }

  function inMonth(key) {
    return all().filter(t => t.date.startsWith(key));
  }

  function get(id) {
    return state.transactions.find(t => t.id === id) || null;
  }

  function add(data) {
    const tx = { ...data, id: uid(), amount: round2(Number(data.amount)) };
    state.transactions.push(tx);
    save();
    return tx;
  }

  function update(id, data) {
    const i = state.transactions.findIndex(t => t.id === id);
    if (i === -1) return null;
    state.transactions[i] = { ...state.transactions[i], ...data, id, amount: round2(Number(data.amount)) };
    save();
    return state.transactions[i];
  }

  function remove(id) {
    const before = state.transactions.length;
    state.transactions = state.transactions.filter(t => t.id !== id);
    save();
    return state.transactions.length < before;
  }

  function totals(list) {
    let income = 0, expense = 0;
    list.forEach(t => { if (t.type === 'income') income += t.amount; else expense += t.amount; });
    return { income: round2(income), expense: round2(expense), balance: round2(income - expense) };
  }

  function byCategory(list, type = 'expense') {
    const map = {};
    list.filter(t => t.type === type).forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount; });
    return Object.entries(map)
      .map(([id, value]) => ({ ...getCategory(type, id), value: round2(value) }))
      .sort((a, b) => b.value - a.value);
  }

  /* ---------- settings ---------- */

  function settings() { return state.settings; }

  function setSettings(patch) {
    state.settings = { ...state.settings, ...patch };
    save();
    return state.settings;
  }

  /* ---------- backup / restore ---------- */

  function exportJSON() {
    return JSON.stringify({ app: 'ExpenseTracker', version: 1, exportedAt: new Date().toISOString(), ...state }, null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.transactions)) throw new Error('This file is not an ExpenseTracker backup.');
    state = normalise(parsed);
    save();
    return state.transactions.length;
  }

  function clearAll() {
    const theme = state.settings.theme;
    state = fresh();
    state.settings.theme = theme;
    save();
  }

  /** Fills the last three months with realistic student data. */
  function loadSample() {
    const now = new Date();
    const items = [];
    const plan = [
      // [dayOfMonth, type, category, amount, note]
      [1, 'income', 'allowance', 12000, 'Monthly allowance from home'],
      [3, 'expense', 'bills', 1500, 'Mess / hostel bill'],
      [4, 'expense', 'food', 220, 'Lunch at canteen'],
      [5, 'expense', 'transport', 120, 'Rickshaw to campus'],
      [6, 'expense', 'education', 850, 'Lab manual & photocopies'],
      [8, 'expense', 'food', 340, 'Dinner with friends'],
      [9, 'expense', 'bills', 499, 'Mobile data pack'],
      [10, 'income', 'parttime', 4000, 'Tuition payment'],
      [11, 'expense', 'entertainment', 600, 'Movie night'],
      [13, 'expense', 'transport', 160, 'Bus fare'],
      [14, 'expense', 'food', 180, 'Snacks & tea'],
      [16, 'expense', 'shopping', 1450, 'New t-shirt'],
      [18, 'expense', 'health', 320, 'Pharmacy'],
      [20, 'expense', 'food', 260, 'Biryani'],
      [22, 'expense', 'education', 400, 'Online course'],
      [24, 'expense', 'transport', 140, 'Ride share'],
      [26, 'expense', 'food', 210, 'Lunch'],
      [27, 'expense', 'other', 300, 'Gift for a friend']
    ];
    for (let back = 2; back >= 0; back--) {
      const base = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const key = monthKey(base);
      const lastDay = back === 0 ? now.getDate() : daysInMonth(key);
      plan.forEach(([day, type, category, amount, note], i) => {
        if (day > lastDay) return;
        const wobble = type === 'expense' ? 0.8 + ((i * 7 + back * 13) % 9) / 20 : 1;
        items.push({
          id: uid() + i + back,
          type, category, note,
          amount: round2(Math.round(amount * wobble)),
          date: `${key}-${pad(day)}`
        });
      });
    }
    state.transactions = items;
    if (!state.settings.budget) state.settings.budget = 9000;
    if (!Object.keys(state.settings.categoryBudgets).length) {
      state.settings.categoryBudgets = { food: 2500, transport: 800, entertainment: 800 };
    }
    save();
  }

  return {
    CATEGORIES, CURRENCIES,
    all, inMonth, get, add, update, remove, totals, byCategory,
    settings, setSettings,
    exportJSON, importJSON, clearAll, loadSample,
    todayISO, monthKey, shiftMonth, daysInMonth, getCategory, round2
  };
})();
