"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Upload, X, Loader2, Camera, FlipHorizontal, RefreshCw, Plus } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { compressImage } from "@/lib/client-image-compress";

interface UploadedImage {
  id: string;
  url: string;
  side: "FRONT" | "BACK";
}

interface DailyCreditStatus {
  limit: number | null;
  remaining: number | null;
  isUnlimited: boolean;
}

type Phase = "idle" | "processing" | "front-done" | "processing-back" | "both-done";

interface CardUploadProps {
  onUploadComplete: (frontId?: string, backId?: string, source?: string) => Promise<void> | void;
  onClose: () => void;
  creditStatus: DailyCreditStatus | null;
  initialSource?: string;
  title?: string;
  submitLabel?: string;
}

export function CardUpload({
  onUploadComplete,
  onClose,
  creditStatus,
  initialSource,
  title,
  submitLabel,
}: CardUploadProps) {
  const t = useTranslations("cards");
  const tc = useTranslations("common");

  const [phase, setPhase] = useState<Phase>("idle");
  const [frontImage, setFrontImage] = useState<UploadedImage | null>(null);
  const [backImage, setBackImage] = useState<UploadedImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [source, setSource] = useState(() =>
    initialSource ??
    (typeof window === "undefined" ? "" : localStorage.getItem("cardUploadSource") || "")
  );

  // Camera state (desktop webcam modal)
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraSide, setCameraSide] = useState<"FRONT" | "BACK">("FRONT");
  const [cameraCapturing, setCameraCapturing] = useState(false);

  const frontCameraRef = useRef<HTMLInputElement>(null);
  const backCameraRef = useRef<HTMLInputElement>(null);

  const requiredCredits = (frontImage ? 1 : 0) + (backImage ? 1 : 0);
  const hasEnoughCredits =
    creditStatus?.isUnlimited ||
    !creditStatus ||
    requiredCredits === 0 ||
    (creditStatus.remaining ?? 0) >= requiredCredits;

  // Upload a file to the server (includes LLM processing)
  async function uploadFile(file: File, side: "FRONT" | "BACK"): Promise<UploadedImage> {
    // Compress image client-side before upload
    const compressedFile = await compressImage(file);

    const formData = new FormData();
    formData.append("file", compressedFile);
    formData.append("side", side);

    const res = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) {
      const code = data?.error?.code;
      throw new Error(data?.error?.message || `Upload failed (${code})`);
    }

    return { id: data.id, url: `/api/images/${data.id}`, side };
  }

  // Delete an orphan image from the server
  async function deleteImage(id: string) {
    await fetch(`/api/upload/${id}`, { method: "DELETE" }).catch(() => {});
  }

  // Handle file selection (from dropzone or camera)
  const processFile = useCallback(async (file: File, side: "FRONT" | "BACK") => {
    setError(null);
    setPhase(side === "FRONT" ? "processing" : "processing-back");

    try {
      const result = await uploadFile(file, side);
      if (side === "FRONT") {
        setFrontImage(result);
        setPhase("front-done");
      } else {
        setBackImage(result);
        setPhase("both-done");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      setError(msg);
      // Return to appropriate phase
      if (side === "BACK" && frontImage) {
        setPhase("front-done");
      } else {
        setPhase("idle");
      }
    }
  }, [frontImage]);

  // Handle mobile native camera input
  function handleCameraInput(side: "FRONT" | "BACK", e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file, side);
    e.target.value = "";
  }

  // Open camera: mobile uses native input, desktop uses webcam modal
  function openCamera(side: "FRONT" | "BACK") {
    const isMobile =
      typeof navigator !== "undefined" &&
      /Mobi|Android/i.test(navigator.userAgent);

    if (isMobile) {
      // Mobile: trigger native camera via hidden input
      const ref = side === "FRONT" ? frontCameraRef : backCameraRef;
      ref.current?.click();
    } else {
      // Desktop: open webcam modal (CameraCapture handles unavailable-camera error)
      setCameraSide(side);
      setCameraOpen(true);
    }
  }

  // Delete processed image and go back
  async function handleDeleteImage(side: "FRONT" | "BACK") {
    if (side === "FRONT" && frontImage) {
      await deleteImage(frontImage.id);
      setFrontImage(null);
      // If back exists, it becomes the "front"
      if (backImage) {
        setFrontImage(backImage);
        setBackImage(null);
        setPhase("front-done");
      } else {
        setPhase("idle");
      }
    } else if (side === "BACK" && backImage) {
      await deleteImage(backImage.id);
      setBackImage(null);
      setPhase("front-done");
    }
  }

  // Submit: create card and navigate
  async function handleSubmit() {
    if (!frontImage && !backImage) return;
    if (!hasEnoughCredits) {
      setError(t("creditLimitExceeded"));
      return;
    }

    setSubmitting(true);
    try {
      // Save source to localStorage for next upload
      localStorage.setItem("cardUploadSource", source);
      await onUploadComplete(frontImage?.id, backImage?.id, source || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : tc("error"));
      setSubmitting(false);
    }
  }

  // Dropzone for initial upload (IDLE state)
  const {
    getRootProps: getInitialRootProps,
    getInputProps: getInitialInputProps,
    isDragActive: isInitialDrag,
  } = useDropzone({
    onDrop: (files) => { if (files[0]) processFile(files[0], "FRONT"); },
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".heic", ".webp"] },
    maxFiles: 1,
    multiple: false,
    disabled: phase !== "idle",
  });

  // Dropzone for back side upload
  const {
    getRootProps: getBackRootProps,
    getInputProps: getBackInputProps,
    isDragActive: isBackDrag,
  } = useDropzone({
    onDrop: (files) => { if (files[0]) processFile(files[0], "BACK"); },
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".heic", ".webp"] },
    maxFiles: 1,
    multiple: false,
    disabled: phase !== "front-done",
  });

  // Hidden mobile camera inputs
  const hiddenInputs = (
    <>
      <input
        ref={frontCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleCameraInput("FRONT", e)}
      />
      <input
        ref={backCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleCameraInput("BACK", e)}
      />
    </>
  );

  // Compact upload dropzone
  const renderDropzone = (
    rootProps: ReturnType<typeof getInitialRootProps>,
    inputProps: ReturnType<typeof getInitialInputProps>,
    isDrag: boolean,
    cameraSide: "FRONT" | "BACK"
  ) => (
    <div className="space-y-2">
      <div
        {...rootProps}
        className={`h-48 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors ${
          isDrag ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input {...inputProps} />
        <Upload className="w-7 h-7 text-gray-400 mb-2" />
        <p className="text-sm text-gray-500">{t("uploadHint")}</p>
      </div>
      <button
        onClick={() => openCamera(cameraSide)}
        className="w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
      >
        <Camera className="w-4 h-4" />
        {t("takePhoto")}
      </button>
    </div>
  );

  // Processing spinner
  const renderProcessing = () => (
    <div className="h-48 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center bg-gray-50">
      <Loader2 className="w-7 h-7 animate-spin text-blue-500 mb-2" />
      <p className="text-sm text-gray-500">{t("processingImage")}</p>
    </div>
  );

  // Processed image preview with X button
  const renderImagePreview = (img: UploadedImage, onDelete: () => void) => (
    <div className="relative aspect-[3/2] rounded-lg overflow-hidden border border-gray-200">
      <img src={img.url} alt={img.side} className="w-full h-full object-cover" />
      <button
        onClick={onDelete}
        className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
      >
        <X className="w-4 h-4 text-white" />
      </button>
    </div>
  );

  const renderCreditStatus = () => {
    if (!creditStatus) return null;

    return (
      <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
        {creditStatus.isUnlimited
          ? t("creditsUnlimited")
          : t("creditsRemaining", {
              remaining: creditStatus.remaining ?? 0,
              limit: creditStatus.limit ?? 0,
            })}
      </div>
    );
  };

  const renderCreditWarning = () => {
    if (hasEnoughCredits || requiredCredits === 0) return null;

    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        {t("creditLimitExceeded")}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
      {hiddenInputs}
      {renderCreditStatus()}

      {/* IDLE: compact single dropzone */}
      {phase === "idle" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700">{title || t("upload")}</h3>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          {/* Source input */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">{t("source")}</label>
            <textarea
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t("sourcePlaceholder")}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>
          {renderDropzone(getInitialRootProps(), getInitialInputProps(), isInitialDrag, "FRONT")}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600 flex-1">{error}</p>
              <button
                onClick={() => { setError(null); setPhase("idle"); }}
                className="shrink-0 px-3 py-1 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-100 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("tryAgain")}
              </button>
            </div>
          )}
        </div>
      )}

      {/* PROCESSING: front side being processed */}
      {phase === "processing" && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">{title || t("upload")}</h3>
          {renderProcessing()}
        </div>
      )}

      {/* FRONT_DONE: front processed, option to add back */}
      {phase === "front-done" && frontImage && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("front")}</span>
          </div>
          {renderImagePreview(frontImage, () => handleDeleteImage("FRONT"))}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600 flex-1">{error}</p>
              <button
                onClick={() => setError(null)}
                className="shrink-0 px-3 py-1 text-sm text-red-700 border border-red-300 rounded-lg hover:bg-red-100 flex items-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("tryAgain")}
              </button>
            </div>
          )}

          {/* Upload other side */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">{t("uploadOtherSide")}</p>
            {renderDropzone(getBackRootProps(), getBackInputProps(), isBackDrag, "BACK")}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={handleSubmit}
              disabled={submitting || !hasEnoughCredits}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitLabel || t("startUpload")}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              {tc("cancel")}
            </button>
          </div>
          {renderCreditWarning()}
        </div>
      )}

      {/* PROCESSING_BACK: back side being processed */}
      {phase === "processing-back" && frontImage && (
        <div className="space-y-4">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("front")}</span>
            <div className="mt-2">{renderImagePreview(frontImage, () => {})}</div>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("back")}</span>
            <div className="mt-2">{renderProcessing()}</div>
          </div>
        </div>
      )}

      {/* BOTH_DONE: both sides processed */}
      {phase === "both-done" && frontImage && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("front")}</span>
              <div className="mt-2">{renderImagePreview(frontImage, () => handleDeleteImage("FRONT"))}</div>
            </div>
            {backImage ? (
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("back")}</span>
                <div className="mt-2">{renderImagePreview(backImage, () => handleDeleteImage("BACK"))}</div>
              </div>
            ) : (
              <div>
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{t("back")}</span>
                <div className="mt-2 h-24 border-2 border-dashed border-gray-200 rounded-lg flex items-center justify-center">
                  <button
                    onClick={() => setPhase("front-done")}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={handleSubmit}
              disabled={submitting || !hasEnoughCredits}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitLabel || t("startUpload")}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
            >
              {tc("cancel")}
            </button>
          </div>
          {renderCreditWarning()}
        </div>
      )}

      {/* Desktop webcam capture modal */}
      {cameraOpen && (
        <CameraCapture
          side={cameraSide}
          onCapture={async (file) => {
            setCameraCapturing(true);
            await processFile(file, cameraSide);
            setCameraCapturing(false);
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
          capturing={cameraCapturing}
          sideLabel={cameraSide === "FRONT" ? t("front") : t("back")}
        />
      )}
    </div>
  );
}

/* ─── CameraCapture sub-component (desktop webcam) ─── */

function CameraCapture({
  side,
  onCapture,
  onClose,
  capturing,
  sideLabel,
}: {
  side: "FRONT" | "BACK";
  onCapture: (file: File) => void;
  onClose: () => void;
  capturing: boolean;
  sideLabel: string;
}) {
  const t = useTranslations("cards");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setCameraError("Camera API not available in this context");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setReady(true);
      }
    } catch (e) {
      setCameraError(e instanceof Error ? e.message : "Failed to access camera");
    }
  }, [facingMode]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [startCamera]);

  function handleCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `card-${side}-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        onCapture(file);
      },
      "image/jpeg",
      0.9
    );
  }

  function toggleCamera() {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h3 className="font-medium text-gray-900">
            {t("takePhoto")} - {sideLabel}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="relative bg-black aspect-[3/2]">
          {cameraError ? (
            <div className="w-full h-full flex items-center justify-center text-white text-sm p-4 text-center">
              {cameraError}
            </div>
          ) : (
            <>
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              {!ready && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex items-center justify-center gap-4 p-4">
          <button onClick={toggleCamera} className="p-3 border border-gray-300 rounded-full hover:bg-gray-50">
            <FlipHorizontal className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={handleCapture}
            disabled={!ready || capturing}
            className="w-16 h-16 bg-blue-600 rounded-full hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
          >
            {capturing ? (
              <Loader2 className="w-6 h-6 animate-spin text-white" />
            ) : (
              <Camera className="w-7 h-7 text-white" />
            )}
          </button>
          <button onClick={onClose} className="p-3 border border-gray-300 rounded-full hover:bg-gray-50">
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  );
}
