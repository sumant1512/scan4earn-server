/**
 * User Credits Controller
 * Refactored to use modern error handling and validators
 */

const db = require('../config/database');
const { asyncHandler } = require('../modules/common/middleware/errorHandler.middleware');
const {
  ValidationError,
  NotFoundError
} = require('../modules/common/errors/AppError');
const {
  validateRequiredFields
} = require('../modules/common/validators/common.validator');
const {
  sendSuccess
} = require('../modules/common/utils/response.util');
const {
  executeTransaction
} = require('../modules/common/utils/database.util');

/**
 * Get user credit balance
 * GET /api/users/:userId/credits
 */
const getUserCredits = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const tenantId = req.user.tenant_id;

  // Get or create credit account
  let result = await db.query(
    `SELECT * FROM user_credits
     WHERE user_id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );

  if (result.rows.length === 0) {
    // Create default credit account
    result = await db.query(
      `INSERT INTO user_credits (user_id, tenant_id, credit_amount)
       VALUES ($1, $2, 0.00)
       RETURNING *`,
      [userId, tenantId]
    );
  }

  return sendSuccess(res, { credits: result.rows[0] });
});

/**
 * Get user credit transaction history
 * GET /api/users/:userId/credits/transactions
 */
const getCreditTransactions = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const tenantId = req.user.tenant_id;
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  // Get user_credit_id
  const creditAccount = await db.query(
    'SELECT id FROM user_credits WHERE user_id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );

  if (creditAccount.rows.length === 0) {
    return sendSuccess(res, {
      transactions: [],
      pagination: { page: 1, limit, total: 0, pages: 0 }
    });
  }

  const result = await db.query(
    `SELECT t.*, va.app_name, va.code as app_code
     FROM user_credit_transactions t
     LEFT JOIN verification_apps va ON t.verification_app_id = va.id
     WHERE t.user_credit_id = $1
     ORDER BY t.created_at DESC
     LIMIT $2 OFFSET $3`,
    [creditAccount.rows[0].id, limit, offset]
  );

  const countResult = await db.query(
    'SELECT COUNT(*) FROM user_credit_transactions WHERE user_credit_id = $1',
    [creditAccount.rows[0].id]
  );

  return sendSuccess(res, {
    transactions: result.rows,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(countResult.rows[0].count),
      pages: Math.ceil(countResult.rows[0].count / limit)
    }
  });
});

/**
 * Add credits to user (Admin function)
 * POST /api/users/:userId/credits/add
 */
const addCredits = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const tenantId = req.user.tenant_id;
  const { amount, description, verification_app_id } = req.body;

  validateRequiredFields(req.body, ['amount']);

  if (amount <= 0) {
    throw new ValidationError('Amount must be greater than 0');
  }

  const newBalance = await executeTransaction(db, async (client) => {
    // Get or create credit account
    let creditAccount = await client.query(
      'SELECT * FROM user_credits WHERE user_id = $1 AND tenant_id = $2 FOR UPDATE',
      [userId, tenantId]
    );

    if (creditAccount.rows.length === 0) {
      creditAccount = await client.query(
        `INSERT INTO user_credits (user_id, tenant_id, credit_amount)
         VALUES ($1, $2, 0.00)
         RETURNING *`,
        [userId, tenantId]
      );
    }

    const account = creditAccount.rows[0];
    const newBalance = parseFloat(account.credit_amount) + parseFloat(amount);

    // Update balance
    await client.query(
      `UPDATE user_credits
       SET credit_amount = $1, last_updated = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newBalance, account.id]
    );

    // Record transaction
    await client.query(
      `INSERT INTO user_credit_transactions
       (user_credit_id, verification_app_id, transaction_type, amount, balance_after, description, created_by)
       VALUES ($1, $2, 'earned', $3, $4, $5, $6)`,
      [account.id, verification_app_id || null, amount, newBalance, description || 'Credits added by admin', req.user.id]
    );

    return newBalance;
  });

  return sendSuccess(res, {
    message: 'Credits added successfully',
    new_balance: newBalance
  });
});

/**
 * Deduct credits from user
 * POST /api/users/:userId/credits/deduct
 */
const deductCredits = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const tenantId = req.user.tenant_id;
  const { amount, description, verification_app_id } = req.body;

  validateRequiredFields(req.body, ['amount']);

  if (amount <= 0) {
    throw new ValidationError('Amount must be greater than 0');
  }

  const newBalance = await executeTransaction(db, async (client) => {
    // Get credit account
    const creditAccount = await client.query(
      'SELECT * FROM user_credits WHERE user_id = $1 AND tenant_id = $2 FOR UPDATE',
      [userId, tenantId]
    );

    if (creditAccount.rows.length === 0) {
      throw new NotFoundError('User credit account');
    }

    const account = creditAccount.rows[0];
    const currentBalance = parseFloat(account.credit_amount);

    if (currentBalance < amount) {
      throw new ValidationError(`Insufficient credits. Current balance: ${currentBalance}, Required: ${amount}`);
    }

    const newBalance = currentBalance - parseFloat(amount);

    // Update balance
    await client.query(
      `UPDATE user_credits
       SET credit_amount = $1, last_updated = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newBalance, account.id]
    );

    // Record transaction
    await client.query(
      `INSERT INTO user_credit_transactions
       (user_credit_id, verification_app_id, transaction_type, amount, balance_after, description, created_by)
       VALUES ($1, $2, 'spent', $3, $4, $5, $6)`,
      [account.id, verification_app_id || null, amount, newBalance, description || 'Credits spent', req.user.id]
    );

    return newBalance;
  });

  return sendSuccess(res, {
    message: 'Credits deducted successfully',
    new_balance: newBalance
  });
});

/**
 * Adjust user credits (Admin only)
 * POST /api/users/:userId/credits/adjust
 */
const adjustCredits = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const tenantId = req.user.tenant_id;
  const { amount, reason } = req.body;

  validateRequiredFields(req.body, ['amount', 'reason']);

  if (amount === 0) {
    throw new ValidationError('Adjustment amount cannot be zero');
  }

  const { newBalance, adjustment } = await executeTransaction(db, async (client) => {
    // Get or create credit account
    let creditAccount = await client.query(
      'SELECT * FROM user_credits WHERE user_id = $1 AND tenant_id = $2 FOR UPDATE',
      [userId, tenantId]
    );

    if (creditAccount.rows.length === 0) {
      creditAccount = await client.query(
        `INSERT INTO user_credits (user_id, tenant_id, credit_amount)
         VALUES ($1, $2, 0.00)
         RETURNING *`,
        [userId, tenantId]
      );
    }

    const account = creditAccount.rows[0];
    const newBalance = parseFloat(account.credit_amount) + parseFloat(amount);

    if (newBalance < 0) {
      throw new ValidationError('Adjustment would result in negative balance');
    }

    // Update balance
    await client.query(
      `UPDATE user_credits
       SET credit_amount = $1, last_updated = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newBalance, account.id]
    );

    // Record transaction
    await client.query(
      `INSERT INTO user_credit_transactions
       (user_credit_id, transaction_type, amount, balance_after, description, created_by)
       VALUES ($1, 'adjusted', $2, $3, $4, $5)`,
      [account.id, Math.abs(amount), newBalance, reason, req.user.id]
    );

    return { newBalance, adjustment: amount };
  });

  return sendSuccess(res, {
    message: 'Credits adjusted successfully',
    adjustment,
    new_balance: newBalance
  });
});

/**
 * Get credit statistics by app
 * GET /api/credits/stats
 */
const getCreditStats = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;

  const result = await db.query(
    `SELECT
       va.app_name,
       va.code as app_code,
       COUNT(DISTINCT t.user_credit_id) as active_users,
       SUM(CASE WHEN t.transaction_type = 'earned' THEN t.amount ELSE 0 END) as total_earned,
       SUM(CASE WHEN t.transaction_type = 'spent' THEN t.amount ELSE 0 END) as total_spent
     FROM user_credit_transactions t
     JOIN user_credits uc ON t.user_credit_id = uc.id
     LEFT JOIN verification_apps va ON t.verification_app_id = va.id
     WHERE uc.tenant_id = $1
     GROUP BY va.id, va.app_name, va.code
     ORDER BY total_earned DESC`,
    [tenantId]
  );

  return sendSuccess(res, { stats: result.rows });
});

module.exports = {
  getUserCredits,
  getCreditTransactions,
  addCredits,
  deductCredits,
  adjustCredits,
  getCreditStats
};
