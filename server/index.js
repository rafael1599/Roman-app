import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// Store SSE clients for real-time updates
let sseClients = [];

// Middleware
app.use(cors());
app.use(express.json());

// Path to unified CSV file
const INVENTORY_CSV_PATH = path.join(__dirname, '../public/data/allInventory.csv');

// Broadcast function to notify all connected clients
function broadcastUpdate(type, data) {
    const message = JSON.stringify({ type, data, timestamp: Date.now() });
    sseClients.forEach(client => {
        client.write(`data: ${message}\n\n`);
    });
    console.log(`📡 Broadcasted ${type} update to ${sseClients.length} clients`);
}

// Helper function to read CSV
async function readCSV(filePath) {
    try {
        const csvContent = await fs.readFile(filePath, 'utf-8');
        return new Promise((resolve, reject) => {
            Papa.parse(csvContent, {
                header: true,
                skipEmptyLines: 'greedy',
                complete: (results) => resolve(results.data),
                error: (error) => reject(error),
            });
        });
    } catch (error) {
        console.error(`Error reading CSV from ${filePath}:`, error);
        throw error;
    }
}

// Helper function to write CSV
async function writeCSV(filePath, data) {
    try {
        const csv = Papa.unparse(data);
        await fs.writeFile(filePath, csv, 'utf-8');
        console.log(`✅ Successfully wrote to ${filePath}`);
    } catch (error) {
        console.error(`Error writing CSV to ${filePath}:`, error);
        throw error;
    }
}

// SSE endpoint for real-time updates
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Add this client to the list
    sseClients.push(res);
    console.log(`📱 New SSE client connected. Total clients: ${sseClients.length}`);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

    // Remove client on disconnect
    req.on('close', () => {
        sseClients = sseClients.filter(client => client !== res);
        console.log(`📴 SSE client disconnected. Total clients: ${sseClients.length}`);
    });
});

// API Endpoints

// GET unified inventory
app.get('/api/inventory', async (req, res) => {
    try {
        const data = await readCSV(INVENTORY_CSV_PATH);
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read inventory' });
    }
});

// POST unified inventory (save)
app.post('/api/inventory', async (req, res) => {
    try {
        const data = req.body;
        await writeCSV(INVENTORY_CSV_PATH, data);

        // Broadcast update to all connected clients
        broadcastUpdate('inventory', data);

        res.json({ success: true, message: 'Inventory saved' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save inventory' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running', clients: sseClients.length });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Roman Inventory Server running on http://localhost:${PORT}`);
    console.log(`📡 Network access enabled on port ${PORT}`);
    console.log(`🔄 Real-time sync enabled via SSE`);
});
