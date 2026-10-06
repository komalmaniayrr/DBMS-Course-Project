// RailSync Backend - Express + MySQL
// Database: railway_db
// Tables: 14
//
// Run with:
//   node server.js
//
// Required packages:
//   npm install express mysql2 dotenv

import express from 'express';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// Load .env variables
// IMPORTANT: keep your real DB password in .env and never commit it to GitHub.
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 5001);

app.use(express.json());

// -----------------------------------------------------------------------------
// MySQL connection pool
// -----------------------------------------------------------------------------
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Komal#123',
  database: process.env.DB_NAME || 'railway_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  decimalNumbers: true,
});

// -----------------------------------------------------------------------------
// Allowed tables / primary keys
// These are also used to protect dynamic table names in CRUD endpoints.
// -----------------------------------------------------------------------------
const TABLES = {
  STATION: 'station_id',
  ROUTE: 'route_id',
  TRAIN: 'train_id',
  TRAIN_STOP: 'stop_id',
  SCHEDULE: 'schedule_id',
  COACH: 'coach_id',
  SEAT: 'seat_id',
  PASSENGER: 'passenger_id',
  BOOKING: 'booking_id',
  JOURNEY_SEGMENT: 'segment_id',
  FARE: 'fare_id',
  PAYMENT: 'payment_id',
  WAITLIST: 'waitlist_id',
  CANCELLATION: 'cancellation_id',
};

const TABLE_NAMES = Object.keys(TABLES);

const assertTable = (tableName) => {
  const normalized = String(tableName || '').toUpperCase();
  if (!TABLE_NAMES.includes(normalized)) {
    const error = new Error(`Invalid table name: ${tableName}`);
    error.status = 400;
    throw error;
  }
  return normalized;
};

const quoteTable = (tableName) => `\`${assertTable(tableName)}\``;
const todaySql = () => new Date().toISOString().slice(0, 10);

// -----------------------------------------------------------------------------
// Health check
// -----------------------------------------------------------------------------
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      success: true,
      message: 'RailSync backend and MySQL are connected.',
      database: process.env.DB_NAME || 'railway_db',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Backend is running, but MySQL connection failed.',
      error: error.message,
    });
  }
});

// -----------------------------------------------------------------------------
// Load the complete database state for the React frontend.
// This replaces the current localStorage-only database state.
// -----------------------------------------------------------------------------
app.get('/api/state', async (_req, res) => {
  try {
    const state = {};

    for (const table of TABLE_NAMES) {
      const [rows] = await pool.query(`SELECT * FROM ${quoteTable(table)}`);
      state[table] = rows;
    }

    res.json({ success: true, db: state });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// Get one table
// GET /api/table/STATION
// -----------------------------------------------------------------------------
app.get('/api/table/:tableName', async (req, res) => {
  try {
    const table = assertTable(req.params.tableName);
    const [rows] = await pool.query(`SELECT * FROM ${quoteTable(table)}`);
    res.json({ success: true, table, rows, rowCount: rows.length });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// Generic INSERT
// POST /api/table/STATION
// body: { station_name: "New Delhi", city: "Delhi", gate: "A1", code: "NDLS" }
// -----------------------------------------------------------------------------
app.post('/api/table/:tableName', async (req, res) => {
  try {
    const table = assertTable(req.params.tableName);
    const data = req.body;

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ success: false, error: 'Request body must be a JSON object.' });
    }

    const columns = Object.keys(data);
    if (columns.length === 0) {
      return res.status(400).json({ success: false, error: 'No columns supplied.' });
    }

    const safeColumns = columns.map((column) => `\`${column}\``).join(', ');
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((column) => data[column]);

    const [result] = await pool.execute(
      `INSERT INTO ${quoteTable(table)} (${safeColumns}) VALUES (${placeholders})`,
      values
    );

    const primaryKey = TABLES[table];
    const insertedId = result.insertId || data[primaryKey] || null;

    res.json({
      success: true,
      message: `1 row inserted into ${table}.`,
      insertedId,
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// Generic UPDATE
// PATCH /api/table/STATION/1
// body: { city: "New Delhi" }
// -----------------------------------------------------------------------------
app.patch('/api/table/:tableName/:id', async (req, res) => {
  try {
    const table = assertTable(req.params.tableName);
    const primaryKey = TABLES[table];
    const data = req.body;

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ success: false, error: 'Request body must be a JSON object.' });
    }

    const columns = Object.keys(data).filter((column) => column !== primaryKey);
    if (columns.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update.' });
    }

    const assignments = columns.map((column) => `\`${column}\` = ?`).join(', ');
    const values = columns.map((column) => data[column]);
    values.push(req.params.id);

    const [result] = await pool.execute(
      `UPDATE ${quoteTable(table)} SET ${assignments} WHERE \`${primaryKey}\` = ?`,
      values
    );

    res.json({
      success: true,
      message: `${result.affectedRows} row(s) updated in ${table}.`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// Generic DELETE
// DELETE /api/table/STATION/1
// -----------------------------------------------------------------------------
app.delete('/api/table/:tableName/:id', async (req, res) => {
  try {
    const table = assertTable(req.params.tableName);
    const primaryKey = TABLES[table];

    const [result] = await pool.execute(
      `DELETE FROM ${quoteTable(table)} WHERE \`${primaryKey}\` = ?`,
      [req.params.id]
    );

    res.json({
      success: true,
      message: `${result.affectedRows} row(s) deleted from ${table}.`,
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// -----------------------------------------------------------------------------
// SQL Console - runs real SQL against MySQL.
// Use locally for your DBMS presentation. Do NOT expose this endpoint publicly.
// POST /api/sql
// body: { "sql": "SELECT ..." }
// -----------------------------------------------------------------------------
app.post('/api/sql', async (req, res) => {
  const sql = String(req.body?.sql || '').trim();

  if (!sql) {
    return res.status(400).json({
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      error: 'Empty SQL query provided.',
    });
  }

  try {
    const [result] = await pool.query(sql);

    // SELECT / SHOW / DESCRIBE / EXPLAIN return an array of row objects.
    if (Array.isArray(result)) {
      const rows = result;
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      return res.json({
        success: true,
        columns,
        rows,
        rowCount: rows.length,
        message: `${rows.length} row(s) returned.`,
      });
    }

    // INSERT / UPDATE / DELETE / DDL return a ResultSetHeader-like object.
    res.json({
      success: true,
      columns: ['affectedRows', 'insertId'],
      rows: [{
        affectedRows: result.affectedRows ?? 0,
        insertId: result.insertId ?? 0,
      }],
      rowCount: 1,
      message: 'SQL command executed successfully.',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      columns: [],
      rows: [],
      rowCount: 0,
      error: error.message,
    });
  }
});

// -----------------------------------------------------------------------------
// Booking transaction
// Inserts/updates in:
// PASSENGER -> BOOKING -> JOURNEY_SEGMENT -> PAYMENT -> WAITLIST(optional)
// All changes are committed together or rolled back together.
// -----------------------------------------------------------------------------
app.post('/api/bookings', async (req, res) => {
  const {
    passenger,
    schedule_id,
    from_station_id,
    to_station_id,
    coach_id,
    seat_id,
    payment_mode,
    fare_amount,
  } = req.body || {};

  if (!passenger || !schedule_id || !from_station_id || !to_station_id || !coach_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing required booking fields.',
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Find existing passenger by email OR ID proof.
    const [passengers] = await connection.execute(
      `SELECT * FROM PASSENGER WHERE LOWER(email) = LOWER(?) OR id_proof = ? LIMIT 1`,
      [passenger.email, passenger.id_proof]
    );

    let passengerId;

    if (passengers.length > 0) {
      passengerId = passengers[0].passenger_id;
    } else {
      const [passengerInsert] = await connection.execute(
        `INSERT INTO PASSENGER (email, phone, gender, age, id_proof)
         VALUES (?, ?, ?, ?, ?)`,
        [passenger.email, passenger.phone, passenger.gender, Number(passenger.age), passenger.id_proof]
      );
      passengerId = passengerInsert.insertId;
    }

    // 2. Determine confirmed vs waiting.
    const isWaitlist = seat_id === null || seat_id === undefined || seat_id === '';
    const bookingStatus = isWaitlist ? 'Waiting' : 'Confirmed';
    const computedFare = Number(fare_amount || 1200);

    // If a seat was selected, make sure it is still free.
    let assignedSeatId = seat_id;

    if (!isWaitlist) {
      const [seatRows] = await connection.execute(
        `SELECT js.segment_id
         FROM JOURNEY_SEGMENT js
         INNER JOIN BOOKING b ON b.booking_id = js.booking_id
         WHERE js.schedule_id = ?
           AND js.seat_id = ?
           AND b.status <> 'Cancelled'
         LIMIT 1
         FOR UPDATE`,
        [schedule_id, seat_id]
      );

      if (seatRows.length > 0) {
        await connection.rollback();
        return res.status(409).json({
          success: false,
          error: 'Selected seat is no longer available. Please choose another seat.',
        });
      }
    } else {
      // The existing React project expects JOURNEY_SEGMENT.seat_id to be non-null.
      // Use the first seat in the selected coach as the placeholder for a waiting ticket.
      const [firstSeat] = await connection.execute(
        `SELECT seat_id FROM SEAT WHERE coach_id = ? ORDER BY seat_id LIMIT 1`,
        [coach_id]
      );
      assignedSeatId = firstSeat.length > 0 ? firstSeat[0].seat_id : 1;
    }

    // 3. Create BOOKING.
    const [bookingInsert] = await connection.execute(
      `INSERT INTO BOOKING (passenger_id, booking_date, status, total_fare)
       VALUES (?, CURRENT_DATE(), ?, ?)`,
      [passengerId, bookingStatus, computedFare]
    );

    const bookingId = bookingInsert.insertId;

    // 4. Create JOURNEY_SEGMENT.
    const [segmentInsert] = await connection.execute(
      `INSERT INTO JOURNEY_SEGMENT
       (booking_id, schedule_id, from_station_id, to_station_id, seat_id, fare)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [bookingId, schedule_id, from_station_id, to_station_id, assignedSeatId, computedFare]
    );

    const segmentId = segmentInsert.insertId;

    // 5. Create PAYMENT.
    const txnSuffix = Math.floor(100 + Math.random() * 900);
    const transactionId = `TXN${String(bookingId).padStart(3, '0')}_${txnSuffix}`;

    await connection.execute(
      `INSERT INTO PAYMENT
       (booking_id, segment, position_no, payment_mode, transaction_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [bookingId, segmentId, isWaitlist ? 1 : 0, payment_mode || 'UPI', transactionId, 'Paid']
    );

    // 6. WAITLIST row, only when no seat was selected.
    if (isWaitlist) {
      const [positionRows] = await connection.execute(
        `SELECT COALESCE(MAX(position_no), 0) + 1 AS next_position
         FROM WAITLIST WHERE status = 'Waiting' FOR UPDATE`
      );

      const nextPosition = positionRows[0].next_position;

      await connection.execute(
        `INSERT INTO WAITLIST
         (booking_id, position_no, allotment_date, status)
         VALUES (?, ?, CURRENT_DATE(), 'Waiting')`,
        [bookingId, nextPosition]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      bookingId,
      pnr: `PNR-2026-${String(bookingId).padStart(4, '0')}`,
      status: bookingStatus,
      transactionId,
      message: `Ticket booked successfully. Booking ID #${bookingId}.`,
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
});

// -----------------------------------------------------------------------------
// Cancellation + refund transaction
// Updates BOOKING, PAYMENT, WAITLIST and inserts CANCELLATION.
// -----------------------------------------------------------------------------
app.post('/api/bookings/:bookingId/cancel', async (req, res) => {
  const bookingId = Number(req.params.bookingId);
  const reason = req.body?.reason || 'Passenger requested cancellation';

  if (!Number.isInteger(bookingId) || bookingId <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid booking ID.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [bookingRows] = await connection.execute(
      `SELECT * FROM BOOKING WHERE booking_id = ? FOR UPDATE`,
      [bookingId]
    );

    if (bookingRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    const booking = bookingRows[0];

    if (booking.status === 'Cancelled') {
      await connection.rollback();
      return res.status(409).json({ success: false, error: 'Booking is already cancelled.' });
    }

    const [segmentRows] = await connection.execute(
      `SELECT * FROM JOURNEY_SEGMENT WHERE booking_id = ? ORDER BY segment_id LIMIT 1`,
      [bookingId]
    );

    if (segmentRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: 'Journey segment not found.' });
    }

    const segment = segmentRows[0];
    const refundAmount = Math.max(0, Math.round(Number(booking.total_fare) * 0.85));

    await connection.execute(
      `UPDATE BOOKING SET status = 'Cancelled' WHERE booking_id = ?`,
      [bookingId]
    );

    await connection.execute(
      `UPDATE PAYMENT SET status = 'Refunded' WHERE booking_id = ?`,
      [bookingId]
    );

    await connection.execute(
      `UPDATE WAITLIST SET status = 'Cancelled' WHERE booking_id = ?`,
      [bookingId]
    );

    await connection.execute(
      `INSERT INTO CANCELLATION
       (segment_id, cancellation_date, reason, refund_amount, status)
       VALUES (?, CURRENT_DATE(), ?, ?, 'Refunded')`,
      [segment.segment_id, reason, refundAmount]
    );

    await connection.commit();

    res.json({
      success: true,
      refundAmount,
      message: `Booking #${bookingId} cancelled. Refund of ₹${refundAmount} processed.`,
    });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ success: false, error: error.message });
  } finally {
    connection.release();
  }
});

// -----------------------------------------------------------------------------
// Friendly error handler
// -----------------------------------------------------------------------------
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({
    success: false,
    error: error.message || 'Internal server error.',
  });
});

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------
const SERVER_PORT = process.env.PORT || 5001;
app.listen(SERVER_PORT, () => console.log(`Server running on port ${SERVER_PORT}`));
