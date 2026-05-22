const { google } = require("googleapis");

// Google OAuth2 email client (optional)
let oAuth2Client = null;
let gmail = null;

if (process.env.GOOGLE_OAUTH_CREDENTIALS && process.env.GOOGLE_OAUTH_TOKEN) {
  try {
    const credentials = JSON.parse(process.env.GOOGLE_OAUTH_CREDENTIALS);
    const token = JSON.parse(process.env.GOOGLE_OAUTH_TOKEN);

    const { client_id, client_secret, redirect_uris } = credentials.web;

    oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0],
    );

    oAuth2Client.setCredentials(token);
    gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  } catch (err) {
    console.warn('Failed to initialize Google OAuth client:', err.message);
    oAuth2Client = null;
    gmail = null;
  }
} else {
  console.warn('Google OAuth credentials not configured. Email service will be disabled.');
}

function makeEmail(to, subject, html) {
  const messageParts = [
    `To: ${to}`,
    "Content-Type: text/html; charset=utf-8",
    `Subject: ${subject}`,
    "",
    html,
  ];

  const message = messageParts.join("\n");

  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send OTP email
 */
const sendOTPEmail = async (to, subject = "Your Login OTP", otp) => {
  // If OAuth isn't configured, skip email sending (local/dev mode)
  if (!gmail) {
    console.warn('OAuth email not configured; skipping OTP send.');
    return { skipped: true, reason: 'OAuth email not configured' };
  }

  const mailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #007bff; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
            .otp-code {
              font-size: 32px;
              font-weight: bold;
              color: #007bff;
              text-align: center;
              padding: 20px;
              background: white;
              border-radius: 5px;
              letter-spacing: 5px;
            }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>TMS System Login</h1>
            </div>
            <div class="content">
              <h2>Your One-Time Password</h2>
              <p>Use the following OTP to log in to your account:</p>
              <div class="otp-code">${otp}</div>
              <p><strong>This code will expire in 5 minutes.</strong></p>
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
            <div class="footer">
              <p>This is an automated message, please do not reply.</p>
              <p>© ${new Date().getFullYear()} TMS System. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
  `;

  const rawEmail = makeEmail(to, subject, mailContent);

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawEmail },
    });

    return res.data;
  } catch (error) {
    // Common issue: Google OAuth token invalid/expired (invalid_grant)
    // Gaxios wraps errors and can nest response data under `cause`.
    const gaxiosError = error?.response ? error : error?.cause || error;
    const errorCode =
      gaxiosError?.response?.data?.error ||
      gaxiosError?.code ||
      (typeof gaxiosError?.message === 'string' && gaxiosError.message.includes('invalid_grant') ? 'invalid_grant' : null);

    if (errorCode === 'invalid_grant') {
      console.warn('OTP email not sent: OAuth token invalid/expired.');
      return { skipped: true, reason: 'OAuth token invalid or expired' };
    }

    console.error("❌ Error sending OTP email:", error);
    throw error;
  }
};

/**
 * Send welcome email to new customer / tenant
 */
const sendWelcomeEmail = async (to, companyName) => {
  const subject = "Welcome to SCAN4EARN System";
  const mailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
            .button {
              display: inline-block;
              background: #007bff;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin-top: 20px;
            }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to TMS!</h1>
            </div>
            <div class="content">
              <h2>Your Account Has Been Created</h2>
              <p>Hello ${companyName},</p>
              <p>Your TMS account has been successfully created by our administrator.</p>
              <p>You can now log in to the system using your email address. We use secure OTP (One-Time Password) authentication, so you'll receive a code via email each time you log in.</p>
              <p><strong>Your login email:</strong> ${to}</p>
              <p>To get started, visit the login page and enter your email address to receive an OTP code.</p>
              <a href="${process.env.CORS_ORIGIN || "http://scan4earn.com"}" class="button">Go to Login</a>
            </div>
            <div class="footer">
              <p>If you have any questions, please contact your system administrator.</p>
              <p>© ${new Date().getFullYear()} TMS System. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
  `;

  const rawEmail = makeEmail(to, subject, mailContent);

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawEmail },
    });

    return res.data;
  } catch (error) {
    console.error("❌ Error sending registration email:", error);
    throw error;
  }
};

/**
 * Send Tenant Admin Welcome Email
 */
const sendTenantAdminWelcomeEmail = async (email, fullName, tenant) => {
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  const baseDomain = process.env.DOMAIN_BASE || "scan4earn.com";
  const port = process.env.NODE_ENV === "production" ? "" : ":4200";
  const loginUrl = `${protocol}://${tenant.subdomain}.${baseDomain}${port}`;
  const subject = `Welcome to Scan4Earn - You're now a Tenant Admin for ${tenant.name}`;

  const mailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #007bff; color: white; padding: 30px; text-align: center; border-radius: 5px 5px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
            .info-box { background: white; padding: 20px; border-left: 4px solid #007bff; margin: 20px 0; }
            .btn {
              display: inline-block;
              background: #007bff;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .capabilities { background: white; padding: 20px; margin: 20px 0; border-radius: 5px; }
            .capabilities li { margin: 10px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to Scan4Earn!</h1>
              <p>You're now a Tenant Admin</p>
            </div>
            <div class="content">
              <p>Hi ${fullName},</p>

              <p>You've been added as a <strong>Tenant Admin</strong> for <strong>${tenant.name}</strong> on Scan4Earn.</p>

              <div class="info-box">
                <h3>📍 Your Login Details:</h3>
                <p><strong>URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
                <p><strong>Email:</strong> ${email}</p>
                <p style="margin-top: 15px;">Please use the "Forgot Password" link on the login page to set your password.</p>
              </div>

              <div class="capabilities">
                <h3>✨ As a Tenant Admin, you can:</h3>
                <ul>
                  <li>✓ Create and manage coupons and batches</li>
                  <li>✓ Manage products and templates</li>
                  <li>✓ View analytics and scan reports</li>
                  <li>✓ Configure tenant settings</li>
                  <li>✓ Manage tenant users</li>
                  <li>✓ Request additional credits</li>
                </ul>
              </div>

              <div style="text-align: center;">
                <a href="${loginUrl}" class="btn">Login to Dashboard →</a>
              </div>

              <p style="margin-top: 30px;">If you have any questions or need assistance, please contact support.</p>

              <p>Best regards,<br>The Scan4Earn Team</p>
            </div>
            <div class="footer">
              <p>This is an automated message, please do not reply.</p>
              <p>© ${new Date().getFullYear()} Scan4Earn. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
  `;

  const rawEmail = makeEmail(email, subject, mailContent);

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawEmail },
    });

    return res.data;
  } catch (error) {
    console.error("❌ Error sending Welcome Email:", error);
    throw error;
  }
};

/**
 * Send credit approval notification
 */
const sendCreditApprovalEmail = async (email, companyName, amount) => {
  const subject = "Credit Request Approved - TMS System";
  const mailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
            .credit-amount {
              font-size: 28px;
              font-weight: bold;
              color: #28a745;
              text-align: center;
              padding: 20px;
            }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Credit Request Approved</h1>
            </div>
            <div class="content">
              <h2>Good News, ${companyName}!</h2>
              <p>Your credit request has been approved by the administrator.</p>
              <div class="credit-amount">${amount} Credits Added</div>
              <p>You can now use these credits to create coupons and promotional offers in the TMS system.</p>
              <p>Log in to your account to start creating campaigns!</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} TMS System. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
  `;

  const rawEmail = makeEmail(email, subject, mailContent);

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawEmail },
    });

    return res.data;
  } catch (error) {
    console.error("❌ Error sending credit approval email:", error);
    throw error;
  }
};

/**
 * Send credit rejection notification
 */
const sendCreditRejectionEmail = async (email, companyName, amount, reason) => {
  const subject = "Credit Request Update - TMS System";
  const mailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
            .reason-box {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              margin: 20px 0;
            }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Credit Request Update</h1>
            </div>
            <div class="content">
              <h2>Hello ${companyName},</h2>
              <p>Your request for ${amount} credits has been reviewed.</p>
              <div class="reason-box">
                <strong>Administrator Note:</strong><br>
                ${reason}
              </div>
              <p>If you have questions or would like to discuss this decision, please contact your administrator.</p>
              <p>You can submit a new credit request at any time through the TMS system.</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} TMS System. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
  `;

  const rawEmail = makeEmail(email, subject, mailContent);

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawEmail },
    });

    return res.data;
  } catch (error) {
    console.error("❌ Error sending credit rejection email:", error);
    throw error;
  }
};

/**
 * Send tenant status change notification
 */
const sendTenantStatusChangeEmail = async (email, companyName, isActive) => {
  const statusText = isActive ? "Account Activated" : "Account Deactivated";
  const statusIcon = isActive ? "✅" : "⚠️";
  const headerColor = isActive ? "#28a745" : "#dc3545";
  const subject = `${statusText} - TMS System`;

  const mailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: ${headerColor}; color: white; padding: 20px; text-align: center; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 5px; margin-top: 20px; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${statusIcon} ${statusText}</h1>
            </div>
            <div class="content">
              <h2>Hello ${companyName},</h2>
              <p>Your TMS account status has been changed to: <strong>${isActive ? "Active" : "Inactive"}</strong></p>
              ${isActive
                ? "<p>You can now access all features of the TMS system. Log in to start managing your campaigns.</p>"
                : "<p>Your account has been temporarily deactivated. You will not be able to access the system until it is reactivated.</p>"
              }
              <p>If you have any questions, please contact your system administrator.</p>
            </div>
            <div class="footer">
              <p>© ${new Date().getFullYear()} TMS System. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
  `;

  const rawEmail = makeEmail(email, subject, mailContent);

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawEmail },
    });

    return res.data;
  } catch (error) {
    console.error("❌ Error sending tenant status change email:", error);
    throw error;
  }
};

/**
 * Send contact us email
 */
const sendContactUsEmail = async (
  subject = "Customer wants to connect - PALS PAINT",
  mailContent = "Hey, Let's connect!",
  to = process.env.MAILER_EMAIL,
) => {
  const rawEmail = makeEmail(to, subject, mailContent);

  try {
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawEmail },
    });

    return res.data;
  } catch (error) {
    console.error("❌ Error sending contact us email:", error);
    throw error;
  }
};

module.exports = {
  sendOTPEmail,
  sendWelcomeEmail,
  sendTenantAdminWelcomeEmail,
  sendCreditApprovalEmail,
  sendCreditRejectionEmail,
  sendTenantStatusChangeEmail,
  sendContactUsEmail,
};
