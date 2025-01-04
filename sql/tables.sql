CREATE DATABASE IF NOT EXISTS transactions_app;

USE transactions_app;

CREATE TABLE IF NOT EXISTS transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date DATE NOT NULL,
    account_id VARCHAR(50) NOT NULL,
    transaction_no VARCHAR(100) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_date (date),
    INDEX idx_account (account_id),
    INDEX idx_transaction_no (transaction_no),
    INDEX idx_currency (currency),
    INDEX idx_amount (amount)
);

CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    initial_balance DECIMAL(15,2) DEFAULT 0,
    currency VARCHAR(3) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exchange_rates (
    currency_from VARCHAR(3),
    currency_to VARCHAR(3),
    rate DECIMAL(15,6),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (currency_from, currency_to)
);
