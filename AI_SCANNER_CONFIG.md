# AI Scanner Configuration

## Overview

The Roman Inventory app uses AI vision models to scan order invoices and verify pallets. The system has **automatic fallback** between two AI providers:

1. **Primary**: Google Gemini 2.5 Flash (Free tier)
2. **Fallback**: OpenAI GPT-4o (When Gemini is overloaded or fails)

## How It Works

When you scan an order or verify a pallet:

1. The system tries **Gemini** first
2. If Gemini returns errors like:
   - `503 - Model is overloaded`
   - `429 - Rate limit exceeded`
   - `Quota exceeded`
3. The system **automatically switches to OpenAI** without user intervention
4. The user never knows which AI was used - it just works! ✨

## Setup Instructions

### 1. Copy the environment file

```bash
cp .env.example .env
```

### 2. Add your API keys to `.env`

```env
# Google Gemini API Key
VITE_GOOGLE_API_KEY=AIza...your_key_here

# OpenAI API Key (Fallback)
VITE_OPENAI_API_KEY=sk-proj-...your_key_here
```

### 3. Get API Keys

#### Google Gemini (Primary)

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Click "Create API Key"
3. Copy the key and paste it in `.env` as `VITE_GOOGLE_API_KEY`

#### OpenAI (Fallback)

1. Go to [OpenAI Platform](https://platform.openai.com/api-keys)
2. Click "Create new secret key"
3. Copy the key and paste it in `.env` as `VITE_OPENAI_API_KEY`

### 4. Restart the dev server

```bash
pnpm run dev:all
```

## Cost Considerations

- **Gemini 2.5 Flash**: Free tier (60 requests/minute)
- **OpenAI GPT-4o**: Paid ($0.005/image for vision)

The system is designed to use Gemini as much as possible (free) and only fall back to OpenAI when necessary.

## Testing

You can test both AI services in the browser console:

```javascript
import { testAIConnection } from './src/services/aiScanner';

const results = await testAIConnection();
console.log(results);
// {
//   gemini: { available: true, error: null },
//   openai: { available: true, error: null }
// }
```

## Error Handling

The system handles these scenarios gracefully:

1. **Gemini overloaded** → Switches to OpenAI
2. **Both APIs fail** → Shows error to user
3. **No API keys configured** → Shows configuration error
4. **Invalid image** → Shows scan failed error

## Files Modified

- `src/services/aiScanner.ts` - Core service with multi-provider fallback logic
- `src/features/smart-picking/components/CamScanner.tsx` - Smart extraction UI (TypeScript)
- `src/features/smart-picking/components/PalletVerification.tsx` - Pallet validation UI (TypeScript)
- `.env.example` - Template for environment variables

## Implementation Details

The system is now fully typed with TypeScript. The `aiScanner.ts` service uses the official Google Generative AI SDK and OpenAI SDK to provide a resilient scanning experience.
