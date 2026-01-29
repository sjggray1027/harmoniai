// Standards Document Parser
// Parses SOPs, regulatory documents, and policies into structured sections and requirements

import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import {
  StandardsDocument,
  StandardsSection,
  StandardsRequirement,
} from '@/types/standards';
import {
  createStandardsDocument,
  createStandardsSection,
  createStandardsRequirement,
} from '@/lib/models/standards';

export interface StandardsParseOptions {
  documentType?: StandardsDocument['documentType'];
  extractRequirements?: boolean;
}

/**
 * Main entry point for parsing standards documents
 */
export async function parseStandardsDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  options: StandardsParseOptions = {}
): Promise<StandardsDocument> {
  const fileType = getFileType(fileName, mimeType);

  let rawContent: string;
  let sections: StandardsSection[];

  switch (fileType) {
    case 'pdf':
      ({ rawContent, sections } = await parsePdfStandards(buffer, options));
      break;
    case 'word':
      ({ rawContent, sections } = await parseWordStandards(buffer, options));
      break;
    case 'excel':
      ({ rawContent, sections } = await parseExcelStandards(buffer, options));
      break;
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }

  const documentType = options.documentType || detectDocumentType(rawContent, fileName);
  const { title, version, effectiveDate } = extractDocumentMetadata(rawContent, fileName);

  const document = createStandardsDocument(fileName, fileType, {
    documentType,
    title,
    version,
    effectiveDate,
    sections,
    rawContent,
    confidence: calculateParseConfidence(sections),
  });

  return document;
}

/**
 * Determines file type from name and MIME type
 */
function getFileType(fileName: string, mimeType: string): 'pdf' | 'word' | 'excel' {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (extension === 'pdf' || mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (['docx', 'doc'].includes(extension || '') || mimeType.includes('word')) {
    return 'word';
  }
  if (['xlsx', 'xls'].includes(extension || '') || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return 'excel';
  }

  throw new Error(`Cannot determine file type for: ${fileName}`);
}

/**
 * Parses PDF standards documents
 */
async function parsePdfStandards(
  buffer: Buffer,
  options: StandardsParseOptions
): Promise<{ rawContent: string; sections: StandardsSection[] }> {
  // Use unpdf for reliable Node.js PDF parsing
  const { extractText } = await import('unpdf');

  const { text } = await extractText(new Uint8Array(buffer), {
    mergePages: true,
  });

  const rawContent = Array.isArray(text) ? text.join('\n\n') : text;
  const sections = extractSections(rawContent, options.extractRequirements !== false);

  return { rawContent, sections };
}

/**
 * Parses Word standards documents
 */
async function parseWordStandards(
  buffer: Buffer,
  options: StandardsParseOptions
): Promise<{ rawContent: string; sections: StandardsSection[] }> {
  const result = await mammoth.extractRawText({ buffer });
  const rawContent = result.value;

  const sections = extractSections(rawContent, options.extractRequirements !== false);

  return { rawContent, sections };
}

/**
 * Parses Excel standards documents (often used for requirement matrices)
 */
async function parseExcelStandards(
  buffer: Buffer,
  options: StandardsParseOptions
): Promise<{ rawContent: string; sections: StandardsSection[] }> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Try to find requirements sheet
  const targetSheets = ['Requirements', 'SOPs', 'Standards', 'Procedures', 'Compliance'];
  let sheetName = workbook.SheetNames[0];

  for (const target of targetSheets) {
    const found = workbook.SheetNames.find(
      name => name.toLowerCase().includes(target.toLowerCase())
    );
    if (found) {
      sheetName = found;
      break;
    }
  }

  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  const { rawContent, sections } = parseExcelRequirements(jsonData, options.extractRequirements !== false);

  return { rawContent, sections };
}

/**
 * Parses Excel data into requirements sections
 */
function parseExcelRequirements(
  data: unknown[][],
  extractRequirements: boolean
): { rawContent: string; sections: StandardsSection[] } {
  const sections: StandardsSection[] = [];
  const rawContentParts: string[] = [];

  // Find header row
  const headerRow = findExcelHeaderRow(data);
  const headers = (data[headerRow] as string[]) || [];
  const columnMap = mapExcelColumns(headers);

  let currentSection: StandardsSection | null = null;

  for (let i = headerRow + 1; i < data.length; i++) {
    const row = data[i] as (string | number | undefined)[];
    if (!row || row.every(cell => !cell)) continue;

    const sectionNum = String(row[columnMap.section] || '').trim();
    const title = String(row[columnMap.title] || row[columnMap.description] || '').trim();
    const requirement = String(row[columnMap.requirement] || row[columnMap.description] || '').trim();

    if (!requirement) continue;

    rawContentParts.push(requirement);

    // Check if this is a new section
    const isSectionHeader = sectionNum && (
      sectionNum.match(/^\d+\.?$/) ||
      sectionNum.match(/^[A-Z]\.?$/) ||
      title.length > 50
    );

    if (isSectionHeader && title) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = createStandardsSection(title, requirement, {
        sectionNumber: sectionNum,
        requirements: extractRequirements ? [createStandardsRequirement(requirement)] : [],
      });
    } else if (currentSection && extractRequirements) {
      currentSection.requirements.push(createStandardsRequirement(requirement));
    } else if (!currentSection) {
      // Create default section
      currentSection = createStandardsSection('General Requirements', '', {
        requirements: extractRequirements ? [createStandardsRequirement(requirement)] : [],
      });
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return {
    rawContent: rawContentParts.join('\n'),
    sections,
  };
}

/**
 * Finds the header row in Excel data
 */
function findExcelHeaderRow(data: unknown[][]): number {
  const headerKeywords = ['section', 'requirement', 'description', 'procedure', 'title', 'id', 'reference'];

  for (let i = 0; i < Math.min(10, data.length); i++) {
    const row = data[i] as string[];
    if (!row || row.length < 2) continue;

    const rowText = row.map(cell => String(cell || '').toLowerCase()).join(' ');
    const matches = headerKeywords.filter(kw => rowText.includes(kw));

    if (matches.length >= 2) {
      return i;
    }
  }

  return 0;
}

/**
 * Maps Excel column headers to field names
 */
function mapExcelColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {
    section: -1,
    title: -1,
    description: -1,
    requirement: -1,
    category: -1,
  };

  const mappings: [string[], keyof typeof map][] = [
    [['section', 'section #', 'sec', 'id', 'ref'], 'section'],
    [['title', 'name', 'heading'], 'title'],
    [['description', 'desc', 'text', 'content'], 'description'],
    [['requirement', 'req', 'shall', 'procedure'], 'requirement'],
    [['category', 'type', 'class'], 'category'],
  ];

  headers.forEach((header, index) => {
    const headerLower = String(header || '').toLowerCase();
    for (const [keywords, fieldName] of mappings) {
      if (keywords.some(kw => headerLower.includes(kw))) {
        if (map[fieldName] === -1) {
          map[fieldName] = index;
        }
        break;
      }
    }
  });

  // Default fallbacks
  if (map.section === -1) map.section = 0;
  if (map.description === -1) map.description = 1;
  if (map.requirement === -1) map.requirement = map.description;

  return map;
}

/**
 * Extracts sections from document text
 */
function extractSections(text: string, extractRequirements: boolean): StandardsSection[] {
  const sections: StandardsSection[] = [];
  const lines = text.split('\n');

  // Section header patterns
  const sectionPatterns = [
    /^(\d+(?:\.\d+)*)\s+(.+)$/,           // 1.0 Section Title or 1.2.3 Section Title
    /^Section\s+(\d+(?:\.\d+)*):?\s+(.+)$/i,  // Section 1: Title
    /^([A-Z])\.\s+(.+)$/,                  // A. Section Title
    /^([IVXLCDM]+)\.\s+(.+)$/,             // Roman numerals
    /^(Purpose|Scope|Procedure|Responsibilities|References|Definitions|Requirements):?$/i,
  ];

  let currentSection: StandardsSection | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    // Check if this line is a section header
    let isHeader = false;
    let sectionNumber = '';
    let sectionTitle = '';

    for (const pattern of sectionPatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        isHeader = true;
        if (match.length === 3) {
          sectionNumber = match[1];
          sectionTitle = match[2];
        } else {
          sectionTitle = match[1] || trimmedLine;
        }
        break;
      }
    }

    if (isHeader) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join('\n');
        if (extractRequirements) {
          currentSection.requirements = extractRequirementsFromText(currentSection.content);
        }
        sections.push(currentSection);
      }

      // Start new section
      currentSection = createStandardsSection(sectionTitle, '', {
        sectionNumber: sectionNumber || undefined,
      });
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(trimmedLine);
    } else {
      // Content before first section - create a default section
      currentSection = createStandardsSection('Document Content', '', {});
      currentContent = [trimmedLine];
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n');
    if (extractRequirements) {
      currentSection.requirements = extractRequirementsFromText(currentSection.content);
    }
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Extracts requirements from section text
 */
function extractRequirementsFromText(text: string): StandardsRequirement[] {
  const requirements: StandardsRequirement[] = [];
  const sentences = text.split(/[.;]\s+/);

  // Requirement indicators
  const requirementIndicators = [
    /\bshall\b/i,
    /\bmust\b/i,
    /\bshould\b/i,
    /\bis required\b/i,
    /\bare required\b/i,
    /\bmay not\b/i,
    /\bwill be\b/i,
    /\bverify\b/i,
    /\bensure\b/i,
    /\bdocument\b/i,
    /\brecord\b/i,
    /\bsign\b/i,
    /\breview\b/i,
    /\bapprove\b/i,
  ];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 10) continue;

    // Check if sentence contains a requirement indicator
    const hasIndicator = requirementIndicators.some(pattern => pattern.test(trimmed));

    if (hasIndicator) {
      requirements.push(createStandardsRequirement(trimmed));
    }
  }

  return requirements;
}

/**
 * Detects document type from content and filename
 */
function detectDocumentType(content: string, fileName: string): StandardsDocument['documentType'] {
  const lowerContent = content.toLowerCase();
  const lowerFileName = fileName.toLowerCase();

  // Check filename first
  if (lowerFileName.includes('sop') || lowerFileName.includes('procedure')) {
    return 'sop';
  }
  if (lowerFileName.includes('policy') || lowerFileName.includes('pol-')) {
    return 'policy';
  }
  if (lowerFileName.includes('guideline') || lowerFileName.includes('guide')) {
    return 'guideline';
  }
  if (lowerFileName.includes('cfr') || lowerFileName.includes('fda') || lowerFileName.includes('ich')) {
    return 'regulatory';
  }

  // Check content
  if (lowerContent.includes('standard operating procedure') || lowerContent.includes('sop-')) {
    return 'sop';
  }
  if (lowerContent.includes('21 cfr') || lowerContent.includes('federal register') || lowerContent.includes('regulation')) {
    return 'regulatory';
  }
  if (lowerContent.includes('policy statement') || lowerContent.includes('company policy')) {
    return 'policy';
  }
  if (lowerContent.includes('guidance') || lowerContent.includes('guideline')) {
    return 'guideline';
  }

  return 'other';
}

/**
 * Extracts document metadata from content
 */
function extractDocumentMetadata(
  content: string,
  fileName: string
): { title?: string; version?: string; effectiveDate?: string } {
  const lines = content.split('\n').slice(0, 50); // Check first 50 lines

  let title: string | undefined;
  let version: string | undefined;
  let effectiveDate: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Title patterns
    if (!title) {
      if (trimmed.match(/^(SOP|PROCEDURE|POLICY|GUIDELINE):\s*(.+)/i)) {
        title = trimmed;
      } else if (trimmed.match(/^Title:\s*(.+)/i)) {
        title = trimmed.replace(/^Title:\s*/i, '');
      }
    }

    // Version patterns
    if (!version) {
      const versionMatch = trimmed.match(/(?:Version|Rev(?:ision)?|Ver)[\s.:]*(\d+(?:\.\d+)*)/i);
      if (versionMatch) {
        version = versionMatch[1];
      }
    }

    // Date patterns
    if (!effectiveDate) {
      const dateMatch = trimmed.match(/(?:Effective|Date|Issued)[\s.:]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i);
      if (dateMatch) {
        effectiveDate = dateMatch[1];
      }
    }
  }

  // Fallback title from filename
  if (!title) {
    title = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  }

  return { title, version, effectiveDate };
}

/**
 * Calculates parsing confidence based on extracted sections
 */
function calculateParseConfidence(sections: StandardsSection[]): number {
  if (sections.length === 0) return 0.3;

  let confidence = 0.5;

  // More sections = higher confidence
  if (sections.length >= 3) confidence += 0.1;
  if (sections.length >= 5) confidence += 0.1;

  // Sections with requirements = higher confidence
  const sectionsWithRequirements = sections.filter(s => s.requirements.length > 0);
  if (sectionsWithRequirements.length > 0) confidence += 0.15;

  // Section numbers present = higher confidence
  const sectionsWithNumbers = sections.filter(s => s.sectionNumber);
  if (sectionsWithNumbers.length > 0) confidence += 0.1;

  return Math.min(1, confidence);
}
