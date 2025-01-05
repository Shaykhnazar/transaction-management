<?php

namespace App\Services;

use App\Repositories\AccountRepository;
use App\Repositories\TransactionRepository;
use Exception;
use PDO;
use PhpOffice\PhpSpreadsheet\IOFactory;

class FileProcessor
{
    private $db;
    private $transactionRepo;
    private $accountRepo;

    public function __construct(PDO $db, TransactionRepository $transactionRepo, AccountRepository $accountRepo)
    {
        $this->db = $db;
        $this->transactionRepo = $transactionRepo;
        $this->accountRepo = $accountRepo;
    }

    /**
     * @throws \PhpOffice\PhpSpreadsheet\Exception
     * @throws \PhpOffice\PhpSpreadsheet\Reader\Exception
     */
    public function processSpreadsheet($filePath)
    {
        try {
            $spreadsheet = IOFactory::load($filePath);
            $worksheet = $spreadsheet->getActiveSheet();
            $data = $worksheet->toArray();

            $this->db->beginTransaction();

            // Clear old data
            $this->db->exec("TRUNCATE TABLE transactions");
            $this->db->exec("TRUNCATE TABLE accounts");

            // Process and insert new data
            $this->processRows($data);

            $this->db->commit();
            return true;
        } catch (Exception $e) {
            $this->db->rollBack();
            throw $e;
        }
    }

    private function processRows($data)
    {
        // Skip header row
        array_shift($data);

        $accountsSet = [];
        $transactions = [];

        foreach ($data as $row) {
            if (count($row) < 5 || empty($row[0])) {
                continue;
            }

            $account = $row[0];
            $accountsSet[$account] = [
                'currency' => $row[3],
                'name' => $account
            ];

            $transactions[] = [
                'account_id' => $account,
                'transaction_no' => $row[1],
                'amount' => $row[2],
                'currency' => $row[3],
                'date' => date('Y-m-d', strtotime($row[4]))
            ];
        }

        $this->accountRepo->insertOrUpdate($accountsSet);
        $this->transactionRepo->insertBulk($transactions);
    }
}
