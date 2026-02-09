import React from 'react';

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

    // Generate pages: for each pallet, we have 1 Info page + 1 Number page
    const pages: React.ReactNode[] = [];

    for (let i = 0; i < pallets; i++) {
        // PAGE A: Customer Info Label
        pages.push(
            <div
                key={`info-${i}`}
                className="preview-page font-sans uppercase bg-white text-black border border-zinc-300 shadow-2xl flex flex-col justify-start overflow-hidden p-2"
                style={{ width: '297mm', height: '210mm' }}
            >
                <div className="page-content w-full mx-auto px-2 py-1 flex flex-col h-full">
                    <div className="text-[5.5rem] leading-[0.9] font-black tracking-tighter">
                        <p>{customerName.toUpperCase()}</p>
                        {hasAddress && (
                            <>
                                <p>{street.toUpperCase()}</p>
                                <p>{cityStateZip}</p>
                            </>
                        )}
                    </div>

                    <div className="mt-4 text-[5rem] leading-[0.9] font-black tracking-tighter">
                        <p>PALLETS: {pallets}</p>
                        <p>UNITS: {units}</p>
                        <p>LOAD: {loadNumber}</p>
                    </div>

                    <div className="mt-4 text-[2.8rem] leading-[1.0] font-bold uppercase">
                        <p>
                            Please count your shipment carefully that there are no damages due to
                            shipping. Jamis Bicycles thanks you for your order.
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
