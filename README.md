# Roman Inv - Inventory Management PWA

High-performance, multi-user Inventory Management System powered by **Supabase** and **Google Gemini AI**.

## 🚀 Reality Check: Current State

The system has matured from a CSV-based prototype into a full-scale warehouse orchestration platform:
- **Database**: 100% migrated to Supabase (PostgreSQL) with Real-time synchronization.
- **Language**: Core logic and Smart Picking migrated to **TypeScript** for enterprise-grade reliability.
- **AI**: Dual-provider fallback system (Gemini 2.5 Flash + GPT-4o).

## Features

### Core Warehouse Management

- 📱 **Mobile-First Design** - Optimized for high-speed warehouse operations on iPhone/PWA.
- 🔄 **Real-time Sync** - Direct Supabase integration for multi-user inventory consistency.
- 🔍 **Global Search** - Instant filtering by SKU, Location, or Metadata.
- 🏗️ **Zone Optimization** - Organize warehouse into HOT, WARM, and COLD zones.
- 📊 **Dual Inventory** - Specialized tracking for Ludlow (General) and ATS (High Density) grids.
- 🛠️ **Location HUD** - Interactive location editor with capacity validation and picking priority.

### 🤖 Smart Picking (AI-Powered)

- 📸 **AI Order Extraction** - Scan physical invoices; Gemini extracts items and quantities automatically.
- 🧠 **Hybrid Reasoning** - Powered by Gemini 2.5 Flash with automatic fallback to OpenAI GPT-4o.
- 📦 **Auto Palletization** - Intelligent order splitting into pallets (max 13 items) based on warehouse mapping.
- 🗺️ **Visual Map Builder** - Drag-and-drop picking route optimizer.
- ✅ **Photo Verification** - AI-driven validation of completed pallets to prevent shipping errors.
- ↩️ **Global Undo** - Single-click restoration of any inventory movement or picking session.

## Installation

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and provide your Supabase and AI provider credentials:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_GOOGLE_API_KEY=...
VITE_OPENAI_API_KEY=... # Optional fallback
```

### 3. Start Development Server

```bash
pnpm run dev
```

The app is accessible at http://localhost:5173/ and automatically broadcasts to your local network.

## Technical Architecture

- **Frontend**: React 19 + Vite + Tailwind CSS + **TypeScript**.
- **State & Data**: TanStack Query (React Query) + Supabase Client.
- **Storage**: PostgreSQL (via Supabase) with Row Level Security (RLS).
- **Communication**: Real-time Postgres changes for instant multi-user updates.
- **Utilities**: 
  - `@dnd-kit` for visual map configuration.
  - `Lucide React` for high-fidelity iconography.
  - `jsPDF` for automated picking reports.

## Usage Guide

### Picking Flow
1. **Deduction & Validation**: As items are scanned or added to a picking session, the system validates stock in real-time.
2. **Route Optimization**: The system calculates the shortest path through the warehouse based on your custom map.
3. **Session Persistence**: Picking progress is synced across users. An admin can "Double Check" a pallet before finalizing.
4. **Finalization**: Inventory is deducted from Supabase, and a comprehensive log is created with an optional PDF report.

## Tech Stack (Current)

- **React 19** - UI Core
- **TypeScript** - Type safety and documentation
- **Supabase** - Authentication, Database, and Real-time
- **Vite** - Build & Dev ecosystem
- **Tailwind CSS** - Design system
- **Google Gemini 2.5 Flash** - Vision & Extraction AI

## Troubleshooting

**Q: Inventory changes aren't syncing?**
- Verify your internet connection; Supabase requires an active link for real-time updates.
- Check the browser console for RLS (Row Level Security) violations.

**Q: AI scanning is slow or failing?**
- The system will fallback to OpenAI if Gemini is overloaded.
- Ensure the invoice is well-lit and the camera is in focus.

---

_Project maintained by the Roman App Engineering Team._
