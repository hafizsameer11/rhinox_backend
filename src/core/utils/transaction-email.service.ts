import { sendEmail } from './email.service.js';

/**
 * Transaction Email Service
 * Sends email notifications for transactions
 */

/**
 * Send deposit initiation email
 */
export const sendDepositInitiatedEmail = async (
  email: string,
  data: {
    amount: string;
    currency: string;
    reference: string;
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
    providerName?: string;
  }
): Promise<void> => {
  const subject = `Deposit Initiated - ${data.amount} ${data.currency}`;
  
  const isMobileMoney = !!data.providerName;
  
  const message = isMobileMoney ? `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Deposit Initiated</h2>
      <p>Your mobile money deposit request has been initiated. You will receive a mobile money prompt to confirm your payment.</p>
      
      <div style="background: #f0f0f0; padding: 20px; margin: 20px 0; border-radius: 5px;">
        <h3>Transaction Details:</h3>
        <p><strong>Amount:</strong> ${data.amount} ${data.currency}</p>
        <p><strong>Provider:</strong> ${data.providerName}</p>
        <p><strong>Reference:</strong> ${data.reference}</p>
      </div>
      
      <p style="color: #666; font-size: 12px;">
        <strong>Important:</strong> You will receive a mobile money prompt to confirm your payment. 
        Payment will take a few minutes to reflect in your wallet.
      </p>
    </div>
  ` : `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Deposit Initiated</h2>
      <p>Your deposit request has been initiated. Please complete the bank transfer using the details below:</p>
      
      <div style="background: #f0f0f0; padding: 20px; margin: 20px 0; border-radius: 5px;">
        <h3>Transfer Details:</h3>
        <p><strong>Amount:</strong> ${data.amount} ${data.currency}</p>
        <p><strong>Bank Name:</strong> ${data.bankName}</p>
        <p><strong>Account Number:</strong> ${data.accountNumber}</p>
        <p><strong>Account Name:</strong> ${data.accountName}</p>
        <p><strong>Reference:</strong> ${data.reference}</p>
      </div>
      
      <p style="color: #666; font-size: 12px;">
        <strong>Important:</strong> Use the reference number above when making the transfer. 
        Payment will be processed after verification.
      </p>
    </div>
  `;

  await sendEmail(email, subject, message);
};

/**
 * Send deposit success email
 */
export const sendDepositSuccessEmail = async (
  email: string,
  data: {
    amount: string;
    currency: string;
    creditedAmount: string;
    fee: string;
    reference: string;
    transactionId: string;
    country: string;
    channel: string;
    paymentMethod: string;
    provider?: string | null;
    date: string;
  }
): Promise<void> => {
  const subject = `Deposit Successful - ${data.amount} ${data.currency}`;
  
  const providerSection = data.provider ? `<p><strong>Provider:</strong> ${data.provider}</p>` : '';
  
  const message = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #28a745;">✅ Deposit Successful</h2>
      <p>Congratulations! Your deposit has been successfully processed.</p>
      
      <div style="background: #d4edda; padding: 20px; margin: 20px 0; border-radius: 5px; border-left: 4px solid #28a745;">
        <h3 style="color: #155724; margin-top: 0;">Transaction Details:</h3>
        <p><strong>Deposit Amount:</strong> ${data.amount} ${data.currency}</p>
        <p><strong>Fee:</strong> ${data.fee} ${data.currency}</p>
        <p><strong>Credited Amount:</strong> ${data.creditedAmount} ${data.currency}</p>
        <p><strong>Country:</strong> ${data.country}</p>
        <p><strong>Channel:</strong> ${data.channel}</p>
        <p><strong>Payment Method:</strong> ${data.paymentMethod}</p>
        ${providerSection}
        <p><strong>Transaction ID:</strong> ${data.transactionId}</p>
        <p><strong>Reference:</strong> ${data.reference}</p>
        <p><strong>Date:</strong> ${data.date}</p>
      </div>
      
      <p style="color: #666; font-size: 12px;">
        Thank you for using Rhinox Pay!
      </p>
    </div>
  `;

  await sendEmail(email, subject, message);
};

