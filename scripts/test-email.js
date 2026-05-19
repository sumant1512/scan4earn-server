#!/usr/bin/env node

/**
 * Manual Email Testing Script
 * 
 * Usage:
 *   node scripts/test-email.js <email-address> [otp-code]
 * 
 * Examples:
 *   node scripts/test-email.js test@example.com
 *   node scripts/test-email.js test@example.com 123456
 */

require('dotenv').config();
const emailService = require('../src/services/email.service');

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('❌ Usage: node scripts/test-email.js <email-address> [otp-code]');
  process.exit(1);
}

const testEmail = args[0];
const testOTP = args[1] || Math.floor(100000 + Math.random() * 900000).toString();

// Validate email format
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
if (!emailRegex.test(testEmail)) {
  console.error('❌ Invalid email format:', testEmail);
  process.exit(1);
}

async function testEmailDelivery() {
  console.log('\n📧 Email Service Test');
  console.log('='.repeat(50));
  console.log(`📮 Recipient: ${testEmail}`);
  console.log(`🔑 OTP Code: ${testOTP}`);
  console.log('='.repeat(50));

  // Check environment variables
  console.log('\n🔍 Checking configuration...');
  const requiredVars = ['EMAIL_SERVICE', 'EMAIL_USER', 'EMAIL_PASSWORD', 'EMAIL_FROM'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    console.error('❌ Missing environment variables:', missingVars.join(', '));
    console.error('Please configure these in your .env file');
    process.exit(1);
  }

  console.log('✅ Configuration OK');
  console.log(`   Service: ${process.env.EMAIL_SERVICE}`);
  console.log(`   User: ${process.env.EMAIL_USER}`);
  console.log(`   From: ${process.env.EMAIL_FROM}`);

  // Test OTP email
  console.log('\n📤 Sending OTP email...');
  try {
    await emailService.sendOTPEmail(testEmail, testOTP);
    console.log('✅ OTP email sent successfully!');
    console.log('   Please check your inbox');
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  }

  // Test welcome email
  console.log('\n📤 Sending welcome email...');
  try {
    await emailService.sendWelcomeEmail(testEmail, 'Test User');
    console.log('✅ Welcome email sent successfully!');
    console.log('   Please check your inbox');
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error.message);
    console.error('   Details:', error);
    process.exit(1);
  }

  console.log('\n✨ All tests passed!');
  console.log('='.repeat(50));
  console.log('\n💡 Tips:');
  console.log('   - Check spam/junk folder if emails don\'t arrive');
  console.log('   - Verify SMTP credentials in .env file');
  console.log('   - For Gmail, use App Password if 2FA is enabled');
  console.log('   - Check firewall settings if connection times out');
  console.log('');
}

// Run the test
testEmailDelivery().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
