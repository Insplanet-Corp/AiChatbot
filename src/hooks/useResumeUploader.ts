import { useState, useRef, useCallback } from "react";

interface ResumeUploadMutation {
  reset: () => void;
  mutate: (
    file: File,
    callbacks: { onSuccess: () => void; onError: () => void },
  ) => void;
}

export const useResumeUploader = (resumeUpload: ResumeUploadMutation) => {
  const [lastDroppedFiles, setLastDroppedFiles] = useState<File[]>([]);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<
    { current: number; total: number } | undefined
  >(undefined);
  const [currentFile, setCurrentFile] = useState<File | undefined>(undefined);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);

  const isUploadingRef = useRef(false);
  const isCancelledRef = useRef(false);
  const pendingRef = useRef<File[]>([]);
  const totalRef = useRef(0);
  const processedRef = useRef(0);
  const accumulatedFailedRef = useRef<File[]>([]);

  const runUploadLoop = useCallback(async () => {
    if (isUploadingRef.current) return;
    isUploadingRef.current = true;
    isCancelledRef.current = false;
    accumulatedFailedRef.current = [];

    while (pendingRef.current.length > 0 && !isCancelledRef.current) {
      const file = pendingRef.current.shift()!;
      processedRef.current++;
      setCurrentFile(file);
      setQueuedFiles([...pendingRef.current]);
      setUploadProgress({ current: processedRef.current, total: totalRef.current });

      resumeUpload.reset();
      try {
        await new Promise<void>((resolve, reject) => {
          resumeUpload.mutate(file, {
            onSuccess: () => resolve(),
            onError: () => reject(),
          });
        });
      } catch {
        accumulatedFailedRef.current = [...accumulatedFailedRef.current, file];
      }
    }

    const failed = accumulatedFailedRef.current;
    const successCount = processedRef.current - failed.length;

    isUploadingRef.current = false;
    totalRef.current = 0;
    processedRef.current = 0;
    accumulatedFailedRef.current = [];
    setUploadProgress(undefined);
    setCurrentFile(undefined);
    setQueuedFiles([]);

    if (isCancelledRef.current) return;

    setFailedFiles(failed);

    if (failed.length === 0) {
      alert(
        successCount > 1
          ? `이력서 ${successCount}건이 성공적으로 저장되었습니다.`
          : "이력서가 성공적으로 저장되었습니다.",
      );
    }
  }, [resumeUpload]);

  const handleCancel = useCallback(() => {
    isCancelledRef.current = true;
    pendingRef.current = [];
    setQueuedFiles([]);
  }, []);

  const handleFileDrop = useCallback(
    (files: File[]) => {
      setLastDroppedFiles(files);
      setFailedFiles([]);
      totalRef.current += files.length;
      pendingRef.current = [...pendingRef.current, ...files];
      setQueuedFiles([...pendingRef.current]);
      runUploadLoop().catch(() => {
        isUploadingRef.current = false;
        setUploadProgress(undefined);
        setCurrentFile(undefined);
        setQueuedFiles([]);
      });
    },
    [runUploadLoop],
  );

  const handleRetry = useCallback(() => {
    const toRetry = failedFiles.length > 0 ? failedFiles : lastDroppedFiles;
    if (!toRetry.length) return;
    setFailedFiles([]);
    handleFileDrop(toRetry);
  }, [failedFiles, lastDroppedFiles, handleFileDrop]);

  const handleDismiss = useCallback(() => {
    setFailedFiles([]);
  }, []);

  const isUploading = uploadProgress !== undefined;

  return {
    handleFileDrop,
    handleRetry,
    handleCancel,
    handleDismiss,
    uploadProgress,
    failedFiles,
    isUploading,
    currentFile,
    queuedFiles,
  };
};
