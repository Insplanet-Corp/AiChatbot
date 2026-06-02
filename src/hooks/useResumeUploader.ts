import { useState, useRef, useCallback } from "react";

interface ResumeUploadMutation {
  reset: () => void;
  mutate: (
    file: File,
    callbacks: { onSuccess: () => void; onError: () => void },
  ) => void;
}

/**
 * 이력서 파일 업로드 관심사를 담당하는 훅.
 * 여러 파일을 순차 업로드하며 진행률(uploadProgress)과 재시도(handleRetry)를 제공한다.
 */
export const useResumeUploader = (resumeUpload: ResumeUploadMutation) => {
  const [lastDroppedFiles, setLastDroppedFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<
    { current: number; total: number } | undefined
  >(undefined);
  const isUploadingRef = useRef(false);

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (isUploadingRef.current) return;
      isUploadingRef.current = true;
      setUploadProgress({ current: 0, total: files.length });

      for (let i = 0; i < files.length; i++) {
        setUploadProgress({ current: i + 1, total: files.length });
        resumeUpload.reset();
        await new Promise<void>((resolve, reject) => {
          resumeUpload.mutate(files[i], {
            onSuccess: () => resolve(),
            onError: () => reject(new Error(`파일 ${files[i].name} 업로드 실패`)),
          });
        });
      }

      isUploadingRef.current = false;
      setUploadProgress(undefined);
    },
    [resumeUpload],
  );

  const handleFileDrop = useCallback(
    async (files: File[]) => {
      setLastDroppedFiles(files);
      try {
        await uploadFiles(files);
      } catch {
        isUploadingRef.current = false;
        setUploadProgress(undefined);
      }
    },
    [uploadFiles],
  );

  const handleRetry = useCallback(() => {
    if (!lastDroppedFiles.length) return;
    uploadFiles(lastDroppedFiles).catch(() => {});
  }, [lastDroppedFiles, uploadFiles]);

  return { handleFileDrop, handleRetry, uploadProgress };
};
