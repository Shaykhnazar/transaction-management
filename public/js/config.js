export const createConfig = () => {
  const api = {
    UPLOAD: 'api/index.php?action=upload',
    RATES: 'api/index.php?action=rates',
    ACCOUNTS: 'api/index.php?action=accounts',
    TRANSACTIONS: 'api/index.php?action=transactions',
    BALANCES: 'api/index.php?action=balances',
    UPDATE_ACCOUNT: 'api/index.php?action=updateAccount',
    DELETE_TRANSACTION: 'api/index.php?action=deleteTransaction',
    UPDATE_TRANSACTION: 'api/index.php?action=updateTransaction',
  };
  return {
    API_ENDPOINTS: api,
    TABLE_CONFIG: {
      RATES: {
        columns: [
          { data: 'currency', title: 'Currency' },
          { data: 'fx_rate', title: 'FX Rate' }
        ],
        searching: false,
        paging: false,
        info: false,
        sorting: false,
        ordering: false
      },
      ACCOUNTS: {
        data: [
          {
            name: 'total',
            currency: 'CHF',
            initial_balance: 0,
            end_balance: 0,
            end_balance_chf: 0,
            transactions_sum: 0
          }
        ],
        columns: [
          { data: 'name', title: 'Banks', className: 'editable' },
          { data: 'currency', title: 'Currency' },
          { data: 'initial_balance', title: 'Starting balance', className: 'editable' },
          { data: 'end_balance', title: 'End balance',
            render: function(data, type, row) {
              return (parseFloat(row.initial_balance) + parseFloat(row.transactions_sum)).toFixed(2);
            }
          },
          { data: 'end_balance_chf', title: 'End balance (CHF)',
            render: function(data, type, row, meta) {
              // meta.settings.oInstance.exchangeRates will be set in DataManager
              const rates = meta.settings.oInstance.exchangeRates || {};
              const rate = rates[row.currency] || 1;
              return ((parseFloat(row.initial_balance) + parseFloat(row.transactions_sum)) * rate).toFixed(2);
            }
          }
        ],
        searching: false,
        paging: false,
        info: false,
        sorting: false,
      },
      TRANSACTIONS: {
        processing: true,
        serverSide: true,
        ajax: {
          url: api.TRANSACTIONS,
          type: 'GET'
        },
        columns: [
          { data: 'account_id', title: 'Account' },
          { data: 'transaction_no', title: 'Transaction No', className: 'editable' },
          { data: 'amount', title: 'Amount', className: 'editable' },
          { data: 'currency', title: 'Currency' },
          { data: 'date', title: 'Date', className: 'editable' },
          {
            data: null,
            orderable: false,
            render: function(data) {
              return `<button class="delete-btn" data-transaction="${data.transaction_no}">
                        <i class="fas fa-trash-alt"></i>
                      </button>`;
            }
          }
        ],
        layout: {
          topStart: {
            buttons: [{
              extend: 'excelHtml5',
              title: null,
              exportOptions: {
                modifier: {
                  page: 'all'
                }
              }
            },{
              extend: 'pdfHtml5',
              exportOptions: {
                modifier: {
                  page: 'all'
                }
              }
            }]
          },
          top2Start: {
            pageLength: {
              menu: [5, 10, 25, 50]
            },
          },
          top2End: {
            paging: [
              'pageLength'
            ],
          },
          bottomEnd: null
        },
        searching: false,
        paging: true,
        pageLength: 10,
        info: false,
        ordering: true,
        order: [[4, 'desc']]
      }
    },
  };
};

export const CONFIG = createConfig();
