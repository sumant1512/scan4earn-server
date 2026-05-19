/**
 * Reward Campaign Controller
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
  sendSuccess,
  sendCreated
} = require('../modules/common/utils/response.util');
const {
  executeTransaction
} = require('../modules/common/utils/database.util');

/**
 * Shuffle array for random distribution
 */
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Create reward campaign (Common or Custom)
 * POST /api/tenant/rewards/campaigns
 */
const createCampaign = asyncHandler(async (req, res) => {
  const { batch_id, campaign_name, start_date, end_date, reward_type, common_amount, custom_variations } = req.body;
  const tenantId = req.user.tenant_id;

  validateRequiredFields(req.body, ['batch_id', 'campaign_name', 'start_date', 'end_date', 'reward_type']);

  if (reward_type !== 'common' && reward_type !== 'custom') {
    throw new ValidationError('reward_type must be "common" or "custom"');
  }

  if (new Date(end_date) <= new Date(start_date)) {
    throw new ValidationError('end_date must be after start_date');
  }

  const result = await executeTransaction(db, async (client) => {
    // Get batch details
    const batchResult = await client.query(
      'SELECT id, batch_status, total_coupons FROM coupon_batches WHERE id = $1 AND tenant_id = $2',
      [batch_id, tenantId]
    );

    if (batchResult.rows.length === 0) {
      throw new NotFoundError('Batch');
    }

    const batch = batchResult.rows[0];

    if (batch.batch_status !== 'activated') {
      throw new ValidationError('Batch must be activated before assigning rewards');
    }

    // Get all coupons in batch
    const couponsResult = await client.query(
      'SELECT id FROM coupons WHERE batch_id = $1 AND tenant_id = $2 ORDER BY serial_number',
      [batch_id, tenantId]
    );

    const coupons = couponsResult.rows;
    const totalCoupons = coupons.length;

    let rewardPool = [];
    let variationsData = null;

    if (reward_type === 'common') {
      // Common reward - same for all
      if (!common_amount || common_amount <= 0) {
        throw new ValidationError('common_amount must be greater than 0');
      }

      rewardPool = Array(totalCoupons).fill(common_amount);
    } else {
      // Custom reward - different amounts with distribution
      if (!custom_variations || !Array.isArray(custom_variations)) {
        throw new ValidationError('custom_variations array is required for custom reward type');
      }

      // Validate variations
      let totalQuantity = 0;
      for (const variation of custom_variations) {
        if (!variation.amount || !variation.quantity) {
          throw new ValidationError('Each variation must have amount and quantity');
        }
        if (variation.amount <= 0 || variation.quantity <= 0) {
          throw new ValidationError('amount and quantity must be greater than 0');
        }
        totalQuantity += variation.quantity;
      }

      if (totalQuantity !== totalCoupons) {
        throw new ValidationError(`Sum of variation quantities (${totalQuantity}) must equal batch total (${totalCoupons})`);
      }

      // Create reward pool
      for (const variation of custom_variations) {
        for (let i = 0; i < variation.quantity; i++) {
          rewardPool.push(variation.amount);
        }
      }

      // Shuffle for random distribution
      rewardPool = shuffle(rewardPool);
      variationsData = custom_variations;
    }

    // Create campaign
    const campaignResult = await client.query(
      `INSERT INTO reward_campaigns (
        tenant_id, batch_id, name, start_date, end_date, reward_type,
        common_amount, custom_variations, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
      RETURNING id, name, start_date, end_date, reward_type, created_at`,
      [
        tenantId, batch_id, campaign_name, start_date, end_date, reward_type,
        common_amount || null,
        variationsData ? JSON.stringify(variationsData) : null
      ]
    );

    const campaign = campaignResult.rows[0];

    // Assign rewards to coupons
    const updatePromises = coupons.map((coupon, index) => {
      return client.query(
        `UPDATE coupons
         SET reward_amount = $1, campaign_id = $2, status = 'active', expiry_date = $3
         WHERE id = $4`,
        [rewardPool[index], campaign.id, end_date, coupon.id]
      );
    });

    await Promise.all(updatePromises);

    // Update batch status to 'live'
    await client.query(
      'UPDATE coupon_batches SET batch_status = \'live\' WHERE id = $1',
      [batch_id]
    );

    // Calculate statistics
    const totalRewardValue = rewardPool.reduce((sum, amount) => sum + parseFloat(amount), 0);

    const distribution = reward_type === 'custom'
      ? custom_variations.map(v => ({
          amount: v.amount,
          quantity: v.quantity,
          percentage: ((v.quantity / totalCoupons) * 100).toFixed(1) + '%'
        }))
      : [{ amount: common_amount, quantity: totalCoupons, percentage: '100%' }];

    return {
      campaign,
      distribution,
      totalCoupons,
      totalRewardValue: totalRewardValue.toFixed(2),
      reward_type
    };
  });

  return sendCreated(res, {
    campaign: result.campaign,
    distribution: result.distribution,
    total_coupons: result.totalCoupons,
    total_reward_value: result.totalRewardValue
  }, `${result.reward_type === 'common' ? 'Common' : 'Custom'} rewards assigned to ${result.totalCoupons} coupons`);
});

/**
 * Get campaign details
 * GET /api/tenant/rewards/campaigns/:campaign_id
 */
const getCampaignDetails = asyncHandler(async (req, res) => {
  const { campaign_id } = req.params;
  const tenantId = req.user.tenant_id;

  const result = await db.query(
    `SELECT
      c.id, c.name, c.start_date, c.end_date, c.reward_type,
      c.common_amount, c.custom_variations, c.status, c.created_at,
      b.batch_name, b.dealer_name, b.zone,
      COUNT(cp.id) as total_coupons,
      COUNT(CASE WHEN cp.status = 'scanned' THEN 1 END) as scanned_count,
      SUM(CASE WHEN cp.status = 'scanned' THEN cp.reward_amount ELSE 0 END) as rewards_distributed,
      SUM(cp.reward_amount) as total_reward_value
     FROM reward_campaigns c
     JOIN coupon_batches b ON b.id = c.batch_id
     LEFT JOIN coupons cp ON cp.campaign_id = c.id
     WHERE c.id = $1 AND c.tenant_id = $2
     GROUP BY c.id, b.batch_name, b.dealer_name, b.zone`,
    [campaign_id, tenantId]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Campaign');
  }

  return sendSuccess(res, { campaign: result.rows[0] });
});

/**
 * List campaigns
 * GET /api/tenant/rewards/campaigns
 */
const listCampaigns = asyncHandler(async (req, res) => {
  const tenantId = req.user.tenant_id;
  const { status, page = 1, limit = 20 } = req.query;

  let query = `
    SELECT
      c.id, c.name, c.start_date, c.end_date, c.reward_type,
      c.status, c.created_at,
      b.batch_name, b.dealer_name,
      COUNT(cp.id) as total_coupons,
      COUNT(CASE WHEN cp.status = 'scanned' THEN 1 END) as scanned_count
    FROM reward_campaigns c
    JOIN coupon_batches b ON b.id = c.batch_id
    LEFT JOIN coupons cp ON cp.campaign_id = c.id
    WHERE c.tenant_id = $1
  `;

  const params = [tenantId];
  let paramIndex = 2;

  if (status) {
    query += ` AND c.status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  query += ` GROUP BY c.id, b.batch_name, b.dealer_name ORDER BY c.created_at DESC`;
  query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
  params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

  const result = await db.query(query, params);

  return sendSuccess(res, {
    campaigns: result.rows,
    page: parseInt(page),
    limit: parseInt(limit)
  });
});

module.exports = {
  createCampaign,
  getCampaignDetails,
  listCampaigns
};
