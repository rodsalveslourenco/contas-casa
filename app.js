const storageKey = 'contas-casa-v1';
const $ = (selector) => document.querySelector(selector);

const elements = {
  monthInput: $('#monthInput'),
  monthList: $('#monthList'),
  monthTitle: $('#monthTitle'),
  incomeForm: $('#incomeForm'),
  incomeValue: $('#incomeValue'),
  billForm: $('#billForm'),
  expenseForm: $('#expenseForm'),
  billTable: $('#billTable'),
  expenseList: $('#expenseList'),
  incomeMetric: $('#incomeMetric'),
  billTotalMetric: $('#billTotalMetric'),
  paidMetric: $('#paidMetric'),
  leftoverMetric: $('#leftoverMetric'),
  dailyMetric: $('#dailyMetric'),
  differenceMetric: $('#differenceMetric'),
  exportCsvBtn: $('#exportCsvBtn'),
  exportJsonBtn: $('#exportJsonBtn'),
  importJsonInput: $('#importJsonInput'),
  clearMonthBtn: $('#clearMonthBtn'),
  paymentDialog: $('#paymentDialog'),
  paymentForm: $('#paymentForm'),
  paymentInfo: $('#paymentInfo'),
  paymentAmount: $('#paymentAmount'),
  cancelPaymentBtn: $('#cancelPaymentBtn'),
  monthlyChart: $('#monthlyChart'),
  categoryChart: $('#categoryChart'),
  ownerChart: $('#ownerChart'),
};

let state = defaultState();
let activeMonth = state.activeMonth;
let activePaymentBillId = null;
let serverReady = false;
let saveTimer = null;

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function defaultState() {
  return { activeMonth: currentMonthKey(), months: {} };
}

function localBackupState() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || defaultState();
  } catch {
    return defaultState();
  }
}

async function loadServerState() {
  try {
    const response = await fetch('/api/state');
    if (!response.ok) throw new Error('API indisponível.');
    const payload = await response.json();
    state = payload.state?.months ? payload.state : defaultState();
    activeMonth = state.activeMonth || currentMonthKey();
    serverReady = true;
  } catch {
    state = localBackupState();
    activeMonth = state.activeMonth || currentMonthKey();
    serverReady = false;
  }
  getMonth();
  render();
}

function saveState() {
  state.activeMonth = activeMonth;
  localStorage.setItem(storageKey, JSON.stringify(state));

  if (!serverReady) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      const response = await fetch('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
      if (!response.ok) throw new Error('Falha ao salvar no banco.');
    } catch {
      serverReady = false;
    }
  }, 350);
}

function getMonth(monthKey = activeMonth) {
  if (!state.months[monthKey]) {
    state.months[monthKey] = { income: 0, bills: [], expenses: [] };
  }
  return state.months[monthKey];
}

function money(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function totals(month) {
  const billTotal = month.bills.reduce((sum, bill) => sum + Number(bill.amount), 0);
  const paidTotal = month.bills.reduce((sum, bill) => sum + Number(bill.paid || 0), 0);
  const dailyTotal = month.expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  return {
    billTotal,
    paidTotal,
    dailyTotal,
    difference: Number(month.income || 0) - billTotal - dailyTotal,
    leftover: Number(month.income || 0) - paidTotal - dailyTotal,
  };
}

function setValueClass(element, value) {
  element.parentElement.classList.toggle('positive', value >= 0);
  element.parentElement.classList.toggle('negative', value < 0);
}

function render() {
  const month = getMonth();
  const total = totals(month);

  elements.monthInput.value = activeMonth;
  elements.monthTitle.textContent = monthLabel(activeMonth);
  elements.incomeValue.value = month.income || '';
  elements.incomeMetric.textContent = money(month.income);
  elements.billTotalMetric.textContent = money(total.billTotal);
  elements.paidMetric.textContent = money(total.paidTotal);
  elements.leftoverMetric.textContent = money(total.leftover);
  elements.dailyMetric.textContent = money(total.dailyTotal);
  elements.differenceMetric.textContent = money(total.difference);
  setValueClass(elements.leftoverMetric, total.leftover);
  setValueClass(elements.differenceMetric, total.difference);

  renderMonths();
  renderBills(month);
  renderExpenses(month);
  renderCharts();
  saveState();
}

function renderMonths() {
  elements.monthList.innerHTML = '';
  Object.keys(state.months).sort().forEach((monthKey) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = monthLabel(monthKey);
    button.className = monthKey === activeMonth ? 'active' : '';
    button.addEventListener('click', () => {
      activeMonth = monthKey;
      render();
    });
    elements.monthList.append(button);
  });
}

function renderBills(month) {
  elements.billTable.innerHTML = '';

  if (!month.bills.length) {
    elements.billTable.innerHTML = '<tr><td colspan="8">Nenhuma conta cadastrada neste mês.</td></tr>';
    return;
  }

  month.bills
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .forEach((bill) => {
      const missing = Math.max(Number(bill.amount) - Number(bill.paid || 0), 0);
      const row = document.createElement('tr');
      row.innerHTML = `
        <td data-label="Conta">${escapeHtml(bill.name)}</td>
        <td data-label="Vencimento">${formatDate(bill.dueDate)}</td>
        <td data-label="Modalidade">${escapeHtml(bill.category)}</td>
        <td data-label="Pessoa">${escapeHtml(bill.owner)}</td>
        <td data-label="Valor">${money(bill.amount)}</td>
        <td data-label="Abatido" class="${bill.paid >= bill.amount ? 'status-paid' : ''}">${money(bill.paid || 0)}</td>
        <td data-label="Falta" class="${missing > 0 ? 'status-open' : 'status-paid'}">${money(missing)}</td>
        <td data-label="Ação">
          <button class="mini-button" data-action="pay" data-id="${bill.id}" type="button">Abater</button>
          <button class="mini-button danger" data-action="remove-bill" data-id="${bill.id}" type="button">Excluir</button>
        </td>
      `;
      elements.billTable.append(row);
    });
}

function renderExpenses(month) {
  elements.expenseList.innerHTML = '';

  if (!month.expenses.length) {
    elements.expenseList.innerHTML = '<p>Nenhum gasto diário cadastrado neste mês.</p>';
    return;
  }

  month.expenses
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((expense) => {
      const item = document.createElement('div');
      item.className = 'expense-item';
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(expense.description)}</strong>
          <p>${formatDate(expense.date)} • ${escapeHtml(expense.category)}</p>
        </div>
        <div>
          <strong>${money(expense.amount)}</strong>
          <button class="mini-button danger" data-action="remove-expense" data-id="${expense.id}" type="button">Excluir</button>
        </div>
      `;
      elements.expenseList.append(item);
    });
}

function renderCharts() {
  const monthRows = Object.entries(state.months)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, month]) => ({ label: key.slice(5), value: totals(month).difference }));

  drawBarChart(elements.monthlyChart, monthRows, '#147447', '#b42318');
  drawBarChart(elements.categoryChart, groupByCategory(getMonth()), '#2d6fa8', '#2d6fa8');
  drawBarChart(elements.ownerChart, groupByOwner(getMonth()), '#33a06f', '#33a06f');
}

function groupByCategory(month) {
  const grouped = new Map();
  month.bills.forEach((bill) => grouped.set(bill.category, (grouped.get(bill.category) || 0) + Number(bill.amount)));
  month.expenses.forEach((expense) => grouped.set(expense.category, (grouped.get(expense.category) || 0) + Number(expense.amount)));
  return Array.from(grouped, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function groupByOwner(month) {
  const grouped = new Map();
  month.bills.forEach((bill) => grouped.set(bill.owner, (grouped.get(bill.owner) || 0) + Number(bill.amount)));
  return Array.from(grouped, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function drawBarChart(canvas, rows, positiveColor, negativeColor) {
  const ctx = canvas.getContext('2d');
  const width = canvas.clientWidth || 420;
  const height = Number(canvas.getAttribute('height')) || 230;
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);
  ctx.font = '12px Segoe UI, Arial';

  if (!rows.length) {
    ctx.fillStyle = '#6d7c8b';
    ctx.fillText('Sem dados para exibir.', 12, 28);
    return;
  }

  const padding = { top: 18, right: 18, bottom: 42, left: 52 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  const gap = 8;
  const barWidth = Math.max(18, (chartWidth - gap * (rows.length - 1)) / rows.length);
  const zeroY = padding.top + chartHeight / 2;

  ctx.strokeStyle = '#d8e0e8';
  ctx.beginPath();
  ctx.moveTo(padding.left, zeroY);
  ctx.lineTo(width - padding.right, zeroY);
  ctx.stroke();

  rows.forEach((row, index) => {
    const x = padding.left + index * (barWidth + gap);
    const magnitude = Math.min((Math.abs(row.value) / max) * (chartHeight / 2 - 8), chartHeight / 2);
    const y = row.value >= 0 ? zeroY - magnitude : zeroY;
    ctx.fillStyle = row.value >= 0 ? positiveColor : negativeColor;
    ctx.fillRect(x, y, barWidth, Math.max(2, magnitude));
    ctx.fillStyle = '#273746';
    ctx.textAlign = 'center';
    ctx.fillText(row.label.slice(0, 12), x + barWidth / 2, height - 16);
    ctx.fillText(compactMoney(row.value), x + barWidth / 2, y - 5);
  });
  ctx.textAlign = 'left';
}

function compactMoney(value) {
  const number = Number(value) || 0;
  if (Math.abs(number) >= 1000) return `R$ ${(number / 1000).toFixed(1)} mil`;
  return money(number).replace(/\s/g, '');
}

function formatDate(value) {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toCsv() {
  const rows = [['tipo', 'mes', 'descricao', 'vencimento_ou_data', 'modalidade', 'pessoa', 'valor', 'abatido']];
  Object.entries(state.months).forEach(([monthKey, month]) => {
    month.bills.forEach((bill) => rows.push(['conta', monthKey, bill.name, bill.dueDate, bill.category, bill.owner, bill.amount, bill.paid || 0]));
    month.expenses.forEach((expense) => rows.push(['gasto_diario', monthKey, expense.description, expense.date, expense.category, '', expense.amount, '']));
    rows.push(['receita', monthKey, 'Receita total do mês', '', '', '', month.income || 0, '']);
  });
  return rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n');
}

elements.monthInput.addEventListener('change', () => {
  activeMonth = elements.monthInput.value || currentMonthKey();
  getMonth();
  render();
});

elements.incomeForm.addEventListener('submit', (event) => {
  event.preventDefault();
  getMonth().income = Number(elements.incomeValue.value || 0);
  render();
});

elements.billForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  getMonth().bills.push({
    id: uid('bill'),
    name: form.get('name'),
    dueDate: form.get('dueDate'),
    amount: Number(form.get('amount')),
    category: form.get('category'),
    owner: form.get('owner'),
    paid: 0,
  });
  event.currentTarget.reset();
  render();
});

elements.expenseForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  getMonth().expenses.push({
    id: uid('expense'),
    date: form.get('date'),
    description: form.get('description'),
    amount: Number(form.get('amount')),
    category: form.get('category'),
  });
  event.currentTarget.reset();
  render();
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;
  const month = getMonth();

  if (action === 'remove-bill') {
    month.bills = month.bills.filter((bill) => bill.id !== id);
    render();
    return;
  }

  if (action === 'remove-expense') {
    month.expenses = month.expenses.filter((expense) => expense.id !== id);
    render();
    return;
  }

  if (action === 'pay') {
    const bill = month.bills.find((item) => item.id === id);
    if (!bill) return;
    activePaymentBillId = id;
    const missing = Math.max(Number(bill.amount) - Number(bill.paid || 0), 0);
    elements.paymentInfo.textContent = `${bill.name}: falta ${money(missing)} de ${money(bill.amount)}.`;
    elements.paymentAmount.value = missing || '';
    elements.paymentDialog.showModal();
  }
});

elements.paymentForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const bill = getMonth().bills.find((item) => item.id === activePaymentBillId);
  if (!bill) return;
  bill.paid = Math.min(Number(bill.amount), Number(bill.paid || 0) + Number(elements.paymentAmount.value || 0));
  activePaymentBillId = null;
  elements.paymentDialog.close();
  render();
});

elements.cancelPaymentBtn.addEventListener('click', () => {
  activePaymentBillId = null;
  elements.paymentDialog.close();
});

elements.exportCsvBtn.addEventListener('click', () => download(`contas-casa-${activeMonth}.csv`, toCsv(), 'text/csv;charset=utf-8'));
elements.exportJsonBtn.addEventListener('click', () => download('contas-casa-backup.json', JSON.stringify(state, null, 2), 'application/json;charset=utf-8'));

elements.importJsonInput.addEventListener('change', async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  const imported = JSON.parse(await file.text());
  if (!imported.months) {
    alert('Arquivo inválido.');
    return;
  }
  state = imported;
  activeMonth = imported.activeMonth || Object.keys(imported.months)[0] || currentMonthKey();
  render();
});

elements.clearMonthBtn.addEventListener('click', () => {
  if (!confirm(`Limpar todos os dados de ${monthLabel(activeMonth)}?`)) return;
  delete state.months[activeMonth];
  getMonth();
  render();
});

window.addEventListener('resize', renderCharts);

getMonth();
render();
void loadServerState();
