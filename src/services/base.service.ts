import { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../integrations/supabase/types';
import { z } from 'zod';

/**
 * Custom application error for standardized error handling across services and UI.
 */
export class AppError extends Error {
    constructor(
        public message: string,
        public status: string | number = '500',
        public originalError?: unknown
    ) {
        super(message);
        this.name = 'AppError';
    }
}

/**
 * BaseService provides a foundation for Supabase-backed services with 
 * automatic Zod validation, standardized error handling, and type safety.
 */
export abstract class BaseService<
    Table extends keyof Database['public']['Tables'],
    Row = Database['public']['Tables'][Table]['Row'],
    Insert = Database['public']['Tables'][Table]['Insert'],
    Update = Database['public']['Tables'][Table]['Update']
> {
    protected schema?: z.ZodType<Row>;

    constructor(
        protected supabase: SupabaseClient<Database>,
        protected table: Table,
        optionsCallback?: (schemas: { [key: string]: any }) => { schema: z.ZodType<Row> }
    ) {
        // If an options callback is provided, we extract the schema from it.
        // This pattern allows for future flexibility if we want to pass more options.
        if (optionsCallback) {
            const options = optionsCallback({});
            this.schema = options.schema;
        }
    }

    /**
     * Internal validator that uses the Zod schema if provided, otherwise fallbacks to casting.
     */
    protected validate(data: any): Row {
        if (!data) return data as Row;
        if (this.schema) {
            try {
                return this.schema.parse(data);
            } catch (err) {
                console.error(`[BaseService] Validation error in table "${String(this.table)}":`, err);
                // In production, we might want to still return the data as Row but log the discrepancy
                // For now, during refactoring, we let it throw or handle it.
                if (err instanceof z.ZodError) {
                    throw new AppError(`Data integrity violation in ${String(this.table)}`, 'VALIDATION_ERROR', err);
                }
                throw err;
            }
        }
        return data as Row;
    }

    /**
     * Validates an array of items.
     */
    protected validateArray(data: any[] | null): Row[] {
        if (!data) return [];
        return data.map(item => this.validate(item));
    }

    /**
     * Standardized error handler that wraps PostgrestErrors into AppErrors.
     */
    protected handleError(error: PostgrestError): never {
        throw new AppError(
            error.message,
            error.code,
            error
        );
    }

    async getAll(): Promise<Row[]> {
        const { data, error } = await this.supabase.from(this.table).select('*');
        if (error) this.handleError(error);
        return this.validateArray(data);
    }

    async getById(id: string | number): Promise<Row | null> {
        const { data, error } = await this.supabase
            .from(this.table)
            .select('*')
            .eq('id' as any, id)
            .single();
        if (error) this.handleError(error);
        return data ? this.validate(data) : null;
    }

    async create(payload: Insert): Promise<Row> {
        const { data, error } = await this.supabase
            .from(this.table)
            .insert(payload as any) // Supabase types can be tricky with generics
            .select()
            .single();
        if (error) this.handleError(error);
        return this.validate(data);
    }

    async update(id: string | number, payload: Update): Promise<Row> {
        const { data, error } = await this.supabase
            .from(this.table)
            .update(payload as any)
            .eq('id' as any, id)
            .select()
            .single();
        if (error) this.handleError(error);
        return this.validate(data);
    }

    async delete(id: string | number): Promise<void> {
        const { error } = await this.supabase.from(this.table).delete().eq('id' as any, id);
        if (error) this.handleError(error);
    }
}

