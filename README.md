# University Management System

A full-stack University Management System built for our DBMS group project. The app provides role-based portals for administrators, professors, and students, with workflows for user management, courses, timetables, fees, placements, announcements, marks, and student resume generation.

## Features

- JWT-based authentication for admin, professor, and student users
- Role-based route protection with dedicated middleware
- Admin dashboard for managing users, courses, timetables, fees, and placement jobs
- Professor dashboard for viewing enrolled students, updating marks, and posting announcements
- Student portal for profile, courses, announcements, timetable, fees, placement applications, and resume PDF generation
- MongoDB schemas with validation and uniqueness constraints
- Seed script with sample users, courses, timetable entries, announcements, and fees
- Backend test suite using Node's built-in test runner

## Tech Stack

**Frontend:** React, Vite, CSS  
**Backend:** Node.js, Express, Mongoose, JWT, bcryptjs, PDFKit  
**Database:** MongoDB  
**Optional AI helper:** Ollama for resume content generation

## Project Structure

```text
.
├── DBMSbackend-main/
│   ├── db/                 # Mongoose schemas and models
│   ├── middleware/         # JWT and role-based middleware
│   ├── route/              # Admin, professor, and student API routes
│   ├── scripts/seed.js     # Sample data seeding script
│   └── test/               # Backend tests
├── DBMSfrontend_main/
│   ├── src/
│   │   ├── components/     # React dashboards and portal pages
│   │   └── api.js          # Frontend API client
│   └── vite.config.js
├── ER Diagram.pdf
└── Group_Project_Report.md
```

## Prerequisites

- Node.js 18 or newer
- npm
- MongoDB running locally or a MongoDB Atlas connection string
- Optional: Ollama, if you want AI-assisted resume generation

## Environment Variables

Create a `.env` file inside `DBMSbackend-main`:

```env
MONGO_URI=mongodb://127.0.0.1:27017/university_management
JWT_SECRET=replace_with_a_strong_secret
PORT=3000
```

Optional resume AI settings:

```env
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_RESUME_MODEL=llama3.2:3b
```

If the backend runs on a URL other than `http://localhost:3000`, create a `.env` file inside `DBMSfrontend_main`:

```env
VITE_API_URL=http://localhost:3000
```

## Installation and Setup

Install backend dependencies:

```bash
cd DBMSbackend-main
npm install
```

Install frontend dependencies:

```bash
cd ../DBMSfrontend_main
npm install
```

Seed the database with sample data:

```bash
cd ../DBMSbackend-main
npm run seed
```

Start the backend API:

```bash
npm start
```

In a second terminal, start the frontend:

```bash
cd DBMSfrontend_main
npm run dev
```

Open the frontend at:

```text
http://localhost:5500
```

The backend API runs at:

```text
http://localhost:3000
```

## Demo Logins

After running the seed script, use these accounts:

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@academicportal.edu` | `password123` |
| Professor | `aarav.mehta@academicportal.edu` | `password123` |
| Student | `rohan.verma@academicportal.edu` | `password123` |

## Available Scripts

Backend:

```bash
npm start      # Start Express server
npm run seed   # Reset and seed sample MongoDB data
npm test       # Run backend tests
```

Frontend:

```bash
npm run dev      # Start Vite dev server on port 5500
npm run build    # Build production assets
npm run preview  # Preview production build
```

## API Overview

- `/admin` - admin sign-in, user management, course management, timetable management, fee generation, placement job management
- `/prof` - professor sign-in, assigned courses, enrolled students, marks, announcements
- `/student` - student sign-in, profile, enrolled courses, timetable, fees, placements, resume PDF generation

The API uses bearer tokens:

```text
Authorization: Bearer <token>
```

## Testing

Run backend tests from `DBMSbackend-main`:

```bash
npm test
```

The tests cover authentication flows, database constraints, and resume-related behavior.

## Notes

- Make sure MongoDB is running before starting the backend or running the seed script.
- The seed script clears existing sample collections before inserting fresh demo data.
- Resume PDF generation uses PDFKit. AI-generated resume content requires Ollama to be running with the configured model.
- The frontend Vite dev server is configured for port `5500`.

## Team

Group members: Harshit, Atharv, Aayush, Naitik, Sidak, Mayank and Dhairya.
