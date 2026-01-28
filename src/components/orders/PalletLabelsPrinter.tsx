import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, FileText, Loader2 } from 'lucide-react';

interface Order {
    id: string;
    order_number: string | null;
    customer_name: string | null;
    pallets_qty: number | any;
}

interface PalletLabelsPrinterProps {
    order: Order;
    onClose: () => void;
}

export const PalletLabelsPrinter = ({ order, onClose }: PalletLabelsPrinterProps) => {
    const [isGenerating, setIsGenerating] = useState(false);
    const pallets = Number(order.pallets_qty) || 1;
    const customer = (order.customer_name || 'GENERIC CUSTOMER').toUpperCase();

    const generateAndPrintPDF = async () => {
        setIsGenerating(true);
        try {
            const { default: jsPDF } = await import('jspdf');

            // Create PDF in 6x4 inches landscape
            const doc = new jsPDF({
                orientation: 'landscape',
                unit: 'in',
                format: [6, 4]
            });

            for (let i = 0; i < pallets; i++) {
                // Page 1: The Numbering
                if (i > 0) doc.addPage([6, 4], 'landscape');

                doc.setFont('helvetica', 'bold');
                doc.setTextColor(0, 0, 0);

                // Draw "1 OF X" - Large and Centered
                doc.setFontSize(110);
                const textNum = `${i + 1} OF ${pallets}`;
                const numWidth = doc.getTextWidth(textNum);
                doc.text(textNum, (6 - numWidth) / 2, 2.3);

                // Page 2: The Company Name
                doc.addPage([6, 4], 'landscape');

                // Maximize font size based on text length
                let fontSize = 70;
                if (customer.length > 20) fontSize = 50;
                if (customer.length > 35) fontSize = 35;

                doc.setFontSize(fontSize);
                const customerLines = doc.splitTextToSize(customer, 5.5);
                const textHeight = (customerLines.length * fontSize) / 72;
                doc.text(customerLines, 3, (4 - textHeight) / 2 + 0.5, { align: 'center' });
            }

            // Create blob and open in new tab
            const blob = doc.output('bloburl');
            window.open(blob, '_blank');
            onClose();
        } catch (error) {
            console.error('Error generating PDF:', error);
        } finally {
            setIsGenerating(false);
        }
    };

    const content = (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-accent/20">
                    <div className="h-full bg-accent w-full origin-left animate-pulse" />
                </div>

                <div className="text-center space-y-6">
                    <div className="w-20 h-20 bg-accent/10 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-accent/20 text-accent">
                        <FileText size={40} />
                    </div>

                    <div>
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight italic">
                            Label <span className="text-accent not-italic">PDF</span>
                        </h2>
                        <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
                            Ready for {pallets} Pallets ({pallets * 2} labels)
                        </p>
                    </div>

                    <div className="p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700/50 text-left">
                        <p className="text-[9px] text-zinc-500 font-black uppercase tracking-widest mb-1">Company Name</p>
                        <p className="text-white font-bold text-sm truncate">{customer}</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <button
                            onClick={generateAndPrintPDF}
                            disabled={isGenerating}
                            className="w-full h-14 bg-accent text-white rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase tracking-widest shadow-xl shadow-accent/20 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isGenerating ? (
                                <Loader2 className="animate-spin" size={18} />
                            ) : (
                                <Printer size={18} />
                            )}
                            {isGenerating ? 'Generating...' : 'Open PDF to Print'}
                        </button>

                        <button
                            onClick={onClose}
                            className="w-full h-12 text-zinc-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(content, document.body);
};
