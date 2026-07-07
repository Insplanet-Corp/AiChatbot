import * as mammoth from "mammoth";
import * as XLSX from "xlsx";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// 이미지형(스캔) PDF 폴백 OCR: 각 페이지를 canvas 로 렌더해 Tesseract.js(WASM)로 인식한다.
// GPU/Ollama 를 쓰지 않으므로 gemma↔qwen 모델 스왑 없이 브라우저에서 바로 동작한다.
// 언어 데이터(kor/eng)는 기본 CDN(jsDelivr)에서 받는다 — 외부망 차단(오프라인) 환경이면
// createWorker 에 { langPath, corePath, workerPath } 로 로컬 호스팅 경로를 지정해야 한다.
// (대부분의 PDF 는 텍스트 레이어가 있어 OCR 을 타지 않으므로 tesseract.js 는 동적 import 한다.)
const extractPdfTextViaOcr = async (pdf: any): Promise<string> => {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("kor+eng");
  try {
    let ocrText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2.5 }); // 해상도 ↑ → 한글 인식률 ↑
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext("2d");
      if (!context) continue;
      await page.render({ canvasContext: context, viewport }).promise;
      const { data } = await worker.recognize(canvas);
      ocrText += data.text + "\n";
      canvas.width = canvas.height = 0; // 캔버스 메모리 즉시 해제
    }
    return ocrText.trim();
  } finally {
    await worker.terminate();
  }
};

// PDF 텍스트 아이템을 좌표 기반으로 마크다운형 구조로 재구성.
// (기존 join(" ") 방식은 페이지 전체를 한 줄로 뭉개 줄/표 구조가 사라졌고,
//  프롬프트의 "라벨 다음 줄 값·헤더 다음 줄 행" 규칙이 동작할 수 없었다)
// - 같은 Y 좌표(±글자높이 절반)의 아이템 → 한 줄로 묶음
// - 줄 안에서 글자높이 1.5배 이상 수평 간격 → 표의 열 경계로 보고 " | " 삽입
// - 셀 텍스트가 줄바꿈된 표 행(열 x좌표가 이전 행과 정렬 + 수직 간격 좁음) → 셀 단위 병합
// - 줄 사이 수직 간격이 글자높이 2.2배 이상 → 문단/섹션 경계로 보고 빈 줄 삽입
// (scripts/testParseLocal.mjs · seedResumesToDB.mjs 에 동일 로직 있음 — 수정 시 함께 변경)
const reconstructPdfPageText = (textContent: { items: any[] }): string => {
  type Positioned = { str: string; x: number; y: number; w: number; h: number };
  type Cell = { x: number; end: number; text: string };
  const items: Positioned[] = textContent.items
    .filter((it: any) => it.str && it.str.trim())
    .map((it: any) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      w: it.width,
      h: it.height || Math.abs(it.transform[3]) || 10,
    }));
  if (items.length === 0) return "";

  // 위→아래(y 내림차순 — PDF 좌표는 아래가 원점), 왼→오 정렬 후 같은 높이끼리 줄로 묶음
  items.sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Positioned[][] = [[items[0]]];
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const line = lines[lines.length - 1];
    if (Math.abs(line[0].y - item.y) <= Math.max(item.h, line[0].h) * 0.5) {
      line.push(item);
    } else {
      lines.push([item]);
    }
  }

  const avgH = items.reduce((sum, it) => sum + it.h, 0) / items.length;

  // 각 줄을 셀 목록으로 변환 (수평 간격 1.5배 이상 = 열 경계)
  const rows = lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    const cells: Cell[] = [];
    let cur: Cell | null = null;
    for (const it of line) {
      if (cur && it.x - cur.end <= avgH * 1.5) {
        const gap = it.x - cur.end;
        const needSpace =
          gap > avgH * 0.15 && !cur.text.endsWith(" ") && !it.str.startsWith(" ");
        cur.text += (needSpace ? " " : "") + it.str;
        cur.end = it.x + it.w;
      } else {
        cur = { x: it.x, end: it.x + it.w, text: it.str };
        cells.push(cur);
      }
    }
    return { y: line[0].y, cells };
  });

  // 한글/한자 경계에서 줄바꿈된 단어는 공백 없이 이어붙임 ("포인트 적립 시"+"스템 개편")
  const joinWrapped = (a: string, b: string): string =>
    /[가-힣一-龥]$/.test(a) && /^[가-힣一-龥]/.test(b) ? a + b : `${a} ${b}`;

  // 줄바꿈된 표 행 병합. 두 가지 신호를 본다:
  // (a) 같은 행 안에서 세로 중앙정렬로 갈라진 줄 — 간격이 글자높이보다 훨씬 좁다(0.8배 미만).
  //     일반 본문 줄 간격은 최소 1em 이상이므로 이 간격은 같은 표 행에서만 나온다.
  // (b) 셀 텍스트 줄바꿈 — 줄 간격 수준(1.9배 미만)이고 모든 셀 x가 이전 행 셀과 정렬.
  const merged: typeof rows = [];
  for (const row of rows) {
    const prev = merged[merged.length - 1];
    const gap = prev !== undefined ? prev.y - row.y : Infinity;
    const sameRow = prev !== undefined && prev.cells.length >= 2 && gap < avgH * 0.8;
    const wrappedLine =
      prev !== undefined &&
      prev.cells.length >= 3 &&
      row.cells.length >= 2 &&
      row.cells.length <= prev.cells.length &&
      gap < avgH * 1.9 &&
      row.cells.every((c) => prev.cells.some((pc) => Math.abs(pc.x - c.x) < avgH));
    if (sameRow || wrappedLine) {
      for (const c of row.cells) {
        const target = prev!.cells.find((pc) => Math.abs(pc.x - c.x) < avgH);
        if (target) {
          target.text = joinWrapped(target.text, c.text);
        } else {
          prev!.cells.push({ ...c }); // 새 열 위치면 x 순서에 맞게 셀로 삽입
          prev!.cells.sort((a, b) => a.x - b.x);
        }
      }
      prev!.y = row.y; // 3줄 이상 이어지는 행도 연속 병합되도록 기준 y 갱신
    } else {
      merged.push(row);
    }
  }

  let out = "";
  let prevY: number | null = null;
  for (const row of merged) {
    if (prevY !== null && prevY - row.y > avgH * 2.2) out += "\n";
    out += row.cells.map((c) => c.text.trim()).join(" | ") + "\n";
    prevY = row.y;
  }
  return out.trim();
};

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
        fullText += reconstructPdfPageText(textContent) + "\n\n";
      }
      fullText = fullText.trim();
      // 텍스트 레이어가 충분하면 그대로 사용(빠름). 너무 짧으면 이미지형으로 보고 OCR 폴백.
      if (fullText.length >= 100) return fullText;

      // 이미지형(스캔) PDF → Tesseract.js OCR (GPU/모델 스왑 불필요). 더 풍부한 쪽을 채택.
      const ocrText = await extractPdfTextViaOcr(pdf);
      const best = ocrText.length > fullText.length ? ocrText : fullText;
      if (best) return best;

      // OCR 까지 했는데도 글자가 전혀 안 나오는 PDF(빈 파일/극저화질 스캔)
      throw new Error(
        "PDF에서 텍스트를 읽을 수 없습니다. 스캔 품질이 낮거나 빈 PDF일 수 있습니다. 더 선명한 파일 또는 .docx 형식으로 변환 후 업로드해 주세요.",
      );
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
