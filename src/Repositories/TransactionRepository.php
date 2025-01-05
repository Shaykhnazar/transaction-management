<?php

namespace App\Repositories;
use PDO;

class TransactionRepository
{
    private $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function getAll(array $params)
    {
        $columns = ['account_id', 'transaction_no', 'amount', 'currency', 'date'];

        $total = $this->db->query("SELECT COUNT(*) FROM transactions")->fetchColumn();

        $sql = "SELECT * FROM transactions";
        $sql .= " ORDER BY ".$columns[$params['orderColumn']]." ".$params['orderDir'];
        $sql .= " LIMIT ".$params['length']." OFFSET ".$params['start'];

        return [
            "draw" => $params['draw'],
            "recordsTotal" => $total,
            "recordsFiltered" => $total,
            "data" => $this->db->query($sql)->fetchAll(PDO::FETCH_ASSOC)
        ];
    }

    public function insertBulk(array $transactions)
    {
        $stmt = $this->db->prepare("
            INSERT INTO transactions (account_id, transaction_no, amount, currency, date)
            VALUES (?, ?, ?, ?, ?)
        ");

        foreach ($transactions as $transaction) {
            $stmt->execute([
                $transaction['account_id'],
                $transaction['transaction_no'],
                $transaction['amount'],
                $transaction['currency'],
                $transaction['date']
            ]);
        }
    }

    public function getBalances()
    {
        return $this->db->query("
            SELECT 
                t1.date,
                t1.account_id,
                SUM(t2.amount) as running_balance
            FROM transactions t1
            JOIN transactions t2 ON t2.account_id = t1.account_id 
                AND t2.date <= t1.date
            GROUP BY t1.date, t1.account_id
            ORDER BY t1.date, t1.account_id
        ")->fetchAll(PDO::FETCH_ASSOC);
    }

    public function getUniqueCurrencies()
    {
        $stmt = $this->db->query("SELECT DISTINCT currency FROM transactions");
        return $stmt->fetchAll(PDO::FETCH_COLUMN);
    }
}
