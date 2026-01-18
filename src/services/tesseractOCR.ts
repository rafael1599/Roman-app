import Tesseract from 'tesseract.js';
import { type AIOrderItem, type AIPalletVerification } from '../schemas/ai.schema';

/**
 * Extract text from image/PDF using Tesseract.js (Free, Local OCR)
 */
async function extractTextWithTesseract(file: File | string): Promise<string> {
    try {
        console.log('🔍 Starting Tesseract OCR...');

        const result = await Tesseract.recognize(
            file,
            'eng', // English language
            {
                logger: (m) => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            }
        );

        console.log('✅ Tesseract OCR completed');
        return result.data.text;
    } catch (error) {
        console.error('❌ Tesseract OCR failed:', error);
        throw new Error('Failed to extract text from image');
    }
}

/**
 * Parse extracted text to find SKU and quantity patterns
 */
function parseOrderText(text: string): AIOrderItem[] {
    const items: AIOrderItem[] = [];
    const lines = text.split('\n').filter(line => line.trim());

    // Common SKU patterns:
    // - XX-XXXXXX (e.g., "06-4432BK")
    // - XXXXXXXX (e.g., "064432BK")
    // - XX-XXXX (e.g., "03-3828")
    const skuPattern = /\b(\d{2}-?\d{4,6}[A-Z]{0,2})\b/gi;

    // Quantity patterns (numbers followed by common quantity indicators)
    const qtyPatterns = [
        /qty[:\s]*(\d+)/gi,
        /quantity[:\s]*(\d+)/gi,
        /(\d+)\s*(?:pcs|pieces|units|ea|each)/gi,
        /x\s*(\d+)/gi,
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Try to find SKU in this line
        const skuMatch = line.match(skuPattern);

        if (skuMatch) {
            const sku = skuMatch[0].toUpperCase();
            let qty = 1; // Default quantity

            // Try to find quantity in the same line
            for (const pattern of qtyPatterns) {
                // Reset lastIndex for global regex
                pattern.lastIndex = 0;
                const qtyMatch = pattern.exec(line);
                if (qtyMatch) {
                    qty = parseInt(qtyMatch[1]);
                    break;
                }
            }

            // If no quantity found in same line, check next line
            if (qty === 1 && i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                for (const pattern of qtyPatterns) {
                    pattern.lastIndex = 0;
                    const qtyMatch = pattern.exec(nextLine);
                    if (qtyMatch) {
                        qty = parseInt(qtyMatch[1]);
                        break;
                    }
                }
            }

            // Also check for standalone numbers that might be quantities
            if (qty === 1) {
                const numberMatch = line.match(/\b(\d{1,3})\b/);
                if (numberMatch) {
                    const num = parseInt(numberMatch[1]);
                    // Assume it's a quantity if it's a reasonable number (1-999)
                    if (num > 0 && num < 1000) {
                        qty = num;
                    }
                }
            }

            items.push({ sku, qty });
        }
    }

    return items;
}

/**
 * Scan order using Tesseract OCR (Free, Local)
 */
export async function scanOrderWithTesseract(file: File | string): Promise<AIOrderItem[]> {
    try {
        // Extract text from image/PDF
        const text = await extractTextWithTesseract(file);
        console.log('📄 Extracted text:', text);

        // Parse text to find SKUs and quantities
        const items = parseOrderText(text);
        console.log('📦 Parsed items:', items);

        if (items.length === 0) {
            throw new Error('No items detected. Please ensure the image is clear and contains SKU codes.');
        }

        return items;
    } catch (error) {
        console.error('Tesseract scan error:', error);
        throw error;
    }
}

/**
 * Verify pallet using Tesseract OCR
 */
export async function verifyPalletWithTesseract(file: File | string, expectedItems: AIOrderItem[]): Promise<AIPalletVerification> {
    try {
        // Extract text from image
        const text = await extractTextWithTesseract(file);
        console.log('📄 Extracted text from pallet:', text);

        // Parse text to find SKUs
        const detectedItems = parseOrderText(text);
        console.log('📦 Detected items:', detectedItems);

        // Compare detected vs expected
        const matched: AIPalletVerification['matched'] = [];
        const missing: AIPalletVerification['missing'] = [];
        const extra: AIPalletVerification['extra'] = [];

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

        return { matched, missing, extra };
    } catch (error) {
        console.error('Tesseract verification error:', error);
        throw error;
    }
}
