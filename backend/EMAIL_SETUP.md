# Email/SMTP Configuration Guide

## Overview

The email service uses **Nodemailer** to send emails via SMTP. Currently, if SMTP is not configured, emails are logged to the console for development/testing.

## Environment Variables

Add these to your `.env` file:

```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com          # SMTP server host
SMTP_PORT=587                     # SMTP port (587 for TLS, 465 for SSL)
SMTP_SECURE=false                 # Use SSL (true for port 465, false for 587)
SMTP_USER=your-email@gmail.com    # SMTP username/email
SMTP_PASS=your-app-password       # SMTP password or app password
FROM_EMAIL=noreply@rhinoxpay.com  # Email address to send from
FROM_NAME=Rhinox Pay              # Display name for sender (optional)
```

## Common SMTP Providers

### Gmail

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Generate App Password in Google Account settings
FROM_EMAIL=your-email@gmail.com
FROM_NAME=Rhinox Pay
```

**Note:** For Gmail, you need to:
1. Enable 2-Step Verification
2. Generate an App Password (not your regular password)
3. Use the App Password in `SMTP_PASS`

### SendGrid

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
FROM_EMAIL=noreply@rhinoxpay.com
FROM_NAME=Rhinox Pay
```

### AWS SES

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com  # Use your region
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ses-smtp-username
SMTP_PASS=your-ses-smtp-password
FROM_EMAIL=noreply@rhinoxpay.com
FROM_NAME=Rhinox Pay
```

### Mailgun

```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-password
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Rhinox Pay
```

### Custom SMTP Server

```env
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-password
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Rhinox Pay
```

## Testing Email Configuration

1. Add SMTP variables to `.env`
2. Restart the server
3. Trigger an email (e.g., register a user, initiate deposit)
4. Check console logs for email sending status
5. Check your email inbox

## Development Mode (No SMTP)

If SMTP is not configured, emails will be logged to console with helpful messages:

```
📧 [EMAIL NOT CONFIGURED - Logging to console]
To: user@example.com
Subject: Email Verification Code - Rhinox Pay
...
💡 To enable email sending, configure SMTP environment variables:
   - SMTP_HOST (e.g., smtp.gmail.com)
   - SMTP_PORT (e.g., 587)
   - SMTP_USER (your email)
   - SMTP_PASS (your password/app password)
   - FROM_EMAIL (sender email)
```

## Email Types Sent

1. **OTP Emails** - Email verification codes
2. **Deposit Initiated** - When user initiates a deposit
3. **Deposit Success** - When deposit is confirmed
4. **Transfer Emails** - Transfer notifications (to be implemented)

## Troubleshooting

### Gmail "Less secure app access" error
- Use App Password instead of regular password
- Enable 2-Step Verification first

### Connection timeout
- Check firewall settings
- Verify SMTP_HOST and SMTP_PORT are correct
- Try different ports (587, 465, 25)

### Authentication failed
- Verify SMTP_USER and SMTP_PASS are correct
- For Gmail, ensure you're using App Password
- Check if your email provider requires specific authentication

### Emails going to spam
- Configure SPF, DKIM, and DMARC records for your domain
- Use a verified sender email address
- Consider using a dedicated email service (SendGrid, AWS SES)

