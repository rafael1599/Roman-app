# AI Scanner Configuration

The Roman Inventory app uses AI vision models to scan order invoices and verify pallets. The system has **automatic fallback** between two AI providers.

## AI Roles
1. **Primary**: Google Gemini 2.5 Flash (Free tier)
2. **Fallback**: OpenAI GPT-4o (When Gemini is overloaded or fails)

## Setup Instructions
Add your API keys to `.env`:
```env
# Google Gemini API Key
VITE_GOOGLE_API_KEY=AIza...your_key_here

# OpenAI API Key (Fallback)
VITE_OPENAI_API_KEY=sk-proj-...your_key_here
```

## How It Works (Fallback Logic)
1. The system tries **Gemini** first.
2. If Gemini returns errors (503 Overloaded, 429 Rate Limit), it automatically switches to **OpenAI**.
3. Logic resides in `src/services/aiScanner.ts`.

## Testing
Test connection in console:
```javascript
import { testAIConnection } from './src/services/aiScanner';
const results = await testAIConnection();
console.log(results);
```
