import { ParsedDocument } from '@/types/workflow';
import { parseExcelFile, ExcelParseOptions } from './excel-parser';
import { parseWordFile, WordParseOptions } from './word-parser';
import { parsePdfFile, PdfParseOptions } from './pdf-parser';

export type ParseOptions = ExcelParseOptions | WordParseOptions | PdfParseOptions;

export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  options?: ParseOptions
): Promise<ParsedDocument> {
  const fileExtension = fileName.split('.').pop()?.toLowerCase();

  // Determine file type from mime type or extension
  if (
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    fileExtension === 'xlsx' ||
    fileExtension === 'xls'
  ) {
    return parseExcelFile(buffer, fileName, options as ExcelParseOptions);
  }

  if (
    mimeType.includes('word') ||
    mimeType.includes('document') ||
    fileExtension === 'docx' ||
    fileExtension === 'doc'
  ) {
    return parseWordFile(buffer, fileName, options as WordParseOptions);
  }

  if (mimeType === 'application/pdf' || fileExtension === 'pdf') {
    return parsePdfFile(buffer, fileName, options as PdfParseOptions);
  }

  throw new Error(`Unsupported file type: ${mimeType} (${fileExtension})`);
}

export { parseExcelFile } from './excel-parser';
export { parseWordFile } from './word-parser';
export { parsePdfFile } from './pdf-parser';
export { parseStandardsDocument } from './standards-parser';
