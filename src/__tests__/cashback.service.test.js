/**
 * Unit tests for cashback.service.js
 * Mocks the database and payment gateway — no real DB required.
 */

jest.mock('../config/database');
jest.mock('../services/paymentGateway.service');

const db = require('../config/database');
const { initiateUpiPayout } = require('../services/paymentGateway.service');
const cashbackService = require('../services/cashback.service');
const { UnprocessableError, ValidationError, ConflictError, NotFoundError } = require('../modules/common/errors/AppError');

// ─── executeTransaction helper ────────────────────────────────────────────────
// The service uses executeTransaction(db, callback). We replace it with a mock
// that calls the callback with a fake client and resolves.
jest.mock('../modules/common/utils/database.util', () => ({
  executeTransaction: jest.fn(async (pool, fn) => fn(pool))
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeClient(responses = []) {
  let call = 0;
  return {
    query: jest.fn(async () => responses[call++] || { rows: [] })
  };
}

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();
  db.query = jest.fn();
});

// ─── validateUpiId ────────────────────────────────────────────────────────────

describe('validateUpiId', () => {
  it('accepts valid UPI IDs', () => {
    expect(() => cashbackService.validateUpiId('user@okaxis')).not.toThrow();
    expect(() => cashbackService.validateUpiId('john.doe@ybl')).not.toThrow();
    expect(() => cashbackService.validateUpiId('user123@icici')).not.toThrow();
  });

  it('rejects IDs without @', () => {
    expect(() => cashbackService.validateUpiId('userokaxis')).toThrow(ValidationError);
  });

  it('rejects IDs with too short bank handle', () => {
    expect(() => cashbackService.validateUpiId('user@a')).toThrow(ValidationError);
  });

  it('rejects IDs with special chars in bank handle', () => {
    expect(() => cashbackService.validateUpiId('user@ok-axis')).toThrow(ValidationError);
  });
});

// ─── scanCoupon ───────────────────────────────────────────────────────────────

describe('scanCoupon', () => {
  const customerId = 'cust-1';
  const tenantId = 'tenant-1';
  const couponCode = 'COUPON123';

  it('throws 422 with action=ADD_UPI when no primary UPI on file', async () => {
    db.query.mockResolvedValueOnce({ rows: [] }); // no primary UPI

    let caughtErr;
    try {
      await cashbackService.scanCoupon(customerId, tenantId, couponCode);
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeInstanceOf(UnprocessableError);
    expect(caughtErr.statusCode).toBe(422);
    expect(caughtErr.action).toBe('ADD_UPI');
  });

  it('throws NotFoundError when coupon does not exist', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ upi_id: 'user@upi' }] }); // primary UPI found

    // executeTransaction calls db as the client
    // First call inside tx = SELECT coupon FOR UPDATE → not found
    db.query
      .mockResolvedValueOnce({ rows: [] }); // coupon not found

    await expect(
      cashbackService.scanCoupon(customerId, tenantId, couponCode)
    ).rejects.toThrow(NotFoundError);
  });

  it('throws ConflictError when coupon is already used', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ upi_id: 'user@upi' }] });

    db.query
      .mockResolvedValueOnce({
        rows: [{ id: 'c1', coupon_code: couponCode, status: 'used', coupon_points: 50, cashback_amount: null }]
      });

    await expect(
      cashbackService.scanCoupon(customerId, tenantId, couponCode)
    ).rejects.toThrow(ConflictError);
  });

  it('returns COMPLETED on successful gateway call', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ upi_id: 'user@upi' }] }) // primary UPI
      .mockResolvedValueOnce({                                     // SELECT coupon
        rows: [{ id: 'c1', coupon_code: couponCode, status: 'active', coupon_points: null, cashback_amount: 50 }]
      })
      .mockResolvedValueOnce({})                                   // UPDATE coupon → used
      .mockResolvedValueOnce({ rows: [{ id: 'tx-1' }] })         // INSERT cashback_transaction
      .mockResolvedValueOnce({});                                  // UPDATE to COMPLETED

    initiateUpiPayout.mockResolvedValueOnce({
      transactionId: 'GW_TXN_001',
      payoutReference: 'REF_001',
      status: 'success'
    });

    const result = await cashbackService.scanCoupon(customerId, tenantId, couponCode);

    expect(result.success).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.cashback_amount).toBe(50);
    expect(result.upi_id).toBe('user@upi');
    expect(result.transaction_id).toBe('tx-1');
    expect(initiateUpiPayout).toHaveBeenCalledWith({
      amount: 50,
      upiId: 'user@upi',
      referenceId: 'tx-1',
      remarks: `Cashback for coupon ${couponCode}`
    });
  });

  it('returns FAILED (not throw) when gateway call fails — coupon stays USED', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ upi_id: 'user@upi' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'c1', coupon_code: couponCode, status: 'active', coupon_points: 100, cashback_amount: null }]
      })
      .mockResolvedValueOnce({})                           // UPDATE coupon
      .mockResolvedValueOnce({ rows: [{ id: 'tx-2' }] }) // INSERT transaction
      .mockResolvedValueOnce({});                          // UPDATE to FAILED

    const gatewayError = new Error('Gateway timeout');
    gatewayError.gatewayCode = 'TIMEOUT';
    initiateUpiPayout.mockRejectedValueOnce(gatewayError);

    const result = await cashbackService.scanCoupon(customerId, tenantId, couponCode);

    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');
    expect(result.transaction_id).toBe('tx-2');
    expect(result.error).toMatch(/retry/i);

    // Verify FAILED update was called (last db.query call)
    const lastCall = db.query.mock.calls[db.query.mock.calls.length - 1];
    expect(lastCall[0]).toMatch(/status = 'FAILED'/);
    expect(lastCall[1][0]).toBe('Gateway timeout');
  });

  it('uses coupon_points as cashback when cashback_amount is not set', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ upi_id: 'user@upi' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'c1', coupon_code: couponCode, status: 'active', coupon_points: 75, cashback_amount: null }]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 'tx-3' }] })
      .mockResolvedValueOnce({});

    initiateUpiPayout.mockResolvedValueOnce({ transactionId: 'G3', payoutReference: 'R3', status: 'success' });

    const result = await cashbackService.scanCoupon(customerId, tenantId, couponCode);
    expect(result.cashback_amount).toBe(75);
  });
});

// ─── retryCashback ────────────────────────────────────────────────────────────

describe('retryCashback', () => {
  const txId = 'tx-abc';
  const customerId = 'cust-1';
  const tenantId = 'tenant-1';

  it('throws NotFoundError when transaction not found', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    await expect(cashbackService.retryCashback(txId, customerId, tenantId)).rejects.toThrow(NotFoundError);
  });

  it('throws ValidationError when transaction is not FAILED', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: txId, amount: '50', upi_id: 'u@upi', coupon_code: 'C1', status: 'COMPLETED' }]
    });
    await expect(cashbackService.retryCashback(txId, customerId, tenantId)).rejects.toThrow(ValidationError);
  });

  it('returns COMPLETED on successful retry', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: txId, amount: '50', upi_id: 'u@upi', coupon_code: 'C1', status: 'FAILED' }]
      })
      .mockResolvedValueOnce({})  // UPDATE to PROCESSING
      .mockResolvedValueOnce({}); // UPDATE to COMPLETED

    initiateUpiPayout.mockResolvedValueOnce({ transactionId: 'G2', payoutReference: 'R2', status: 'success' });

    const result = await cashbackService.retryCashback(txId, customerId, tenantId);

    expect(result.success).toBe(true);
    expect(result.status).toBe('COMPLETED');
    expect(result.transaction_id).toBe(txId);
    expect(initiateUpiPayout).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: txId, amount: 50, upiId: 'u@upi' })
    );
  });

  it('uses new UPI ID when provided', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: txId, amount: '50', upi_id: 'old@upi', coupon_code: 'C1', status: 'FAILED' }]
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    initiateUpiPayout.mockResolvedValueOnce({ transactionId: 'G3', payoutReference: 'R3', status: 'success' });

    const result = await cashbackService.retryCashback(txId, customerId, tenantId, 'new@upi');

    expect(result.upi_id).toBe('new@upi');
    expect(initiateUpiPayout).toHaveBeenCalledWith(
      expect.objectContaining({ upiId: 'new@upi' })
    );
  });

  it('rejects invalid new UPI ID format', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: txId, amount: '50', upi_id: 'old@upi', coupon_code: 'C1', status: 'FAILED' }]
    });
    await expect(
      cashbackService.retryCashback(txId, customerId, tenantId, 'not-a-valid-upi')
    ).rejects.toThrow(ValidationError);
  });

  it('returns FAILED when gateway fails on retry', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{ id: txId, amount: '30', upi_id: 'u@upi', coupon_code: 'C1', status: 'FAILED' }]
      })
      .mockResolvedValueOnce({})  // PROCESSING
      .mockResolvedValueOnce({}); // FAILED update

    initiateUpiPayout.mockRejectedValueOnce(new Error('Bank declined'));

    const result = await cashbackService.retryCashback(txId, customerId, tenantId);
    expect(result.success).toBe(false);
    expect(result.status).toBe('FAILED');
  });
});

// ─── saveUpiId ────────────────────────────────────────────────────────────────

describe('saveUpiId', () => {
  it('throws ValidationError on invalid format', async () => {
    await expect(cashbackService.saveUpiId('c1', 't1', 'bad-format')).rejects.toThrow(ValidationError);
  });

  it('saves UPI and sets as primary', async () => {
    db.query
      .mockResolvedValueOnce({})  // UPDATE clear existing primary
      .mockResolvedValueOnce({    // UPSERT
        rows: [{ id: 'upi-1', upi_id: 'user@upi', is_primary: true }]
      });

    const result = await cashbackService.saveUpiId('c1', 't1', 'user@upi');
    expect(result.upi_id).toBe('user@upi');
    expect(result.is_primary).toBe(true);
  });
});

// ─── getCashbackBalance ───────────────────────────────────────────────────────

describe('getCashbackBalance', () => {
  it('returns total_earned, processing, and failed count', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ total_earned: '150.00', processing: '50.00', failed: '2' }]
    });

    const result = await cashbackService.getCashbackBalance('c1', 't1');
    expect(result.total_earned).toBe(150);
    expect(result.processing).toBe(50);
    expect(result.failed).toBe(2);
  });
});

// ─── getCashbackHistory ───────────────────────────────────────────────────────

describe('getCashbackHistory', () => {
  it('includes gateway_transaction_id in results', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({
        rows: [{ id: 'tx-1', coupon_code: 'C1', amount: '50', upi_id: 'u@upi', status: 'COMPLETED', gateway_transaction_id: 'GW_001', created_at: new Date() }]
      });

    const { transactions } = await cashbackService.getCashbackHistory('c1', 't1', {});
    expect(transactions[0].gateway_transaction_id).toBe('GW_001');
  });
});
