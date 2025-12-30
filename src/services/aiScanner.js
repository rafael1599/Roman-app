import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { scanOrderWithTesseract, verifyPalletWithTesseract } from './tesseractOCR';

// Initialize APIs
const GEMINI_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY, dangerouslyAllowBrowser: true }) : null;

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
 * Convert image file to base64 data URL for OpenAI API
 */
async function fileToBase64DataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/**
 * Scan order using Gemini API
 */
async function scanWithGemini(imageFile) {
    if (!genAI) {
        throw new Error('Gemini API not initialized');
    }

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
    });

    const imagePart = await fileToGenerativePart(imageFile);

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
                            description: 'Product SKU code (e.g., "06-4432BK", "03-3828GY")'
                        },
                        qty: {
                            type: 'number',
                            description: 'Quantity ordered (must be a positive integer)'
                        }
                    },
                    required: ['sku', 'qty']
                }
            }
        },
        required: ['items']
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
            temperature: 0.1,
        },
    });

    const response = await result.response;
    const text = response.text();
    const data = JSON.parse(text);

    return data.items || [];
}

/**
 * Scan order using OpenAI API (GPT-4 Vision)
 */
async function scanWithOpenAI(imageFile) {
    if (!openai) {
        throw new Error('OpenAI API not initialized');
    }

    const base64Image = await fileToBase64DataURL(imageFile);

    const prompt = `You are a warehouse OCR system specialized in reading order invoices.

TASK: Extract ALL product SKUs and their quantities from this invoice image.

RULES:
1. SKU format is typically "XX-XXXXXX" (e.g., "06-4432BK") but can be any alphanumeric code
2. Look for product codes, item numbers, or SKU fields
3. Extract the quantity for each item
4. If you cannot read the image clearly, return an empty items array
5. Be precise - only extract items you can clearly see

Return ONLY a valid JSON object in this exact format:
{
  "items": [
    {"sku": "string", "qty": number}
  ]
}`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    {
                        type: "image_url",
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
    const data = JSON.parse(text);

    return data.items || [];
}

/**
 * Verify pallet using Gemini API
 */
async function verifyWithGemini(imageFile, expectedItems) {
    if (!genAI) {
        throw new Error('Gemini API not initialized');
    }

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
    });

    const imagePart = await fileToGenerativePart(imageFile);

    const expectedList = expectedItems
        .map(item => `- ${item.sku}: ${item.qty} units`)
        .join('\n');

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
                            description: 'Product SKU code visible on boxes'
                        },
                        qty: {
                            type: 'number',
                            description: 'Number of units counted in the image'
                        }
                    },
                    required: ['sku', 'qty']
                }
            }
        },
        required: ['items']
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
            temperature: 0.2,
        },
    });

    const response = await result.response;
    const text = response.text();
    const data = JSON.parse(text);

    return data.items || [];
}

/**
 * Verify pallet using OpenAI API
 */
async function verifyWithOpenAI(imageFile, expectedItems) {
    if (!openai) {
        throw new Error('OpenAI API not initialized');
    }

    const base64Image = await fileToBase64DataURL(imageFile);

    const expectedList = expectedItems
        .map(item => `- ${item.sku}: ${item.qty} units`)
        .join('\n');

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
    {"sku": "string", "qty": number}
  ]
}`;

    const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "user",
                content: [
                    { type: "text", text: prompt },
                    {
                        type: "image_url",
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
    const data = JSON.parse(text);

    return data.items || [];
}

/**
 * Check if error is a rate limit or overload error
 */
function isRetryableError(error) {
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
 * Scan an order invoice/photo with automatic fallback
 * Priority: Tesseract (free) -> Gemini -> OpenAI
 */
export async function scanOrderImage(imageFile) {
    let lastError = null;

    // Try Tesseract first (FREE, unlimited)
    try {
        console.log('🔍 Scanning with Tesseract OCR (Free)...');
        const items = await scanOrderWithTesseract(imageFile);

        // Validate items
        if (items && items.length > 0) {
            items.forEach((item, index) => {
                if (!item.sku || typeof item.sku !== 'string') {
                    throw new Error(`Invalid SKU at index ${index}`);
                }
                if (typeof item.qty !== 'number' || item.qty <= 0) {
                    throw new Error(`Invalid quantity at index ${index}`);
                }
            });

            console.log('✅ Order scanned successfully with Tesseract:', items);
            return items;
        }
    } catch (error) {
        console.warn('⚠️ Tesseract scan failed:', error.message);
        lastError = error;
        // Continue to AI fallbacks
    }

    // Try Gemini as fallback
    if (genAI) {
        try {
            console.log('🔄 Falling back to Gemini...');
            const items = await scanWithGemini(imageFile);

            // Validate items
            items.forEach((item, index) => {
                if (!item.sku || typeof item.sku !== 'string') {
                    throw new Error(`Invalid SKU at index ${index}`);
                }
                if (typeof item.qty !== 'number' || item.qty <= 0) {
                    throw new Error(`Invalid quantity at index ${index}`);
                }
            });

            console.log('✅ Order scanned successfully with Gemini:', items);
            return items;
        } catch (error) {
            console.warn('⚠️ Gemini scan failed:', error.message);
            lastError = error;

            // Only try next fallback if it's a retryable error
            if (!isRetryableError(error)) {
                throw error;
            }
        }
    }

    // Try OpenAI as last resort
    if (openai) {
        try {
            console.log('🔄 Falling back to OpenAI...');
            const items = await scanWithOpenAI(imageFile);

            // Validate items
            items.forEach((item, index) => {
                if (!item.sku || typeof item.sku !== 'string') {
                    throw new Error(`Invalid SKU at index ${index}`);
                }
                if (typeof item.qty !== 'number' || item.qty <= 0) {
                    throw new Error(`Invalid quantity at index ${index}`);
                }
            });

            console.log('✅ Order scanned successfully with OpenAI:', items);
            return items;
        } catch (error) {
            console.error('❌ OpenAI scan also failed:', error.message);
            throw new Error(`All OCR services failed. Last error: ${error.message}`);
        }
    }

    // No service available or all failed
    throw lastError || new Error('No OCR service available. Please try again with a clearer image.');
}

/**
 * Verify a completed pallet with automatic fallback
 * Priority: Tesseract (free) -> Gemini -> OpenAI
 */
export async function verifyPalletImage(imageFile, expectedItems) {
    let lastError = null;

    // Try Tesseract first (FREE, unlimited)
    try {
        console.log('🔍 Verifying pallet with Tesseract OCR (Free)...');
        const result = await verifyPalletWithTesseract(imageFile, expectedItems);
        console.log('✅ Pallet verified successfully with Tesseract:', result);
        return result;
    } catch (error) {
        console.warn('⚠️ Tesseract verification failed:', error.message);
        lastError = error;
        // Continue to AI fallbacks
    }

    // Try Gemini as fallback
    if (genAI) {
        try {
            console.log('🔄 Falling back to Gemini for verification...');
            const detectedItems = await verifyWithGemini(imageFile, expectedItems);

            // Compare detected vs expected
            const matched = [];
            const missing = [];
            const extra = [];

            expectedItems.forEach(expected => {
                const detected = detectedItems.find(d => d.sku === expected.sku);
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

            detectedItems.forEach(detected => {
                const expected = expectedItems.find(e => e.sku === detected.sku);
                if (!expected) {
                    extra.push(detected);
                }
            });

            console.log('✅ Pallet verified successfully with Gemini:', { matched, missing, extra });
            return { matched, missing, extra };
        } catch (error) {
            console.warn('⚠️ Gemini verification failed:', error.message);
            lastError = error;

            if (!isRetryableError(error)) {
                throw error;
            }
        }
    }

    // Try OpenAI as last resort
    if (openai) {
        try {
            console.log('🔄 Falling back to OpenAI for verification...');
            const detectedItems = await verifyWithOpenAI(imageFile, expectedItems);

            // Compare detected vs expected
            const matched = [];
            const missing = [];
            const extra = [];

            expectedItems.forEach(expected => {
                const detected = detectedItems.find(d => d.sku === expected.sku);
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

            detectedItems.forEach(detected => {
                const expected = expectedItems.find(e => e.sku === detected.sku);
                if (!expected) {
                    extra.push(detected);
                }
            });

            console.log('✅ Pallet verified successfully with OpenAI:', { matched, missing, extra });
            return { matched, missing, extra };
        } catch (error) {
            console.error('❌ OpenAI verification also failed:', error.message);
            throw new Error(`All OCR services failed. Last error: ${error.message}`);
        }
    }

    throw lastError || new Error('No OCR service available. Please try again.');
}

/**
 * Test if AI services are available
 */
export async function testAIConnection() {
    const results = {
        tesseract: { available: true, error: null }, // Always available (local)
        gemini: { available: false, error: null },
        openai: { available: false, error: null },
    };

    // Test Gemini
    if (genAI) {
        try {
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
            });
            await result.response;
            results.gemini.available = true;
        } catch (error) {
            results.gemini.error = error.message;
        }
    } else {
        results.gemini.error = 'API key not configured';
    }

    // Test OpenAI
    if (openai) {
        try {
            await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [{ role: "user", content: "Hello" }],
                max_tokens: 5,
            });
            results.openai.available = true;
        } catch (error) {
            results.openai.error = error.message;
        }
    } else {
        results.openai.error = 'API key not configured';
    }

    return results;
}
