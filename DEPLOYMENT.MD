# Sersa — Deployment Documentation

## 1. Project Overview

Sersa is a Service Business Management SaaS application built with React, Node.js, Express, and PostgreSQL.

## 2. Technology Stack

- Frontend: React, Vite
- Backend: Node.js, Express
- Database: PostgreSQL (Neon)
- Containerization: Docker, Docker Compose
- CI/CD: GitHub Actions
- Frontend Hosting: Vercel
- Backend Hosting: Vercel

## 3. Production URLs

- Frontend: https://sersa-five.vercel.app
- Backend Health Check: https://sersa-api.vercel.app/api/health

## 4. Environment Variables

Configure production environment variables through the hosting provider dashboard.

Required variables may include:

- `DATABASE_URL`
- `JWT_SECRET`
- `VITE_API_URL`

Never commit production secrets or database credentials to GitHub.

## 5. Database Deployment

The production PostgreSQL database is hosted on Neon.

Database schema was deployed using SQL migration files `001` through `011` in the backend migration directory.

## 6. Database Backup

A production database backup was created using `pg_dump` in custom format.

Backup location: `backups/sersa-production-backup.dump`

The backup directory and database dump files are excluded through `.gitignore`.

## 7. Health Check

Verify backend availability by opening:

https://sersa-api.vercel.app/api/health

The endpoint should return a healthy status and database connection information.

## 8. Deployment Workflow

1. Make changes locally.
2. Run the available tests.
3. Commit and push changes to GitHub.
4. Check the deployment status in Vercel.
5. Verify the frontend and backend production endpoints.
6. Test critical application flows after deployment.

## 9. Security Notes

- Keep production credentials private.
- Use separate local and production environment variables.
- Do not commit `.env` files or database backups.
- Verify authentication and role-based access controls.
- Back up the production database before risky schema changes.

## 10. Known Limitations

Document any unresolved deployment issues, monitoring gaps, or operational limitations here.