import { GoogleGenAI } from "@google/genai";
import { Customer, Invoice, AgingBucket } from '../types';

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const generateCreditRiskAnalysis = async (
  customer: Customer,
  invoices: Invoice[]
): Promise<string> => {
  const customerInvoices = invoices.filter(inv => inv.customer_id === customer.customer_id);
  
  // Calculate raw stats for the prompt
  const totalDue = customerInvoices.reduce((sum, inv) => sum + inv.balance_due, 0);
  const overdueCount = customerInvoices.filter(inv => new Date(inv.due_date) < new Date()).length;
  
  const prompt = `
    Role: You are a Senior Credit Risk Auditor.
    Task: Analyze the following customer for credit risk and suggest an audit approach.
    
    Customer Profile:
    - Name: ${customer.name}
    - Historical Risk Scores (Last 3 quarters): ${customer.risk_score_history.join(', ')} (Lower is better)
    
    Current Financial Status:
    - Total Balance Due: $${totalDue}
    - Number of Open Invoices: ${customerInvoices.length}
    - Number of Overdue Invoices: ${overdueCount}
    
    Invoices Details:
    ${JSON.stringify(customerInvoices.map(i => ({ date: i.invoice_date, due: i.due_date, amount: i.balance_due })), null, 2)}
    
    Please provide:
    1. A calculated risk assessment (Low/Medium/High).
    2. A brief analysis of their payment behavior.
    3. Recommended audit procedure (e.g., "Positive Confirmation Request", "Specific Allowance Provision").
    
    Keep the response concise and professional (under 200 words).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2, // Low temperature for analytical consistency
      }
    });
    return response.text || "Unable to generate analysis.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Error connecting to AI service. Please check API Key.";
  }
};

export const generateAuditSummary = async (
  complianceCount: number,
  agingBuckets: AgingBucket[]
): Promise<string> => {
  const prompt = `
    Role: You are a Chief Audit Executive.
    Task: Write a brief executive summary of the Accounts Receivable Audit findings.

    Data:
    1. Compliance Testing: We found ${complianceCount} transactions with invalid Chart of Accounts codes.
    2. Substantive Testing (Aging Analysis):
       ${JSON.stringify(agingBuckets)}

    Please summarize:
    - The overall health of the AR portfolio.
    - The adequacy of the allowance for doubtful accounts based on the aging.
    - Any immediate red flags regarding internal controls (compliance).
  `;

  try {
     const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.3,
      }
    });
    return response.text || "Unable to generate summary.";
  } catch (error) {
    return "Error generating summary.";
  }
}
