/**
 * Email Service
 * Handles sending emails (OTP, notifications, etc.)
 * 
 * For development: Logs email to console
 * For production: Integrate with SendGrid, AWS SES, etc.
 */

/**
 * Send OTP email
 */
export const sendOTPEmail = async (email: string, code: string, type: 'email' | 'phone' = 'email'): Promise<void> => {
  const subject = type === 'email' 
    ? 'Email Verification Code - Rhinox Pay'
    : 'Phone Verification Code - Rhinox Pay';
  
  const message = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${subject}</h2>
      <p>Your verification code is:</p>
      <div style="background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
        ${code}
      </div>
      <p>This code will expire in 10 minutes.</p>
      <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
    </div>
  `;

  // In development: Log to console
  if (process.env.NODE_ENV === 'development') {
    console.log('📧 Email would be sent:');
    console.log('To:', email);
    console.log('Subject:', subject);
    console.log('Code:', code);
    console.log('---');
    return;
  }

  // In production: Use actual email service
  // Example with SendGrid:
  // const sgMail = require('@sendgrid/mail');
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // await sgMail.send({
  //   to: email,
  //   from: process.env.FROM_EMAIL,
  //   subject,
  //   html: message,
  // });

  // For now, just log
  console.log('📧 Email sent to:', email);
};

/**
 * Generate 5-digit OTP code
 */
export const generateOTP = (): string => {
  return Math.floor(10000 + Math.random() * 90000).toString(); // 5-digit code
};

