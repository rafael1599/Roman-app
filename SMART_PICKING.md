# Smart Picking System - Documentation

## 🎯 Overview

The Smart Picking system is an AI-powered warehouse picking solution that uses Google Gemini Vision API to:

1. Scan order invoices automatically
2. Deduct inventory in real-time
3. Generate optimized picking routes
4. Split orders into pallets (max 13 items per pallet)
5. Verify completed pallets with AI

## 🚀 Setup

### 1. Get Google Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Get API Key"
3. Create a new API key or use an existing one
4. Copy the API key

### 2. Configure the App

1. Navigate to **Settings** tab in the app
2. Paste your API key in the "Google Gemini API Key" field
3. Click "Save API Key"
4. Click "Test Connection" to verify it works

### 3. Configure Warehouse Map

1. In Settings, go to the "Warehouse Map" tab
2. Drag and drop location blocks to organize them by picking route
3. Top locations = picked first (closest to exit)
4. Click "Save Map" when done

## 📋 How to Use

### Step 1: Scan Order

1. Go to the **PICKING** tab
2. Click "Scan New Order"
3. Take a photo of the order invoice or upload an image
4. AI will extract SKUs and quantities automatically

### Step 2: Review Order

- The system validates inventory availability
- Items with sufficient stock are marked as "Available"
- Items without stock are marked as "Shortage" (in red)
- Available items are automatically deducted from inventory

### Step 3: Pick Items

- Follow the optimized picking route
- Items are sorted by location (based on your warehouse map)
- Orders are split into pallets (max 13 items per pallet)
- Check off items as you pick them

### Step 4: Verify Pallet

1. When all items are picked, click "Verify Pallet"
2. Take a photo of the completed pallet
3. AI compares detected items vs expected items
4. Review the verification results
5. Confirm or manually override if needed

### Step 5: Next Pallet

- If there are more pallets, repeat steps 3-4
- When all pallets are complete, the order is finished

## 🔄 Rollback

If you scanned the wrong order:

1. Click "Cancel Order" button
2. Confirm the action
3. Inventory will be restored to previous state

## 🏗️ Technical Architecture

### Files Structure

```
src/
├── services/
│   └── gemini.js                 # Gemini API integration
├── features/smart-picking/
│   ├── components/
│   │   ├── MapBuilder.jsx        # Warehouse map editor
│   │   ├── CamScanner.jsx        # Order scanning component
│   │   └── PalletVerification.jsx # Pallet verification component
│   └── hooks/
│       └── useOrderProcessing.js # Order processing logic
└── screens/
    ├── SmartPicking.jsx          # Main picking screen
    └── Settings.jsx              # Configuration screen
```

### Key Components

#### 1. Gemini Service (`gemini.js`)

- **scanOrderImage()**: Extracts SKUs and quantities from invoice photos
- **verifyPalletImage()**: Verifies completed pallets
- **testGeminiConnection()**: Tests API connectivity

#### 2. Order Processing Hook (`useOrderProcessing.js`)

- **processOrder()**: Validates inventory and creates pallets
- **createPallets()**: Splits items into pallets (max 13 items)
- **deductInventory()**: Updates inventory in real-time
- **rollbackOrder()**: Restores inventory if needed

#### 3. Map Builder (`MapBuilder.jsx`)

- Drag-and-drop interface for organizing locations
- Saves configuration to localStorage
- Calculates picking route based on position

## 🎨 Algorithm Details

### Pallet Creation Algorithm

```javascript
1. Validate items against inventory
2. Sort items by location distance (closest to exit first)
3. Create pallets:
   - Max 13 items per pallet
   - If an item has >13 units, split across multiple pallets
   - Example: 20 units → Pallet 1: 13, Pallet 2: 7
```

### Route Optimization

```javascript
1. Each location has coordinates (x, y)
2. Exit point is at (0, 1000)
3. Distance = sqrt((x-0)² + (y-1000)²)
4. Items sorted by ascending distance
```

## 📊 Data Flow

```
1. User scans invoice
   ↓
2. Gemini extracts SKUs + quantities
   ↓
3. System validates against inventory
   ↓
4. Available items → deduct inventory
   ↓
5. Create optimized pallets
   ↓
6. User picks items
   ↓
7. User scans pallet
   ↓
8. Gemini verifies contents
   ↓
9. Move to next pallet or complete order
```

## 🔐 Security

- API key stored in localStorage (client-side only)
- API key never sent to backend
- All Gemini API calls made directly from browser
- Add `.env` to `.gitignore` to prevent key exposure

## 🐛 Troubleshooting

### "API key not configured"

- Go to Settings → API Configuration
- Enter your Gemini API key
- Click "Test Connection"

### "No items detected"

- Ensure good lighting
- Keep invoice flat and in focus
- Try a different angle
- Upload a clearer image

### "Verification failed"

- Use manual override option
- Retake photo with better lighting
- Ensure all boxes are visible

### Items not deducting from inventory

- Check that backend server is running
- Verify inventory has sufficient stock
- Check browser console for errors

## 💡 Tips

1. **Good Photos**: Use good lighting, avoid shadows and glare
2. **Map Configuration**: Organize locations to match your physical warehouse
3. **Test First**: Test with small orders before going live
4. **Manual Override**: Use manual confirmation if AI fails
5. **Rollback**: Don't hesitate to rollback if you make a mistake

## 🔮 Future Enhancements

- [ ] Barcode scanning support
- [ ] Multi-warehouse support
- [ ] Historical order tracking
- [ ] Performance analytics
- [ ] Voice commands for hands-free operation
- [ ] Integration with shipping labels
