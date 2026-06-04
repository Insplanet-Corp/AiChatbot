import { useState, ReactNode, useRef, useEffect } from "react";
import { SERVICE_NAME } from "../constants/service";

interface DragDropWrapperProps {
  children: ReactNode;
  onFileDrop: (files: File[]) => void;
  isUploading?: boolean;
  failedFiles?: File[];
  onRetry?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  uploadProgress?: { current: number; total: number };
  currentFile?: File;
  queuedFiles?: File[];
}

export default function DragDropWrapper({
  children,
  onFileDrop,
  isUploading = false,
  failedFiles = [],
  onRetry,
  onCancel,
  onDismiss,
  uploadProgress,
  currentFile,
  queuedFiles = [],
}: DragDropWrapperProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current -= 1;
      if (dragCounterRef.current === 0) setIsDragging(false);
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        const files = Array.from(e.dataTransfer.files).slice(0, 10);
        onFileDrop(files);
      }
    };

    document.addEventListener("dragenter", handleDragEnter as EventListener);
    document.addEventListener("dragleave", handleDragLeave as EventListener);
    document.addEventListener("dragover", handleDragOver as EventListener);
    document.addEventListener("drop", handleDrop as EventListener);

    return () => {
      document.removeEventListener("dragenter", handleDragEnter as EventListener);
      document.removeEventListener("dragleave", handleDragLeave as EventListener);
      document.removeEventListener("dragover", handleDragOver as EventListener);
      document.removeEventListener("drop", handleDrop as EventListener);
    };
  }, [onFileDrop]);

  const handleNewFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).slice(0, 10);
      onFileDrop(files);
      e.target.value = "";
    }
  };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* 업로드 실패 모달 (position:fixed → 부모 높이와 무관하게 항상 전체 화면에 표시) */}
      {failedFiles.length > 0 && !isUploading && (
        <>
          {/* 백드롭 — 클릭 시 닫기 */}
          <div
            onClick={onDismiss}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 900,
              backgroundColor: "rgba(0, 0, 0, 0.35)",
              backdropFilter: "blur(2px)",
              cursor: "pointer",
            }}
          />
          {/* 카드 */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 901,
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
              padding: "32px 28px 24px",
              width: "min(420px, 90vw)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
            }}
          >
            {/* X 닫기 버튼 */}
            <button
              onClick={onDismiss}
              style={{
                position: "absolute",
                top: "14px",
                right: "14px",
                width: "28px",
                height: "28px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "6px",
                color: "#9ca3af",
                fontSize: "18px",
                lineHeight: 1,
              }}
              title="닫기"
            >
              ✕
            </button>
            <div style={{ fontSize: "2.2rem", lineHeight: 1 }}>⚠️</div>
            <div style={{ fontWeight: "700", color: "#dc2626", fontSize: "15px" }}>
              이력서 업로드에 실패했습니다
            </div>
            <div style={{ color: "#6b7280", fontSize: "13px", textAlign: "center" }}>
              다음 {failedFiles.length}건의 파일을 처리하지 못했습니다.
            </div>
            {/* 실패한 파일 목록 */}
            <ul
              style={{
                width: "100%",
                background: "#f9fafb",
                borderRadius: "8px",
                padding: "10px 14px",
                margin: 0,
                listStyle: "none",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {failedFiles.map((f) => (
                <li
                  key={f.name}
                  style={{
                    fontSize: "12px",
                    color: "#374151",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    wordBreak: "break-all",
                  }}
                >
                  <span style={{ color: "#dc2626", flexShrink: 0 }}>✕</span>
                  {f.name}
                </li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: "8px", marginTop: "8px", width: "100%" }}>
              <button
                onClick={onRetry}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  backgroundColor: "#111827",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                실패 파일만 재시도
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  backgroundColor: "#ffffff",
                  color: "#111827",
                  border: "1.5px solid #d1d5db",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                새 파일 업로드
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.hwp,.xlsx,.xls"
              multiple
              style={{ display: "none" }}
              onChange={handleNewFileSelect}
            />
          </div>
        </>
      )}

      {/* 업로드 중 토스트 (우하단 고정, 비차단) */}
      {isUploading && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 901,
            backgroundColor: "#ffffff",
            borderRadius: "12px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
            padding: "14px 16px",
            minWidth: "260px",
            maxWidth: "340px",
          }}
        >
          {/* 헤더 */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Spinner />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: "600", color: "#374151", fontSize: "13px" }}>
                {uploadProgress && uploadProgress.total > 1
                  ? `이력서 분석 중... (${uploadProgress.current}/${uploadProgress.total})`
                  : "이력서 분석 중..."}
              </div>
              {currentFile && (
                <div
                  style={{
                    color: "#6b7280",
                    fontSize: "12px",
                    marginTop: "2px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={currentFile.name}
                >
                  {currentFile.name}
                </div>
              )}
            </div>
            <button
              onClick={onCancel}
              title="취소"
              style={{
                flexShrink: 0,
                width: "24px",
                height: "24px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#9ca3af",
                fontSize: "14px",
                borderRadius: "4px",
              }}
            >
              ✕
            </button>
          </div>

          {/* 대기 중인 파일 목록 */}
          {queuedFiles.length > 0 && (
            <div
              style={{
                marginTop: "10px",
                paddingTop: "10px",
                borderTop: "1px solid #f3f4f6",
              }}
            >
              <div style={{ color: "#9ca3af", fontSize: "11px", marginBottom: "6px" }}>
                대기 중 ({queuedFiles.length}건)
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: "4px" }}>
                {queuedFiles.slice(0, 5).map((f) => (
                  <li
                    key={f.name}
                    style={{
                      fontSize: "12px",
                      color: "#6b7280",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={f.name}
                  >
                    · {f.name}
                  </li>
                ))}
                {queuedFiles.length > 5 && (
                  <li style={{ fontSize: "12px", color: "#9ca3af" }}>
                    외 {queuedFiles.length - 5}건 더...
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* 드래그 시 오버레이 (페이지 전체) */}
      {isDragging && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(255, 255, 255, 0.6)",
            border: "3px dashed #007bff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            color: "#007bff",
            backdropFilter: "blur(2px)",
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: "3rem", marginBottom: "12px" }}>📂</div>
          <div style={{ fontWeight: "bold", fontSize: "18px" }}>파일을 여기에 놓아주세요</div>
          <div style={{ fontSize: "13px", color: "#6b7280", marginTop: "6px" }}>PDF, DOC, DOCX, HWP 등 지원</div>
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
