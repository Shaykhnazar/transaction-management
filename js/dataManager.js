import { CONFIG } from './config.js'

export class DataManager {
  constructor() {
    this.exchangeRates = {};
    this.initializeTables();
    this.initializeChart();
    // Refresh other data
    this.refreshAllData();
  }

  initializeTables() {
    this.ratesTable = this.createRatesTable();
    this.accountsTable = this.createAccountsTable();
    this.transactionsTable = this.createTransactionsTable();
    this.accountsTable.on('click', 'td.editable', (e) => this.editAccount(e));
    this.transactionsTable.on('click', 'td.editable', (e) => this.editTransaction(e));

    // Delete button click handler
    this.transactionsTable.on('click', '.delete-btn', (e) => {
      const transactionNo = $(e.currentTarget).data('transaction');
      this.showDeleteConfirmation(transactionNo);
    });

    // Confirmation modal handlers
    $('#confirmDelete').on('click', () => this.deleteTransaction());
    $('#cancelDelete').on('click', () => this.hideDeleteModal());
  }

  initializeChart() {
    this.balanceChart = this.createBalanceChart();
    this.transactionsTable.on('draw', () => this.refreshBalanceChart());
  }

  async refreshAllData() {
    await this.refreshRates().then(async () => {
      await this.refreshAccounts();
    })
  }

  async refreshTransactions() {
    this.transactionsTable.ajax.reload();
  }

  // Function to refresh chart data
  refreshBalanceChart() {
    $.get(CONFIG.API_ENDPOINTS.BALANCES, (data) => {
      // Update all series data
      const series = this.getChartData(data);

      // Remove existing series
      while(this.balanceChart.series.length > 0) {
        this.balanceChart.series[0].remove(false);
      }

      // Add new series
      series.forEach(seriesData => {
        this.balanceChart.addSeries(seriesData, false);
      });

      // Redraw chart
      this.balanceChart.redraw();
    });
  }

  // Refresh exchange rates
  async refreshRates() {
    try {
      const data = await $.get(CONFIG.API_ENDPOINTS.RATES);

      // Update global exchangeRates variable
      this.exchangeRates = Object.fromEntries(
        Object.entries(data).map(([currency, info]) => [currency, info.rate])
      );

      // Update rates table
      this.ratesTable.clear().rows.add(
        Object.entries(data).map(([currency, info]) => ({
          currency: currency,
          fx_rate: info.rate.toFixed(6)
        }))
      ).draw();

      // Update accounts table exchange rates and redraw
      if (this.accountsTable) {
        this.accountsTable.exchangeRates = this.exchangeRates;
        this.accountsTable.draw(false); // false to maintain current paging
      }
    } catch (error) {
      console.error('Failed to refresh rates:', error);
    }
  }

  // Function to process data for chart
  async refreshAccounts() {
    try {
      const data = await $.get(CONFIG.API_ENDPOINTS.ACCOUNTS);
      this.accountsTable.clear().rows.add(data).draw();
    } catch (error) {
      console.error('Failed to refresh accounts:', error);
    }
  }

  getChartData(data) {
    const series = [];
    const accountData = {};

    // Group by account
    data.forEach(row => {
      if (!accountData[row.account_id]) {
        accountData[row.account_id] = [];
      }
      accountData[row.account_id].push([
        new Date(row.date).getTime(),
        parseFloat(row.running_balance)
      ]);
    });

    // Create series for each account
    Object.entries(accountData).forEach(([account, data]) => {
      series.push({
        name: account,
        data: data
      });
    });

    // Add total series
    const totalData = {};
    data.forEach(row => {
      const date = new Date(row.date).getTime();
      totalData[date] = (totalData[date] || 0) + parseFloat(row.running_balance);
    });

    series.push({
      name: 'Total',
      data: Object.entries(totalData).map(([date, balance]) => [
        parseInt(date),
        balance
      ]),
      lineWidth: 4
    });

    return series;
  }

  createRatesTable() {
    return $('#ratesTable').DataTable({
      ...CONFIG.TABLE_CONFIG.RATES
    })
  }

  createAccountsTable() {
    const table = $('#accountsTable').DataTable({
      ...CONFIG.TABLE_CONFIG.ACCOUNTS,
      // Add drawCallback to update exchange rates on each draw
      drawCallback: (settings) => {
        settings.oInstance.exchangeRates = this.exchangeRates;
      }
    });
    // Attach exchangeRates to table instance
    table.exchangeRates = this.exchangeRates;
    return table;
  }

  createBalanceChart() {
    return Highcharts.chart('balanceChart', {
      title: { text: 'Account Balances Over Time' },
      xAxis: { type: 'datetime' },
      yAxis: { title: { text: 'Balance' } },
      series: [],  // Empty initially
      plotOptions: {
        series: {
          marker: { enabled: false }
        }
      },
      exporting: {
        enabled: true,
        buttons: {
          contextButton: {
            menuItems: ['downloadPNG', 'downloadPDF', 'downloadSVG']
          }
        }
      }
    })
  }

  createTransactionsTable() {
    return $('#transactionsTable').DataTable({
      ...CONFIG.TABLE_CONFIG.TRANSACTIONS
    })
  }

  showDeleteConfirmation(transactionNo) {
    this.pendingDeleteTransaction = transactionNo;
    $('#deleteTransactionNo').text(transactionNo);
    $('#deleteModal').show();
  }

  hideDeleteModal() {
    $('#deleteModal').hide();
    this.pendingDeleteTransaction = null;
  }

  async deleteTransaction() {
    if (!this.pendingDeleteTransaction) return;

    try {
      const response = await fetch(`${CONFIG.API_ENDPOINTS.DELETE_TRANSACTION}&transaction_no=${this.pendingDeleteTransaction}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        await this.refreshTransactions();
        // Refresh other data
        this.refreshAllData();
      } else {
        alert('Failed to delete transaction: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction');
    }

    this.hideDeleteModal();
  }

  editAccount(e) {
    const cell = $(e.currentTarget);
    const original = cell.text();

    // Don't create new input if already editing
    if (cell.find('input').length > 0) return;

    const input = $('<input type="text" class="form-control">').val(original);

    cell.html(input);
    input.focus();

    input.on('blur', async () => {
      const newValue = input.val();
      const row = this.accountsTable.row(cell.parent());
      const data = row.data();
      const column = this.accountsTable.column(cell).dataSrc();

      // Check if value has actually changed
      if (data[column] === newValue) {
        cell.html(newValue);
        return;
      }

      // Store the original value in case we need to revert
      const originalValue = data[column];

      // Update data object with new value
      data[column] = newValue;

      try {
        await $.ajax({
          url: CONFIG.API_ENDPOINTS.UPDATE_ACCOUNT,
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(data)
        });

        // Get fresh data for this account
        const response = await $.get(CONFIG.API_ENDPOINTS.ACCOUNTS);
        const updatedAccountData = response.find(account => account.name === data.name);

        if (updatedAccountData) {
          // Update the row with fresh data
          row.data(updatedAccountData).draw(false);
        }

        // Refresh data after successful update
        await this.refreshBalanceChart();
      } catch (error) {
        console.error('Failed to update account:', error);
        // Revert to original value on error
        cell.html(originalValue);
        data[column] = originalValue;
      }
    });
    input.on('keypress', (e) => {
      if (e.which === 13) { // Enter key
        input.blur();
      }
    });
  }

  editTransaction(e) {
    const cell = $(e.currentTarget);
    const row = cell.closest('tr');
    const data = this.transactionsTable.row(row).data();
    const column = this.transactionsTable.cell(cell).index().column;
    const fieldName = CONFIG.TABLE_CONFIG.TRANSACTIONS.columns[column].data;
    const currentValue = data[fieldName];

    // Don't create new input if already editing
    if (cell.find('input').length > 0) return;

    // Create input field
    const input = this.createEditInput(fieldName, currentValue);
    cell.html(input);
    input.focus();

    // Handle input events
    input.on('blur', () => this.handleTransactionUpdate(cell, data, fieldName, input));
    input.on('keypress', (e) => {
      if (e.which === 13) { // Enter key
        input.blur();
      }
    });
  }

  createEditInput(fieldName, value) {
    let input;

    switch (fieldName) {
      case 'date':
        input = $('<input type="date">');
        input.val(value);
        break;
      case 'amount':
        input = $('<input type="number" step="0.01">');
        input.val(parseFloat(value));
        break;
      default:
        input = $('<input type="text">');
        input.val(value);
    }

    return input;
  }

  async handleTransactionUpdate(cell, rowData, fieldName, input) {
    const newValue = input.val();
    if (newValue === rowData[fieldName]) {
      cell.html(newValue);
      return;
    }

    try {
      const response = await fetch(
        `${CONFIG.API_ENDPOINTS.UPDATE_TRANSACTION}&transaction_no=${rowData.transaction_no}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            [fieldName]: newValue
          })
        }
      );

      const result = await response.json();

      if (result.success) {
        cell.html(newValue);
        await this.refreshTransactions();
        // Refresh other data
        this.refreshAllData();
      } else {
        alert('Failed to update transaction: ' + (result.error || 'Unknown error'));
        cell.html(rowData[fieldName]);
      }
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Failed to update transaction');
      cell.html(rowData[fieldName]);
    }
  }
}
