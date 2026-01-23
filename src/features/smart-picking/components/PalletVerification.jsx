import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { verifyPalletImage } from '../../../services/aiScanner';

/**
 * Pallet Verification Component
 * Verifies completed pallet using AI image recognition
 */
export default function PalletVerification({ expectedItems, onVerified, onCancel, palletNumber }) {
  const [isVerifying, setIsVerifying] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  /**
   * Process the pallet image
   */
  const processImage = async (file) => {
    if (!file) return;

    setError(null);
    setIsVerifying(true);
    setResult(null);

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);

    try {
      // Verify with Gemini
      const verificationResult = await verifyPalletImage(file, expectedItems);
      setResult(verificationResult);
      setIsVerifying(false);
    } catch (err) {
      console.error('Verification error:', err);
      setError(err.message);
      setIsVerifying(false);
    }
  };

  /**
   * Handle file upload
   */
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  /**
   * Handle camera capture
   */
  const handleCameraCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  /**
   * Confirm verification
   */
  const handleConfirm = () => {
    onVerified(result);
  };

  /**
   * Manual override (skip AI verification)
   */
  const handleManualConfirm = () => {
    onVerified({ manualOverride: true });
  };

  const allMatched =
    result?.matched?.every((m) => m.match) &&
    result?.missing?.length === 0 &&
    result?.extra?.length === 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border-2 border-accent rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-subtle">
          <div>
            <h2 className="text-2xl font-bold text-accent">Verify Pallet {palletNumber}</h2>
            <p className="text-muted text-sm mt-1">
              Take a photo of the completed pallet for AI verification
            </p>
          </div>
          <button
            onClick={onCancel}
            disabled={isVerifying}
            className="text-muted hover:text-content transition-colors disabled:opacity-50"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Expected Items */}
          <div className="bg-surface border border-subtle rounded-lg p-4">
            <div className="text-accent font-semibold mb-3">Expected Items:</div>
            <div className="space-y-2">
              {expectedItems.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span className="text-muted">{item.sku}</span>
                  <span className="text-accent font-mono">{item.qty} units</span>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="relative">
              <img
                src={preview}
                alt="Pallet preview"
                className="w-full rounded-lg border-2 border-accent/30"
              />
              {isVerifying && (
                <div className="absolute inset-0 bg-main/70 flex items-center justify-center rounded-lg">
                  <div className="text-center">
                    <Loader2 className="animate-spin text-accent mx-auto mb-3" size={48} />
                    <p className="text-accent font-semibold">Verifying with Gemini AI...</p>
                    <p className="text-muted text-sm mt-1">Analyzing pallet contents</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Verification Result */}
          {result && !isVerifying && (
            <div className="space-y-4">
              {/* Status Banner */}
              <div
                className={`rounded-lg p-4 border-2 ${
                  allMatched
                    ? 'bg-green-500/10 border-green-500/30'
                    : 'bg-yellow-500/10 border-yellow-500/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  {allMatched ? (
                    <CheckCircle className="text-green-500" size={24} />
                  ) : (
                    <AlertTriangle className="text-yellow-500" size={24} />
                  )}
                  <div>
                    <div
                      className={`font-bold ${allMatched ? 'text-green-500' : 'text-yellow-600'}`}
                    >
                      {allMatched ? '✓ Perfect Match!' : '⚠️ Discrepancies Detected'}
                    </div>
                    <div
                      className={`text-sm mt-1 ${allMatched ? 'text-green-600/80' : 'text-yellow-600/80'}`}
                    >
                      {allMatched
                        ? 'All items verified successfully'
                        : 'Please review the differences below'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Matched Items */}
              {result.matched.length > 0 && (
                <div className="bg-surface border border-subtle rounded-lg p-4">
                  <div className="text-accent font-semibold mb-3">Verified Items:</div>
                  <div className="space-y-2">
                    {result.matched.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-muted">{item.sku}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-accent font-mono">
                            Expected: {item.expected} | Detected: {item.detected}
                          </span>
                          {item.match ? (
                            <CheckCircle className="text-green-500" size={16} />
                          ) : (
                            <AlertTriangle className="text-yellow-500" size={16} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing Items */}
              {result.missing.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <XCircle className="text-red-400" size={20} />
                    <div className="text-red-400 font-semibold">Missing Items:</div>
                  </div>
                  <div className="space-y-2">
                    {result.missing.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-red-300">{item.sku}</span>
                        <span className="text-red-400 font-mono">{item.qty} units</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Extra Items */}
              {result.extra.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="text-yellow-400" size={20} />
                    <div className="text-yellow-400 font-semibold">Extra Items (Not Expected):</div>
                  </div>
                  <div className="space-y-2">
                    {result.extra.map((item, index) => (
                      <div key={index} className="flex justify-between text-sm">
                        <span className="text-yellow-300">{item.sku}</span>
                        <span className="text-yellow-400 font-mono">{item.qty} units</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <XCircle className="text-red-400 flex-shrink-0" size={20} />
                <div>
                  <div className="text-red-400 font-semibold">Verification Failed</div>
                  <div className="text-red-300/80 text-sm mt-1">{error}</div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          {!preview && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-4 p-8 bg-surface border-2 border-accent rounded-xl hover:shadow-lg hover:shadow-accent/20 transition-all"
              >
                <Camera className="text-accent" size={48} />
                <div className="text-center">
                  <div className="text-accent font-bold text-lg">Take Photo</div>
                  <div className="text-muted text-sm mt-1">Use camera</div>
                </div>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-4 p-8 bg-surface border-2 border-blue-500 rounded-xl hover:shadow-lg hover:shadow-blue-500/20 transition-all"
              >
                <Upload className="text-blue-500" size={48} />
                <div className="text-center">
                  <div className="text-blue-500 font-bold text-lg">Upload Image</div>
                  <div className="text-muted text-sm mt-1">From gallery</div>
                </div>
              </button>
            </div>
          )}

          {/* Confirmation Buttons */}
          {result && (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setPreview(null);
                  setResult(null);
                  setError(null);
                }}
                className="flex-1 py-3 bg-surface hover:opacity-80 text-content rounded-lg transition-colors border border-subtle"
              >
                Retake Photo
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 bg-accent text-main font-semibold rounded-lg transition-colors"
              >
                {allMatched ? 'Confirm & Continue' : 'Accept & Continue'}
              </button>
            </div>
          )}

          {/* Manual Override - Always available */}
          {!preview && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="text-yellow-600/80 text-sm mb-3">
                💡 <strong>Already verified the pallet?</strong> You can skip the photo
                verification.
              </div>
              <button
                onClick={handleManualConfirm}
                className="w-full py-3 bg-yellow-500/10 border border-yellow-500/50 hover:bg-yellow-500/20 text-yellow-600 font-semibold rounded-lg transition-colors"
              >
                Skip Photo - Confirm Manually
              </button>
            </div>
          )}

          {/* Manual Override after failed verification */}
          {(error || (result && !allMatched)) && (
            <button
              onClick={handleManualConfirm}
              className="w-full py-3 bg-yellow-500/10 border border-yellow-500/50 hover:bg-yellow-500/20 text-yellow-600 rounded-lg transition-colors"
            >
              Skip AI Verification (Manual Confirm)
            </button>
          )}

          {/* Hidden Inputs */}
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
        </div>
      </div>
    </div>
  );
}
