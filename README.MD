# Sersa — Service Business Management SaaS

Sersa is a web-based service business management system designed to help businesses manage customers, service requests, appointments, technicians, work orders, invoices, payments, and business reports in one application.

## Features

- Customer management and customer address management
- Service catalog management
- Service request management
- Appointment and scheduling management
- Technician and team management
- Work order management
- Invoice and invoice item management
- Payment record management
- Business activity logs
- Dashboard and business reporting
- JWT authentication
- Role-based access control
- Multi-tenant architecture
- REST API integration
- Responsive user interface
- Docker-based development environment
- CI/CD workflow with GitHub Actions
- Production deployment and PostgreSQL database backup

## Tech Stack

- **React** — Frontend user interface
- **JavaScript** — Main programming language
- **Node.js & Express.js** — Backend and REST API
- **PostgreSQL** — Relational database
- **Neon** — Cloud PostgreSQL database
- **JWT** — User authentication
- **Docker & Docker Compose** — Containerization and local development
- **Git & GitHub** — Version control
- **GitHub Actions** — CI/CD automation
- **Vercel** — Frontend and backend deployment

## Database

Sersa uses PostgreSQL with the following main tables:

- Tenants
- Users
- Tenant Memberships
- Customers
- Customer Addresses
- Service Catalog
- Service Requests
- Appointments
- Work Orders
- Invoices
- Invoice Items
- Payments
- Activity Logs

Database schema changes are managed through SQL migration files.

## Project Structure

```text
Sersa/
├── backend/
│   ├── api/
│   │   └── index.js
│   ├── scripts/
│   │   └── migrate.js
│   ├── src/
│   │   ├── config/
│   │   │   └── database.js
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── app.js
│   │   └── server.js
│   └── migrations/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── App.jsx
│   ├── public/
│   ├── package.json
│   └── vercel.json
├── backups/
├── docker-compose.yml
├── Dockerfile
├── .github/
│   └── workflows/
├── .gitignore
├── DEPLOYMENT.md
├── README.md
└── vercel.json
```

*Note: The project structure above is a simplified overview. Some directories and files may differ depending on the current repository.*

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/harsarcv/Sersa.git
cd Sersa
```

### 2. Configure environment variables

Configure the environment variables required by the frontend and backend.

Backend environment variables may include:

```env
PORT=5000
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_jwt_secret
```

Frontend environment variable:

```env
VITE_API_URL=http://localhost:5000
```

Use your own local database credentials and a secure JWT secret. Do not commit `.env` files or production credentials to GitHub.

### 3. Install backend dependencies

```bash
cd backend
npm install
```

### 4. Install frontend dependencies

Open another terminal from the project root and run:

```bash
cd frontend
npm install
```

### 5. Configure PostgreSQL

Create a PostgreSQL database and configure the connection through the backend environment variables.

Sersa supports PostgreSQL for local development and Neon for the production database.

### 6. Run database migrations

From the backend directory, run:

```bash
node scripts/migrate.js
```

Ensure the configured database URL points to the intended database before executing migrations.

### 7. Run the backend

From the backend directory:

```bash
npm start
```

Use the development script defined in `package.json` if a separate development command is available.

### 8. Run the frontend

From the frontend directory:

```bash
npm run dev
```

Open the local URL provided by Vite in your browser.

### 9. Run with Docker

From the project root, start the Docker Compose services:

```bash
docker compose up --build
```

The local development environment uses the following ports:

- Frontend: `http://localhost:8080`
- Backend: `http://localhost:5000`
- PostgreSQL: `localhost:5433`

Port mappings may vary depending on the Docker Compose configuration.

## Production Deployment

Sersa is deployed using Vercel for the frontend and backend, with Neon as the production PostgreSQL database.

### Production URLs

- **Frontend:** https://sersa-five.vercel.app
- **Backend Health Check:** https://sersa-api.vercel.app/api/health
- **GitHub Repository:** https://github.com/harsarcv/Sersa

The health endpoint can be used to verify backend availability and database connectivity.

For deployment procedures, environment configuration, database migrations, and backup information, see [DEPLOYMENT.md](DEPLOYMENT.md).

## API

Sersa uses a REST API built with Node.js and Express.js.

### Authentication

- `POST /api/auth/register-business`
- `POST /api/auth/login`

### Customers

- `GET /api/customers`
- `POST /api/customers`
- `PUT /api/customers/:id`
- `GET /api/customers/:customerId/addresses`
- `POST /api/customers/:customerId/addresses`

### Service Management

- Service catalog management
- Service request management
- Appointment management
- Work order management

### Billing

- Invoice management
- Invoice item management
- Payment records

### Operations

- Team and technician management
- Business activity logs
- Dashboard and business reports
- Health check endpoint

*Note: Consult the backend route files for the complete API endpoint list, HTTP methods, and request parameters.*

## Testing

Sersa includes automated backend tests. Tests should be run before merging changes and deploying to production.

```bash
npm test
```

Run the command from the package directory that defines the test script.

## Database Backup

Production database backups are created using PostgreSQL `pg_dump`.

The custom-format backup file is stored locally in the `backups/` directory and excluded from Git through `.gitignore`.

Backup files contain potentially sensitive production data and must not be committed to the repository.

## Security

- JWT-based authentication
- Role-based access control
- Environment-based configuration
- Separate local and production database connections
- Production secrets excluded from version control
- Database migrations for schema management
- Production database backup procedures

## Author

**Harsa Archive**

Full-Stack Developer | PostgreSQL & Database | Web, Mobile & 3D

GitHub: https://github.com/harsarcv