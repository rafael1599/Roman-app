import { ZodSchema, ZodError, ZodIssue } from 'zod';

/**
 * Validates data against a Zod schema and throws a detailed error if validation fails
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns The validated data with proper typing
 * @throws Error with detailed validation messages
 */
export function validateData<T>(schema: ZodSchema<T>, data: unknown): T {
    try {
        return schema.parse(data);
    } catch (error) {
        if (error instanceof ZodError) {
            const errorMessages = error.issues
                .map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`)
                .join(', ');
            console.error('❌ Validation failed:', error.issues);
            throw new Error(`Data validation error: ${errorMessages}`);
        }
        throw error;
    }
}

/**
 * Safely validates data without throwing, returns success/error result
 * @param schema - The Zod schema to validate against
 * @param data - The data to validate
 * @returns Object with success flag and either data or error
 */
export function safeValidateData<T>(
    schema: ZodSchema<T>,
    data: unknown
): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    const errorMessages = result.error.issues
        .map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`)
        .join(', ');

    return { success: false, error: errorMessages };
}

/**
 * Validates an array of items against a schema
 * @param schema - The Zod schema for individual items
 * @param data - Array of items to validate
 * @returns Validated array with proper typing
 * @throws Error with detailed validation messages including item index
 */
export function validateArray<T>(schema: ZodSchema<T>, data: unknown[]): T[] {
    return data.map((item, index) => {
        try {
            return schema.parse(item);
        } catch (error) {
            if (error instanceof ZodError) {
                const errorMessages = error.issues
                    .map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`)
                    .join(', ');
                throw new Error(`Item ${index} validation failed: ${errorMessages}`);
            }
            throw error;
        }
    });
}

/**
 * Type guard helper - checks if data matches schema without throwing
 * @param schema - The Zod schema to check against
 * @param data - The data to check
 * @returns Boolean indicating if data matches schema
 */
export function isValidData<T>(schema: ZodSchema<T>, data: unknown): data is T {
    return schema.safeParse(data).success;
}
