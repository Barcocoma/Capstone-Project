# Divine Life Memorial Park - Cemetery Management System

A web-based lot management system with digital map and ownership management for Divine Life Memorial Park, Cabuyao, Laguna.

## Current Status: Sample Data Mode

**⚠️ IMPORTANT:** This version uses sample data and does not require any backend database connection. All authentication and data operations are simulated locally.

## Features

### User Roles
- **Admin**: Full system access, user management, reports
- **Cemetery Staff**: Map view
- **Cashier**: Payment processing, transaction management
- **Customer**: View own lots, payment history, map navigation

### Core Modules
- **Map View**: Interactive cemetery map with lot status indicators
- **Ownership Management**: Customer and lot ownership records
- **Transaction Processing**: Payment tracking and history
- **User Management**: Role-based access control
- **Reports**: Analytics and financial reports

## How to Download and Install (Step by Step)

### Prerequisites
- **XAMPP**: Required for MySQL database server only (download from https://www.apachefriends.org/)
  - **Note**: You only need XAMPP for the MySQL database. The application runs via Node.js, not through XAMPP's Apache server.
- **Node.js v14 or higher** (download from https://nodejs.org). The installer already includes npm.
- A terminal (PowerShell on Windows, or your preferred shell on macOS/Linux).

---

### Step 1: Install XAMPP

1. **Download XAMPP Installer**
   - Visit https://www.apachefriends.org/
   - Click the `Download` button for your operating system:
     - **Windows**: Download `xampp-windows-x64-8.x.x-installer.exe` (or latest version)
     - **macOS**: Download `xampp-osx-8.x.x-installer.dmg`
     - **Linux**: Download `xampp-linux-x64-8.x.x-installer.run`
   - Choose the latest version (PHP 8.x recommended)
   - The installer file size is approximately 150-200 MB

2. **Install XAMPP**
   - **Windows**: 
     - Run the downloaded `.exe` installer
     - If Windows Defender or antivirus warns, click "More info" → "Run anyway" (XAMPP is safe)
     - Follow the installation wizard:
       - Choose installation directory (default: `C:\xampp` on Windows)
       - Select components: **Apache**, **MySQL**, **PHP**, **phpMyAdmin** (all recommended)
       - Click "Next" and complete the installation
   - **macOS**:
     - Open the downloaded `.dmg` file
     - Drag XAMPP to Applications folder
     - Open Applications → XAMPP → Manager-OSX
   - **Linux**:
     - Make the installer executable: `chmod +x xampp-linux-x64-8.x.x-installer.run`
     - Run: `sudo ./xampp-linux-x64-8.x.x-installer.run`
     - Follow the installation prompts

---

### Step 2: Start MySQL Service in XAMPP

1. **Open XAMPP Control Panel**
   - **Windows**: Start menu → XAMPP → XAMPP Control Panel
   - **macOS**: Applications → XAMPP → Manager-OSX
   - **Linux**: Run `sudo /opt/lampp/manager-linux-x64.run`

2. **Start MySQL Service**
   - In the Control Panel, click `Start` button next to **MySQL** service
   - **Note**: You don't need to start Apache - the React app runs via `npm run dev`, not through XAMPP
   - Verify MySQL shows green indicator (running status)

3. **Verify MySQL Installation**
   - Open your browser and go to `http://localhost/phpmyadmin`
   - You should see the phpMyAdmin interface
   - Your MySQL database server is now ready!

**Important**: 
- XAMPP is only needed for the MySQL database server
- The React application runs independently via `npm run dev` (not through XAMPP Apache)

---

### Step 3: Import Database

The project includes a MySQL database file that needs to be imported. The database file is located at:
```
C:\xampp\htdocs\ManagementSystem\Cemetery Management System Database.sql
```

**Method 1: Import via phpMyAdmin (Recommended)**

1. Make sure **MySQL** service is running in XAMPP Control Panel
2. Open your browser and go to `http://localhost/phpmyadmin`
3. Click on the **"Import"** tab at the top
4. Click **"Choose File"** or **"Browse"** button
5. Navigate to and select: `C:\xampp\htdocs\ManagementSystem\Cemetery Management System Database.sql`
6. Click **"Go"** or **"Import"** button at the bottom
7. Wait for the import to complete (you should see a success message)
8. The database `cemetery_management` should now be created with all tables

**Method 2: Import via MySQL Command Line (Alternative)**

1. Open Command Prompt (Windows) or Terminal (macOS/Linux)
2. Navigate to XAMPP MySQL bin directory:
   ```bash
   # Windows
   cd C:\xampp\mysql\bin
   
   # macOS/Linux
   cd /Applications/XAMPP/xamppfiles/bin  # or /opt/lampp/bin
   ```
3. Run the MySQL import command:
   ```bash
   # Windows
   mysql.exe -u root -p < "C:\xampp\htdocs\ManagementSystem\Cemetery Management System Database.sql"
   
   # macOS/Linux
   ./mysql -u root -p < "/path/to/ManagementSystem/Cemetery Management System Database.sql"
   ```
4. Enter password when prompted (default is empty, just press Enter)
5. The database will be imported automatically

**Verify Database Import:**
- Go back to phpMyAdmin (`http://localhost/phpmyadmin`)
- You should see `cemetery_management` database in the left sidebar
- Click on it to view all imported tables (users, gardens, sectors, blocks, etc.)

---

### Step 4: Install Node.js

1. **Download Node.js**
   - Visit https://nodejs.org/
   - Download the LTS (Long Term Support) version (v14 or higher recommended)
   - The installer includes npm automatically

2. **Install Node.js**
   - **Windows**: Run the downloaded `.msi` installer and follow the wizard
   - **macOS**: Run the downloaded `.pkg` installer
   - **Linux**: Use your package manager or download the binary

3. **Verify Installation**
   - Open a terminal and run:
     ```bash
     node --version
     npm --version
     ```
   - You should see version numbers for both commands

---

### Step 5: Download the Project

1. Open the provided Google Drive link
2. Click `Download` to get the ZIP file
3. Extract the ZIP to your chosen folder (e.g., `C:\xampp\htdocs\ManagementSystem`)
4. Open a terminal and change directory to the extracted folder:
   ```bash
   cd C:\xampp\htdocs\ManagementSystem
   ```

---

### Step 6: Install Project Dependencies

1. Make sure you're in the project folder (from Step 5)
2. Run the following command:
   ```bash
   npm install
   ```
3. Wait for all dependencies to be installed (this may take a few minutes)

---

### Step 7: Start the Application

**Important**: Make sure MySQL is running in XAMPP Control Panel before starting the app.

1. In the project folder, run:
   ```bash
   npm run dev
   ```

2. Wait for the development server to start
   - You should see a message like: `Local: http://localhost:5173`

3. Open your browser and go to `http://localhost:5173`
   - The application should now be running!

**Note**: The app runs on its own development server (port 5173), not through XAMPP Apache. XAMPP is only needed for the MySQL database.

---

### Additional Information

**Stop the dev server:**
- Press `Ctrl + C` in the terminal where `npm run dev` is running

**Re-run the application later:**
1. Make sure MySQL is running in XAMPP Control Panel
2. Open terminal and navigate to project folder:
   ```bash
   cd C:\xampp\htdocs\ManagementSystem   # or the folder where you cloned
   ```
3. Run:
   ```bash
   npm run dev
   ```

**Production build (Optional):**
If you need an optimized build:
```bash
npm run build
```
The output goes to the `dist/` folder; you can serve it with any static server.

## Sample Login Credentials

Use these credentials to test different user roles:

| Role | Username | Password |
|------|----------|----------|
| Admin | `admin` | `Admin@123!` |
| Cemetery Staff | `staff1` | `Staff@123!` |
| Cashier | `cashier1` | `Cashier@123!` |

## Sample Data

The system includes realistic sample data for:
- **14,250 total lots** with status distribution
- **11,403 customers** with ownership records
- **Monthly revenue tracking** (₱2.45M average)
- **Weekly lot sales** and customer registrations
- **Payment history** and transaction logs

## Project Structure

```
Project1/
├── src/
│   ├── components/          # Reusable UI components
│   ├── context/            # Authentication and state management
│   ├── data/               # Sample data files
│   ├── layouts/            # Page layouts
│   ├── pages/              # Main application pages
│   │   ├── admin-dashboard/ # Admin-specific pages
│   │   ├── auth/           # Authentication pages
│   │   └── dashboard/      # General dashboard pages
│   └── widgets/            # Dashboard widgets and charts
├── public/                 # Static assets
└── api/                    # Backend API files (not used in sample mode)
```

## Key Components

### Authentication
- **AuthContext**: Manages user authentication state
- **ProtectedRoute**: Route protection (currently disabled for sample mode)
- **SignIn**: Login page with sample credentials

### Dashboard
- **Statistics Cards**: Key metrics display
- **Charts**: Revenue, sales, and customer analytics
- **Activity Feed**: Recent system activities

### Admin Features
- **User Management**: User creation and role assignment
- **Payment Monitoring**: Transaction tracking
- **Reports**: Financial and operational reports

## Development Notes

### Sample Data Mode
- All backend API calls have been replaced with local sample data
- Authentication is simulated with hardcoded credentials
- Data persistence is handled through browser localStorage
- No database connection required

### Backend Integration (Future)
When ready to connect to a real backend:
1. Update `src/context/AuthContext.jsx` to use real API calls
2. Restore authentication checks in `src/components/ProtectedRoute.jsx`
3. Update all components to fetch data from backend APIs
4. Configure database connection in `api/config.php`

## Technologies Used

- **Frontend**: React 18, Vite, Material Tailwind CSS
- **Charts**: ApexCharts
- **Icons**: Heroicons
- **Routing**: React Router DOM
- **State Management**: React Context API

## License

MIT License - see LICENSE file for details.

## Support

For questions or issues, please refer to the project documentation or contact the development team.
