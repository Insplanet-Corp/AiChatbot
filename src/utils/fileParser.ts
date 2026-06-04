import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { extractPdfTextViaVision } from "./pdfVisionOcr";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const extractTextFromFile = async (file: File): Promise<string> => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  try {
    if (extension === "txt") return await file.text();

    if (extension === "pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText +=
          textContent.items.map((item: any) => item.str).join(" ") + "\n";
      }
      fullText = fullText.trim();
      if (fullText) return fullText;

      // 텍스트 레이어가 없는 이미지형 PDF → 비전 LLM OCR 폴백
      console.warn("[PDF] 텍스트 레이어 없음 → 비전 OCR 폴백 실행");
      return await extractPdfTextViaVision(file);
    }

    if (extension === "docx") {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value.trim();
    }

    if (extension === "doc") {
      const arrayBuffer = await file.arrayBuffer();

      // 1차 시도: mammoth (일부 .doc는 내부적으로 docx 호환 가능)
      try {
        const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer.slice(0) });
        if (result.value.trim().length > 20) return result.value.trim();
      } catch { /* OLE 바이너리 형식 → 다음 단계로 */ }

      // 2차 시도: OLE 바이너리에서 직접 텍스트 추출
      // .doc는 OLE 복합 문서로 텍스트가 UTF-16LE(현대) 또는 EUC-KR(구형)로 저장됨
      const uint8 = new Uint8Array(arrayBuffer);
      const utf16Text = new TextDecoder("utf-16le", { fatal: false }).decode(uint8);
      const eucKrText = new TextDecoder("euc-kr",   { fatal: false }).decode(uint8);

      // 한글 글자수가 더 많은 인코딩을 선택
      const utf16KoCount = (utf16Text.match(/[가-힣]/g) ?? []).length;
      const eucKrKoCount = (eucKrText.match(/[가-힣]/g) ?? []).length;
      const decoded = eucKrKoCount > utf16KoCount ? eucKrText : utf16Text;

      // 의미 있는 텍스트 구간(한글·영문·숫자·기본 특수문자 5자 이상)만 추출
      const runs = decoded.match(
        /[가-힣a-zA-Z0-9\s.,!?\-_()\[\]:;'"+=/%&*<>]{5,}/g,
      ) ?? [];
      const extracted = runs
        .filter((r) => r.trim().length > 3)
        .join("\n")
        .replace(/[ \t]{2,}/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (extracted.length > 50) return extracted;

      throw new Error(
        ".doc 파일에서 텍스트를 읽을 수 없습니다. .docx 또는 PDF 형식으로 변환 후 업로드해 주세요.",
      );
    }

    if (extension === "xlsx" || extension === "xls") {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      let fullText = "";
      workbook.SheetNames.forEach((sheetName) => {
        const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
        fullText += `\n--- Sheet: ${sheetName} ---\n${csv}\n`;
      });
      return fullText.trim();
    }

    // if (extension === "hwp") {
    //   const arrayBuffer = await file.arrayBuffer();
    //   const { parse } = await import("hwp.js");
    //   const doc = parse(new Uint8Array(arrayBuffer), { type: "array" });
    //   let fullText = "";
    //   doc.sections.forEach((section: any) =>
    //     section.content.forEach((paragraph: any) => {
    //       paragraph.content.forEach((char: any) => {
    //         // 일반 텍스트 글자만 string 값으로 저장됨(제어문자는 number)
    //         if (typeof char.value === "string") fullText += char.value;
    //       });
    //       fullText += "\n";
    //     }),
    //   );
    //   return fullText.trim();
    // }

    throw new Error(`지원하지 않는 파일 형식: ${extension}`);
  } catch (error) {
    console.error("파일 파싱 에러:", error);
    throw error instanceof Error
      ? error
      : new Error("파일을 읽는 중 오류가 발생했습니다.");
  }
};

export { extractTextFromFile };
