# SplitX

Shared Expenses App for the Spreetail internship assignment.

## Tech Stack

- Backend: Node.js + Express
- Frontend: React + Vite
- Database: PostgreSQL via Neon
- ORM: Prisma
- Auth: JWT + bcryptjs
- CSV import: multer + csv-parser
- Deploy: Render for backend, Vercel for frontend

## Project Structure

```text
splitwise-clone/
├── client/
└── server/
```

## Local Setup

### 1. Install dependencies

```bash
cd server && npm install
cd ../client && npm install
```

### 2. Configure environment variables

Create the following env files:

#### server/.env

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
JWT_SECRET=your_jwt_secret
CLIENT_URL=http://localhost:3000
PORT=5000
```

#### client/.env

```bash
VITE_API_URL=http://localhost:5000/api
```

### 3. Prepare the database

```bash
cd server
npx prisma db push
```

### 4. Run the app

```bash
# terminal 1
cd server
npm start

# terminal 2
cd client
npm run dev
```

## Deployment

### Backend on Render

- Root directory: `server`
- Start command: `npm start`
- Required env vars: `DATABASE_URL`, `JWT_SECRET`, `CLIENT_URL`

### Frontend on Vercel

- Root directory: `client`
- Build command: `npm run build`
- Required env vars: `VITE_API_URL`

## Required Env Variables

### Server

- `DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_URL`
- `PORT` (provided by Render in production)

### Client

- `VITE_API_URL`

## Deployed URLs

- Frontend: https://your-frontend.vercel.app
- Backend: https://your-backend.onrender.com

## AI Used

- GitHub Copilot

## Notes

- The CSV import flow is designed to analyze the uploaded file and produce anomaly reports.
- Membership is time-based using `joinedAt` and `leftAt`.
- Settlements are recorded as rows, not deleted.
## Deployed URLs
- Frontend: https://split-x-eosin.vercel.app
- Backend: https://splitx-backend-1jnu.onrender.com
- GitHub: https://github.com/RajanReddyGangumalla/SplitX


Ai used - Chatgpt
