/**
 * Database Utilities
 * Common database operations and helpers
 */

const { AppError, DatabaseError } = require('../errors/AppError');

/**
 * Execute query with error handling
 */
const executeQuery = async (db, query, params = []) => {
  try {
    const result = await db.query(query, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw new DatabaseError(
      error.message,
      { query: query.substring(0, 100), code: error.code }
    );
  }
};

/**
 * Execute transaction with automatic rollback on error
 */
const executeTransaction = async (db, callback) => {
  const client = await db.getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error instanceof AppError) {
      throw error;
    }
    console.error('Transaction error:', error);
    throw new DatabaseError(error.message);
  } finally {
    client.release();
  }
};

/**
 * Build pagination query
 */
const buildPaginationQuery = (baseQuery, page = 1, limit = 10, orderBy = 'created_at DESC') => {
  const offset = (page - 1) * limit;
  return `${baseQuery} ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`;
};

/**
 * Build search query with ILIKE
 */
const buildSearchQuery = (fields, searchTerm) => {
  if (!searchTerm || !fields.length) {
    return { clause: '', params: [] };
  }

  const conditions = fields.map((field, index) => `${field} ILIKE $${index + 1}`).join(' OR ');
  const params = fields.map(() => `%${searchTerm}%`);

  return {
    clause: `(${conditions})`,
    params
  };
};

/**
 * Build filter query from object
 */
const buildFilterQuery = (filters, startIndex = 1) => {
  const conditions = [];
  const params = [];
  let paramIndex = startIndex;

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      conditions.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    }
  });

  return {
    clause: conditions.length > 0 ? conditions.join(' AND ') : '',
    params
  };
};

/**
 * Check if record exists
 */
const recordExists = async (db, table, conditions) => {
  const { clause, params } = buildFilterQuery(conditions);
  const query = `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${clause}) as exists`;

  const result = await executeQuery(db, query, params);
  return result.rows[0].exists;
};

/**
 * Get record count
 */
const getRecordCount = async (db, table, conditions = {}) => {
  const { clause, params } = buildFilterQuery(conditions);
  const whereClause = clause ? `WHERE ${clause}` : '';
  const query = `SELECT COUNT(*) as count FROM ${table} ${whereClause}`;

  const result = await executeQuery(db, query, params);
  return parseInt(result.rows[0].count);
};

/**
 * Soft delete record
 */
const softDelete = async (db, table, id, deletedBy = null) => {
  const params = deletedBy ? [id, deletedBy] : [id];
  const setClause = deletedBy
    ? 'is_active = false, deleted_at = CURRENT_TIMESTAMP, deleted_by = $2'
    : 'is_active = false, deleted_at = CURRENT_TIMESTAMP';

  const query = `
    UPDATE ${table}
    SET ${setClause}
    WHERE id = $1
    RETURNING id
  `;

  const result = await executeQuery(db, query, params);
  return result.rows.length > 0;
};

/**
 * Hard delete record
 */
const hardDelete = async (db, table, id) => {
  const query = `DELETE FROM ${table} WHERE id = $1 RETURNING id`;
  const result = await executeQuery(db, query, [id]);
  return result.rows.length > 0;
};

/**
 * Bulk insert
 */
const bulkInsert = async (db, table, records, returnFields = ['id']) => {
  if (!records || records.length === 0) {
    return [];
  }

  const fields = Object.keys(records[0]);
  const placeholders = records.map((_, rIndex) => {
    const values = fields.map((_, fIndex) => `$${rIndex * fields.length + fIndex + 1}`);
    return `(${values.join(', ')})`;
  }).join(', ');

  const values = records.flatMap(record => fields.map(field => record[field]));

  const query = `
    INSERT INTO ${table} (${fields.join(', ')})
    VALUES ${placeholders}
    RETURNING ${returnFields.join(', ')}
  `;

  const result = await executeQuery(db, query, values);
  return result.rows;
};

/**
 * Upsert (INSERT ... ON CONFLICT UPDATE)
 */
const upsert = async (db, table, record, conflictFields, updateFields) => {
  const fields = Object.keys(record);
  const values = Object.values(record);
  const placeholders = fields.map((_, index) => `$${index + 1}`).join(', ');

  const updateClause = updateFields
    .map(field => `${field} = EXCLUDED.${field}`)
    .join(', ');

  const query = `
    INSERT INTO ${table} (${fields.join(', ')})
    VALUES (${placeholders})
    ON CONFLICT (${conflictFields.join(', ')})
    DO UPDATE SET ${updateClause}
    RETURNING *
  `;

  const result = await executeQuery(db, query, values);
  return result.rows[0];
};

module.exports = {
  executeQuery,
  executeTransaction,
  buildPaginationQuery,
  buildSearchQuery,
  buildFilterQuery,
  recordExists,
  getRecordCount,
  softDelete,
  hardDelete,
  bulkInsert,
  upsert
};
