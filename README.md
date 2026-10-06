# RailSync — Railway Ticket Reservation & Journey Management System

NAME- Komal Maniyar
ROLL NUMBER- 25WU0102127

PROJECT TITLE- Railway Ticket Reservation & Journey Management System


This version connects the React/Vite frontend to a real MySQL database through an Express backend.

## Prerequisites
- Node.js
- MySQL Server

## 1. Create the database
Create a MySQL database named `railway_db` and create the 14 tables that match `src/types/database.ts`.

## 2. Configure environment variables
Copy `.env.example` to `.env` and set your MySQL credentials.

```text
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=railway_db
PORT=5000
```

Never commit `.env` to GitHub.

## 3. Install dependencies

```bash
npm install
```

## 4. Start the backend

```bash
npm run server
```

Backend health check:
`http://localhost:5000/api/health`

## 5. Start the frontend
In another terminal:

```bash
npm run dev
```

The Vite dev server proxies `/api` requests to the Express server on port 5000.

## What is now connected to MySQL
- Database Explorer table reads/inserts/updates/deletes
- Live SQL Console
- Train/seat data loaded from MySQL
- Ticket booking transaction
- Cancellation/refund transaction

## Important
The `/api/sql` endpoint executes real SQL. Keep the backend local for your DBMS presentation and do not expose it publicly without authentication and authorization.
