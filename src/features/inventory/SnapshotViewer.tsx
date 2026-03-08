import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';

export const SnapshotViewer: React.FC = () => {
    const { fileName } = useParams<{ fileName: string }>();
    const navigate = useNavigate();
    const [html, setHtml] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchSnapshot = async () => {
            if (!fileName) return;
            try {
                setLoading(true);

                // We use the edge function as a proxy to bypass CORS on R2.
                // We call it via standard fetch to ensure we get raw text/html.
                const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-snapshot?file=${fileName}`;

                const response = await fetch(functionUrl, {
                    method: 'GET',
                    headers: {
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
                    }
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || 'Failed to load snapshot from archive');
                }

                const content = await response.text();
                setHtml(content);
            } catch (err: any) {
                console.error('Failed to load snapshot:', err);
                setError(err.message || 'Error loading snapshot content');
            } finally {
                setLoading(false);
            }
        };

        fetchSnapshot();
    }, [fileName]);

    if (loading) {
        return (
            <div className="min-h-screen bg-main flex flex-col items-center justify-center p-4">
                <Loader2 className="animate-spin text-accent w-10 h-10 mb-4" />
                <p className="text-muted text-sm font-medium">Archiving inventory data...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-main flex flex-col items-center justify-center p-4 text-center">
                <AlertCircle className="text-destructive w-12 h-12 mb-4 opacity-50" />
                <h1 className="text-xl font-bold mb-2">Unavailable</h1>
                <p className="text-muted mb-6 max-w-md">{error}</p>
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 px-6 py-2 bg-accent text-white rounded-lg font-medium shadow-lg hover:brightness-110 active:scale-95 transition-all"
                >
                    <ChevronLeft size={18} />
                    Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-main flex flex-col font-sans transition-premium">
            {/* Premium Header */}
            <div className="ios-glass border-b border-subtle p-3 px-6 sticky top-0 z-50 flex items-center justify-between shadow-ios">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-muted hover:text-accent-primary transition-premium text-sm group"
                >
                    <ChevronLeft size={18} className="group-active:scale-90 transition-transform" />
                    <span className="font-semibold">Exit Preview</span>
                </button>
                <div className="text-[10px] text-muted font-mono bg-surface px-3 py-1 rounded-full border border-subtle">
                    {fileName}
                </div>
            </div>

            {/* Snapshot Content (Rendered inside a clean wrapper) */}
            <main className="flex-1 w-full max-w-4xl mx-auto py-6 px-4 md:py-10">
                <div
                    className="bg-surface rounded-2xl shadow-ios overflow-hidden border border-subtle min-h-[85vh] transition-premium animate-slide-in-new"
                    dangerouslySetInnerHTML={{ __html: html || '' }}
                />
            </main>

            {/* Secure Footer */}
            <footer className="pb-10 pt-4 text-center">
                <p className="text-muted text-[10px] uppercase tracking-widest font-black opacity-50">
                    Authenticated Archives • PickD Inventory System
                </p>
            </footer>
        </div>
    );
};
