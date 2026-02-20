import json
import os

def generate_sql(table, data_file):
    with open(data_file, 'r') as f:
        content = f.read()
        
    try:
        # The entire file is a JSON string
        full_output = json.loads(content)
        # Extract the part between markers
        import re
        match = re.search(r'<untrusted-data-.*?>\n(.*)\n</untrusted-data-.*?>', full_output, re.DOTALL)
        if match:
            json_str = match.group(1)
        else:
            # Fallback for different format
            match = re.search(r'<untrusted-data-.*?>\n(.*)', full_output, re.DOTALL)
            if match:
                json_str = match.group(1)
            else:
                print(f"Markers not found in {data_file}")
                return ""
        
        json_data = json.loads(json_str)
        if not json_data:
            return ""
        
        columns = json_data[0].keys()
        sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES \n"
        values_list = []
        for row in json_data:
            formatted_values = []
            for col in columns:
                val = row[col]
                if val is None:
                    formatted_values.append("NULL")
                elif isinstance(val, bool):
                    formatted_values.append(str(val).upper())
                elif isinstance(val, (int, float)):
                    formatted_values.append(str(val))
                else:
                    escaped_val = str(val).replace("'", "''")
                    formatted_values.append(f"'{escaped_val}'")
            values_list.append(f"({', '.join(formatted_values)})")
        
        sql += ",\n".join(values_list) + ";\n"
        return sql
    except Exception as e:
        print(f"Error processing {data_file}: {e}")
        return ""

tables = {
    "sku_metadata": "/Users/rafaellopez/.gemini/antigravity/brain/eae3e473-eae8-46a0-bb5b-2ca937e1e1d4/.system_generated/steps/3597/output.txt",
    "locations": "/Users/rafaellopez/.gemini/antigravity/brain/eae3e473-eae8-46a0-bb5b-2ca937e1e1d4/.system_generated/steps/3596/output.txt",
    "inventory": "/Users/rafaellopez/.gemini/antigravity/brain/eae3e473-eae8-46a0-bb5b-2ca937e1e1d4/.system_generated/steps/3595/output.txt"
}

with open("populate_local.sql", "w") as f:
    for table in ["sku_metadata", "locations", "inventory"]:
        sql = generate_sql(table, tables[table])
        f.write(sql)
