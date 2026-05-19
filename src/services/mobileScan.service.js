const db = require('../config/database');

/**
 * Process a coupon scan for authenticated customer
 */
exports.processScan = async ({
  customerId,
  customerPhone,
  tenantId,
  couponCode,
  appCode,
  location,
  scannedAt,
  deviceInfo
}) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');

    // 1. Get verification app by code
    const appResult = await client.query(
      `SELECT id, app_name, tenant_id FROM verification_apps
       WHERE code = $1 AND tenant_id = $2 AND is_active = true`,
      [appCode, tenantId]
    );

    if (appResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'app_not_found',
        message: 'Verification app not found or inactive',
        statusCode: 404
      };
    }

    const verificationApp = appResult.rows[0];

    // 2. Get coupon details
    const couponResult = await client.query(
      `SELECT
        c.id,
        c.coupon_code,
        c.discount_value,
        c.discount_currency,
        c.discount_type,
        c.status,
        c.expiry_date,
        c.total_usage_limit,
        c.verification_app_id,
        c.coupon_points,
        c.description,
        COUNT(s.id) as usage_count
       FROM coupons c
       LEFT JOIN scans s ON c.id = s.coupon_id AND s.scan_status = 'SUCCESS'
       WHERE c.coupon_code = $1 AND c.tenant_id = $2
       GROUP BY c.id`,
      [couponCode, tenantId]
    );

    if (couponResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'coupon_not_found',
        message: 'Invalid coupon code',
        statusCode: 404
      };
    }

    const coupon = couponResult.rows[0];

    // 3. Verify coupon belongs to the app
    if (coupon.verification_app_id !== verificationApp.id) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'app_mismatch',
        message: 'This coupon does not belong to the selected app',
        statusCode: 400
      };
    }

    // 4. Check if coupon is active
    if (coupon.status !== 'active') {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'coupon_inactive',
        message: 'This coupon is not active',
        statusCode: 400
      };
    }

    // 5. Check if coupon is expired
    const now = new Date();
    const expiryDate = new Date(coupon.expiry_date);
    if (expiryDate < now) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'coupon_expired',
        message: 'This coupon has expired',
        statusCode: 400,
        coupon: {
          code: coupon.coupon_code,
          expiry_date: coupon.expiry_date
        }
      };
    }

    // 6. Check usage limit (0 or null = unlimited)
    if (coupon.total_usage_limit > 0 && parseInt(coupon.usage_count) >= coupon.total_usage_limit) {
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'coupon_usage_limit_exceeded',
        message: 'This coupon has reached its usage limit',
        statusCode: 409
      };
    }

    // 7. Check if customer already used this coupon (for single-use coupons)
    const customerScanResult = await client.query(
      `SELECT id, scanned_at FROM scans
       WHERE coupon_id = $1 AND customer_id = $2 AND scan_status = 'SUCCESS'
       ORDER BY scanned_at DESC LIMIT 1`,
      [coupon.id, customerId]
    );

    if (customerScanResult.rows.length > 0 && coupon.total_usage_limit === 1) {
      const previousScan = customerScanResult.rows[0];
      await client.query('ROLLBACK');
      return {
        success: false,
        error: 'coupon_already_used',
        message: 'You have already redeemed this coupon',
        statusCode: 409,
        previous_scan: {
          scanned_at: previousScan.scanned_at,
          scan_id: previousScan.id
        }
      };
    }

    // 8. Create scan record
    const scanResult = await client.query(
      `INSERT INTO scans (
        coupon_id,
        tenant_id,
        customer_id,
        scan_status,
        latitude,
        longitude,
        device_info,
        scanned_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, scanned_at`,
      [
        coupon.id,
        tenantId,
        customerId,
        'SUCCESS',
        location?.lat || null,
        location?.lng || null,
        deviceInfo ? JSON.stringify(deviceInfo) : null,
        scannedAt
      ]
    );

    const scan = scanResult.rows[0];

    // 9. Award points if configured
    let creditsEarned = 0;
    let creditsBalance = 0;

    if (coupon.coupon_points && coupon.coupon_points > 0) {
      // Get current balance before update
      const currentBalResult = await client.query(
        `SELECT COALESCE(total_points, 0) as total_points FROM user_points
         WHERE customer_id = $1 AND tenant_id = $2`,
        [customerId, tenantId]
      );
      const balanceBefore = currentBalResult.rows.length > 0 ? parseInt(currentBalResult.rows[0].total_points) : 0;
      const balanceAfter = balanceBefore + coupon.coupon_points;

      // Upsert user points balance
      const balanceResult = await client.query(
        `INSERT INTO user_points (customer_id, tenant_id, total_points, lifetime_points)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (customer_id, tenant_id)
         DO UPDATE SET
           total_points = user_points.total_points + $3,
           lifetime_points = user_points.lifetime_points + $3,
           updated_at = CURRENT_TIMESTAMP
         RETURNING total_points`,
        [customerId, tenantId, coupon.coupon_points]
      );

      creditsBalance = parseInt(balanceResult.rows[0].total_points);
      creditsEarned = coupon.coupon_points;

      // Record transaction
      await client.query(
        `INSERT INTO points_transactions
           (customer_id, tenant_id, transaction_type, points, balance_before, balance_after, description, reference_id, reference_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [customerId, tenantId, 'EARN', coupon.coupon_points, balanceBefore, balanceAfter,
         'Coupon scan reward: ' + coupon.coupon_code, scan.id, 'scan']
      );
    } else {
      // Just get current balance
      const balanceResult = await client.query(
        `SELECT COALESCE(total_points, 0) as total_points FROM user_points
         WHERE customer_id = $1 AND tenant_id = $2`,
        [customerId, tenantId]
      );
      creditsBalance = balanceResult.rows.length > 0 ? parseInt(balanceResult.rows[0].total_points) : 0;
    }

    await client.query('COMMIT');

    // 10. Return success response
    return {
      success: true,
      scan_id: scan.id,
      status: 'success',
      message: 'Coupon verified successfully!',
      coupon: {
        code: coupon.coupon_code,
        discount_value: parseFloat(coupon.discount_value),
        discount_currency: coupon.discount_currency,
        discount_type: coupon.discount_type,
        expiry_date: coupon.expiry_date,
        description: coupon.description
      },
      reward: {
        credits_earned: creditsEarned,
        credits_balance: creditsBalance
      },
      scanned_at: scan.scanned_at
    };

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in processScan:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Get scan history for a customer
 */
exports.getScanHistory = async ({
  customerId,
  tenantId,
  page,
  limit,
  status,
  appCode,
  fromDate,
  toDate,
  sort
}) => {
  try {
    const offset = (page - 1) * limit;
    const sortOrder = sort === 'asc' ? 'ASC' : 'DESC';

    // Build WHERE conditions
    const conditions = ['s.customer_id = $1', 's.tenant_id = $2'];
    const params = [customerId, tenantId];
    let paramIndex = 3;

    if (status) {
      conditions.push(`s.scan_status = $${paramIndex}`);
      params.push(status.toUpperCase());
      paramIndex++;
    }

    if (appCode) {
      conditions.push(`va.code = $${paramIndex}`);
      params.push(appCode);
      paramIndex++;
    }

    if (fromDate) {
      conditions.push(`s.scanned_at >= $${paramIndex}`);
      params.push(fromDate);
      paramIndex++;
    }

    if (toDate) {
      conditions.push(`s.scanned_at <= $${paramIndex}`);
      params.push(toDate);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM scans s
      JOIN coupons c ON s.coupon_id = c.id
      JOIN verification_apps va ON c.verification_app_id = va.id
      WHERE ${whereClause}
    `;
    const countResult = await db.query(countQuery, params);
    const total = parseInt(countResult.rows[0].total);

    // Get scan data
    const dataQuery = `
      SELECT
        s.id,
        s.scanned_at,
        s.scan_status as status,
        s.latitude,
        s.longitude,
        c.coupon_code,
        c.discount_value,
        c.discount_currency,
        c.discount_type,
        c.description as coupon_description,
        va.code as app_code,
        va.app_name
      FROM scans s
      JOIN coupons c ON s.coupon_id = c.id
      JOIN verification_apps va ON c.verification_app_id = va.id
      WHERE ${whereClause}
      ORDER BY s.scanned_at ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, offset);
    const dataResult = await db.query(dataQuery, params);

    // Get summary statistics
    const summaryQuery = `
      SELECT
        COUNT(*) as total_scans,
        COUNT(CASE WHEN s.scan_status = 'SUCCESS' THEN 1 END) as successful_scans,
        COUNT(CASE WHEN s.scan_status != 'SUCCESS' THEN 1 END) as failed_scans,
        COALESCE(SUM(CASE WHEN s.scan_status = 'SUCCESS' THEN c.discount_value ELSE 0 END), 0) as total_discount_value
      FROM scans s
      JOIN coupons c ON s.coupon_id = c.id
      WHERE s.customer_id = $1 AND s.tenant_id = $2
    `;
    const summaryResult = await db.query(summaryQuery, [customerId, tenantId]);
    const summary = summaryResult.rows[0];

    // Get total credits earned
    const creditsQuery = `
      SELECT COALESCE(total_points, 0) as balance
      FROM user_points
      WHERE customer_id = $1 AND tenant_id = $2
    `;
    const creditsResult = await db.query(creditsQuery, [customerId, tenantId]);
    const totalCreditsEarned = creditsResult.rows.length > 0 ? creditsResult.rows[0].balance : 0;

    // Format response data
    const data = dataResult.rows.map(row => ({
      id: row.id,
      coupon_code: row.coupon_code,
      status: row.status.toLowerCase(),
      scanned_at: row.scanned_at,
      discount_value: parseFloat(row.discount_value),
      discount_currency: row.discount_currency,
      discount_type: row.discount_type,
      app: {
        code: row.app_code,
        name: row.app_name
      },
      location: (row.latitude && row.longitude) ? {
        lat: parseFloat(row.latitude),
        lng: parseFloat(row.longitude)
      } : null
    }));

    // Calculate pagination
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1
      },
      summary: {
        total_scans: parseInt(summary.total_scans),
        successful_scans: parseInt(summary.successful_scans),
        failed_scans: parseInt(summary.failed_scans),
        total_credits_earned: parseInt(totalCreditsEarned),
        total_discount_value: parseFloat(summary.total_discount_value)
      }
    };

  } catch (error) {
    console.error('Error in getScanHistory:', error);
    throw error;
  }
};

/**
 * Get specific scan details
 */
exports.getScanDetails = async ({ scanId, customerId, tenantId }) => {
  try {
    const result = await db.query(
      `SELECT
        s.id,
        s.scanned_at,
        s.scan_status as status,
        s.latitude,
        s.longitude,
        s.device_info,
        c.coupon_code,
        c.discount_value,
        c.discount_currency,
        c.discount_type,
        c.description as coupon_description,
        c.expiry_date,
        c.coupon_points as credits_earned,
        va.code as app_code,
        va.app_name,
        va.logo_url
      FROM scans s
      JOIN coupons c ON s.coupon_id = c.id
      JOIN verification_apps va ON c.verification_app_id = va.id
      WHERE s.id = $1 AND s.customer_id = $2 AND s.tenant_id = $3`,
      [scanId, customerId, tenantId]
    );

    if (result.rows.length === 0) {
      return {
        success: false,
        error: 'scan_not_found',
        message: 'Scan transaction not found or doesn\'t belong to you'
      };
    }

    const scan = result.rows[0];

    // Get credits balance after this scan
    const creditsQuery = `
      SELECT COALESCE(total_points, 0) as balance
      FROM user_points
      WHERE customer_id = $1 AND tenant_id = $2
    `;
    const creditsResult = await db.query(creditsQuery, [customerId, tenantId]);
    const creditsBalance = creditsResult.rows.length > 0 ? creditsResult.rows[0].balance : 0;

    return {
      success: true,
      data: {
        id: scan.id,
        coupon_code: scan.coupon_code,
        status: scan.status.toLowerCase(),
        scanned_at: scan.scanned_at,
        coupon: {
          code: scan.coupon_code,
          discount_value: parseFloat(scan.discount_value),
          discount_currency: scan.discount_currency,
          discount_type: scan.discount_type,
          description: scan.coupon_description,
          expiry_date: scan.expiry_date
        },
        reward: {
          credits_earned: scan.credits_earned || 0,
          credits_balance_after: creditsBalance
        },
        app: {
          code: scan.app_code,
          name: scan.app_name,
          logo_url: scan.logo_url
        },
        location: (scan.latitude && scan.longitude) ? {
          lat: parseFloat(scan.latitude),
          lng: parseFloat(scan.longitude)
        } : null,
        device: scan.device_info ? JSON.parse(scan.device_info) : null
      }
    };

  } catch (error) {
    console.error('Error in getScanDetails:', error);
    throw error;
  }
};

/**
 * Get scan statistics
 */
exports.getScanStats = async ({ customerId, tenantId }) => {
  try {
    const statsQuery = `
      SELECT
        COUNT(*) as total_scans,
        COUNT(CASE WHEN s.scan_status = 'SUCCESS' THEN 1 END) as successful_scans,
        COUNT(CASE WHEN s.scan_status = 'EXPIRED' THEN 1 END) as expired_scans,
        COUNT(CASE WHEN s.scan_status = 'EXHAUSTED' THEN 1 END) as exhausted_scans,
        COUNT(CASE WHEN s.scan_status = 'INVALID' THEN 1 END) as invalid_scans,
        COALESCE(SUM(CASE WHEN s.scan_status = 'SUCCESS' THEN c.discount_value ELSE 0 END), 0) as total_savings,
        MAX(s.scanned_at) as last_scan_at,
        MIN(s.scanned_at) as first_scan_at
      FROM scans s
      JOIN coupons c ON s.coupon_id = c.id
      WHERE s.customer_id = $1 AND s.tenant_id = $2
    `;
    const statsResult = await db.query(statsQuery, [customerId, tenantId]);
    const stats = statsResult.rows[0];

    // Get credits balance
    const creditsQuery = `
      SELECT COALESCE(total_points, 0) as balance
      FROM user_points
      WHERE customer_id = $1 AND tenant_id = $2
    `;
    const creditsResult = await db.query(creditsQuery, [customerId, tenantId]);
    const creditsBalance = creditsResult.rows.length > 0 ? creditsResult.rows[0].balance : 0;

    // Get top apps used
    const topAppsQuery = `
      SELECT
        va.app_name,
        va.code as app_code,
        COUNT(*) as scan_count
      FROM scans s
      JOIN coupons c ON s.coupon_id = c.id
      JOIN verification_apps va ON c.verification_app_id = va.id
      WHERE s.customer_id = $1 AND s.tenant_id = $2 AND s.scan_status = 'SUCCESS'
      GROUP BY va.app_name, va.code
      ORDER BY scan_count DESC
      LIMIT 5
    `;
    const topAppsResult = await db.query(topAppsQuery, [customerId, tenantId]);

    return {
      success: true,
      data: {
        total_scans: parseInt(stats.total_scans),
        successful_scans: parseInt(stats.successful_scans),
        expired_scans: parseInt(stats.expired_scans),
        exhausted_scans: parseInt(stats.exhausted_scans),
        invalid_scans: parseInt(stats.invalid_scans),
        total_savings: parseFloat(stats.total_savings),
        credits_balance: creditsBalance,
        last_scan_at: stats.last_scan_at,
        first_scan_at: stats.first_scan_at,
        top_apps: topAppsResult.rows.map(app => ({
          app_name: app.app_name,
          app_code: app.app_code,
          scan_count: parseInt(app.scan_count)
        }))
      }
    };

  } catch (error) {
    console.error('Error in getScanStats:', error);
    throw error;
  }
};
