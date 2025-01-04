<?php
require_once '../config.php';
require_once '../vendor/autoload.php';

use PhpOffice\PhpSpreadsheet\IOFactory;

class TransactionAPI {
    private $db;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
    }

    public function handleRequest() {
        $method = $_SERVER['REQUEST_METHOD'];
        $action = isset($_GET['action']) ? $_GET['action'] : '';

        switch ($method) {
            case 'POST':
                switch ($action) {
                    case 'upload':
                        return $this->uploadFile();
                    case 'updateAccount':
                        return $this->updateAccount();
                }
                break;
            case 'GET':
                switch ($action) {
                    case 'rates':
                        return $this->getExchangeRates();
                    case 'accounts':
                        return $this->getAccounts();
                    case 'transactions':
                        return $this->getTransactions();
                    case 'balances':
                        return $this->getBalances();
                }
                break;
        }
        http_response_code(404);
        return ['error' => 'Not found'];
    }

    private function uploadFile() {
        try {
            $spreadsheet = IOFactory::load($_FILES['file']['tmp_name']);
            $worksheet = $spreadsheet->getActiveSheet();
            $data = $worksheet->toArray();

            $this->db->beginTransaction();

            // Clear old data
            $this->db->exec("TRUNCATE TABLE transactions");
            $this->db->exec("TRUNCATE TABLE accounts");

            // Process and insert new data
            $this->processTransactions($data);

            $this->db->commit();
            return ['success' => true];
        } catch (Exception $e) {
            $this->db->rollBack();
            return ['error' => $e->getMessage()];
        }
    }

    private function processTransactions($data) {
        // Skip header row
        array_shift($data);

        $accountsSet = [];
        $stmt = $this->db->prepare("
            INSERT INTO transactions 
            (account_id, transaction_no, amount, currency, date)
            VALUES (?, ?, ?, ?, ?)
        ");

        foreach ($data as $row) {
            try {
                if (count($row) < 5 || empty($row[0])) {
                    continue; // Skip invalid rows
                }

                $account = $row[0];    // Account
                $transactionNo = $row[1];  // Transaction No
                $amount = $row[2];     // Amount
                $currency = $row[3];   // Currency
                $date = date('Y-m-d', strtotime($row[4]));  // Format date

                $accountsSet[$account] = [
                    'currency' => $currency,
                    'name' => $account
                ];

                $stmt->execute([
                    $account,
                    $transactionNo,
                    $amount,
                    $currency,
                    $date
                ]);
            } catch (Exception $e) {
                error_log("Error processing row: " . json_encode($row) . " Error: " . $e->getMessage());
                continue;
            }
        }

        // Create accounts
        $stmt = $this->db->prepare("
            INSERT INTO accounts (id, name, currency, initial_balance)
            VALUES (?, ?, ?, 0)
            ON DUPLICATE KEY UPDATE name = VALUES(name), currency = VALUES(currency)
        ");

        foreach ($accountsSet as $id => $info) {
            $stmt->execute([$id, $info['name'], $info['currency']]);
        }
    }

    private function updateAccount() {
        $data = json_decode(file_get_contents('php://input'), true);
        $stmt = $this->db->prepare("
            UPDATE accounts 
            SET name = ?, initial_balance = ?
            WHERE id = ?
        ");
        $stmt->execute([$data['name'], $data['initial_balance'], $data['id']]);
        return ['success' => true];
    }

    private function getRealExchangeRate($currency) {
        try {
            // Using exchangerate-api.com (free tier)
            $apiKey = 'fddf2663733ea255b0f68ac3';
            $url = "https://v6.exchangerate-api.com/v6/{$apiKey}/latest/CHF";

            // Use caching to avoid hitting API limits
            // Cache directory and file setup
            $cacheDir = __DIR__ . '/../cache';
            $cacheFile = $cacheDir . '/exchange_rates.json';
            $cacheExpiry = 3600; // 1 hour

            // Create cache directory if it doesn't exist
            if (!is_dir($cacheDir)) {
                if (!mkdir($cacheDir, 0777, true)) {
                    throw new Exception("Failed to create cache directory");
                }
            }

            if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheExpiry)) {
                $rates = json_decode(file_get_contents($cacheFile), true);
            } else {
                // Get fresh rates from API
                $response = file_get_contents($url);
                $data = json_decode($response, true);

                if ($data && isset($data['conversion_rates'])) {
                    $rates = $data['conversion_rates'];
                    // Cache the results
                    if (!file_put_contents($cacheFile, json_encode($rates))) {
                        throw new Exception("Failed to write cache file");
                    }
                } else {
                    throw new Exception("Failed to fetch exchange rates");
                }
            }

            // Convert from CHF to target currency (inverse of rate)
            return isset($rates[$currency]) ? (1 / $rates[$currency]) : 1;

        } catch (Exception $e) {
            error_log("Exchange rate error: " . $e->getMessage());
            // Fallback to mock rates if API fails
            return $this->mockExchangeRate($currency);
        }
    }

    private function getExchangeRates() {
        // In real app, use external API
        $currencies = $this->getUniqueCurrencies();
        $rates = [];

        // Insert or update exchange rates
        $stmt = $this->db->prepare("
            INSERT INTO exchange_rates (currency_from, currency_to, rate)
            VALUES (?, 'CHF', ?)
            ON DUPLICATE KEY UPDATE rate = ?, last_updated = CURRENT_TIMESTAMP
        ");

        foreach ($currencies as $currency) {
            if ($currency != 'CHF') {
                $rate = $this->getRealExchangeRate($currency);
                $stmt->execute([$currency, $rate, $rate]);
                $rates[$currency] = ['rate' => $rate];
            }
        }

        return $rates;
    }


    private function mockExchangeRate($currency) {
        $mockRates = [
            'USD' => 0.91,
            'EUR' => 0.98,
            'GBP' => 1.14
        ];
        return isset($mockRates[$currency]) ? $mockRates[$currency] : 1;
    }

    private function getUniqueCurrencies() {
        $stmt = $this->db->query("SELECT DISTINCT currency FROM transactions");
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    private function getAccounts() {
        $stmt = $this->db->query("
            SELECT 
                a.*,
                COALESCE(SUM(t.amount), 0) as transactions_sum
            FROM accounts a
            LEFT JOIN transactions t ON a.id = t.account_id
            GROUP BY a.id
        ");
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    private function getTransactions() {
        // Get DataTables parameters
        $draw = isset($_GET['draw']) ? intval($_GET['draw']) : 1;
        $start = isset($_GET['start']) ? intval($_GET['start']) : 0;
        $length = isset($_GET['length']) ? intval($_GET['length']) : 10;
        $orderColumn = isset($_GET['order'][0]['column']) ? intval($_GET['order'][0]['column']) : 4; // default date
        $orderDir = isset($_GET['order'][0]['dir']) ? $_GET['order'][0]['dir'] : 'DESC';

        // Column names mapping
        $columns = [
            'account_id',
            'transaction_no',
            'amount',
            'currency',
            'date'
        ];

        // Get total count
        $totalQuery = $this->db->query("SELECT COUNT(*) FROM transactions");
        $total = $totalQuery->fetchColumn();

        // Build query
        $sql = "SELECT * FROM transactions";

        // Add ordering
        $sql .= " ORDER BY " . $columns[$orderColumn] . " " . $orderDir;

        // Add pagination
        $sql .= " LIMIT " . $length . " OFFSET " . $start;

        // Execute query
        $stmt = $this->db->query($sql);
        $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

        // Return in DataTables format
        return [
            "draw" => $draw,
            "recordsTotal" => $total,
            "recordsFiltered" => $total,
            "data" => $data
        ];
    }
    private function getBalances() {
        $stmt = $this->db->query("
            SELECT 
                t1.date,
                t1.account_id,
                SUM(t2.amount) as running_balance
            FROM transactions t1
            JOIN transactions t2 ON t2.account_id = t1.account_id 
                AND t2.date <= t1.date
            GROUP BY t1.date, t1.account_id
            ORDER BY t1.date, t1.account_id
        ");

        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}

$api = new TransactionAPI();
header('Content-Type: application/json');
echo json_encode($api->handleRequest());
