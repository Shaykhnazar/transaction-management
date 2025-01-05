import { CONFIG } from './config.js'

export class DataManager {
  constructor() {
    this.exchangeRates = {};
    this.initializeTables();
    this.initializeChart();
  }

  initializeTables() {
    this.ratesTable = this.createRatesTable();
    this.accountsTable = this.createAccountsTable();
    this.transactionsTable = this.createTransactionsTable();
    this.accountsTable.on('click', 'td.editable', (e) => this.editAccount(e));
  }

  initializeChart() {
    this.balanceChart = this.createBalanceChart();
    this.transactionsTable.on('draw', () => this.refreshBalanceChart());
  }

  async refreshAllData(initialize = false) {
    await this.refreshRates();
    await this.refreshAccounts();
    if (initialize) {
      this.transactionsTable.ajax.reload();
    }
    await this.refreshBalanceChart();
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

      this.ratesTable.clear().rows.add(
        Object.entries(data).map(([currency, info]) => ({
          currency: currency,
          fx_rate: info.rate.toFixed(6)
        }))
      ).draw();
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
      ...CONFIG.TABLE_CONFIG.ACCOUNTS
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

  editAccount(e) {
    const cell = $(e.currentTarget);
    const original = cell.text();
    const input = $('<input type="text" class="form-control">').val(original);

    cell.html(input);
    input.focus();

    input.on('blur', async () => {
      const newValue = input.val();
      cell.html(newValue);

      const row = this.accountsTable.row(cell.parent());
      const data = row.data();
      const column = this.accountsTable.column(cell).dataSrc();
      data[column] = newValue;

      try {
        await $.ajax({
          url: CONFIG.API_ENDPOINTS.UPDATE_ACCOUNT,
          type: 'POST',
          contentType: 'application/json',
          data: JSON.stringify(data)
        });

        // Refresh data after successful update
        await this.refreshBalanceChart();
      } catch (error) {
        console.error('Failed to update account:', error);
        // Revert to original value on error
        cell.html(original);
      }
    });
  }
}
