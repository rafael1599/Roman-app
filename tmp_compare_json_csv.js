import fs from 'fs/promises';
import Papa from 'papaparse';

async function run() {
    try {
        const jsonPath = '/Users/rafaellopez/Documents/Antigravity/Roman-app/src/jsoneliminar-despues-de-1-solo-uso/output.json';
        const csvPath = '/Users/rafaellopez/Documents/Antigravity/Roman-app/src/jsoneliminar-despues-de-1-solo-uso/Inventory 2_26 - Hoja 1.csv';

        const jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
        const csvContent = await fs.readFile(csvPath, 'utf8');

        const csvResults = Papa.parse(csvContent, {
            header: true,
            skipEmptyLines: true,
            transform: (value) => value.trim()
        });
        const csvRecords = csvResults.data;

        const csvMap = new Map();
        for (const record of csvRecords) {
            if (record.sku) {
                // Store only unique SKUs to simplify comparison
                csvMap.set(record.sku, record.desc);
            }
        }

        const newSkus = [];
        const differingDescs = [];

        for (const item of jsonData) {
            const { sku, descripcion } = item;
            if (!sku) continue;

            if (!csvMap.has(sku)) {
                newSkus.push(item);
            } else {
                const csvDesc = csvMap.get(sku);
                if (csvDesc !== descripcion) {
                    differingDescs.push({
                        sku,
                        jsonDesc: descripcion,
                        csvDesc: csvDesc
                    });
                }
            }
        }

        console.log(`Comparison Results:`);
        console.log(`- Total items in JSON: ${jsonData.length}`);
        console.log(`- SKUs in JSON NOT found in CSV: ${newSkus.length}`);
        console.log(`- SKUs in both but with different descriptions: ${differingDescs.length}`);

        if (newSkus.length > 0) {
            console.log('\nSample SKUs in JSON not in CSV:');
            console.log(newSkus.slice(0, 5));
        }

        if (differingDescs.length > 0) {
            console.log('\nSample differing descriptions (JSON vs CSV):');
            console.log(differingDescs.slice(0, 5));
        }

    } catch (err) {
        console.error(err);
    }
}

run();
