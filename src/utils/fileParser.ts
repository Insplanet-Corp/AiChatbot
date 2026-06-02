import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

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
      return fullText.trim();
    }

    if (extension === "docx") {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value.trim();
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
