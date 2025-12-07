
export interface Account {
  account_id: string;
  account_name: string;
  account_type: 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';
}

export interface Customer {
  customer_id: string;
  name: string;
  email: string;
  risk_score_history: number[]; // 0-100
}

export interface Invoice {
  invoice_id: string;
  customer_id: string;
  invoice_date: string; // ISO Date
  due_date: string; // ISO Date
  original_amount: number;
  amount_paid: number;
  balance_due: number;
  status: 'Open' | 'Paid' | 'Void';
}

export interface Transaction {
  transaction_id: string;
  transaction_date: string;
  debit_account_id: string;
  credit_account_id: string;
  amount: number;
  reference_invoice_id?: string;
  description: string;
}

export interface AgingBucket {
  bucket: 'Current' | '1-30 Days' | '31-60 Days' | '61-90 Days' | '90+ Days';
  total_amount: number;
  invoice_count: number;
  allowance_rate: number;
  estimated_allowance: number;
}

export interface ComplianceIssue {
  transaction_id: string;
  issue_type: 'Invalid Debit Account' | 'Invalid Credit Account' | 'Data Integrity';
  description: string;
  severity: 'High' | 'Medium' | 'Low';
}

export enum ViewState {
  DASHBOARD = 'DASHBOARD',
  COMPLIANCE = 'COMPLIANCE',
  AGING = 'AGING',
  AI_RISK = 'AI_RISK',
  UPLOAD = 'UPLOAD'
}
