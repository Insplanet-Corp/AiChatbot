import { useState, DragEvent, ReactNode } from "react";
import { SERVICE_NAME } from "../constants/service";

interface DragDropWrapperProps {
  children: ReactNode;
  onFileDrop: (file: File) => void;
  isUploading?: boolean;
  uploadError?: boolean;
  onRetry?: () => void;
}

export default function DragDropWrapper({
  children,
  onFileDrop,
  isUploading = false,
  uploadError = false,
  onRetry,
}: DragDropWrapperProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isUploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFileDrop(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ position: "relative", width: "100%" }}
    >
      {/* 업로드 실패 오버레이 */}
      {uploadError && !isUploading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            backdropFilter: "blur(4px)",
          }}
        >
          <div style={{ fontSize: "2rem" }}>⚠️</div>
          <div style={{ fontWeight: "bold", color: "#dc2626", fontSize: "14px" }}>
            이력서 업로드에 실패했습니다
          </div>
          <div style={{ color: "#6b7280", fontSize: "12px" }}>
            파일을 다시 업로드하거나 재시도해 주세요.
          </div>
          <button
            onClick={onRetry}
            style={{
              marginTop: "4px",
              padding: "8px 20px",
              backgroundColor: "#111827",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              fontSize: "13px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            재시도
          </button>
        </div>
      )}

      {/* 업로드 중 오버레이 */}
      {isUploading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            backgroundColor: "rgba(255, 255, 255, 0.92)",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            backdropFilter: "blur(4px)",
            margin: "0 0",
          }}
        >
          <Spinner />
          <div style={{ fontWeight: "bold", color: "#374151", fontSize: "14px" }}>
            이력서 분석 중...
          </div>
          <div style={{ color: "#6b7280", fontSize: "12px" }}>
            {SERVICE_NAME}이 이력서를 읽고 있습니다. 잠시만 기다려주세요.
          </div>
        </div>
      )}

      {/* 드래그 시 오버레이 */}
      {isDragging && !isUploading && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            backgroundColor: "rgba(255, 255, 255, 0.95)",
            border: "2px dashed #007bff",
            borderRadius: "12px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            color: "#007bff",
            backdropFilter: "blur(4px)",
            margin: "20px 60px",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>📂</div>
          <div style={{ fontWeight: "bold" }}>파일을 여기에 놓아주세요</div>
        </div>
      )}

      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div
      style={{
        width: "36px",
        height: "36px",
        border: "3px solid #e5e7eb",
        borderTop: "3px solid #111827",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }}
    >
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
