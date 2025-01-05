<?php

use App\Repositories\AccountRepository;
use App\Repositories\TransactionRepository;
use App\Services\ExchangeRateService;
use App\Services\FileProcessor;

require_once '../config.php';
require_once '../vendor/autoload.php';

class TransactionAPI {
    private $db;
    private $transactionRepo;
    private $accountRepo;
    private $exchangeService;
    private $fileProcessor;

    public function __construct() {
        $this->db = Database::getInstance()->getConnection();
        $this->transactionRepo = new TransactionRepository($this->db);
        $this->accountRepo = new AccountRepository($this->db);
        $this->exchangeService = new ExchangeRateService(
            'fddf2663733ea255b0f68ac3', // TODO: move this API key into .env file in real app
            __DIR__ . '/../cache',
            $this->db
        );
        $this->fileProcessor = new FileProcessor(
            $this->db,
            $this->transactionRepo,
            $this->accountRepo
        );
    }

    public function handleRequest() {
        try {
            $method = $_SERVER['REQUEST_METHOD'];
            $action = isset($_GET['action']) ? $_GET['action'] : '';

            switch ("$method:$action") {
                case 'POST:upload': return $this->uploadFile();
                case 'POST:updateAccount': return $this->updateAccount();
                case 'GET:rates': return $this->getExchangeRates();
                case 'GET:accounts': return $this->getAccounts();
                case 'GET:transactions': return $this->getTransactions();
                case 'GET:balances': return $this->getBalances();
                default:
                    http_response_code(404);
                    return ['error' => 'Not found'];
            }
        } catch (Exception $e) {
            http_response_code(404);
            return ['error' => 'Not found'];
        }
    }

    private function uploadFile() {
        try {
            $this->fileProcessor->processSpreadsheet($_FILES['file']['tmp_name']);
            return ['success' => true];
        } catch (Exception $e) {
            return ['error' => $e->getMessage()];
        }
    }

    private function updateAccount() {
        $data = json_decode(file_get_contents('php://input'), true);
        $this->accountRepo->update($data);
        return ['success' => true];
    }

    private function getExchangeRates() {
        $currencies = $this->transactionRepo->getUniqueCurrencies();
        return $this->exchangeService->getRates($currencies);
    }

    private function getAccounts() {
        return $this->accountRepo->getAll();
    }

    private function getTransactions() {
        $params = [
            'draw' => isset($_GET['draw']) ? intval($_GET['draw']) : 1,
            'start' => isset($_GET['start']) ? intval($_GET['start']) : 0,
            'length' => isset($_GET['length']) ? intval($_GET['length']) : 10,
            'orderColumn' => isset($_GET['order'][0]['column']) ? intval($_GET['order'][0]['column']) : 4,
            'orderDir' => isset($_GET['order'][0]['dir']) ? $_GET['order'][0]['dir'] : 'DESC'
        ];

        return $this->transactionRepo->getAll($params);
    }

    private function getBalances() {
        return $this->transactionRepo->getBalances();
    }
}

$api = new TransactionAPI();
header('Content-Type: application/json');
echo json_encode($api->handleRequest());
