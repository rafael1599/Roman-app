import re

input_path = '/Users/rafaellopez/Downloads/Supabase Snippet Inventory Tracking.csv'
output_path = '/Users/rafaellopez/Downloads/Supabase_Snippet_Sorted.csv'

def get_row_key(row_header):
    # Extrae el número y sufijo de forma robusta
    # Ej: " Row  19B" -> (19, "B")
    match = re.search(r'Row\s+(\d+)([a-zA-Z]*)', row_header, re.IGNORECASE)
    if match:
        num = int(match.group(1))
        suffix = match.group(2).upper()
        return (num, suffix)
    return (999, row_header)

def sort_inventory():
    with open(input_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    if not lines:
        return

    # Mantener el encabezado (line_text, LUDLOW, etc.)
    # Buscamos dónde empieza el primer "Row"
    first_row_idx = -1
    for i, line in enumerate(lines):
        if re.search(r'^\s*Row\s+\d+', line, re.IGNORECASE):
            first_row_idx = i
            break
    
    if first_row_idx == -1:
        print("No se encontraron filas con 'Row'. Verificando formato...")
        return

    header = lines[:first_row_idx]
    body = lines[first_row_idx:]

    blocks = []
    current_block = None

    for line in body:
        clean_line = line.strip()
        # Detectar nuevo cabezal de Row
        if re.search(r'^"?\s*Row\s+\d+', clean_line, re.IGNORECASE):
            if current_block:
                blocks.append(current_block)
            current_block = {'header': line, 'items': []}
        else:
            if current_block:
                current_block['items'].append(line)
            else:
                # Líneas huérfanas antes del primer Row (no debería pasar)
                header.append(line)

    if current_block:
        blocks.append(current_block)

    # Ordenar los bloques por el número de Row
    blocks.sort(key=lambda x: get_row_key(x['header']))

    with open(output_path, 'w', encoding='utf-8') as f:
        f.writelines(header)
        for block in blocks:
            f.write(block['header'])
            f.writelines(block['items'])

    print(f"Archivo ordenado guardado en: {output_path}")

if __name__ == "__main__":
    sort_inventory()
