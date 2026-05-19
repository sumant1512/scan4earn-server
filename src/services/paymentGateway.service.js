/**
 * Payment Gateway Service
 * Abstraction layer for UPI payout processing.
 *
 * Configured via environment variables:
 *   PAYMENT_GATEWAY=mock|razorpay   (default: mock)
 *   RAZORPAY_KEY_ID=<key>
 *   RAZORPAY_KEY_SECRET=<secret>
 *   GATEWAY_MOCK_FAIL_RATE=0        (0-100, % of mock calls that fail — useful for testing retry)
 */

const https = require('https');

/**
 * @typedef {Object} PayoutRequest
 * @property {number}  amount      - Amount in INR (e.g. 50.00)
 * @property {string}  upiId       - Destination UPI ID (e.g. user@upi)
 * @property {string}  referenceId - Idempotency key (cashback_transactions.id)
 * @property {string}  [remarks]   - Human-readable payment note
 *
 * @typedef {Object} PayoutResult
 * @property {string}  transactionId  - Gateway-assigned transaction ID
 * @property {string}  payoutReference - Gateway payout reference
 * @property {string}  status         - 'success'
 */

// ─── Mock Implementation ─────────────────────────────────────────────────────

/**
 * Mock payout — returns instantly without hitting any external API.
 * Simulates failure based on GATEWAY_MOCK_FAIL_RATE (default 0 = always succeed).
 * @param {PayoutRequest} req
 * @returns {Promise<PayoutResult>}
 */
async function mockPayout({ amount, upiId, referenceId }) {
  const failRate = parseInt(process.env.GATEWAY_MOCK_FAIL_RATE || '0', 10);

  if (failRate > 0 && Math.random() * 100 < failRate) {
    const err = new Error(`[Mock Gateway] Simulated payout failure (fail rate ${failRate}%)`);
    err.gatewayCode = 'MOCK_FAILURE';
    throw err;
  }

  console.log(`[Mock Gateway] Payout SUCCESS — ₹${amount} → ${upiId} (ref: ${referenceId})`);

  return {
    transactionId: `MOCK_TXN_${Date.now()}`,
    payoutReference: `MOCK_REF_${referenceId.slice(0, 8).toUpperCase()}`,
    status: 'success'
  };
}

// ─── Razorpay Implementation ──────────────────────────────────────────────────

/**
 * Make an HTTPS request to the Razorpay Payouts API.
 * Razorpay uses Basic auth: key_id:key_secret
 */
function razorpayRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      return reject(new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set'));
    }

    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const payload = JSON.stringify(body);

    const options = {
      hostname: 'api.razorpay.com',
      path,
      method,
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            const err = new Error(parsed.error?.description || `Razorpay error ${res.statusCode}`);
            err.gatewayCode = parsed.error?.code;
            err.statusCode = res.statusCode;
            reject(err);
          }
        } catch {
          reject(new Error(`Razorpay response parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Razorpay request timed out after 15s'));
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Razorpay UPI payout via Payouts API.
 * Requires a Razorpay X account with payout capability.
 * @param {PayoutRequest} req
 * @returns {Promise<PayoutResult>}
 */
async function razorpayPayout({ amount, upiId, referenceId, remarks }) {
  const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER;
  if (!accountNumber) throw new Error('RAZORPAY_ACCOUNT_NUMBER must be set');

  const body = {
    account_number: accountNumber,
    fund_account: {
      account_type: 'vpa',
      vpa: { address: upiId },
      contact: {
        name: 'Cashback Recipient',
        type: 'customer',
        reference_id: referenceId
      }
    },
    amount: Math.round(amount * 100), // Razorpay uses paise
    currency: 'INR',
    mode: 'UPI',
    purpose: 'cashback',
    reference_id: referenceId,
    narration: remarks || 'Cashback payout'
  };

  const result = await razorpayRequest('POST', '/v1/payouts', body);

  return {
    transactionId: result.id,
    payoutReference: result.reference_id || result.id,
    status: 'success'
  };
}

// ─── Public Interface ─────────────────────────────────────────────────────────

/**
 * Initiate a UPI payout. Delegates to the configured gateway.
 * Throws on failure — caller handles retry logic.
 * @param {PayoutRequest} request
 * @returns {Promise<PayoutResult>}
 */
async function initiateUpiPayout(request) {
  const gateway = (process.env.PAYMENT_GATEWAY || 'mock').toLowerCase();

  switch (gateway) {
    case 'mock':
      return mockPayout(request);
    case 'razorpay':
      return razorpayPayout(request);
    default:
      throw new Error(`Unknown PAYMENT_GATEWAY: "${gateway}". Use "mock" or "razorpay".`);
  }
}

module.exports = { initiateUpiPayout };
