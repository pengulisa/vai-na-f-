/**
 * BillFlow - Core Application Logic
 */

// Initial Data (Clean State)
const DEFAULT_BILLS = [];
const DEFAULT_RECEIVABLES = [];
const DEFAULT_CATEGORIES = [
  { id: 'cat-1', name: 'Energia', icon: '💡' },
  { id: 'cat-2', name: 'Água', icon: '🚰' },
  { id: 'cat-3', name: 'Internet', icon: '🌐' },
  { id: 'cat-4', name: 'Celular', icon: '📱' },
  { id: 'cat-5', name: 'Gás', icon: '🔥' },
  { id: 'cat-6', name: 'Cartão de Crédito', icon: '💳' },
  { id: 'cat-7', name: 'Outros', icon: '📌' }
];

// App State
class AppState {
  constructor() {
    this.bills = JSON.parse(localStorage.getItem('bf_bills')) || [];
    this.receivables = JSON.parse(localStorage.getItem('bf_receivables')) || [];
    this.categories = JSON.parse(localStorage.getItem('bf_categories')) || DEFAULT_CATEGORIES;
    this.theme = localStorage.getItem('bf_theme') || 'dark';
    this.currency = localStorage.getItem('bf_currency') || 'BRL';
    this.currentCalendarDate = new Date();
    this.chartCategoryInstance = null;
    this.chartCompareInstance = null;
    this.chartDashDoughnutInstance = null;
  }

  saveBills() {
    localStorage.setItem('bf_bills', JSON.stringify(this.bills));
  }

  saveReceivables() {
    localStorage.setItem('bf_receivables', JSON.stringify(this.receivables));
  }

  saveCategories() {
    localStorage.setItem('bf_categories', JSON.stringify(this.categories));
  }

  saveTheme() {
    localStorage.setItem('bf_theme', this.theme);
  }
}

const state = new AppState();

// Helper Utilities
function formatCurrency(amount) {
  const symbolMap = { BRL: 'R$', USD: '$', EUR: '€' };
  const symbol = symbolMap[state.currency] || 'R$';
  const val = Number(amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${symbol} ${val}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

function getCategoryIcon(catName) {
  const found = state.categories.find(c => c.name.toLowerCase() === (catName || '').toLowerCase());
  return found ? (found.icon || '📌') : '📌';
}

function getInstallmentBadgeHTML(current, total) {
  const curr = parseInt(current) || 1;
  const tot = parseInt(total) || 1;
  if (tot <= 1) return '';

  const remaining = tot - curr;
  if (remaining > 0) {
    return `<div style="margin-top: 0.25rem;"><span class="badge badge-pending" title="${remaining} parcela(s) restante(s)"><i class="fa-solid fa-layer-group"></i> ${curr}/${tot} (Faltam ${remaining})</span></div>`;
  } else {
    return `<div style="margin-top: 0.25rem;"><span class="badge badge-paid" title="Última parcela"><i class="fa-solid fa-flag-checkered"></i> ${curr}/${tot} (Última)</span></div>`;
  }
}

function updateCategoryUI() {
  const selectBillCategory = document.getElementById('billCategory');
  if (selectBillCategory) {
    const currentVal = selectBillCategory.value;
    selectBillCategory.innerHTML = state.categories.map(c => 
      `<option value="${c.name}">${c.icon || ''} ${c.name}</option>`
    ).join('');
    if (currentVal && state.categories.some(c => c.name === currentVal)) {
      selectBillCategory.value = currentVal;
    }
  }

  ['billCategoryFilter', 'paidBillCategoryFilter'].forEach(filterId => {
    const filterSelect = document.getElementById(filterId);
    if (filterSelect) {
      const currentVal = filterSelect.value || 'ALL';
      filterSelect.innerHTML = `<option value="ALL">Todas as Categorias</option>` +
        state.categories.map(c => `<option value="${c.name}">${c.icon || ''} ${c.name}</option>`).join('');
      if (currentVal === 'ALL' || state.categories.some(c => c.name === currentVal)) {
        filterSelect.value = currentVal;
      } else {
        filterSelect.value = 'ALL';
      }
    }
  });

  renderCategoriesManager();
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNavigation();
  initModals();
  initForms();
  initSettings();
  initGlobalSearch();

  // Initial render
  updateCategoryUI();
  updateDashboard();
  renderCalendar();
  renderBillsTable();
  renderPaidBillsTable();
  renderReceivablesTable();
  renderReports();

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW error:', err));
  }
});

/* Theme Setup */
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcon();

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
    state.saveTheme();
    updateThemeIcon();
  });
}

function updateThemeIcon() {
  const icon = document.querySelector('#themeToggleBtn i');
  if (state.theme === 'dark') {
    icon.className = 'fa-solid fa-sun';
  } else {
    icon.className = 'fa-solid fa-moon';
  }
}

/* Navigation Routing */
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const pageTitle = document.getElementById('pageTitle');

  const titleMap = {
    dashboard: 'Dashboard',
    calendar: 'Calendário Financeiro',
    bills: 'Contas a Pagar',
    'paid-bills': 'Contas Pagas',
    receivables: 'Valores a Receber',
    reports: 'Relatórios & Gráficos',
    search: 'Pesquisa Global',
    cadastros: 'Cadastros (Categorias)',
    settings: 'Configurações'
  };

  const switchView = (targetView) => {
    navItems.forEach(nav => {
      if (nav.getAttribute('data-view') === targetView) {
        nav.classList.add('active');
      } else {
        nav.classList.remove('active');
      }
    });

    mobileNavItems.forEach(mobileNav => {
      if (mobileNav.getAttribute('data-view') === targetView) {
        mobileNav.classList.add('active');
      } else {
        mobileNav.classList.remove('active');
      }
    });

    viewSections.forEach(sec => {
      sec.classList.remove('active');
      if (sec.id === `view-${targetView}`) {
        sec.classList.add('active');
      }
    });

    pageTitle.textContent = titleMap[targetView] || 'BillFlow';

    if (targetView === 'reports') {
      renderReports();
    } else if (targetView === 'calendar') {
      renderCalendar();
    } else if (targetView === 'paid-bills') {
      renderPaidBillsTable();
    } else if (targetView === 'cadastros') {
      renderCategoriesManager();
    }
  };

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.getAttribute('data-view');
      switchView(targetView);
    });
  });

  mobileNavItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetView = item.getAttribute('data-view');
      if (targetView) {
        switchView(targetView);
      }
    });
  });

  document.getElementById('btnOpenMobileMenu')?.addEventListener('click', () => {
    openModal('modalMobileMenu');
  });

  document.querySelectorAll('.mobile-menu-card').forEach(card => {
    card.addEventListener('click', () => {
      const targetView = card.getAttribute('data-view');
      closeModal('modalMobileMenu');
      if (targetView) {
        switchView(targetView);
      }
    });
  });

  document.getElementById('btnGoToBills')?.addEventListener('click', () => {
    document.querySelector('.nav-item[data-view="bills"]')?.click();
  });
}

/* Dashboard Rendering */
function updateDashboard() {
  const bills = state.bills;
  const receivables = state.receivables;

  // Compute 11 indicators
  const totalContas = bills.length;
  const contasPagas = bills.filter(b => b.status === 'Pago').length;
  const contasPendentes = bills.filter(b => b.status === 'Pendente').length;
  const contasVencidas = bills.filter(b => b.status === 'Vencido').length;

  const valorAPagar = bills
    .filter(b => b.status === 'Pendente' || b.status === 'Vencido')
    .reduce((acc, b) => acc + Number(b.amount), 0);

  const valorPago = bills
    .filter(b => b.status === 'Pago')
    .reduce((acc, b) => acc + Number(b.amount), 0);

  const valorAReceber = receivables
    .filter(r => r.status === 'A receber' || r.status === 'Atrasado')
    .reduce((acc, r) => acc + Number(r.amount), 0);

  const valorRecebido = receivables
    .filter(r => r.status === 'Recebido')
    .reduce((acc, r) => acc + Number(r.amount), 0);

  const dividasPendentes = new Set(
    receivables
      .filter(r => r.status === 'A receber' || r.status === 'Atrasado')
      .map(r => r.person.toLowerCase().trim())
  ).size;

  // Next bill to expire
  const todayStr = new Date().toISOString().split('T')[0];
  const pendingBills = bills
    .filter(b => b.status === 'Pendente' && b.dueDate >= todayStr)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const nextBill = pendingBills[0] || bills.find(b => b.status === 'Pendente');

  // DOM Updates
  document.getElementById('kpiTotalContas').textContent = totalContas;
  document.getElementById('kpiContasPagas').textContent = contasPagas;
  document.getElementById('kpiContasPendentes').textContent = contasPendentes;
  document.getElementById('kpiContasVencidas').textContent = contasVencidas;

  document.getElementById('kpiValorAPagar').textContent = formatCurrency(valorAPagar);
  document.getElementById('kpiValorPago').textContent = formatCurrency(valorPago);
  document.getElementById('kpiValorAReceber').textContent = formatCurrency(valorAReceber);
  document.getElementById('kpiValorRecebido').textContent = formatCurrency(valorRecebido);
  document.getElementById('kpiDividasPendentes').textContent = dividasPendentes;

  // Banner logic
  if (nextBill) {
    const dueDate = new Date(nextBill.dueDate);
    const today = new Date();
    today.setHours(0,0,0,0);
    dueDate.setHours(0,0,0,0);

    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    let dayText = diffDays === 0 ? 'vence HOJE!' : diffDays < 0 ? `vencida há ${Math.abs(diffDays)} dias!` : `restam ${diffDays} dias para o vencimento.`;

    document.getElementById('bannerTitle').textContent = `Próximo Vencimento: ${nextBill.name} (${formatCurrency(nextBill.amount)})`;
    document.getElementById('bannerSub').textContent = `Vence em ${formatDate(nextBill.dueDate)} - ${dayText}`;
    
    const btnBanner = document.getElementById('btnBannerAction');
    btnBanner.onclick = () => {
      markBillPaid(nextBill.id);
    };
  } else {
    document.getElementById('bannerTitle').textContent = 'Nenhuma conta pendente próxima!';
    document.getElementById('bannerSub').textContent = 'Parabéns! Suas contas estão em dia.';
    document.getElementById('btnBannerAction').style.display = 'none';
  }

  // Dashboard Table Render (Top 5 upcoming non-paid bills)
  const sortedUpcoming = bills
    .filter(b => b.status !== 'Pago' && b.status !== 'Cancelado')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  const tbody = document.getElementById('dashUpcomingTableBody');
  if (sortedUpcoming.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 1.5rem; color: var(--text-muted);">Nenhum vencimento pendente no momento.</td></tr>`;
  } else {
    tbody.innerHTML = sortedUpcoming.map(b => `
      <tr>
        <td>
          <strong>${b.name}</strong>
          ${getInstallmentBadgeHTML(b.installmentCurrent, b.installmentTotal)}
        </td>
        <td><span class="category-pill">${getCategoryIcon(b.category)} ${b.category}</span></td>
        <td>${formatDate(b.dueDate)}</td>
        <td><strong>${formatCurrency(b.amount)}</strong></td>
        <td><span class="badge badge-${getStatusBadgeClass(b.status)}">${b.status}</span></td>
        <td>
          <button class="btn btn-success btn-sm" onclick="markBillPaid('${b.id}')"><i class="fa-solid fa-check"></i> Pagar</button>
        </td>
      </tr>
    `).join('');
  }

  // Dashboard Chart Render
  renderDashChart(valorPago, valorAPagar, valorAReceber);
}

function getStatusBadgeClass(status) {
  switch(status) {
    case 'Pago':
    case 'Recebido': return 'paid';
    case 'Pendente':
    case 'A receber': return 'pending';
    case 'Vencido':
    case 'Atrasado': return 'overdue';
    default: return 'canceled';
  }
}

function renderDashChart(pago, aPagar, aReceber) {
  const ctx = document.getElementById('dashDoughnutChart')?.getContext('2d');
  if (!ctx) return;

  if (state.chartDashDoughnutInstance) {
    state.chartDashDoughnutInstance.destroy();
  }

  state.chartDashDoughnutInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Pago', 'A Pagar', 'A Receber'],
      datasets: [{
        data: [pago, aPagar, aReceber],
        backgroundColor: ['#10b981', '#f59e0b', '#06b6d4'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: state.theme === 'dark' ? '#f8fafc' : '#0f172a' } }
      }
    }
  });
}

/* Calendar Logic */
function renderCalendar() {
  const calendarGrid = document.getElementById('calendarGrid');
  const calendarLabel = document.getElementById('calendarMonthLabel');
  if (!calendarGrid || !calendarLabel) return;

  const year = state.currentCalendarDate.getFullYear();
  const month = state.currentCalendarDate.getMonth();

  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  calendarLabel.textContent = `${monthNames[month]} ${year}`;

  calendarGrid.innerHTML = '';

  // Day Headers
  const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  daysOfWeek.forEach(d => {
    const head = document.createElement('div');
    head.className = 'calendar-day-head';
    head.textContent = d;
    calendarGrid.appendChild(head);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevDaysInMonth = new Date(year, month, 0).getDate();

  // Previous month trailing days
  for (let i = firstDay - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.className = 'calendar-day-cell other-month';
    cell.innerHTML = `<span class="day-number">${prevDaysInMonth - i}</span>`;
    calendarGrid.appendChild(cell);
  }

  // Current month days
  const today = new Date();
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    const isToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
    cell.className = `calendar-day-cell ${isToday ? 'today' : ''}`;

    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    let cellContent = `<span class="day-number">${day}</span>`;

    // Bills on this day
    const dayBills = state.bills.filter(b => b.dueDate === dateStr);
    dayBills.forEach(b => {
      const badgeClass = getStatusBadgeClass(b.status);
      cellContent += `
        <div class="calendar-event badge-${badgeClass}" title="${b.name} - ${formatCurrency(b.amount)}">
          ${getCategoryIcon(b.category)} ${b.name.substring(0, 10)}.. (${formatCurrency(b.amount)})
        </div>
      `;
    });

    // Receivables on this day
    const dayReceivables = state.receivables.filter(r => r.expectedDate === dateStr);
    dayReceivables.forEach(r => {
      cellContent += `
        <div class="calendar-event badge-receivable" title="Receber de ${r.person}">
          💰 de ${r.person.substring(0, 8)} (${formatCurrency(r.amount)})
        </div>
      `;
    });

    cell.innerHTML = cellContent;
    calendarGrid.appendChild(cell);
  }
}

// Calendar Navigation
document.getElementById('btnPrevMonth')?.addEventListener('click', () => {
  state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() - 1);
  renderCalendar();
});
document.getElementById('btnNextMonth')?.addEventListener('click', () => {
  state.currentCalendarDate.setMonth(state.currentCalendarDate.getMonth() + 1);
  renderCalendar();
});
document.getElementById('btnTodayMonth')?.addEventListener('click', () => {
  state.currentCalendarDate = new Date();
  renderCalendar();
});

/* Bills Table Rendering & CRUD */
function renderBillsTable() {
  const tbody = document.getElementById('billsTableBody');
  if (!tbody) return;

  const searchQuery = (document.getElementById('billSearchInput')?.value || '').toLowerCase();
  const categoryFilter = document.getElementById('billCategoryFilter')?.value || 'ALL';
  const statusFilter = document.getElementById('billStatusFilter')?.value || 'ALL';

  const filtered = state.bills.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchQuery) || (b.company || '').toLowerCase().includes(searchQuery);
    const matchesCategory = categoryFilter === 'ALL' || b.category === categoryFilter;
    const matchesStatus = statusFilter === 'ALL' ? b.status !== 'Pago' : b.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhuma conta encontrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td>
        <strong>${b.name}</strong>
        ${b.company ? `<div style="font-size: 0.775rem; color: var(--text-muted);">${b.company}</div>` : ''}
      </td>
      <td><span class="category-pill">${getCategoryIcon(b.category)} ${b.category}</span></td>
      <td><strong>${formatCurrency(b.amount)}</strong></td>
      <td>${formatDate(b.dueDate)}</td>
      <td>
        <div>${b.recurrence || 'Nenhuma'}</div>
        ${getInstallmentBadgeHTML(b.installmentCurrent, b.installmentTotal)}
      </td>
      <td><span class="badge badge-${getStatusBadgeClass(b.status)}">${b.status}</span></td>
      <td>
        <div style="display:flex; gap: 0.35rem;">
          ${b.status !== 'Pago' ? `<button class="btn btn-success btn-sm btn-icon-only" title="Pagar" onclick="markBillPaid('${b.id}')"><i class="fa-solid fa-check"></i></button>` : ''}
          <button class="btn btn-secondary btn-sm btn-icon-only" title="Editar" onclick="editBill('${b.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm btn-icon-only" title="Excluir" onclick="deleteBill('${b.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

/* Contas Pagas View Rendering */
function renderPaidBillsTable() {
  const tbody = document.getElementById('paidBillsTableBody');
  const countEl = document.getElementById('kpiPaidBillsCount');
  const totalEl = document.getElementById('kpiPaidBillsTotal');
  if (!tbody) return;

  const searchQuery = (document.getElementById('paidBillSearchInput')?.value || '').toLowerCase();
  const categoryFilter = document.getElementById('paidBillCategoryFilter')?.value || 'ALL';

  const paidBills = state.bills.filter(b => b.status === 'Pago');

  // KPI updates
  if (countEl) countEl.textContent = paidBills.length;
  if (totalEl) {
    const totalVal = paidBills.reduce((acc, b) => acc + Number(b.amount), 0);
    totalEl.textContent = formatCurrency(totalVal);
  }

  const filtered = paidBills.filter(b => {
    const matchesSearch = b.name.toLowerCase().includes(searchQuery) || (b.company || '').toLowerCase().includes(searchQuery);
    const matchesCategory = categoryFilter === 'ALL' || b.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhuma conta paga encontrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td>
        <strong>${b.name}</strong>
        ${b.company ? `<div style="font-size: 0.775rem; color: var(--text-muted);">${b.company}</div>` : ''}
        ${getInstallmentBadgeHTML(b.installmentCurrent, b.installmentTotal)}
      </td>
      <td><span class="category-pill">${getCategoryIcon(b.category)} ${b.category}</span></td>
      <td><strong style="color: var(--status-paid);">${formatCurrency(b.amount)}</strong></td>
      <td>${formatDate(b.dueDate)}</td>
      <td><strong style="color: var(--status-paid);">${formatDate(b.paidDate)}</strong></td>
      <td>${b.paymentMethod || 'PIX'}</td>
      <td><span class="badge badge-paid">Pago</span></td>
      <td>
        <div style="display:flex; gap: 0.35rem;">
          <button class="btn btn-secondary btn-sm" title="Reverter Pagamento" onclick="unmarkBillPaid('${b.id}')">
            <i class="fa-solid fa-rotate-left"></i> Reverter
          </button>
          <button class="btn btn-danger btn-sm btn-icon-only" title="Excluir" onclick="deleteBill('${b.id}')">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Global actions
window.markBillPaid = function(id) {
  const bill = state.bills.find(b => b.id === id);
  if (bill) {
    bill.status = 'Pago';
    bill.paidDate = new Date().toISOString().split('T')[0];
    state.saveBills();
    updateDashboard();
    renderBillsTable();
    renderPaidBillsTable();
    renderCalendar();
    showToast(`Conta "${bill.name}" marcada como PAGA!`);
  }
};

window.unmarkBillPaid = function(id) {
  const bill = state.bills.find(b => b.id === id);
  if (bill) {
    bill.status = 'Pendente';
    bill.paidDate = null;
    state.saveBills();
    updateDashboard();
    renderBillsTable();
    renderPaidBillsTable();
    renderCalendar();
    showToast(`Pagamento da conta "${bill.name}" foi revertido.`);
  }
};

window.deleteBill = function(id) {
  if (confirm('Tem certeza que deseja excluir esta conta?')) {
    state.bills = state.bills.filter(b => b.id !== id);
    state.saveBills();
    updateCategoryUI();
    updateDashboard();
    renderBillsTable();
    renderPaidBillsTable();
    renderCalendar();
    showToast('Conta excluída com sucesso.', 'error');
  }
};

window.editBill = function(id) {
  const bill = state.bills.find(b => b.id === id);
  if (!bill) return;

  document.getElementById('billId').value = bill.id;
  document.getElementById('billName').value = bill.name;
  document.getElementById('billCategory').value = bill.category;
  document.getElementById('billCompany').value = bill.company || '';
  document.getElementById('billAmount').value = bill.amount;
  document.getElementById('billDueDate').value = bill.dueDate;
  document.getElementById('billPaidDate').value = bill.paidDate || '';
  document.getElementById('billPaymentMethod').value = bill.paymentMethod || 'PIX';
  document.getElementById('billRecurrence').value = bill.recurrence || 'Nenhuma';
  document.getElementById('billInstallmentCurrent').value = bill.installmentCurrent || '1';
  document.getElementById('billInstallmentTotal').value = bill.installmentTotal || '1';
  document.getElementById('billStatus').value = bill.status;
  document.getElementById('billNotes').value = bill.notes || '';

  document.getElementById('modalBillTitle').textContent = 'Editar Conta';
  openModal('modalBill');
};

/* Receivables Table & Actions */
function renderReceivablesTable() {
  const tbody = document.getElementById('receivablesTableBody');
  if (!tbody) return;

  const searchQuery = (document.getElementById('receivableSearchInput')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('receivableStatusFilter')?.value || 'ALL';

  const filtered = state.receivables.filter(r => {
    const matchesSearch = r.person.toLowerCase().includes(searchQuery) || (r.description || '').toLowerCase().includes(searchQuery);
    const matchesStatus = statusFilter === 'ALL' ? r.status !== 'Recebido' : r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhum valor a receber encontrado.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><strong>${r.person}</strong></td>
      <td>
        <div>${r.description || '-'}</div>
        ${getInstallmentBadgeHTML(r.installmentCurrent, r.installmentTotal)}
      </td>
      <td><strong style="color: var(--status-paid);">${formatCurrency(r.amount)}</strong></td>
      <td>${formatDate(r.expectedDate)}</td>
      <td>${formatDate(r.receivedDate)}</td>
      <td>${r.paymentMethod || 'PIX'}</td>
      <td><span class="badge badge-${getStatusBadgeClass(r.status)}">${r.status}</span></td>
      <td>
        <div style="display:flex; gap: 0.35rem;">
          ${r.status !== 'Recebido' ? `<button class="btn btn-success btn-sm btn-icon-only" title="Marcar Recebido" onclick="markReceivableReceived('${r.id}')"><i class="fa-solid fa-hand-holding-dollar"></i></button>` : ''}
          <button class="btn btn-secondary btn-sm btn-icon-only" title="Editar" onclick="editReceivable('${r.id}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-danger btn-sm btn-icon-only" title="Excluir" onclick="deleteReceivable('${r.id}')"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.markReceivableReceived = function(id) {
  const rec = state.receivables.find(r => r.id === id);
  if (rec) {
    rec.status = 'Recebido';
    rec.receivedDate = new Date().toISOString().split('T')[0];
    state.saveReceivables();
    updateDashboard();
    renderReceivablesTable();
    renderCalendar();
    showToast(`Valor de ${rec.person} marcado como RECEBIDO!`);
  }
};

window.deleteReceivable = function(id) {
  if (confirm('Tem certeza que deseja excluir este recebimento?')) {
    state.receivables = state.receivables.filter(r => r.id !== id);
    state.saveReceivables();
    updateDashboard();
    renderReceivablesTable();
    renderCalendar();
    showToast('Registro excluído.', 'error');
  }
};

window.editReceivable = function(id) {
  const rec = state.receivables.find(r => r.id === id);
  if (!rec) return;

  document.getElementById('recId').value = rec.id;
  document.getElementById('recPerson').value = rec.person;
  document.getElementById('recAmount').value = rec.amount;
  document.getElementById('recDescription').value = rec.description || '';
  document.getElementById('recExpectedDate').value = rec.expectedDate;
  document.getElementById('recReceivedDate').value = rec.receivedDate || '';
  document.getElementById('recPaymentMethod').value = rec.paymentMethod || 'PIX';
  document.getElementById('recInstallmentCurrent').value = rec.installmentCurrent || '1';
  document.getElementById('recInstallmentTotal').value = rec.installmentTotal || '1';
  document.getElementById('recStatus').value = rec.status;
  document.getElementById('recNotes').value = rec.notes || '';

  document.getElementById('modalReceivableTitle').textContent = 'Editar Valor a Receber';
  openModal('modalReceivable');
};

/* Reports */
function renderReports() {
  const catCtx = document.getElementById('chartCategory')?.getContext('2d');
  const cmpCtx = document.getElementById('chartCompare')?.getContext('2d');
  if (!catCtx || !cmpCtx) return;

  // Categories aggregation
  const catTotals = {};
  state.bills.forEach(b => {
    catTotals[b.category] = (catTotals[b.category] || 0) + Number(b.amount);
  });

  if (state.chartCategoryInstance) state.chartCategoryInstance.destroy();
  state.chartCategoryInstance = new Chart(catCtx, {
    type: 'pie',
    data: {
      labels: Object.keys(catTotals),
      datasets: [{
        data: Object.values(catTotals),
        backgroundColor: ['#6366f1', '#10b981', '#06b6d4', '#ec4899', '#f59e0b', '#a855f7', '#64748b']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: state.theme === 'dark' ? '#f8fafc' : '#0f172a' } }
      }
    }
  });

  // Comparison Bar Chart
  const totalContas = state.bills.reduce((a, b) => a + Number(b.amount), 0);
  const totalReceber = state.receivables.reduce((a, r) => a + Number(r.amount), 0);

  if (state.chartCompareInstance) state.chartCompareInstance.destroy();
  state.chartCompareInstance = new Chart(cmpCtx, {
    type: 'bar',
    data: {
      labels: ['Total Contas a Pagar', 'Total Valores a Receber'],
      datasets: [{
        label: 'Valor Total',
        data: [totalContas, totalReceber],
        backgroundColor: ['#ef4444', '#10b981']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { ticks: { color: state.theme === 'dark' ? '#f8fafc' : '#0f172a' } },
        x: { ticks: { color: state.theme === 'dark' ? '#f8fafc' : '#0f172a' } }
      }
    }
  });
}

/* Cadastros / Category Manager */
function renderCategoriesManager() {
  const tbody = document.getElementById('categoriesTableBody');
  if (!tbody) return;

  const searchQuery = (document.getElementById('categorySearchInput')?.value || '').toLowerCase();
  
  const filtered = state.categories.filter(c => c.name.toLowerCase().includes(searchQuery));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 2rem; color: var(--text-muted);">Nenhuma categoria encontrada.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const count = state.bills.filter(b => b.category === c.name).length;
    return `
      <tr>
        <td><span style="font-size: 1.25rem;">${c.icon || '📌'}</span></td>
        <td><strong>${c.name}</strong></td>
        <td><span class="badge badge-pending">${count} conta(s)</span></td>
        <td>
          <div style="display:flex; gap: 0.35rem;">
            <button class="btn btn-secondary btn-sm btn-icon-only" title="Editar" onclick="editCategory('${c.id}')"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-danger btn-sm btn-icon-only" title="Excluir" onclick="deleteCategory('${c.id}')"><i class="fa-solid fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

window.editCategory = function(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;

  document.getElementById('categoryId').value = cat.id;
  document.getElementById('categoryName').value = cat.name;
  document.getElementById('categoryIcon').value = cat.icon || '';
  document.getElementById('modalCategoryTitle').textContent = 'Editar Categoria';
  openModal('modalCategory');
};

window.deleteCategory = function(id) {
  const cat = state.categories.find(c => c.id === id);
  if (!cat) return;

  const count = state.bills.filter(b => b.category === cat.name).length;
  if (count > 0) {
    if (!confirm(`A categoria "${cat.name}" possui ${count} conta(s) vinculada(s). Deseja excluí-la mesmo assim?`)) {
      return;
    }
  } else if (!confirm(`Tem certeza que deseja excluir a categoria "${cat.name}"?`)) {
    return;
  }

  state.categories = state.categories.filter(c => c.id !== id);
  state.saveCategories();
  updateCategoryUI();
  showToast('Categoria excluída.', 'error');
};

function resetCategoryForm() {
  document.getElementById('formCategory').reset();
  document.getElementById('categoryId').value = '';
  document.getElementById('modalCategoryTitle').textContent = 'Nova Categoria';
}

/* Modals & Forms */
function initModals() {
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close-modal');
      closeModal(modalId);
    });
  });

  document.getElementById('btnQuickBill')?.addEventListener('click', () => {
    resetBillForm();
    openModal('modalBill');
  });

  document.getElementById('btnOpenNewBillModal')?.addEventListener('click', () => {
    resetBillForm();
    openModal('modalBill');
  });

  document.getElementById('btnQuickReceivable')?.addEventListener('click', () => {
    resetReceivableForm();
    openModal('modalReceivable');
  });

  document.getElementById('btnOpenNewReceivableModal')?.addEventListener('click', () => {
    resetReceivableForm();
    openModal('modalReceivable');
  });

  document.getElementById('btnOpenNewCategoryModal')?.addEventListener('click', () => {
    resetCategoryForm();
    openModal('modalCategory');
  });
}

function openModal(id) {
  document.getElementById(id)?.classList.add('active');
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('active');
}

function resetBillForm() {
  document.getElementById('formBill').reset();
  document.getElementById('billId').value = '';
  document.getElementById('billInstallmentCurrent').value = '1';
  document.getElementById('billInstallmentTotal').value = '1';
  document.getElementById('modalBillTitle').textContent = 'Cadastrar Conta';
}

function resetReceivableForm() {
  document.getElementById('formReceivable').reset();
  document.getElementById('recId').value = '';
  document.getElementById('recInstallmentCurrent').value = '1';
  document.getElementById('recInstallmentTotal').value = '1';
  document.getElementById('modalReceivableTitle').textContent = 'Registrar Valor a Receber';
}

function initForms() {
  // Bill Submit
  document.getElementById('formBill')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('billId').value || `b-${Date.now()}`;
    const billObj = {
      id,
      name: document.getElementById('billName').value,
      category: document.getElementById('billCategory').value,
      company: document.getElementById('billCompany').value,
      amount: parseFloat(document.getElementById('billAmount').value),
      dueDate: document.getElementById('billDueDate').value,
      paidDate: document.getElementById('billPaidDate').value || null,
      paymentMethod: document.getElementById('billPaymentMethod').value,
      recurrence: document.getElementById('billRecurrence').value,
      installmentCurrent: parseInt(document.getElementById('billInstallmentCurrent').value) || 1,
      installmentTotal: parseInt(document.getElementById('billInstallmentTotal').value) || 1,
      status: document.getElementById('billStatus').value,
      notes: document.getElementById('billNotes').value
    };

    const existingIndex = state.bills.findIndex(b => b.id === id);
    if (existingIndex >= 0) {
      state.bills[existingIndex] = billObj;
      showToast('Conta atualizada com sucesso!');
    } else {
      state.bills.push(billObj);
      showToast('Nova conta cadastrada!');
    }

    state.saveBills();
    updateCategoryUI();
    closeModal('modalBill');
    updateDashboard();
    renderBillsTable();
    renderCalendar();
  });

  // Receivable Submit
  document.getElementById('formReceivable')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('recId').value || `r-${Date.now()}`;
    const recObj = {
      id,
      person: document.getElementById('recPerson').value,
      amount: parseFloat(document.getElementById('recAmount').value),
      description: document.getElementById('recDescription').value,
      expectedDate: document.getElementById('recExpectedDate').value,
      receivedDate: document.getElementById('recReceivedDate').value || null,
      paymentMethod: document.getElementById('recPaymentMethod').value,
      installmentCurrent: parseInt(document.getElementById('recInstallmentCurrent').value) || 1,
      installmentTotal: parseInt(document.getElementById('recInstallmentTotal').value) || 1,
      status: document.getElementById('recStatus').value,
      notes: document.getElementById('recNotes').value
    };

    const existingIndex = state.receivables.findIndex(r => r.id === id);
    if (existingIndex >= 0) {
      state.receivables[existingIndex] = recObj;
      showToast('Recebimento atualizado!');
    } else {
      state.receivables.push(recObj);
      showToast('Valor a receber cadastrado!');
    }

    state.saveReceivables();
    closeModal('modalReceivable');
    updateDashboard();
    renderReceivablesTable();
    renderCalendar();
  });

  // Category Submit
  document.getElementById('formCategory')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('categoryId').value || `cat-${Date.now()}`;
    const name = document.getElementById('categoryName').value.trim();
    const icon = document.getElementById('categoryIcon').value.trim() || '📌';

    if (!name) return;

    const existingIndex = state.categories.findIndex(c => c.id === id);
    if (existingIndex >= 0) {
      state.categories[existingIndex] = { id, name, icon };
      showToast('Categoria atualizada!');
    } else {
      state.categories.push({ id, name, icon });
      showToast('Nova categoria adicionada!');
    }

    state.saveCategories();
    closeModal('modalCategory');
    updateCategoryUI();
  });

  // Table filter triggers
  document.getElementById('billSearchInput')?.addEventListener('input', renderBillsTable);
  document.getElementById('billCategoryFilter')?.addEventListener('change', renderBillsTable);
  document.getElementById('billStatusFilter')?.addEventListener('change', renderBillsTable);

  document.getElementById('paidBillSearchInput')?.addEventListener('input', renderPaidBillsTable);
  document.getElementById('paidBillCategoryFilter')?.addEventListener('change', renderPaidBillsTable);

  document.getElementById('receivableSearchInput')?.addEventListener('input', renderReceivablesTable);
  document.getElementById('receivableStatusFilter')?.addEventListener('change', renderReceivablesTable);

  document.getElementById('categorySearchInput')?.addEventListener('input', renderCategoriesManager);
}

/* Global Search View Logic */
function initGlobalSearch() {
  const input = document.getElementById('advSearchQuery');
  const typeSelect = document.getElementById('advSearchType');
  const headerSearch = document.getElementById('quickSearchInput');

  const performSearch = () => {
    const q = (input?.value || headerSearch?.value || '').toLowerCase().trim();
    const type = typeSelect?.value || 'ALL';
    const tbody = document.getElementById('searchResultsTableBody');
    if (!tbody) return;

    if (!q) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">Digite um termo para buscar em todas as contas e valores a receber.</td></tr>`;
      return;
    }

    let results = [];

    if (type === 'ALL' || type === 'BILL') {
      state.bills.forEach(b => {
        if (b.name.toLowerCase().includes(q) || b.category.toLowerCase().includes(q) || (b.company||'').toLowerCase().includes(q)) {
          results.push({ type: 'Conta a Pagar', name: b.name, amount: b.amount, date: b.dueDate, status: b.status });
        }
      });
    }

    if (type === 'ALL' || type === 'RECEIVABLE') {
      state.receivables.forEach(r => {
        if (r.person.toLowerCase().includes(q) || (r.description||'').toLowerCase().includes(q)) {
          results.push({ type: 'Valor a Receber', name: `De ${r.person} (${r.description||''})`, amount: r.amount, date: r.expectedDate, status: r.status });
        }
      });
    }

    if (results.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:2rem; color:var(--text-muted);">Nenhum registro encontrado para "${q}".</td></tr>`;
      return;
    }

    tbody.innerHTML = results.map(res => `
      <tr>
        <td><span class="badge ${res.type === 'Conta a Pagar' ? 'badge-overdue' : 'badge-receivable'}">${res.type}</span></td>
        <td><strong>${res.name}</strong></td>
        <td>${formatCurrency(res.amount)}</td>
        <td>${formatDate(res.date)}</td>
        <td><span class="badge badge-${getStatusBadgeClass(res.status)}">${res.status}</span></td>
      </tr>
    `).join('');
  };

  input?.addEventListener('input', performSearch);
  typeSelect?.addEventListener('change', performSearch);
  headerSearch?.addEventListener('input', (e) => {
    if (e.target.value) {
      document.querySelector('.nav-item[data-view="search"]')?.click();
      if (input) input.value = e.target.value;
      performSearch();
    }
  });
}

/* Settings & Data Backup */
function initSettings() {
  document.getElementById('settingCurrency')?.addEventListener('change', (e) => {
    state.currency = e.target.value;
    localStorage.setItem('bf_currency', state.currency);
    updateDashboard();
    renderBillsTable();
    renderReceivablesTable();
    showToast('Moeda alterada com sucesso!');
  });

  document.getElementById('settingTheme')?.addEventListener('change', (e) => {
    state.theme = e.target.value;
    document.documentElement.setAttribute('data-theme', state.theme);
    state.saveTheme();
    updateThemeIcon();
    renderReports();
  });

  // Export JSON
  document.getElementById('btnExportJSON')?.addEventListener('click', () => {
    const data = {
      bills: state.bills,
      receivables: state.receivables,
      exportDate: new Date().toISOString()
    };
    const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute("href", jsonStr);
    dlAnchor.setAttribute("download", `billflow_backup_${Date.now()}.json`);
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    showToast('Backup JSON exportado com sucesso!');
  });

  // Export CSV
  document.getElementById('btnExportCSV')?.addEventListener('click', () => {
    let csv = "Tipo,Nome,Categoria,Valor,Data,Status\n";
    state.bills.forEach(b => {
      csv += `Conta,${b.name},${b.category},${b.amount},${b.dueDate},${b.status}\n`;
    });
    state.receivables.forEach(r => {
      csv += `Recebimento,${r.person},A receber,${r.amount},${r.expectedDate},${r.status}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `billflow_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Relatório CSV exportado!');
  });

  // Clear All Data
  document.getElementById('btnResetDemoData')?.addEventListener('click', () => {
    if (confirm('Deseja apagar todos os dados de contas e recebimentos cadastrados?')) {
      state.bills = [];
      state.receivables = [];
      state.saveBills();
      state.saveReceivables();
      updateDashboard();
      renderBillsTable();
      renderReceivablesTable();
      renderCalendar();
      renderReports();
      showToast('Todos os dados foram apagados com sucesso!', 'error');
    }
  });
}
