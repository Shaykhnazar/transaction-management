let exchangeRates = {};  // Global variable to store exchange rates

document.addEventListener('DOMContentLoaded', function() {
    const dropArea = document.querySelector('.drop-area');
    const fileInput = document.getElementById('fileInput');

    document.querySelector('.browse-files').addEventListener('click', function(e) {
        e.preventDefault();
        fileInput.click();
    });

    fileInput.addEventListener('change', function(e) {
        handleFiles(this.files);
    });

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropArea.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropArea.addEventListener('drop', handleDrop, false);

    function preventDefaults (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight(e) {
        dropArea.classList.add('highlight');
    }

    function unhighlight(e) {
        dropArea.classList.remove('highlight');
    }

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;

        // Create a new FileList object
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(files[0]);
        fileInput.files = dataTransfer.files;

        // Handle file upload
        handleFiles(files);
    }

    function handleFiles(files) {
        const formData = new FormData();
        formData.append('file', files[0]);

        // Show loading state
        dropArea.classList.add('uploading');

        $.ajax({
            url: 'api/index.php?action=upload',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                if (response.success) {
                    refreshAllData(true);
                }
            },
            complete: function() {
                dropArea.classList.remove('uploading');
            }
        });
    }

    // Initialize DataTables
    const ratesTable = $('#ratesTable').DataTable({
        // data: [
        //     {
        //         currency: "CHF",
        //         fx_rate: 1
        //     }
        // ],
        columns: [
            { data: 'currency', title: 'Currency' },
            { data: 'fx_rate', title: 'FX Rate' }
        ],
        searching: false,
        paging: false,
        info: false,
        sorting: false,
        ordering: false,
    });

    const accountsTable = $('#accountsTable').DataTable({
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
                render: function(data, type, row) {
                    const rate = exchangeRates[row.currency] || 1;
                    return ((parseFloat(row.initial_balance) + parseFloat(row.transactions_sum)) * rate).toFixed(2);
                }
            }
        ],
        searching: false,
        paging: false,
        info: false,
        sorting: false,
    });

    const transactionsTable = $('#transactionsTable').DataTable({
        processing: true,
        serverSide: true,
        ajax: {
            url: 'api/index.php?action=transactions',
            type: 'GET'
        },
        columns: [
            { data: 'account_id', title: 'Account' },
            { data: 'transaction_no', title: 'Transaction No' },
            { data: 'amount', title: 'Amount' },
            { data: 'currency', title: 'Currency' },
            { data: 'date', title: 'Date' }
        ],
        layout: {
            topStart: {
                buttons: ['excelHtml5', 'pdfHtml5']
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
        order: [[4, 'desc']] // Default sort by date descending
    });

    function refreshAllData(initialize = false) {
        // Refresh exchange rates
        $.get('api/index.php?action=rates', function(data) {
            // Update global exchangeRates variable
            exchangeRates = Object.fromEntries(
              Object.entries(data).map(([currency, info]) => [currency, info.rate])
            );

            ratesTable.clear().rows.add(
              Object.entries(data).map(([currency, info]) => ({
                  currency: currency,
                  fx_rate: info.rate.toFixed(6)
              }))
            ).draw();
        });

        // Since exchange rates affect account balances in CHF, refresh accounts table
        $.get('api/index.php?action=accounts', function(data) {
            accountsTable.clear().rows.add(data).draw();
        });

        if (initialize) {
            // Refresh transactions table
            transactionsTable.ajax.reload();
        }


        refreshBalanceChart();
    }

    // Initialize chart first
    const balanceChart = Highcharts.chart('balanceChart', {
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
    });

    // Function to process data for chart
    function getChartData(data) {
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

    // Function to refresh chart data
    function refreshBalanceChart() {
        $.get('api/index.php?action=balances', function(data) {
            // Update all series data
            const series = getChartData(data);

            // Remove existing series
            while(balanceChart.series.length > 0) {
                balanceChart.series[0].remove(false);
            }

            // Add new series
            series.forEach(seriesData => {
                balanceChart.addSeries(seriesData, false);
            });

            // Redraw chart
            balanceChart.redraw();
        });
    }

    // Update chart when transactions table is updated
    transactionsTable.on('draw', function() {
        refreshBalanceChart();
    });


    // Initial data load
    refreshAllData();

    // Account editing
    $('#accountsTable').on('click', 'td.editable', function() {
        const cell = $(this);
        const original = cell.text();
        const input = $('<input type="text" class="form-control">').val(original);

        cell.html(input);
        input.focus();

        input.on('blur', function() {
            const newValue = input.val();
            cell.html(newValue);

            const data = accountsTable.row(cell.parent()).data();
            const column = accountsTable.column(cell).dataSrc();
            data[column] = newValue;

            $.ajax({
                url: 'api/index.php?action=updateAccount',
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(data),
                success: function() {
                    refreshBalanceChart();
                }
            });
        });
    });

});

