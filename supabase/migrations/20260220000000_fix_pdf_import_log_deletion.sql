-- Fix foreign key constraint to allow deleting picking lists imported via PDF
ALTER TABLE public.pdf_import_log
DROP CONSTRAINT IF EXISTS pdf_import_log_picking_list_id_fkey,
ADD CONSTRAINT pdf_import_log_picking_list_id_fkey 
    FOREIGN KEY (picking_list_id) 
    REFERENCES public.picking_lists(id) 
    ON DELETE SET NULL;
