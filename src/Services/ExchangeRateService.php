<?php

namespace App\Services;
use Exception;
use PDO;

class ExchangeRateService
{
    private $cacheDir;
    private $cacheExpiry;
    private $apiKey;
    private $db;

    public function __construct($apiKey, $cacheDir, PDO $db, $cacheExpiry = 3600)
    {
        $this->apiKey = $apiKey;
        $this->cacheDir = $cacheDir;
        $this->db = $db;
        $this->cacheExpiry = $cacheExpiry;
        $this->initializeCache();
    }

    private function initializeCache()
    {
        if (!is_dir($this->cacheDir)) {
            mkdir($this->cacheDir, 0777, true);
        }
    }

    public function getRates($currencies)
    {
        $rates = [];

        // Prepare statement for database operations
        $stmt = $this->db->prepare("
            INSERT INTO exchange_rates (currency_from, currency_to, rate)
            VALUES (?, 'CHF', ?)
            ON DUPLICATE KEY UPDATE rate = ?, last_updated = CURRENT_TIMESTAMP
        ");

        foreach ($currencies as $currency) {
            if ($currency !== 'CHF') {
                $rate = $this->getRate($currency);

                // Update database
                $stmt->execute([$currency, $rate, $rate]);

                $rates[$currency] = ['rate' => $rate];
            }
        }
        return $rates;
    }

    private function getRate($currency)
    {
        try {
            $rates = $this->getCachedRates();
            return isset($rates[$currency]) ? (1 / $rates[$currency]) : 1;
        } catch (Exception $e) {
            error_log("Exchange rate error: ".$e->getMessage());
            return $this->getMockRate($currency);
        }
    }

    /**
     * @throws Exception
     */
    private function getCachedRates()
    {
        $cacheFile = $this->cacheDir.'/exchange_rates.json';

        if ($this->isCacheValid($cacheFile)) {
            return json_decode(file_get_contents($cacheFile), true);
        }

        return $this->fetchFreshRates($cacheFile);
    }

    private function isCacheValid($cacheFile)
    {
        return file_exists($cacheFile) &&
            (time() - filemtime($cacheFile) < $this->cacheExpiry);
    }

    /**
     * @throws Exception
     */
    private function fetchFreshRates($cacheFile)
    {
        $url = "https://v6.exchangerate-api.com/v6/{$this->apiKey}/latest/CHF";

        $response = file_get_contents($url);
        $data = json_decode($response, true);

        if (!$data || !isset($data['conversion_rates'])) {
            throw new Exception("Failed to fetch exchange rates");
        }

        $rates = $data['conversion_rates'];

        if (!file_put_contents($cacheFile, json_encode($rates))) {
            throw new Exception("Failed to write cache file");
        }

        return $rates;
    }

    private function getMockRate($currency)
    {
        $mockRates = [
            'USD' => 0.91,
            'EUR' => 0.98,
            'GBP' => 1.14
        ];
        return isset($mockRates[$currency]) ? $mockRates[$currency] : 1;
    }
}
