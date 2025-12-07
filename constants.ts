import { Account, Customer, Invoice, Transaction } from './types';

// --- TABLE 1: GENERAL LEDGER (COA) ---
export const MOCK_COA: Account[] = [
  { account_id: '1100', account_name: 'Cash', account_type: 'Asset' },
  { account_id: '1200', account_name: 'Accounts Receivable', account_type: 'Asset' },
  { account_id: '1300', account_name: 'Allowance for Doubtful Accounts', account_type: 'Asset' }, // Contra-Asset
  { account_id: '4000', account_name: 'Sales Revenue', account_type: 'Revenue' },
  { account_id: '5000', account_name: 'Cost of Goods Sold', account_type: 'Expense' },
];

// --- CUSTOMERS ---
export const MOCK_CUSTOMERS: Customer[] = [
  { customer_id: 'CUST-001', name: 'Acme Corp', email: 'finance@acme.com', risk_score_history: [10, 12, 10] },
  { customer_id: 'CUST-002', name: 'Globex Inc', email: 'ap@globex.com', risk_score_history: [20, 25, 40] }, // Worsening
  { customer_id: 'CUST-003', name: 'Soylent Corp', email: 'pay@soylent.com', risk_score_history: [5, 5, 5] },
];

// --- TABLE 2: ACCOUNTS RECEIVABLE (AR) ---
export const MOCK_INVOICES: Invoice[] = [
  // Current
  { invoice_id: 'INV-1001', customer_id: 'CUST-001', invoice_date: '2024-05-01', due_date: '2024-05-31', original_amount: 5000, amount_paid: 0, balance_due: 5000, status: 'Open' },
  // 31-60 Days Overdue (Assuming today is approx July 2024)
  { invoice_id: 'INV-0900', customer_id: 'CUST-002', invoice_date: '2024-03-01', due_date: '2024-03-31', original_amount: 12000, amount_paid: 2000, balance_due: 10000, status: 'Open' },
  // 90+ Days Overdue
  { invoice_id: 'INV-0850', customer_id: 'CUST-002', invoice_date: '2023-12-01', due_date: '2023-12-31', original_amount: 8500, amount_paid: 0, balance_due: 8500, status: 'Open' },
  // Paid
  { invoice_id: 'INV-0800', customer_id: 'CUST-003', invoice_date: '2024-01-15', due_date: '2024-02-15', original_amount: 3000, amount_paid: 3000, balance_due: 0, status: 'Paid' },
];

// --- TABLE 3: TRANSACTIONS (JOURNAL ENTRIES) ---
export const MOCK_TRANSACTIONS: Transaction[] = [
  // Valid Sales
  { transaction_id: 'TXN-001', transaction_date: '2024-05-01', debit_account_id: '1200', credit_account_id: '4000', amount: 5000, reference_invoice_id: 'INV-1001', description: 'Credit Sale to Acme' },
  // Valid Payment
  { transaction_id: 'TXN-002', transaction_date: '2024-02-10', debit_account_id: '1100', credit_account_id: '1200', amount: 3000, reference_invoice_id: 'INV-0800', description: 'Payment from Soylent' },
  
  // -- COMPLIANCE ISSUES FOR TESTING --
  // Issue 1: Debit Account '9999' does not exist in COA
  { transaction_id: 'TXN-ERR-01', transaction_date: '2024-05-02', debit_account_id: '9999', credit_account_id: '4000', amount: 1500, description: 'Suspicious Adjustment' },
  // Issue 2: Credit Account '4005' does not exist in COA
  { transaction_id: 'TXN-ERR-02', transaction_date: '2024-05-03', debit_account_id: '1200', credit_account_id: '4005', amount: 200, description: 'Misc Revenue unclassified' },
];
