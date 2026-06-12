# Divine Life Memorial Park - Cemetery Management System

A full-stack web application for lot management, interactive cemetery mapping, ownership records, and payment processing for Divine Life Memorial Park, Cabuyao, Laguna.

**Repository:** [github.com/Barcocoma/Capstone-Project](https://github.com/Barcocoma/Capstone-Project)

## Features

### User Roles
- **Admin** — Full system access, user management, reports, backup & recovery
- **Cemetery Staff** — Map view, deceased records, lot search
- **Cashier** — Payment processing, customer transactions, receipts
- **Customer** — View owned lots, payment history, online payments

### Core Modules
- **Interactive Map View** — Google Maps with sector overlays and lot status
- **Ownership Management** — Customer and lot ownership records
- **Payment Processing** — Cashier payments, monthly plans, PayMongo integration
- **User Management** — Role-based access control
- **Reports & Activity Logs** — Analytics and audit trail

---

## Quick Start with Docker (Recommended)

The easiest way to run the full system (frontend + PHP API + MySQL) is with Docker.

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running

### Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/Barcocoma/Capstone-Project.git
   cd Capstone-Project
   ```

2. **Set up environment variables**
   ```bash
   copy .env.example .env
   ```
   Edit `.env` and add your Google Maps API key:
   ```
   VITE_GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here
   ```
   > Get a key from [Google Cloud Console](https://console.cloud.google.com/). Enable **Maps JavaScript API** and allow `http://localhost:8082/*` in key restrictions.

3. **Start the application**
   ```bash
   docker compose up --build -d
   ```
   First run may take a few minutes. The database is imported automatically on first startup.

4. **Open in browser**
   ```
   http://localhost:8082
   ```

### Docker Commands

| Command | Description |
|---------|-------------|
| `docker compose up -d` | Start containers |
| `docker compose up --build -d` | Rebuild and start (after code changes) |
| `docker compose down` | Stop containers |
| `docker compose down -v` | Stop and reset database (fresh import on next start) |
| `docker compose logs -f app` | View app logs |

### Docker Services

| Service | URL / Port | Description |
|---------|------------|-------------|
| App | `http://localhost:8082` | React frontend + PHP API (Apache) |
| MySQL | `localhost:3307` | Database (`cemetery_management`) |

---

## Local Development (XAMPP + Node.js)

Use this setup if you prefer running without Docker.

### Prerequisites
- **XAMPP** — MySQL + Apache + PHP ([download](https://www.apachefriends.org/))
- **Node.js v18+** — ([download](https://nodejs.org/))
- **Composer** — PHP dependency manager ([download](https://getcomposer.org/))

### Steps

1. **Start XAMPP services**
   - Open XAMPP Control Panel
   - Start **Apache** and **MySQL**

2. **Place project in htdocs**
   ```
   C:\xampp\htdocs\ManagementSystem
   ```

3. **Import the database**
   - Open `http://localhost/phpmyadmin`
   - Go to **Import** → select `Cemetery Management System Database.sql` → **Go**
   - Database `cemetery_management` will be created with default users

4. **Install dependencies**
   ```bash
   npm install
   composer install
   ```

5. **Configure environment**
   ```bash
   copy .env.example .env.local
   ```
   Add your Google Maps API key to `.env.local`.

6. **Configure API (optional)**
   - Database settings in `api/config.php` default to XAMPP (`root`, no password)
   - Update SMTP and PayMongo keys in `api/config.php` for email and online payments

7. **Start the dev server**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` (or the port shown in the terminal).

   > The Vite dev server proxies `/api` requests to `http://localhost/ManagementSystem/api`. Apache must be running.

---

## Default Login Credentials

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `Admin@123!` |
| Cemetery Staff | `staff1` | `Staff@123!` |
| Cashier | `cashier1` | `Cashier@123!` |

> You may be prompted to change your password on first login.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_GOOGLE_MAPS_API_KEY` | Yes (for maps) | Google Maps JavaScript API key |

Copy `.env.example` to `.env` (Docker) or `.env.local` (local dev). These files are gitignored — never commit API keys.

For Docker builds, the Maps key is baked in at build time via the `VITE_GOOGLE_MAPS_API_KEY` build arg in `docker-compose.yml`.

---

## Project Structure

```
ManagementSystem/
├── src/                    # React frontend (Vite)
│   ├── components/
│   ├── context/            # Auth & app state
│   ├── pages/              # Dashboard pages by role
│   └── configs/            # API endpoints
├── api/                    # PHP REST API
├── public/                 # Static assets & map images
├── docker-compose.yml      # Docker orchestration
├── Dockerfile              # Multi-stage build (Node + PHP/Apache)
└── Cemetery Management System Database.sql
```

---

## Technologies Used

| Layer | Stack |
|-------|-------|
| Frontend | React 18, Vite, Material Tailwind CSS, ApexCharts |
| Backend | PHP 8.2, Apache |
| Database | MySQL 8.0 |
| Maps | Google Maps JavaScript API |
| Payments | PayMongo (optional) |
| Email | PHPMailer / SMTP (optional) |
| Container | Docker, Docker Compose |

---

## Troubleshooting

**"Unable to reach server" on login**
- Ensure MySQL is running (XAMPP) or Docker containers are up (`docker compose ps`)
- Verify the database was imported

**Google Maps not loading**
- Check `VITE_GOOGLE_MAPS_API_KEY` in `.env` / `.env.local`
- For Docker: rebuild with `docker compose up --build -d`
- Allow `http://localhost:8082/*` in Google Cloud Console key restrictions

**Port already in use (Docker)**
- Default app port is **8082** (not 8080). Change it in `docker-compose.yml` if needed.

**Blank page on localhost:5173**
- Another app may be cached on that port. Try a hard refresh (`Ctrl+Shift+R`) or use a different port: `npm run dev -- --port 5174`

---

## License

MIT License — see [LICENSE](LICENSE) file for details.
