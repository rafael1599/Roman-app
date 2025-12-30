# Roman Inv - Inventory Management PWA

Offline-first Progressive Web App for inventory management with automatic CSV file synchronization.

## Features

### Core Inventory Management
- 📱 **Mobile-First Design** - Optimized for iPhone/Safari
- 🌐 **Network Access** - Access from any device on your local network
- 💾 **Auto-Save** - Changes automatically saved to CSV files (1 second debounce)
- 🔍 **Search** - Filter inventory by SKU or Location
- ✏️ **CRUD Operations** - Add, Edit, Delete inventory items
- 📊 **Dual Inventory** - Separate views for Ludlow (General) and ATS (High Density)
- 🎨 **Dark Mode** - Industrial dark theme with Matrix green accents

### 🤖 Smart Picking (AI-Powered)
- 📸 **AI Order Scanning** - Scan invoices with camera, AI extracts SKUs automatically
- 🧠 **Powered by Gemini 2.5 Flash** - Best FREE model with hybrid reasoning
- 🎯 **JSON Schema Validation** - Guaranteed accurate OCR results
- 📦 **Auto Palletization** - Automatically splits orders into pallets (max 13 items)
- 🗺️ **Route Optimization** - Configurable warehouse map for optimal picking routes
- ✅ **AI Verification** - Verify completed pallets with photo verification
- 🔄 **Real-time Inventory** - Automatic inventory deduction as orders are processed
- ↩️ **Rollback Support** - Undo orders if mistakes are made
- ⚡ **Fast & Free** - Latest AI technology on free tier

> 📖 **[Read Smart Picking Documentation](./SMART_PICKING.md)** for setup and usage guide

## Installation

### 1. Install Dependencies

```bash
# Install frontend dependencies
pnpm install

# Install backend dependencies
cd server
pnpm install
cd ..
```

### 2. Run the Application

You need to run **both** the frontend and backend servers:

#### Option A: Run Both Servers Separately (Recommended)

**Terminal 1 - Backend Server:**
```bash
pnpm run dev:server
```

**Terminal 2 - Frontend Server:**
```bash
pnpm run dev
```

#### Option B: Run Both Together (macOS/Linux)

```bash
pnpm run dev:all
```

### 3. Access the App

- **Local:** http://localhost:5173/
- **Network:** http://YOUR_IP:5173/ (shown in terminal after starting)

> **Note:** Make sure both servers are running. The backend runs on port 3001, frontend on port 5173.

## How It Works

### Architecture

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Express.js (Node.js)
- **Data Storage:** CSV files in `public/data/`
- **Auto-Save:** Debounced (1 second) automatic writes to CSV

### Data Flow

1. Frontend loads inventory from backend API (`/api/inventory/ludlow` and `/api/inventory/ats`)
2. User makes changes (add, edit, delete, increment/decrement)
3. Changes are automatically saved to CSV files via API after 1 second of inactivity
4. CSV files in `public/data/` are updated in real-time

### CSV Files

- `public/data/clean_inventory.csv` - Ludlow inventory
- `public/data/ats_inventory.csv` - ATS inventory

## Usage

### Ludlow Screen (General Inventory)
- Grouped by Location (Row 1, Row 2, etc.)
- Click any card to edit
- Use +/- buttons to adjust quantity
- Tap green "+" button (bottom right) to add new item

### ATS Screen (High Density)
- Sorted by Location and Location_Detail
- Location_Detail highlighted in yellow
- Same editing capabilities as Ludlow

### Editing Items
- Click any inventory card to open edit modal
- Modify SKU, Location, Quantity, or Location_Detail
- Click "Save" to confirm or "Delete" to remove item
- Changes auto-save to CSV files

## Network Access

The app is configured to be accessible from other devices on your local network:

1. Start both servers
2. Find the Network URL in the terminal output
3. Open that URL on your iPhone (same WiFi network)
4. Add to Home Screen for PWA experience

## Tech Stack

### Core
- **React 19** - UI framework
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Express.js** - Backend API server
- **PapaParse** - CSV parsing
- **Lucide React** - Icons
- **React Router** - Navigation

### Smart Picking
- **Google Gemini 2.5 Flash** - Best FREE model with hybrid reasoning
- **JSON Schema Validation** - Ensures accurate OCR results
- **@google/generative-ai** - Official Gemini SDK
- **@dnd-kit** - Drag-and-drop for warehouse map editor

## Development

- Frontend runs on port **5173**
- Backend runs on port **3001**
- Vite proxy forwards `/api/*` requests to backend
- CORS enabled for network access

## Troubleshooting

**Q: Changes aren't saving to CSV?**
- Make sure the backend server is running (`pnpm run dev:server`)
- Check the browser console for API errors
- Verify CSV files exist in `public/data/`

**Q: Can't access from iPhone?**
- Ensure both devices are on the same WiFi network
- Use the Network URL shown in terminal (not localhost)
- Check firewall settings on your Mac

**Q: App shows "Loading Inventory..." forever?**
- Backend server might not be running
- Check if CSV files exist in `public/data/`
- Open browser console to see error messages
