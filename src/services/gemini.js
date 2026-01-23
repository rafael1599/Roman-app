import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Gemini API
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

if (!API_KEY) {
  console.warn('⚠️ VITE_GOOGLE_API_KEY not found in environment variables');
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

/**
 * Convert image file to base64 format for Gemini API
 */
async function fileToGenerativePart(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(',')[1];
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
 * Scan an order invoice/photo and extract SKU list
 * @param {File|Blob} imageFile - The image file to process
 * @returns {Promise<Array<{sku: string, qty: number}>>} - Extracted order items
 */
export async function scanOrderImage(imageFile) {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please check your API key.');
  }

  try {
    // Use Gemini 2.5 Flash - Best FREE model with hybrid reasoning
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const imagePart = await fileToGenerativePart(imageFile);

    // Define JSON schema for structured output
    const orderSchema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'List of order items extracted from the invoice',
          items: {
            type: 'object',
            properties: {
              sku: {
                type: 'string',
                description: 'Product SKU code (e.g., "06-4432BK", "03-3828GY")',
              },
              qty: {
                type: 'number',
                description: 'Quantity ordered (must be a positive integer)',
              },
            },
            required: ['sku', 'qty'],
          },
        },
      },
      required: ['items'],
    };

    const prompt = `You are a warehouse OCR system specialized in reading order invoices.

TASK: Extract ALL product SKUs and their quantities from this invoice image.

RULES:
1. SKU format is typically "XX-XXXXXX" (e.g., "06-4432BK") but can be any alphanumeric code
2. Look for product codes, item numbers, or SKU fields
3. Extract the quantity for each item
4. If you cannot read the image clearly, return an empty items array
5. Be precise - only extract items you can clearly see

Return the data in the specified JSON format.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: orderSchema,
        temperature: 0.1, // Low temperature for more deterministic results
      },
    });

    const response = await result.response;
    const text = response.text();

    // Parse the structured JSON response
    const data = JSON.parse(text);
    const orderItems = data.items || [];

    // Validate each item
    orderItems.forEach((item, index) => {
      if (!item.sku || typeof item.sku !== 'string') {
        throw new Error(`Invalid SKU at index ${index}`);
      }
      if (typeof item.qty !== 'number' || item.qty <= 0) {
        throw new Error(`Invalid quantity at index ${index}`);
      }
    });

    console.log('✅ Order scanned successfully:', orderItems);
    return orderItems;
  } catch (error) {
    console.error('❌ Error scanning order:', error);
    throw new Error(`Failed to scan order: ${error.message}`);
  }
}

/**
 * Verify a completed pallet by scanning its photo
 * @param {File|Blob} imageFile - Photo of the completed pallet
 * @param {Array<{sku: string, qty: number}>} expectedItems - Items that should be on the pallet
 * @returns {Promise<{matched: Array, missing: Array, extra: Array}>}
 */
export async function verifyPalletImage(imageFile, expectedItems) {
  if (!genAI) {
    throw new Error('Gemini API not initialized. Please check your API key.');
  }

  try {
    // Use Gemini 2.5 Flash - Best FREE model with hybrid reasoning
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
    });

    const imagePart = await fileToGenerativePart(imageFile);

    const expectedList = expectedItems.map((item) => `- ${item.sku}: ${item.qty} units`).join('\n');

    // Define JSON schema for structured output
    const verificationSchema = {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'List of items detected in the pallet photo',
          items: {
            type: 'object',
            properties: {
              sku: {
                type: 'string',
                description: 'Product SKU code visible on boxes',
              },
              qty: {
                type: 'number',
                description: 'Number of units counted in the image',
              },
            },
            required: ['sku', 'qty'],
          },
        },
      },
      required: ['items'],
    };

    const prompt = `You are a warehouse quality control AI specialized in pallet verification.

TASK: Analyze this photo of a completed pallet and identify all visible product boxes.

Expected items on this pallet:
${expectedList}

INSTRUCTIONS:
1. Look for product labels, SKU codes, or barcodes on visible boxes
2. Count how many units of each SKU you can see
3. Be precise - only count items you can clearly identify
4. If you cannot identify any items clearly, return an empty items array

Return the detected items in the specified JSON format.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }, imagePart] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: verificationSchema,
        temperature: 0.2, // Slightly higher for better image recognition
      },
    });

    const response = await result.response;
    const text = response.text();

    // Parse the structured JSON response
    const data = JSON.parse(text);
    const detectedItems = data.items || [];

    // Compare detected vs expected
    const matched = [];
    const missing = [];
    const extra = [];

    // Check expected items
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

    // Check for extra items
    detectedItems.forEach((detected) => {
      const expected = expectedItems.find((e) => e.sku === detected.sku);
      if (!expected) {
        extra.push(detected);
      }
    });

    console.log('✅ Pallet verification complete:', { matched, missing, extra });
    return { matched, missing, extra };
  } catch (error) {
    console.error('❌ Error verifying pallet:', error);
    throw new Error(`Failed to verify pallet: ${error.message}`);
  }
}

/**
 * Test if the API key is valid
 */
export async function testGeminiConnection() {
  if (!genAI) {
    return { success: false, error: 'API key not configured' };
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
    });
    await result.response;
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
