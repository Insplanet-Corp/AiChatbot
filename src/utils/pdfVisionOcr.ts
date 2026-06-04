import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { askOllama } from "../apis/ollama";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// OCR(이미지→텍스트)용 비전 모델. 전용 모델을 지정하지 않으면 텍스트 모델로 폴백.
// 주의: 이 모델은 실제로 이미지를 읽는 vision 모델이어야 한다 (예: qwen2.5vl).
const VISION_MODEL =
  import.meta.env.VITE_LLAMA_VISION_MODEL || import.meta.env.VITE_LLAMA_TEXT_MODEL;

const OCR_PROMPT =
  "이 이미지는 이력서 또는 포트폴리오의 한 페이지입니다. " +
  "페이지에 보이는 모든 글자를 빠짐없이 읽어 원문 그대로 출력하세요. " +
  "표는 줄 단위로 풀어 쓰고, 설명·요약·번역·코멘트 없이 추출한 텍스트만 출력합니다. " +
  "글자가 전혀 없으면 아무것도 출력하지 마세요.";

// PDF 한 페이지를 캔버스로 렌더링하고 base64(PNG, data URL 접두어 제거)로 반환
const renderPageToBase64 = async (page: pdfjsLib.PDFPageProxy): Promise<string> => {
  // 긴 변이 약 1600px가 되도록 스케일 조정 (OCR 정확도 ↔ 속도 균형)
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, 1600 / Math.max(baseViewport.width, baseViewport.height));
  const viewport = page.getViewport({ scale: scale > 0 ? scale : 1 });

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스 2D 컨텍스트를 생성할 수 없습니다.");

  await page.render({ canvasContext: ctx, viewport }).promise;

  const dataUrl = canvas.toDataURL("image/png");
  canvas.width = 0; // 메모리 해제 힌트
  canvas.height = 0;
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
};

/**
 * 텍스트 레이어가 없는 이미지형 PDF를 비전 LLM(Ollama)으로 페이지별 OCR하여
 * 전체 텍스트를 추출한다. VITE_LLAMA_VISION_MODEL 이 비전(vision) 지원 모델이어야 한다.
 */
export const extractPdfTextViaVision = async (
  file: File,
  onProgress?: (current: number, total: number) => void,
): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const total = pdf.numPages;
  const pageTexts: string[] = [];

  for (let i = 1; i <= total; i++) {
    onProgress?.(i, total);
    console.log(`[비전 OCR] ${i}/${total} 페이지 처리 중...`);
    try {
      const page = await pdf.getPage(i);
      const base64 = await renderPageToBase64(page);
      const text = await askOllama(
        VISION_MODEL,
        [{ role: "user", content: OCR_PROMPT, images: [base64] }],
        false,
        { temperature: 0, num_ctx: 8192, num_predict: 4096 },
      );
      pageTexts.push(text.trim());
    } catch (e) {
      console.warn(`[비전 OCR] ${i}페이지 실패 - 건너뜀`, e);
    }
  }

  return pageTexts.filter(Boolean).join("\n\n").trim();
};
