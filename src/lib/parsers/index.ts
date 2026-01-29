import { ParsedDocument } from '@/types/workflow';
import { parseExcelFile, ExcelParseOptions } from './excel-parser';
import { parseWordFile, WordParseOptions } from './word-parser';
import { parsePdfFile, PdfParseOptions } from './pdf-parser';
import { parseXmlFile, XmlParseOptions } from './xml-parser';

export type ParseOptions = ExcelParseOptions | WordParseOptions | PdfParseOptions | XmlParseOptions;

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

  if (
    mimeType === 'application/xml' ||
    mimeType === 'text/xml' ||
    fileExtension === 'xml'
  ) {
    return parseXmlFile(buffer, fileName, options as XmlParseOptions);
  }

  throw new Error(`Unsupported file type: ${mimeType} (${fileExtension})`);
}

export { parseExcelFile } from './excel-parser';
export { parseWordFile } from './word-parser';
export { parsePdfFile } from './pdf-parser';
export { parseXmlFile } from './xml-parser';
export { parseStandardsDocument } from './standards-parser';
