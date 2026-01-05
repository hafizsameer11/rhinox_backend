import nodemailer from 'nodemailer';

/**
 * Email Service
 * Handles sending emails (OTP, notifications, etc.)
 * 
 * SMTP Configuration via environment variables:
 * - SMTP_HOST: SMTP server host (e.g., smtp.gmail.com, smtp.sendgrid.net)
 * - SMTP_PORT: SMTP port (usually 587 for TLS, 465 for SSL)
 * - SMTP_SECURE: Use SSL (true/false, default: false for port 587, true for 465)
 * - SMTP_USER: SMTP username/email
 * - SMTP_PASS: SMTP password/app password
 * - FROM_EMAIL: Email address to send from
 * - FROM_NAME: Name to display as sender (optional)
 */

/**
 * Create email transporter
 */
const createTransporter = () => {
  // If SMTP is not configured, return null (will log to console)
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  const secure = process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465';
  const port = parseInt(process.env.SMTP_PORT || '587', 10);

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: port,
    secure: secure, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // For Gmail, you may need:
    // tls: {
    //   rejectUnauthorized: false
    // }
  });
};

/**
 * Send email (exported for use in other services)
 */
export const sendEmail = async (to: string, subject: string, html: string): Promise<void> => {
  const transporter = createTransporter();
  const fromEmail = process.env.FROM_EMAIL || process.env.SMTP_USER || 'noreply@rhinoxpay.com';
  const fromName = process.env.FROM_NAME || 'Rhinox Pay';

  // If SMTP is not configured, log to console (development mode)
  if (!transporter) {
    console.log('📧 [EMAIL NOT CONFIGURED - Logging to console]');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('HTML:', html);
    console.log('---');
    console.log('💡 To enable email sending, configure SMTP environment variables:');
    console.log('   - SMTP_HOST (e.g., smtp.gmail.com)');
    console.log('   - SMTP_PORT (e.g., 587)');
    console.log('   - SMTP_USER (your email)');
    console.log('   - SMTP_PASS (your password/app password)');
    console.log('   - FROM_EMAIL (sender email)');
    console.log('---');
    return;
  }

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: to,
      subject: subject,
      html: html,
    });

    console.log('📧 Email sent successfully:', info.messageId);
  } catch (error: any) {
    console.error('❌ Failed to send email:', error.message);
    // Don't throw - log error but don't break the flow
    // In production, you might want to queue failed emails for retry
  }
};

/**
 * Send OTP email
 */
export const sendOTPEmail = async (email: string, code: string, type: 'email' | 'phone' | 'password_reset' = 'email'): Promise<void> => {
  let subject: string;
  let title: string;
  
  if (type === 'password_reset') {
    subject = 'Password Reset Code - Rhinox Pay';
    title = 'Password Reset Code';
  } else if (type === 'email') {
    subject = 'Email Verification Code - Rhinox Pay';
    title = 'Email Verification Code';
  } else {
    subject = 'Phone Verification Code - Rhinox Pay';
    title = 'Phone Verification Code';
  }
  
  const message = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #333;">${title}</h2>
      <p>Your verification code is:</p>
      <div style="background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0; border-radius: 5px;">
        ${code}
      </div>
      <p>This code will expire in 10 minutes.</p>
      <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="color: #999; font-size: 11px;">This is an automated message from Rhinox Pay. Please do not reply to this email.</p>
    </div>
  `;

  await sendEmail(email, subject, message);
};

/**
 * Generate 5-digit OTP code
 */
export const generateOTP = (): string => {
  return Math.floor(10000 + Math.random() * 90000).toString(); // 5-digit code
};
