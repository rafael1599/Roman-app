import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import ChevronLeft from 'lucide-react/dist/esm/icons/chevron-left';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';

const R2_PUBLIC_DOMAIN = 'https://pub-1a61139939fa4f3ba21ee7909510985c.r2.dev';

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
                const response = await fetch(`${R2_PUBLIC_DOMAIN}/${fileName}`);
                if (!response.ok) throw new Error('Snapshot not found or unauthorized');
                const content = await response.text();
                setHtml(content);
            } catch (err: any) {
                console.error('Failed to load snapshot:', err);
                setError(err.message || 'Error loading snapshot');
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
                <p className="text-muted text-sm">Loading historical snapshot...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-main flex flex-col items-center justify-center p-4 text-center">
                <AlertCircle className="text-destructive w-12 h-12 mb-4 opacity-50" />
                <h1 className="text-xl font-bold mb-2">Oops! Couldn't load snapshot</h1>
                <p className="text-muted mb-6 max-w-md">{error}</p>
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 px-6 py-2 bg-accent text-white rounded-lg font-medium"
                >
                    <ChevronLeft size={18} />
                    Return to Dashboard
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-neutral-100 flex flex-col">
            {/* Top Bar */}
            <div className="bg-surface border-b border-subtle p-4 sticky top-0 z-10 flex items-center justify-between">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-muted hover:text-accent transition-colors"
                >
                    <ChevronLeft size={20} />
                    <span className="font-medium">Back to App</span>
                </button>
                <div className="text-xs text-muted font-mono bg-subtle/50 px-2 py-1 rounded">
                    {fileName}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 w-full max-w-5xl mx-auto p-4 md:p-8">
                <div
                    className="bg-white rounded-xl shadow-xl overflow-hidden border border-subtle min-h-[80vh]"
                    dangerouslySetInnerHTML={{ __html: html || '' }}
                />
            </div>

            {/* Footer */}
            <footer className="p-8 text-center text-muted text-xs">
                Archived Inventory Snapshot • Secure View
            </footer>
        </div>
    );
};
