<?php

namespace App\Repositories;
use PDO;

require_once '../config.php';
require_once '../vendor/autoload.php';

class AccountRepository
{
    private $db;

    public function __construct(PDO $db)
    {
        $this->db = $db;
    }

    public function getAll()
    {
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

    public function insertOrUpdate(array $accounts)
    {
        $stmt = $this->db->prepare("
            INSERT INTO accounts (id, name, currency, initial_balance)
            VALUES (?, ?, ?, 0)
            ON DUPLICATE KEY UPDATE name = VALUES(name), currency = VALUES(currency)
        ");

        foreach ($accounts as $id => $info) {
            $stmt->execute([$id, $info['name'], $info['currency']]);
        }
    }

    public function update(array $data)
    {
        $stmt = $this->db->prepare("
            UPDATE accounts 
            SET name = ?, initial_balance = ?
            WHERE id = ?
        ");

        return $stmt->execute([$data['name'], $data['initial_balance'], $data['id']]);
    }
}
