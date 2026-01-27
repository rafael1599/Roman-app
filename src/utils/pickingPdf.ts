/**
 * Generates a Picking List PDF based on a pre-ordered sequence.
 */
export const generatePickingPdf = async (
  finalSequence: any[],
  orderNumber?: string,
  totalPallets: number = 0
) => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);

  const doc = new jsPDF('p', 'mm', 'a4');
  const today = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());

  // Title
  doc.setFontSize(22);
  doc.setTextColor(40, 40, 40);
  doc.text('PICKING LIST', 15, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${today}`, 15, 27);

  let startY = 40;
  if (orderNumber) {
    doc.text(`Order Number: #${orderNumber}`, 15, 32);
    doc.text(`Total Pallets: ${totalPallets}`, 15, 37);
    startY = 45;
  } else {
    doc.text(`Total Pallets: ${totalPallets}`, 15, 32);
  }

  // --- Picking Sequence Table ---
  const verifiedCount = finalSequence.filter((item) => item.isPicked).length;

  const sequenceData = finalSequence.map((item, idx) => [
    (idx + 1).toString(),
    item.sku,
    `${item.location}${item.warehouse ? ` / ${item.warehouse}` : ''}`,
    `P${item.palletId}`,
    item.pickingQty?.toString() || '0',
    item.isPicked ? 'VERIFIED' : '',
  ]);

  if (sequenceData.length > 0) {
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text(`PICKING SEQUENCE (Verified: ${verifiedCount}/${finalSequence.length})`, 15, startY);
    startY += 5;

    autoTable(doc, {
      startY: startY,
      head: [['#', 'SKU', 'Location / WH', 'Pallet', 'Qty', 'Double check']],
      body: sequenceData,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 255, 255],
        textColor: 0,
        font: 'times',
        fontSize: 12,
        fontStyle: 'bold',
        lineColor: [0, 0, 0],
        lineWidth: 0.1,
      },
      styles: {
        font: 'times',
        fontSize: 12,
        cellPadding: 3,
        overflow: 'linebreak',
        lineColor: [0, 0, 0],
        lineWidth: 0.1,
        fillColor: [255, 255, 255],
        textColor: [0, 0, 0],
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
        5: { halign: 'center', cellWidth: 35 },
      },
      didDrawCell: (data) => {
        if (
          data.section === 'body' &&
          data.column.index === 5 &&
          data.cell.text[0] === 'VERIFIED'
        ) {
          const x = data.cell.x + data.cell.width / 2;
          const y = data.cell.y + data.cell.height / 2;

          // Draw Green Checkmark manually
          doc.setDrawColor(22, 163, 74); // Green
          doc.setLineWidth(0.5);
          doc.line(x - 2, y + 0.5, x - 0.5, y + 2);
          doc.line(x - 0.5, y + 2, x + 2.5, y - 2);

          // Clear the placeholder text so it doesn't print
          data.cell.text[0] = '';
        }
      },
      margin: { left: 15, right: 15 },
    });

    startY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Optional: Group by pallets if needed, but the user asked for "filament by filament" based on finalSequence.
  // However, for clarity, we can still show a summary or just stick to the sequence as requested.
  // The user said: "Simplemente recibirá esta finalSequence y la imprimirá tal cual fila por fila."
  // So I will stop here to keep it "dumb".

  doc.save(`picking_list_${new Date().toISOString().replace(/[:.]/g, '-')}.pdf`);
};
