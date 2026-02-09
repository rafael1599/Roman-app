
-- Add unique constraint to load_number in picking_lists table
-- Only enforces uniqueness where load_number is NOT NULL and NOT EMPTY (handled by partial index or check constraint, 
-- but standards SQL UNIQUE allows multiple NULLs. For empty strings, we might want to be careful).
-- The user requirement is "no same load number in different orders".

-- First, ensure we don't have empty strings that would collide if we consider them "values".
-- But typically load numbers are non-empty. 

ALTER TABLE "public"."picking_lists"
    ADD CONSTRAINT "picking_lists_load_number_key" UNIQUE ("load_number");
