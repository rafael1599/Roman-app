import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, AlertCircle, Trash2, FileText, Plus } from 'lucide-react';
import { scanOrderImage } from '../../../services/aiScanner';
import jsPDF from 'jspdf';

/**
 * Camera Scanner Component
 * Allows scanning order invoices using camera or file upload
 * Supports multiple photos that are combined into a single PDF
 */
export default function CamScanner({ onScanComplete, onCancel }) {
    const [isScanning, setIsScanning] = useState(false);
    const [error, setError] = useState(null);
    const [photos, setPhotos] = useState([]); // Array of { id, dataUrl, file }
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    /**
     * Add a new photo to the collection
     */
    const addPhoto = (file) => {
        if (!file) return;

        setError(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            const newPhoto = {
                id: Date.now() + Math.random(),
                dataUrl: e.target.result,
                file: file
            };
            setPhotos(prev => [...prev, newPhoto]);
        };
        reader.readAsDataURL(file);
    };

    /**
     * Remove a photo from the collection
     */
    const removePhoto = (photoId) => {
        setPhotos(prev => prev.filter(p => p.id !== photoId));
    };

    /**
     * Generate PDF from all photos
     */
    const generatePDF = async () => {
        if (photos.length === 0) return null;

        return new Promise((resolve, reject) => {
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const pageWidth = pdf.internal.pageSize.getWidth();
            const margin = 10;
            const imageWidth = pageWidth - (2 * margin);
            let currentY = margin;

            let loadedImages = 0;

            photos.forEach((photo, index) => {
                const img = new Image();
                img.onload = () => {
                    const aspectRatio = img.height / img.width;
                    const imageHeight = imageWidth * aspectRatio;

                    // Add image to PDF at current Y position
                    pdf.addImage(
                        photo.dataUrl,
                        'JPEG',
                        margin,
                        currentY,
                        imageWidth,
                        imageHeight
                    );

                    currentY += imageHeight + 5; // 5mm spacing between images

                    loadedImages++;

                    // When all images are loaded, resolve with PDF blob
                    if (loadedImages === photos.length) {
                        const pdfBlob = pdf.output('blob');
                        resolve(pdfBlob);
                    }
                };
                img.onerror = () => {
                    reject(new Error(`Failed to load image ${index + 1}`));
                };
                img.src = photo.dataUrl;
            });
        });
    };

    /**
     * Process all photos: generate PDF and send to AI
     */
    const processAllPhotos = async () => {
        if (photos.length === 0) {
            setError('Please add at least one photo before scanning.');
            return;
        }

        setError(null);
        setIsScanning(true);

        try {
            // Generate PDF from all photos
            const pdfBlob = await generatePDF();

            // Create a File object from the blob
            const pdfFile = new File([pdfBlob], 'order-scan.pdf', { type: 'application/pdf' });

            // Scan PDF with AI
            const scannedItems = await scanOrderImage(pdfFile);

            if (scannedItems.length === 0) {
                throw new Error('No items detected in the images. Please try again with clearer photos.');
            }

            // Success!
            onScanComplete(scannedItems);

        } catch (err) {
            console.error('Scan error:', err);
            setError(err.message);
            setIsScanning(false);
        }
    };

    /**
     * Handle file upload
     */
    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            addPhoto(file);
        }
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    /**
     * Handle camera capture
     */
    const handleCameraCapture = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            addPhoto(file);
        }
        // Reset input so multiple photos can be taken
        e.target.value = '';
    };


    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card border-2 border-accent rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-subtle">
                    <div>
                        <h2 className="text-2xl font-bold text-accent">Scan Order - Multi Photo</h2>
                        <p className="text-muted text-sm mt-1">
                            Take multiple photos, they'll be combined into one PDF for AI analysis
                        </p>
                    </div>
                    <button
                        onClick={onCancel}
                        disabled={isScanning}
                        className="text-muted hover:text-content transition-colors disabled:opacity-50"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Photo Gallery */}
                    {photos.length > 0 && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="text-content font-semibold">
                                    📸 Photos ({photos.length})
                                </div>
                                {!isScanning && (
                                    <button
                                        onClick={() => setPhotos([])}
                                        className="text-red-500 hover:text-red-400 text-sm transition-colors"
                                    >
                                        Clear All
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {photos.map((photo, index) => (
                                    <div key={photo.id} className="relative group">
                                        <div className="relative aspect-[3/4] rounded-lg overflow-hidden border-2 border-subtle group-hover:border-accent transition-colors">
                                            <img
                                                src={photo.dataUrl}
                                                alt={`Photo ${index + 1}`}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute top-2 left-2 bg-main/70 text-content text-xs font-bold px-2 py-1 rounded">
                                                #{index + 1}
                                            </div>
                                            {!isScanning && (
                                                <button
                                                    onClick={() => removePhoto(photo.id)}
                                                    className="absolute top-2 right-2 bg-red-500/90 hover:bg-red-500 text-white p-2 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Scanning Overlay */}
                            {isScanning && (
                                <div className="bg-main/70 border-2 border-accent rounded-lg p-6">
                                    <div className="text-center">
                                        <Loader2 className="animate-spin text-accent mx-auto mb-3" size={48} />
                                        <p className="text-accent font-semibold text-lg">
                                            Generating PDF and Scanning with AI...
                                        </p>
                                        <p className="text-muted text-sm mt-2">
                                            Processing {photos.length} photo{photos.length > 1 ? 's' : ''}
                                        </p>
                                        <div className="mt-4 flex items-center justify-center gap-2 text-muted text-sm">
                                            <FileText size={16} />
                                            <span>Creating single-page PDF...</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Process Button */}
                            {!isScanning && (
                                <button
                                    onClick={processAllPhotos}
                                    className="w-full py-4 bg-accent hover:opacity-90 text-main font-bold text-lg rounded-lg transition-all shadow-lg shadow-accent/20 flex items-center justify-center gap-3"
                                >
                                    <FileText size={24} />
                                    Process All Photos ({photos.length})
                                </button>
                            )}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
                                <div>
                                    <div className="text-red-400 font-semibold">Scan Failed</div>
                                    <div className="text-red-300/80 text-sm mt-1">{error}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons - Show when no photos */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Camera Button */}
                        <button
                            onClick={() => cameraInputRef.current?.click()}
                            disabled={isScanning}
                            className="flex flex-col items-center justify-center gap-4 p-8 bg-surface border-2 border-accent rounded-xl hover:shadow-lg hover:shadow-accent/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Camera className="text-accent" size={48} />
                            <div className="text-center">
                                <div className="text-accent font-bold text-lg">Take Photo</div>
                                <div className="text-muted text-sm mt-1">
                                    Use your device camera
                                </div>
                            </div>
                        </button>

                        {/* Upload Button */}
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isScanning}
                            className="flex flex-col items-center justify-center gap-4 p-8 bg-surface border-2 border-blue-500 rounded-xl hover:shadow-lg hover:shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Upload className="text-blue-500" size={48} />
                            <div className="text-center">
                                <div className="text-blue-500 font-bold text-lg">Upload Image</div>
                                <div className="text-muted text-sm mt-1">
                                    Select from gallery
                                </div>
                            </div>
                        </button>
                    </div>

                    {/* Add More Photos Button - Show when photos exist */}
                    {photos.length > 0 && !isScanning && (
                        <div className="grid grid-cols-2 gap-4">
                            <button
                                onClick={() => cameraInputRef.current?.click()}
                                className="flex items-center justify-center gap-2 py-3 bg-surface hover:opacity-80 text-accent rounded-lg transition-colors border border-subtle"
                            >
                                <Plus size={20} />
                                <span>Add Photo</span>
                            </button>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex items-center justify-center gap-2 py-3 bg-surface hover:opacity-80 text-blue-500 rounded-lg transition-colors border border-subtle"
                            >
                                <Plus size={20} />
                                <span>Upload Image</span>
                            </button>
                        </div>
                    )}

                    {/* Hidden File Inputs */}
                    <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleCameraCapture}
                        className="hidden"
                    />
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileUpload}
                        className="hidden"
                    />

                    {/* Tips */}
                    <div className="bg-surface/50 border border-subtle rounded-lg p-4">
                        <div className="text-accent font-semibold mb-2">📸 Tips for best results:</div>
                        <ul className="text-muted text-sm space-y-1 list-disc list-inside">
                            <li>Take multiple photos if the order is long</li>
                            <li>Ensure good lighting for each photo</li>
                            <li>Keep each section flat and in focus</li>
                            <li>Include all SKUs and quantities</li>
                            <li>Avoid shadows and glare</li>
                            <li>Photos will be combined into one PDF automatically</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

