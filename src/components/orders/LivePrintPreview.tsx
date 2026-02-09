import React, { useMemo } from 'react';
import jsPDF from 'jspdf';

interface OrderPreviewData {
    customerName: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    pallets: number;
    units: number;
    loadNumber: string;
}

interface LivePrintPreviewProps {
    data: OrderPreviewData;
}

export const LivePrintPreview: React.FC<LivePrintPreviewProps> = ({ data }) => {
    const { customerName, street, city, state, zip, pallets, units, loadNumber } = data;
    const hasAddress = Boolean(street && city);
    const cityStateZip = `${city}, ${state} ${zip}`.toUpperCase();

    // Replicate PDF Scaling Logic
    const fontSizePt = useMemo(() => {
        const margin = 5;
        const pageWidth = 297;
        const pageHeight = 210;
        const PT_TO_MM = 0.3528;
        const LINE_HEIGHT = 1.1;
        const maxWidth = pageWidth - margin * 2;
        const maxHeight = pageHeight - margin * 2;
        const thankYouMsg = 'PLEASE COUNT YOUR SHIPMENT CAREFULLY THAT THERE ARE NO DAMAGES DUE TO SHIPPING. JAMIS BICYCLES THANKS YOU FOR YOUR ORDER.';

        const contentLines: string[] = [];
        contentLines.push(customerName.toUpperCase());
        if (street) contentLines.push(street.toUpperCase());
        if (city) contentLines.push(cityStateZip);
        contentLines.push(''); // spacer
        contentLines.push(`PALLETS: ${pallets}`);
        contentLines.push(`UNITS: ${units}`);
        contentLines.push(`LOAD: ${loadNumber || 'N/A'}`);
        contentLines.push(''); // spacer

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        doc.setFont('helvetica', 'bold');

        let fontSize = 100;
        const minFontSize = 12;
        let fits = false;

        while (fontSize >= minFontSize && !fits) {
            doc.setFontSize(fontSize);
            doc.setLineHeightFactor(LINE_HEIGHT);
            let totalHeight = margin;

            for (const line of contentLines) {
                if (line === '') {
                    totalHeight += (fontSize * PT_TO_MM) * 0.3;
                } else {
                    const wrapped = doc.splitTextToSize(line, maxWidth);
                    totalHeight += wrapped.length * (fontSize * PT_TO_MM * LINE_HEIGHT);
                }
            }

            const msgFontSize = fontSize * 0.7;
            doc.setFontSize(msgFontSize);
            const msgWrapped = doc.splitTextToSize(thankYouMsg, maxWidth);
            totalHeight += msgWrapped.length * (msgFontSize * PT_TO_MM * LINE_HEIGHT);

            if (totalHeight <= maxHeight) {
                fits = true;
            } else {
                fontSize -= 1;
            }
        }
        return fontSize;
    }, [customerName, street, city, state, zip, pallets, units, loadNumber, cityStateZip]);

    // Generate pages: for each pallet, we have 1 Info page + 1 Number page
    const pages: React.ReactNode[] = [];

    for (let i = 0; i < pallets; i++) {
        // PAGE A: Customer Info Label
        pages.push(
            <div
                key={`info-${i}`}
                className="preview-page font-sans uppercase bg-white text-black border border-zinc-300 shadow-2xl flex flex-col justify-start overflow-hidden"
                style={{
                    width: '297mm',
                    height: '210mm',
                    padding: '5mm', // Match PDF margin
                }}
            >
                <div
                    className="page-content w-full flex flex-col"
                    style={{
                        fontSize: `${fontSizePt}pt`,
                        lineHeight: '1.1',
                        fontWeight: 'bold'
                    }}
                >
                    <div className="font-black tracking-tighter" style={{ fontSize: 'inherit' }}>
                        <p>{customerName.toUpperCase()}</p>
                        {hasAddress && (
                            <>
                                <p>{street.toUpperCase()}</p>
                                <p>{cityStateZip}</p>
                            </>
                        )}
                    </div>

                    <div className="mt-[0.3em] font-black tracking-tighter" style={{ fontSize: 'inherit' }}>
                        <p>PALLETS: {pallets}</p>
                        <p>UNITS: {units}</p>
                        <p>LOAD: {loadNumber}</p>
                    </div>

                    <div
                        className="mt-auto font-bold uppercase"
                        style={{ fontSize: `${fontSizePt * 0.7}pt` }}
                    >
                        <p>
                            PLEASE COUNT YOUR SHIPMENT CAREFULLY THAT THERE ARE NO DAMAGES DUE TO
                            SHIPPING. JAMIS BICYCLES THANKS YOU FOR YOUR ORDER.
                        </p>
                    </div>
                </div>
            </div>
        );

        // PAGE B: Pallet Number Only
        pages.push(
            <div
                key={`num-${i}`}
                className="preview-page font-sans bg-white text-black border border-zinc-300 shadow-2xl flex items-center justify-center overflow-hidden"
                style={{ width: '297mm', height: '210mm' }}
            >
                <h2 className="text-[22rem] font-black leading-none tracking-tighter text-slate-900">
                    {i + 1} of {pallets}
                </h2>
            </div>
        );
    }

    return (
        <div className="w-full h-full bg-zinc-200 dark:bg-zinc-900 overflow-y-auto p-8 flex flex-col items-center">
            <div className="flex items-center justify-between w-full max-w-5xl mb-6">
                <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <h3 className="font-bold uppercase tracking-widest text-sm">Live Print Preview</h3>
                </div>
                <p className="text-xs text-zinc-400">
                    {pallets} Pallets × 2 = {pallets * 2} Labels
                </p>
            </div>

            {/* Scaled Preview Grid */}
            <div
                className="preview-viewer grid gap-16 justify-center origin-top"
                style={{
                    gridTemplateColumns: 'repeat(2, 297mm)',
                    transform: 'scale(0.35)',
                    marginBottom: '-1200px', // Compensate for scale shrink
                }}
            >
                {pages}
            </div>

            <p className="mt-8 text-center text-zinc-500 dark:text-zinc-600 text-sm italic">
                Final layout may vary slightly depending on paper size settings.
            </p>
        </div>
    );
};
