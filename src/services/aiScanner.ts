import { scanOrderWithTesseract, verifyPalletWithTesseract } from './tesseractOCR';
import {
  AIOrderResponseSchema,
  AIPalletVerificationSchema,
  type AIOrderItem,
  type AIPalletVerification,
} from '../schemas/ai.schema';
import { validateData, safeValidateData } from '../utils/validate';

// API Keys
const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;

/**
 * Lazy-load and initialize Gemini API
 */
async function getGenAI() {
  if (!GEMINI_API_KEY) return null;
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  return new GoogleGenerativeAI(GEMINI_API_KEY);
}

/**
 * Lazy-load and initialize OpenAI API
 */
async function getOpenAI() {
  if (!OPENAI_API_KEY) return null;
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey: OPENAI_API_KEY, dangerouslyAllowBrowser: true });
}

/**
 * Convert image file to base64 format for Gemini API
 */
async function fileToGenerativePart(
  file: File
): Promise<{ inlineData: { data: string; mimeType: string } }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      resolve({
        inlineData: {
          data: base64Data,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Convert image file to base64 data URL for OpenAI API
 */
async function fileToBase64DataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Scan order using Gemini API with Zod validation
 */
async function scanWithGemini(imageFile: File): Promise<AIOrderItem[]> {
  const genAI = await getGenAI();
  if (!genAI) {
    throw new Error('Gemini API not initialized');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
  });

  const imagePart = await fileToGenerativePart(imageFile);

  const prompt = `You are a warehouse OCR system specialized in reading order invoices.

    TASK: Extract ALL product SKUs and their quantities from this invoice image.

        RULES:
1. SKU format is typically "XX-XXXXXX"(e.g., "06-4432BK") but can be any alphanumeric code
2. Look for product codes, item numbers, or SKU fields
3. Extract the quantity for each item
4. If you cannot read the image clearly, return an empty items array
5. Be precise - only extract items you can clearly see

Return ONLY a valid JSON object in this exact format:
{
    "items": [
        { "sku": "string", "qty": number }
    ]
} `;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
    generationConfig: {
      temperature: 0.1,
    },
  });

  const response = await result.response;
  const text = response.text();

  // Parse and validate with Zod (CRITICAL GUARD)
  let rawData: unknown;
  try {
    rawData = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse Gemini response as JSON: ${error instanceof Error ? error.message : 'Unknown error'} `
    );
  }

  // Validate the response structure
  const validatedResponse = validateData(AIOrderResponseSchema, rawData);
  return validatedResponse.items;
}

/**
 * Scan order using OpenAI API (GPT-4 Vision) with Zod validation
 */
async function scanWithOpenAI(imageFile: File): Promise<AIOrderItem[]> {
  const openai = await getOpenAI();
  if (!openai) {
    throw new Error('OpenAI API not initialized');
  }

  const base64Image = await fileToBase64DataURL(imageFile);

  const prompt = `You are a warehouse OCR system specialized in reading order invoices.

    TASK: Extract ALL product SKUs and their quantities from this invoice image.

        RULES:
1. SKU format is typically "XX-XXXXXX"(e.g., "06-4432BK") but can be any alphanumeric code
2. Look for product codes, item numbers, or SKU fields
3. Extract the quantity for each item
4. If you cannot read the image clearly, return an empty items array
5. Be precise - only extract items you can clearly see

Return ONLY a valid JSON object in this exact format:
{
    "items": [
        { "sku": "string", "qty": number }
    ]
} `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: base64Image,
            },
          },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.1,
  });

  const text = response.choices[0].message.content;
  if (!text) {
    throw new Error('OpenAI returned empty response');
  }

  // Parse and validate with Zod (CRITICAL GUARD)
  let rawData: unknown;
  try {
    rawData = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse OpenAI response as JSON: ${error instanceof Error ? error.message : 'Unknown error'} `
    );
  }

  // Validate the response structure
  const validatedResponse = validateData(AIOrderResponseSchema, rawData);
  return validatedResponse.items;
}

/**
 * Verify pallet using Gemini API with Zod validation
 */
async function verifyWithGemini(
  imageFile: File,
  expectedItems: AIOrderItem[]
): Promise<AIPalletVerification> {
  const genAI = await getGenAI();
  if (!genAI) {
    throw new Error('Gemini API not initialized');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
  });

  const imagePart = await fileToGenerativePart(imageFile);

  const expectedList = expectedItems.map((item) => `- ${item.sku}: ${item.qty} units`).join('\\n');

  const prompt = `You are a warehouse quality control AI specialized in pallet verification.

    TASK: Analyze this photo of a completed pallet and identify all visible product boxes.

Expected items on this pallet:
${expectedList}

INSTRUCTIONS:
1. Look for product labels, SKU codes, or barcodes on visible boxes
2. Count how many units of each SKU you can see
3. Be precise - only count items you can clearly identify
4. If you cannot identify any items clearly, return an empty items array

Return ONLY a valid JSON object in this exact format:
{
    "items": [
        { "sku": "string", "qty": number }
    ]
} `;

  const genResult = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
    generationConfig: {
      temperature: 0.2,
    },
  });

  const response = await genResult.response;
  const text = response.text();

  // Parse and validate
  let rawData: unknown;
  try {
    rawData = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse Gemini response as JSON: ${error instanceof Error ? error.message : 'Unknown error'} `
    );
  }

  const validatedResponse = validateData(AIOrderResponseSchema, rawData);
  const detectedItems = validatedResponse.items;

  // Compare detected vs expected
  const matched: Array<{ sku: string; expected: number; detected: number; match: boolean }> = [];
  const missing: AIOrderItem[] = [];
  const extra: AIOrderItem[] = [];

  expectedItems.forEach((expected) => {
    const detected = detectedItems.find((d) => d.sku === expected.sku);
    if (detected) {
      matched.push({
        sku: expected.sku,
        expected: expected.qty,
        detected: detected.qty,
        match: detected.qty === expected.qty,
      });
    } else {
      missing.push(expected);
    }
  });

  detectedItems.forEach((detected) => {
    const expected = expectedItems.find((e) => e.sku === detected.sku);
    if (!expected) {
      extra.push(detected);
    }
  });

  // Validate the final result
  const verificationResult = { matched, missing, extra };
  return validateData(AIPalletVerificationSchema, verificationResult);
}

/**
 * Verify pallet using OpenAI API with Zod validation
 */
async function verifyWithOpenAI(
  imageFile: File,
  expectedItems: AIOrderItem[]
): Promise<AIPalletVerification> {
  const openai = await getOpenAI();
  if (!openai) {
    throw new Error('OpenAI API not initialized');
  }

  const base64Image = await fileToBase64DataURL(imageFile);

  const expectedList = expectedItems.map((item) => `- ${item.sku}: ${item.qty} units`).join('\\n');

  const prompt = `You are a warehouse quality control AI specialized in pallet verification.

    TASK: Analyze this photo of a completed pallet and identify all visible product boxes.

Expected items on this pallet:
${expectedList}

INSTRUCTIONS:
1. Look for product labels, SKU codes, or barcodes on visible boxes
2. Count how many units of each SKU you can see
3. Be precise - only count items you can clearly identify
4. If you cannot identify any items clearly, return an empty items array

Return ONLY a valid JSON object in this exact format:
{
    "items": [
        { "sku": "string", "qty": number }
    ]
} `;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: base64Image,
            },
          },
        ],
      },
    ],
    max_tokens: 1000,
    temperature: 0.2,
  });

  const text = response.choices[0].message.content;
  if (!text) {
    throw new Error('OpenAI returned empty response');
  }

  // Parse and validate
  let rawData: unknown;
  try {
    rawData = JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Failed to parse OpenAI response as JSON: ${error instanceof Error ? error.message : 'Unknown error'} `
    );
  }

  const validatedResponse = validateData(AIOrderResponseSchema, rawData);
  const detectedItems = validatedResponse.items;

  // Compare detected vs expected
  const matched: Array<{ sku: string; expected: number; detected: number; match: boolean }> = [];
  const missing: AIOrderItem[] = [];
  const extra: AIOrderItem[] = [];

  expectedItems.forEach((expected) => {
    const detected = detectedItems.find((d) => d.sku === expected.sku);
    if (detected) {
      matched.push({
        sku: expected.sku,
        expected: expected.qty,
        detected: detected.qty,
        match: detected.qty === expected.qty,
      });
    } else {
      missing.push(expected);
    }
  });

  detectedItems.forEach((detected) => {
    const expected = expectedItems.find((e) => e.sku === detected.sku);
    if (!expected) {
      extra.push(detected);
    }
  });

  // Validate the final result
  const finalResult = { matched, missing, extra };
  return validateData(AIPalletVerificationSchema, finalResult);
}

/**
 * Check if error is a rate limit or overload error
 */
function isRetryableError(error: Error): boolean {
  const errorMessage = error.message?.toLowerCase() || '';
  return (
    errorMessage.includes('overloaded') ||
    errorMessage.includes('503') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('429') ||
    errorMessage.includes('quota')
  );
}

/**
 * Scan an order invoice/photo with automatic fallback and Zod validation
 * Priority: Tesseract (free) -> Gemini -> OpenAI
 */
export async function scanOrderImage(imageFile: File): Promise<AIOrderItem[]> {
  let lastError: Error | null = null;

  // Try Tesseract first (FREE, unlimited)
  try {
    console.log('🔍 Scanning with Tesseract OCR (Free)...');
    const items = await scanOrderWithTesseract(imageFile);

    // Validate items with Zod
    const validationResult = safeValidateData(AIOrderResponseSchema, { items });

    if (validationResult.success && validationResult.data.items.length > 0) {
      console.log('✅ Order scanned successfully with Tesseract:', validationResult.data.items);
      return validationResult.data.items;
    }

    throw new Error('Tesseract returned invalid or empty data');
  } catch (error) {
    console.warn(
      '⚠️ Tesseract scan failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    lastError = error instanceof Error ? error : new Error(String(error));
    // Continue to AI fallbacks
  }

  // Try Gemini as fallback
  const genAI = await getGenAI();
  if (genAI) {
    try {
      console.log('🔄 Falling back to Gemini...');
      const items = await scanWithGemini(imageFile);
      console.log('✅ Order scanned successfully with Gemini:', items);
      return items;
    } catch (error) {
      console.warn(
        '⚠️ Gemini scan failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only try next fallback if it's a retryable error
      if (!(error instanceof Error) || !isRetryableError(error)) {
        throw error;
      }
    }
  }

  // Try OpenAI as last resort
  const openai = await getOpenAI();
  if (openai) {
    try {
      console.log('🔄 Falling back to OpenAI...');
      const items = await scanWithOpenAI(imageFile);
      console.log('✅ Order scanned successfully with OpenAI:', items);
      return items;
    } catch (error) {
      console.error(
        '❌ OpenAI scan also failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw new Error(
        `All OCR services failed.Last error: ${error instanceof Error ? error.message : 'Unknown error'} `
      );
    }
  }

  // No service available or all failed
  throw lastError || new Error('No OCR service available. Please try again with a clearer image.');
}

/**
 * Verify a completed pallet with automatic fallback and Zod validation
 * Priority: Tesseract (free) -> Gemini -> OpenAI
 */
export async function verifyPalletImage(
  imageFile: File,
  expectedItems: AIOrderItem[]
): Promise<AIPalletVerification> {
  let lastError: Error | null = null;

  // Try Tesseract first (FREE, unlimited)
  try {
    console.log('🔍 Verifying pallet with Tesseract OCR (Free)...');
    const result = await verifyPalletWithTesseract(imageFile, expectedItems);

    // Validate result
    const validatedResult = validateData(AIPalletVerificationSchema, result);
    console.log('✅ Pallet verified successfully with Tesseract:', validatedResult);
    return validatedResult;
  } catch (error) {
    console.warn(
      '⚠️ Tesseract verification failed:',
      error instanceof Error ? error.message : 'Unknown error'
    );
    lastError = error instanceof Error ? error : new Error(String(error));
    // Continue to AI fallbacks
  }

  // Try Gemini as fallback
  const genAI = await getGenAI();
  if (genAI) {
    try {
      console.log('🔄 Falling back to Gemini for verification...');
      const result = await verifyWithGemini(imageFile, expectedItems);
      console.log('✅ Pallet verified successfully with Gemini:', result);
      return result;
    } catch (error) {
      console.warn(
        '⚠️ Gemini verification failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      lastError = error instanceof Error ? error : new Error(String(error));

      if (!(error instanceof Error) || !isRetryableError(error)) {
        throw error;
      }
    }
  }

  // Try OpenAI as last resort
  const openai = await getOpenAI();
  if (openai) {
    try {
      console.log('🔄 Falling back to OpenAI for verification...');
      const result = await verifyWithOpenAI(imageFile, expectedItems);
      console.log('✅ Pallet verified successfully with OpenAI:', result);
      return result;
    } catch (error) {
      console.error(
        '❌ OpenAI verification also failed:',
        error instanceof Error ? error.message : 'Unknown error'
      );
      throw new Error(
        `All OCR services failed.Last error: ${error instanceof Error ? error.message : 'Unknown error'} `
      );
    }
  }

  throw lastError || new Error('No OCR service available. Please try again.');
}

/**
 * Test if AI services are available
 */
export async function testAIConnection(): Promise<{
  tesseract: { available: boolean; error: string | null };
  gemini: { available: boolean; error: string | null };
  openai: { available: boolean; error: string | null };
}> {
  const results = {
    tesseract: { available: true, error: null }, // Always available (local)
    gemini: { available: false, error: null as string | null },
    openai: { available: false, error: null as string | null },
  };

  // Test Gemini
  const genAI = await getGenAI();
  if (genAI) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      });
      await result.response;
      results.gemini.available = true;
    } catch (error) {
      results.gemini.error = error instanceof Error ? error.message : 'Unknown error';
    }
  } else {
    results.gemini.error = 'API key not configured';
  }

  // Test OpenAI
  const openai = await getOpenAI();
  if (openai) {
    try {
      await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 5,
      });
      results.openai.available = true;
    } catch (error) {
      results.openai.error = error instanceof Error ? error.message : 'Unknown error';
    }
  } else {
    results.openai.error = 'API key not configured';
  }

  return results;
}
