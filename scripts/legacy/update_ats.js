import postgres from 'postgres';
import dotenv from 'dotenv';
dotenv.config();

const sql = postgres(process.env.DATABASE_URL);

const data = [
    { sku: '03-3985GY', warehouse: 'ATS', location: 'A6', quantity: 19 },
    { sku: '03-3985GY', warehouse: 'ATS', location: 'B6', quantity: 30 },
    { sku: '03-3931BK', warehouse: 'ATS', location: 'A4', quantity: 12 },
    { sku: '03-3931BK', warehouse: 'ATS', location: 'B4', quantity: 30 },
    { sku: '03-4085BK', warehouse: 'ATS', location: 'A3', quantity: 13 },
    { sku: '03-4085BK', warehouse: 'ATS', location: 'B3', quantity: 30 },
    { sku: '03-3980BL', warehouse: 'ATS', location: 'E1', quantity: 10 },
    { sku: '03-3980BL', warehouse: 'ATS', location: 'G2:6', quantity: 150 },
    { sku: '03-3981GY', warehouse: 'ATS', location: 'H1:6', quantity: 159 },
    { sku: '03-3981GY', warehouse: 'ATS', location: 'I2:6', quantity: 130 },
    { sku: '03-3983GY', warehouse: 'ATS', location: 'J2:6', quantity: 150 },
    { sku: '03-3983GY', warehouse: 'ATS', location: 'K2:6', quantity: 120 },
    { sku: '03-3979GY', warehouse: 'ATS', location: 'L2:6', quantity: 145 },
    { sku: '03-3979GY', warehouse: 'ATS', location: 'M2:6', quantity: 101 },
    { sku: '03-4070BK', warehouse: 'ATS', location: 'M1', quantity: 30 },
    { sku: '03-4070BK', warehouse: 'ATS', location: 'N2:6', quantity: 150 },
    { sku: '03-4070BK', warehouse: 'ATS', location: 'PALLETIZED', quantity: 29 },
    { sku: '03-4035BL', warehouse: 'ATS', location: 'O2:6', quantity: 150 },
    { sku: '03-4035BL', warehouse: 'ATS', location: 'PALLETIZED', quantity: 38 },
    { sku: '03-4068BK', warehouse: 'ATS', location: 'P2:6', quantity: 136 },
    { sku: '03-4068BK', warehouse: 'ATS', location: 'PALLETIZED', quantity: 32 },
    { sku: '03-3986TL', warehouse: 'ATS', location: 'R3:6', quantity: 90 },
    { sku: '03-4034BK', warehouse: 'ATS', location: 'S2:6', quantity: 120 },
    { sku: '03-4034BK', warehouse: 'ATS', location: 'PALLETIZED', quantity: 14 },
    { sku: '03-4038BL', warehouse: 'ATS', location: 'T2:6', quantity: 120 },
    { sku: '03-4038BL', warehouse: 'ATS', location: 'PALLETIZED', quantity: 9 },
    { sku: '03-3976BL', warehouse: 'ATS', location: 'U2:6', quantity: 119 },
    { sku: '03-3976BL', warehouse: 'ATS', location: 'PALLETIZED', quantity: 10 },
    { sku: '03-4067BL', warehouse: 'ATS', location: 'V3:6', quantity: 103 },
    { sku: '03-4072BK', warehouse: 'ATS', location: 'W4:6', quantity: 89 },
    { sku: '03-3977GY', warehouse: 'ATS', location: 'Y5:6', quantity: 50 },
    { sku: '03-3977GY', warehouse: 'ATS', location: 'PALLETIZED', quantity: 16 },
    { sku: '03-3735GY', warehouse: 'ATS', location: 'PALLETIZED', quantity: 50 },
    { sku: '03-3742BK', warehouse: 'ATS', location: 'PALLETIZED', quantity: 47 },
    { sku: '03-4080SL', warehouse: 'ATS', location: 'PALLETIZED', quantity: 16 },
    { sku: '03-3740BK', warehouse: 'ATS', location: 'PALLETIZED', quantity: 56 }
];

async function update() {
    console.log(`Starting update of ${data.length} records via direct SQL...`);
    
    try {
        for (const item of data) {
            const existing = await sql\`
                SELECT id, "Quantity" FROM inventory 
                WHERE "SKU" = \${item.sku} 
                AND "Warehouse" = \${item.warehouse} 
                AND "Location" = \${item.location}
            \`;

            if (existing.length > 0) {
                console.log(\`Updating \${item.sku} at \${item.location}: \${existing[0].Quantity} -> \${item.quantity}\`);
                await sql\`
                    UPDATE inventory 
                    SET "Quantity" = \${item.quantity} 
                    WHERE id = \${existing[0].id}
                \`;
            } else {
                console.log(\`Inserting new record: \${item.sku} at \${item.location} with \${item.quantity}\`);
                await sql\`
                    INSERT INTO inventory ("SKU", "Warehouse", "Location", "Quantity")
                    VALUES (\${item.sku}, \${item.warehouse}, \${item.location}, \${item.quantity})
                \`;
            }
        }
        console.log('Update finished successfully.');
    } catch (err) {
        console.error('Update failed:', err);
    } finally {
        await sql.end();
    }
}

update();
