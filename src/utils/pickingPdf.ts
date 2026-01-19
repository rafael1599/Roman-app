import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generates a Picking List PDF grouped by pallets.
 */
export const generatePickingPdf = (pallets: any[]) => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const today = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(new Date());

    // Title
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text('PICKING LIST', 15, 20);

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Generated: ${today}`, 15, 27);
    doc.text(`Total Pallets: ${pallets.length}`, 15, 32);

    let startY = 40;

    pallets.forEach((pallet) => {
        // Check if we need a new page
        if (startY > 250) {
            doc.addPage();
            startY = 20;
        }

        doc.setFontSize(14);
        doc.setTextColor(0, 0, 0);
        doc.text(`PALLET #${pallet.id} (${pallet.totalUnits} items)`, 15, startY);
        startY += 5;

        const tableData = pallet.items.map((item: any) => [
            item.SKU,
            item.Location,
            item.Warehouse,
            item.pickingQty,
            '' // Checkbox column
        ]);

        autoTable(doc, {
            startY: startY,
            head: [['SKU', 'Location', 'Warehouse', 'Qty', 'Picked']],
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [52, 152, 219], textColor: 255 },
            styles: { fontSize: 10, cellPadding: 3 },
            columnStyles: {
                0: { fontStyle: 'bold' },
                3: { halign: 'center', fontStyle: 'bold' },
                4: { cellWidth: 20 }
            },
            margin: { left: 15, right: 15 }
        });

        startY = (doc as any).lastAutoTable.finalY + 15;
    });

    doc.save(`picking_list_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`);
};
