import { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../integrations/supabase/types';

/**
 * Custom application error for standardized error handling across services and UI.
 */
export class AppError extends Error {
    constructor(
        public message: string,
        public status: string | number = '500',
        public originalError?: any
    ) {
        super(message);
        this.name = 'AppError';
    }
}

export abstract class BaseService<
    Table extends keyof Database['public']['Tables'],
    Row = Database['public']['Tables'][Table]['Row'],
    Insert = Database['public']['Tables'][Table]['Insert'],
    Update = Database['public']['Tables'][Table]['Update']
> {
    constructor(
        protected supabase: SupabaseClient<Database>,
        protected table: Table
    ) { }

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
        return data as Row[];
    }

    async getById(id: string | number): Promise<Row | null> {
        const { data, error } = await this.supabase
            .from(this.table)
            .select('*')
            .eq('id', id)
            .single();
        if (error) this.handleError(error);
        return data as Row;
    }

    async create(payload: Insert): Promise<Row> {
        const { data, error } = await this.supabase
            .from(this.table)
            .insert(payload)
            .select()
            .single();
        if (error) this.handleError(error);
        return data as Row;
    }

    async update(id: string | number, payload: Update): Promise<Row> {
        const { data, error } = await this.supabase
            .from(this.table)
            .update(payload)
            .eq('id', id)
            .select()
            .single();
        if (error) this.handleError(error);
        return data as Row;
    }

    async delete(id: string | number): Promise<void> {
        const { error } = await this.supabase.from(this.table).delete().eq('id', id);
        if (error) this.handleError(error);
    }
}
