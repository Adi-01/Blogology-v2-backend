# Blogology API

Production-ready backend API for **Blogology**, an editorial blogging platform. Built with Express 5, TypeScript, Prisma ORM, PostgreSQL, and Redis.

---

## Features

- **Authentication & Sessions:** Cryptographically secure opaque session tokens (`crypto.randomBytes(32)`), Redis cache-aside session lookup (<1ms latency), Google OAuth 2.0, password reset emails, and multi-device session management.
- **Content & Publishing Engine:** Rich editorial post lifecycle (drafting, publishing validations, auto-calculated reading time), tag taxonomy, and Cloudinary media uploads.
- **Weighted Feed Algorithm:** On-write scoring recomputed on publish, like, and comment events (`ORDER BY score DESC`) for low-latency feed retrieval.
- **Social Graph & Engagement:** Follow/unfollow authors, post reactions (likes), nested hierarchical comments, and bookmarks.
- **AI-Powered Writing Assistant:** Google Gemini SSE (Server-Sent Events) streaming endpoint (`/api/v1/ai/generate`) with client disconnect handling, post summarisation with jittered Redis caching, and tiered daily rate limiting.
- **Subscription & Billing:** Stripe Checkout integration and secure raw webhook verification (`/api/v1/billing/webhook`) supporting plan upgrades and daily quota scaling.

---

## Tech Stack

- **Runtime & Language:** Node.js (ESM), TypeScript
- **Framework:** Express 5
- **Database & ORM:** PostgreSQL, Prisma ORM 7
- **Caching & Rate Limiting:** Redis (ioredis)
- **AI:** Google GenAI SDK (`@google/genai`)
- **Payments:** Stripe SDK (`stripe`)
- **Storage:** Cloudinary (`cloudinary`, `multer`)
- **Validation:** Zod

---

## Architecture

The backend strictly enforces a layered separation of concerns:

```
Request ──> Route ──> Zod Validation ──> Controller ──> Service ──> Prisma / Database
```

- **Routes (`src/routes/`):** Route definitions and HTTP method bindings.
- **Validators (`src/validators/`):** Request body, params, and query schemas using Zod.
- **Controllers (`src/controllers/`):** HTTP request/response orchestration and status codes.
- **Services (`src/services/`):** Business logic, transactions, scoring algorithms, and external integrations.
- **Prisma Client (`prisma/`):** Database models, migrations, and seeding.

---

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose (for PostgreSQL and Redis)

### 1. Environment Configuration

Copy the example environment file and fill in your credentials:

```bash
cp .env.example .env
```

Ensure `DATABASE_URL`, `REDIS_URL`, `SESSION_SECRET`, and API keys (`GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, etc.) are configured.

### 2. Start Infrastructure

Start PostgreSQL and Redis using the included Compose configuration:

```bash
docker compose up -d
```

### 3. Install Dependencies & Generate Prisma Client

```bash
npm install
```
*(Prisma client is automatically generated via the `postinstall` script).*

### 4. Database Setup & Seeding

Run Prisma migrations and populate initial test data:

```bash
npx prisma migrate dev
npm run seed  # runs prisma/seed.ts
```

### 5. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:5000`.

---

## Production Deployment

### Build
Compile TypeScript to JavaScript with path alias resolution:

```bash
npm run build
```

### Run Production Server
Apply any pending database migrations and start the compiled server:

```bash
npm run start:prod
```

---

## Key API Endpoints

| Category | Endpoint | Method | Description |
|---|---|---|---|
| **Auth** | `/api/v1/auth/register` | `POST` | Register with email and password |
| | `/api/v1/auth/login` | `POST` | Authenticate and obtain session cookie |
| | `/api/v1/auth/logout` | `POST` | Terminate active session |
| | `/api/v1/auth/google` | `GET` | Initiate Google OAuth flow |
| **Posts** | `/api/v1/posts` | `GET`, `POST` | List published posts / Create draft |
| | `/api/v1/posts/:id` | `GET`, `PATCH`, `DELETE`| Retrieve, update, or soft-delete post |
| | `/api/v1/posts/:id/publish` | `POST` | Publish draft with editorial checks |
| **Feeds** | `/api/v1/feeds/for-you` | `GET` | Weighted algorithm feed |
| | `/api/v1/feeds/following` | `GET` | Chronological posts from followed authors |
| **AI** | `/api/v1/ai/generate` | `POST` | SSE stream for AI drafting & expansion |
| | `/api/v1/ai/summary` | `POST` | Cached post summary generation |
| **Billing** | `/api/v1/billing/checkout` | `POST` | Create Stripe Checkout session |
| | `/api/v1/billing/webhook` | `POST` | Stripe raw body event handler |
