import React, { useState, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  Clock, 
  BrainCircuit, 
  CheckCircle, 
  AlertTriangle, 
  FileText,
  DollarSign,
  PieChart,
  Upload,
  RefreshCw,
  FileSpreadsheet,
  X,
  FileDown
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

import { 
  MOCK_COA, 
  MOCK_INVOICES, 
  MOCK_TRANSACTIONS, 
  MOCK_CUSTOMERS 
} from './constants';
import { 
  Transaction, 
  Account, 
  ComplianceIssue, 
  AgingBucket, 
  ViewState, 
  Customer,
  Invoice
} from './types';
import { generateCreditRiskAnalysis, generateAuditSummary } from './services/geminiService';

// --- LOGIC: COMPLIANCE CHECK ---
const checkCoaCompliance = (transactions: Transaction[], coa: Account[]): ComplianceIssue[] => {
  const accountIds = new Set(coa.map(a => a.account_id));
  const issues: ComplianceIssue[] = [];

  transactions.forEach(txn => {
    if (!accountIds.has(txn.debit_account_id)) {
      issues.push({
        transaction_id: txn.transaction_id,
        issue_type: 'Invalid Debit Account',
        description: `Debit Account ID ${txn.debit_account_id} not found in COA.`,
        severity: 'High'
      });
    }
    if (!accountIds.has(txn.credit_account_id)) {
      issues.push({
        transaction_id: txn.transaction_id,
        issue_type: 'Invalid Credit Account',
        description: `Credit Account ID ${txn.credit_account_id} not found in COA.`,
        severity: 'High'
      });
    }
  });
  return issues;
};

// --- LOGIC: AGING & ALLOWANCE CALCULATION ---
const calculateAllowance = (invoices: Invoice[], referenceDateStr: string = '2024-07-01'): AgingBucket[] => {
  const REF_DATE = new Date(referenceDateStr); 

  const buckets: AgingBucket[] = [
    { bucket: 'Current', total_amount: 0, invoice_count: 0, allowance_rate: 0.01, estimated_allowance: 0 },
    { bucket: '1-30 Days', total_amount: 0, invoice_count: 0, allowance_rate: 0.05, estimated_allowance: 0 },
    { bucket: '31-60 Days', total_amount: 0, invoice_count: 0, allowance_rate: 0.10, estimated_allowance: 0 },
    { bucket: '61-90 Days', total_amount: 0, invoice_count: 0, allowance_rate: 0.25, estimated_allowance: 0 },
    { bucket: '90+ Days', total_amount: 0, invoice_count: 0, allowance_rate: 0.50, estimated_allowance: 0 },
  ];

  invoices.forEach(inv => {
    if (inv.balance_due <= 0) return;

    const dueDate = new Date(inv.due_date);
    const diffTime = REF_DATE.getTime() - dueDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    // If diffDays is negative, it means it's not due yet (Current)
    // If diffDays is positive, it is overdue

    let bucketIndex = 0;
    if (diffDays <= 0) {
      bucketIndex = 0; // Current
    } else if (diffDays <= 30) {
      bucketIndex = 1;
    } else if (diffDays <= 60) {
      bucketIndex = 2;
    } else if (diffDays <= 90) {
      bucketIndex = 3;
    } else {
      bucketIndex = 4;
    }

    buckets[bucketIndex].total_amount += inv.balance_due;
    buckets[bucketIndex].invoice_count += 1;
  });

  // Calculate allowance
  buckets.forEach(b => {
    b.estimated_allowance = b.total_amount * b.allowance_rate;
  });

  return buckets;
};

// --- UTILS: CSV PARSER ---
const parseCSVLine = (line: string): string[] => {
  const values: string[] = [];
  let inQuote = false;
  let currentValue = '';
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuote = !inQuote;
    } else if (char === ',' && !inQuote) {
      values.push(currentValue.trim());
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  values.push(currentValue.trim());
  return values;
};

const parseCSVData = (content: string) => {
  const lines = content.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) return { headers: [], data: [] };

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  
  const data = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj: any = {};
    
    headers.forEach((h, i) => {
      let val = values[i]?.replace(/^"|"$/g, ''); // Unquote
      
      // Auto-convert numbers
      if (['original_amount', 'amount_paid', 'balance_due', 'amount'].includes(h)) {
        obj[h] = parseFloat(val) || 0;
      } else if (h === 'risk_score_history') {
        // Handle array separated by semicolon e.g. "10;20;30"
        obj[h] = val ? val.split(';').map((n: string) => parseFloat(n) || 0) : [];
      } else {
        obj[h] = val;
      }
    });
    return obj;
  });

  return { headers, data };
};


// --- COMPONENTS ---

const MetricCard = ({ title, value, subtext, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-start justify-between">
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <h3 className="text-2xl font-bold text-slate-800 mt-1">{value}</h3>
      {subtext && <p className="text-xs text-slate-400 mt-1">{subtext}</p>}
    </div>
    <div className={`p-3 rounded-lg ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
  </div>
);

// --- CSV TEMPLATE DATA ---
const CSV_TEMPLATES = {
  coa: {
    title: 'Chart of Accounts (COA)',
    filename: 'template_coa.csv',
    content: 'account_id,account_name,account_type\n1100,Cash,Asset\n1200,Accounts Receivable,Asset\n4000,Sales Revenue,Revenue\n5000,Cost of Goods Sold,Expense',
    headers: ['account_id', 'account_name', 'account_type']
  },
  transactions: {
    title: 'Transactions (Journal)',
    filename: 'template_transactions.csv',
    content: 'transaction_id,transaction_date,debit_account_id,credit_account_id,amount,reference_invoice_id,description\nTXN-001,2024-05-01,1200,4000,5000,INV-1001,Credit Sale to Acme',
    headers: ['transaction_id', 'transaction_date', 'debit_account_id', 'credit_account_id', 'amount', 'reference_invoice_id', 'description']
  },
  invoices: {
    title: 'Invoices (AR Detail)',
    filename: 'template_invoices.csv',
    content: 'invoice_id,customer_id,invoice_date,due_date,original_amount,amount_paid,balance_due,status\nINV-1001,CUST-001,2024-05-01,2024-05-31,5000,0,5000,Open',
    headers: ['invoice_id', 'customer_id', 'invoice_date', 'due_date', 'original_amount', 'amount_paid', 'balance_due', 'status']
  },
  customers: {
    title: 'Customer Master',
    filename: 'template_customers.csv',
    content: 'customer_id,name,email,risk_score_history\nCUST-001,Acme Corp,finance@acme.com,10;12;10',
    headers: ['customer_id', 'name', 'email', 'risk_score_history (semicolon separated)']
  }
};

export default function App() {
  const [currentView, setCurrentView] = useState<ViewState>(ViewState.DASHBOARD);
  
  // -- APP STATE (Dynamic Data) --
  const [transactions, setTransactions] = useState<Transaction[]>(MOCK_TRANSACTIONS);
  const [invoices, setInvoices] = useState<Invoice[]>(MOCK_INVOICES);
  const [customers, setCustomers] = useState<Customer[]>(MOCK_CUSTOMERS);
  const [coa, setCoa] = useState<Account[]>(MOCK_COA);
  
  // Determine reference date for aging (Default to '2024-07-01' for mock, or max invoice date + 1 for custom)
  // For simplicity, we keep it fixed in UI but could be dynamic
  const referenceDate = '2024-07-01';

  // -- COMPUTED --
  const complianceIssues = useMemo(() => checkCoaCompliance(transactions, coa), [transactions, coa]);
  const agingData = useMemo(() => calculateAllowance(invoices, referenceDate), [invoices, referenceDate]);
  
  const totalReceivables = agingData.reduce((sum, b) => sum + b.total_amount, 0);
  const totalAllowance = agingData.reduce((sum, b) => sum + b.estimated_allowance, 0);
  
  // -- AI STATE --
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [summaryReport, setSummaryReport] = useState<string>("");

  // -- UI STATE --
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // -- UPLOAD HANDLERS --
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    let loadedInfo = [];
    
    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();

      if (file.name.endsWith('.json')) {
        try {
          const json = JSON.parse(text);
          if (json.transactions) { setTransactions(json.transactions); loadedInfo.push('Transactions (JSON)'); }
          if (json.invoices) { setInvoices(json.invoices); loadedInfo.push('Invoices (JSON)'); }
          if (json.customers) { setCustomers(json.customers); loadedInfo.push('Customers (JSON)'); }
          if (json.coa) { setCoa(json.coa); loadedInfo.push('COA (JSON)'); }
        } catch (e) {
          console.error("JSON Error", e);
        }
      } else if (file.name.endsWith('.csv')) {
        const { headers, data } = parseCSVData(text);
        
        // Auto-detect type based on headers
        if (headers.includes('account_id') && headers.includes('account_type')) {
          setCoa(data);
          loadedInfo.push('COA (CSV)');
        } else if (headers.includes('customer_id') && headers.includes('risk_score_history')) {
          setCustomers(data);
          loadedInfo.push('Customers (CSV)');
        } else if (headers.includes('invoice_id') && headers.includes('balance_due')) {
          setInvoices(data);
          loadedInfo.push('Invoices (CSV)');
        } else if (headers.includes('transaction_id') && headers.includes('debit_account_id')) {
          setTransactions(data);
          loadedInfo.push('Transactions (CSV)');
        }
      }
    }

    if (loadedInfo.length > 0) {
      alert(`Successfully loaded: ${loadedInfo.join(', ')}`);
      setCurrentView(ViewState.DASHBOARD);
    } else {
      alert("No recognized data found. Please check CSV headers.");
    }
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleResetData = () => {
    if (window.confirm("Reset all data to default Mock Data?")) {
      setTransactions(MOCK_TRANSACTIONS);
      setInvoices(MOCK_INVOICES);
      setCustomers(MOCK_CUSTOMERS);
      setCoa(MOCK_COA);
      alert("Data reset to defaults.");
    }
  };

  const downloadSample = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAnalyzeCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsAnalyzing(true);
    setAiAnalysis("");
    const result = await generateCreditRiskAnalysis(customer, invoices);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  const handleGenerateSummary = async () => {
    setIsAnalyzing(true);
    const result = await generateAuditSummary(complianceIssues.length, agingData);
    setSummaryReport(result);
    setIsAnalyzing(false);
  }

  // --- VIEWS ---

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard 
          title="Total Receivables" 
          value={`$${totalReceivables.toLocaleString()}`} 
          icon={DollarSign} 
          color="bg-indigo-600" 
        />
        <MetricCard 
          title="Est. Allowance" 
          value={`$${totalAllowance.toLocaleString()}`} 
          subtext={`${totalReceivables > 0 ? ((totalAllowance/totalReceivables)*100).toFixed(1) : 0}% of AR`}
          icon={PieChart} 
          color="bg-amber-500" 
        />
        <MetricCard 
          title="Compliance Issues" 
          value={complianceIssues.length} 
          subtext="Requires immediate attention"
          icon={ShieldAlert} 
          color="bg-red-500" 
        />
        <MetricCard 
          title="Records Audited" 
          value={transactions.length} 
          subtext="Total Transactions Processed"
          icon={CheckCircle} 
          color="bg-emerald-500" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Aging Schedule Analysis</h3>
          {/* FIXED: Explicitly set height and width in style to prevent Recharts -1 error before Tailwind loads */}
          <div style={{ width: '100%', height: '300px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tick={{fontSize: 12}} />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                  contentStyle={{ backgroundColor: '#1e293b', color: '#fff', borderRadius: '8px', border: 'none' }}
                />
                <Legend />
                <Bar dataKey="total_amount" name="Total Exposure" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="estimated_allowance" name="Rec. Allowance" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
           <h3 className="text-lg font-bold text-slate-800 mb-4">AI Audit Executive Summary</h3>
           {summaryReport ? (
             <div className="p-4 bg-slate-50 rounded-lg text-sm text-slate-700 leading-relaxed overflow-y-auto max-h-60">
               {summaryReport}
             </div>
           ) : (
             <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
               <BrainCircuit className="w-12 h-12 text-slate-300" />
               <p className="text-slate-500 text-sm">Generate an executive summary based on current findings.</p>
               <button 
                onClick={handleGenerateSummary}
                disabled={isAnalyzing}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
               >
                 {isAnalyzing ? 'Thinking...' : 'Generate Report'}
               </button>
             </div>
           )}
        </div>
      </div>
    </div>
  );

  const renderCompliance = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex justify-between items-center">
        <div>
           <h2 className="text-xl font-bold text-slate-800">COA Compliance Audit</h2>
           <p className="text-slate-500 text-sm mt-1">Automated test for transactions referencing invalid General Ledger accounts.</p>
        </div>
        <div className="bg-red-50 text-red-700 px-3 py-1 rounded-full text-xs font-bold border border-red-200">
          {complianceIssues.length} Anomalies Found
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
            <tr>
              <th className="p-4">Txn ID</th>
              <th className="p-4">Issue Type</th>
              <th className="p-4">Description</th>
              <th className="p-4">Severity</th>
              <th className="p-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {complianceIssues.map((issue) => (
              <tr key={issue.transaction_id} className="hover:bg-slate-50 transition-colors">
                <td className="p-4 font-mono text-slate-600">{issue.transaction_id}</td>
                <td className="p-4 text-slate-800 font-medium">{issue.issue_type}</td>
                <td className="p-4 text-slate-600">{issue.description}</td>
                <td className="p-4">
                  <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold">
                    {issue.severity}
                  </span>
                </td>
                <td className="p-4">
                  <button className="text-indigo-600 hover:text-indigo-800 font-medium text-xs">Investigate</button>
                </td>
              </tr>
            ))}
            {complianceIssues.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500">
                  <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  No compliance issues found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAging = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <h2 className="text-xl font-bold text-slate-800 mb-2">Allowance for Doubtful Accounts Calculation</h2>
        <p className="text-slate-500 text-sm mb-6">Substantive analytical procedure based on historical loss rates per aging bucket. Ref Date: {referenceDate}</p>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-100">
              <tr>
                <th className="p-4">Aging Bucket</th>
                <th className="p-4 text-right">Invoice Count</th>
                <th className="p-4 text-right">Total Exposure</th>
                <th className="p-4 text-right">Loss Rate</th>
                <th className="p-4 text-right">Required Allowance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agingData.map((bucket, idx) => (
                <tr key={idx}>
                  <td className="p-4 font-medium text-slate-800">{bucket.bucket}</td>
                  <td className="p-4 text-right text-slate-600">{bucket.invoice_count}</td>
                  <td className="p-4 text-right font-mono text-slate-700">${bucket.total_amount.toLocaleString()}</td>
                  <td className="p-4 text-right text-slate-600">{(bucket.allowance_rate * 100).toFixed(0)}%</td>
                  <td className="p-4 text-right font-mono font-bold text-amber-600">${bucket.estimated_allowance.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-bold">
                <td className="p-4">TOTAL</td>
                <td className="p-4 text-right">{agingData.reduce((a,b) => a + b.invoice_count, 0)}</td>
                <td className="p-4 text-right">${totalReceivables.toLocaleString()}</td>
                <td className="p-4 text-right">-</td>
                <td className="p-4 text-right text-amber-700">${totalAllowance.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderRisk = () => (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <h2 className="text-xl font-bold text-slate-800">Customer Risk Profiling</h2>
        <p className="text-slate-500 text-sm">Select a customer to perform AI-driven credit risk analysis based on payment history and current exposure.</p>
        
        <div className="space-y-3 mt-4 max-h-[600px] overflow-y-auto">
          {customers.map(cust => (
            <div 
              key={cust.customer_id}
              onClick={() => handleAnalyzeCustomer(cust)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                selectedCustomer?.customer_id === cust.customer_id 
                ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500' 
                : 'bg-white border-slate-200 hover:border-indigo-300'
              }`}
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-700">{cust.name}</h3>
                <span className="text-xs bg-slate-100 px-2 py-1 rounded text-slate-600">{cust.customer_id}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">{cust.email}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="bg-white h-full rounded-xl shadow-sm border border-slate-100 p-6">
           {!selectedCustomer ? (
             <div className="h-full flex flex-col items-center justify-center text-slate-400">
               <BrainCircuit className="w-16 h-16 mb-4 opacity-50" />
               <p>Select a customer to begin analysis</p>
             </div>
           ) : (
             <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                    <BrainCircuit className="w-6 h-6 text-indigo-600" />
                    Audit Analysis: {selectedCustomer.name}
                  </h3>
                  {isAnalyzing && (
                    <span className="flex items-center gap-2 text-indigo-600 text-sm font-medium animate-pulse">
                      <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
                      Processing with Gemini...
                    </span>
                  )}
                </div>
                
                <div className="prose prose-sm max-w-none text-slate-700">
                  {isAnalyzing ? (
                    <div className="space-y-3">
                      <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                      <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                      <div className="h-4 bg-slate-100 rounded w-5/6"></div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed bg-slate-50 p-6 rounded-lg border border-slate-200">
                      {aiAnalysis}
                    </div>
                  )}
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );

  const renderUpload = () => (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 text-center">
        <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <Upload className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload Synthetic Dataset</h2>
        <p className="text-slate-500 mb-8 max-w-md mx-auto">
          Import your dataset in <strong>JSON</strong> or <strong>CSV</strong> format. 
          You can select multiple CSV files at once (e.g., <code>transactions.csv</code>, <code>invoices.csv</code>).
          The system will auto-detect the data type based on headers.
        </p>

        <input 
          type="file" 
          accept=".json, .csv"
          multiple
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden" 
        />
        
        <div className="flex justify-center gap-4">
           <button 
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
           >
             <Upload className="w-4 h-4" />
             Select Files (JSON or CSV)
           </button>
           
           <button 
            onClick={() => setIsGuideOpen(true)}
            className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2"
           >
             <FileSpreadsheet className="w-4 h-4" />
             View CSV Format Guide
           </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-bold text-slate-800">Current Data Statistics</h3>
          <button 
            onClick={handleResetData}
            className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            Reset to Defaults
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-50 rounded-lg">
            <span className="block text-slate-400 text-xs font-bold uppercase">Transactions</span>
            <span className="block text-xl font-bold text-slate-800">{transactions.length}</span>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <span className="block text-slate-400 text-xs font-bold uppercase">Invoices</span>
            <span className="block text-xl font-bold text-slate-800">{invoices.length}</span>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <span className="block text-slate-400 text-xs font-bold uppercase">Customers</span>
            <span className="block text-xl font-bold text-slate-800">{customers.length}</span>
          </div>
          <div className="p-4 bg-slate-50 rounded-lg">
            <span className="block text-slate-400 text-xs font-bold uppercase">COA Accounts</span>
            <span className="block text-xl font-bold text-slate-800">{coa.length}</span>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 text-blue-800 rounded-lg text-sm border border-blue-100">
           <strong>CSV Header Requirements (Auto-Detection):</strong>
           <ul className="list-disc ml-5 mt-2 space-y-1 text-xs">
             <li><strong>COA:</strong> Must contain <code>account_id</code>, <code>account_name</code>, <code>account_type</code></li>
             <li><strong>Customers:</strong> Must contain <code>customer_id</code>, <code>risk_score_history</code> (semicolon separated for array, e.g. "10;20")</li>
             <li><strong>Invoices:</strong> Must contain <code>invoice_id</code>, <code>balance_due</code></li>
             <li><strong>Transactions:</strong> Must contain <code>transaction_id</code>, <code>debit_account_id</code></li>
           </ul>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex font-sans text-slate-900 bg-slate-50 relative">
      {/* GUIDE MODAL */}
      {isGuideOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center sticky top-0 bg-white z-10">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                CSV Format Templates
              </h2>
              <button 
                onClick={() => setIsGuideOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              {Object.values(CSV_TEMPLATES).map((tmpl, idx) => (
                <div key={idx} className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-slate-700">{tmpl.title}</h3>
                    <button 
                      onClick={() => downloadSample(tmpl.filename, tmpl.content)}
                      className="text-xs flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded text-indigo-600 hover:text-indigo-800 hover:border-indigo-300 transition-colors font-medium"
                    >
                      <FileDown className="w-3 h-3" />
                      Download
                    </button>
                  </div>
                  
                  <div className="mb-2">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Required Headers:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tmpl.headers.map((h, i) => (
                        <span key={i} className="text-xs bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">{h}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                     <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Sample Data:</span>
                     <pre className="text-[10px] leading-relaxed bg-slate-800 text-slate-300 p-2 rounded mt-1 overflow-x-auto font-mono">
                       {tmpl.content}
                     </pre>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 text-center">
              <button 
                onClick={() => setIsGuideOpen(false)}
                className="px-6 py-2 bg-slate-800 text-white font-medium rounded-lg hover:bg-slate-900 transition-colors"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col fixed h-full z-10">
        <div className="p-6 border-b border-slate-800">
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-8 h-8 text-indigo-500" />
            AuditGuard
          </h1>
          <p className="text-xs text-slate-500 mt-2">v2.5.0 • Enterprise</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setCurrentView(ViewState.DASHBOARD)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === ViewState.DASHBOARD ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Dashboard
          </button>
          
          <button 
            onClick={() => setCurrentView(ViewState.COMPLIANCE)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === ViewState.COMPLIANCE ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <FileText className="w-5 h-5" />
            Compliance Check
          </button>
          
          <button 
            onClick={() => setCurrentView(ViewState.AGING)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === ViewState.AGING ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Clock className="w-5 h-5" />
            Aging & Allowance
          </button>
          
          <button 
            onClick={() => setCurrentView(ViewState.AI_RISK)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === ViewState.AI_RISK ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <BrainCircuit className="w-5 h-5" />
            AI Risk Center
          </button>

          <div className="my-2 border-t border-slate-800"></div>

          <button 
            onClick={() => setCurrentView(ViewState.UPLOAD)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${currentView === ViewState.UPLOAD ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'}`}
          >
            <Upload className="w-5 h-5" />
            Upload Dataset
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
           <div className="bg-slate-800 rounded-lg p-3">
             <p className="text-xs font-medium text-slate-400">Current User</p>
             <p className="text-sm font-bold text-white">Lead Auditor</p>
           </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-64 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
           <div>
             <h2 className="text-2xl font-bold text-slate-900">
               {currentView === ViewState.DASHBOARD && 'Audit Dashboard'}
               {currentView === ViewState.COMPLIANCE && 'Transaction Compliance'}
               {currentView === ViewState.AGING && 'Aging Analysis'}
               {currentView === ViewState.AI_RISK && 'Predictive Risk Intelligence'}
               {currentView === ViewState.UPLOAD && 'Data Management'}
             </h2>
             <p className="text-slate-500">Cycle: Accounts Receivable • FY 2024</p>
           </div>
           <div className="flex gap-3">
             <button className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50">
               <AlertTriangle className="w-4 h-4 text-amber-500" />
               Flagged Items ({complianceIssues.length})
             </button>
           </div>
        </header>

        {currentView === ViewState.DASHBOARD && renderDashboard()}
        {currentView === ViewState.COMPLIANCE && renderCompliance()}
        {currentView === ViewState.AGING && renderAging()}
        {currentView === ViewState.AI_RISK && renderRisk()}
        {currentView === ViewState.UPLOAD && renderUpload()}
      </main>
    </div>
  );
}