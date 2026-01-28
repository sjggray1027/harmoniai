import mammoth from 'mammoth';
import { v4 as uuidv4 } from 'uuid';
import { ParsedDocument, ExtractedStep } from '@/types/workflow';

export interface WordParseOptions {
  extractTables?: boolean;
  extractLists?: boolean;
}

export async function parseWordFile(
  buffer: Buffer,
  fileName: string,
  options: WordParseOptions = { extractTables: true, extractLists: true }
): Promise<ParsedDocument> {
  // Extract raw text
  const textResult = await mammoth.extractRawText({ buffer });
  const text = textResult.value;

  // Extract HTML for better structure detection
  const htmlResult = await mammoth.convertToHtml({ buffer });
  const html = htmlResult.value;

  const extractedSteps = extractStepsFromContent(text, html, options);

  return {
    fileName,
    fileType: 'word',
    extractedSteps,
    rawData: {
      textLength: text.length,
      hasWarnings: textResult.messages.length > 0 || htmlResult.messages.length > 0,
    },
    parseDate: new Date().toISOString(),
    confidence: calculateConfidence(extractedSteps),
  };
}

function extractStepsFromContent(
  text: string,
  html: string,
  options: WordParseOptions
): ExtractedStep[] {
  const steps: ExtractedStep[] = [];

  // Try to extract from tables first (most structured)
  if (options.extractTables) {
    const tableSteps = extractFromTables(html);
    steps.push(...tableSteps);
  }

  // If no table data, try to extract from lists
  if (steps.length === 0 && options.extractLists) {
    const listSteps = extractFromLists(html);
    steps.push(...listSteps);
  }

  // If still no data, try to extract from text patterns
  if (steps.length === 0) {
    const textSteps = extractFromText(text);
    steps.push(...textSteps);
  }

  return steps;
}

function extractFromTables(html: string): ExtractedStep[] {
  const steps: ExtractedStep[] = [];

  // Simple table extraction using regex
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const rows: string[][] = [];

    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const rowHtml = rowMatch[1];
      const cells: string[] = [];

      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        // Strip HTML tags and clean up text
        const cellText = cellMatch[1]
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        cells.push(cellText);
      }

      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    // Process rows as workflow steps
    let currentPhase = '';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Check for phase header
      if (row.length <= 2 && isPhaseHeader(row[0])) {
        currentPhase = row[0];
        continue;
      }

      // Try to extract step data
      const step = parseTableRow(row, i, currentPhase);
      if (step) {
        steps.push(step);
      }
    }
  }

  return steps;
}

function extractFromLists(html: string): ExtractedStep[] {
  const steps: ExtractedStep[] = [];

  // Extract ordered and unordered lists
  const listItemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let sequence = 0;
  let currentPhase = '';

  let match;
  while ((match = listItemRegex.exec(html)) !== null) {
    const itemText = match[1]
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!itemText) continue;

    // Check for phase header
    if (isPhaseHeader(itemText)) {
      currentPhase = itemText;
      continue;
    }

    // Check for numbered step pattern
    const numberedMatch = itemText.match(/^(\d+\.?\s*)?(.+)$/);
    if (numberedMatch) {
      sequence++;
      steps.push({
        id: uuidv4(),
        phase: currentPhase,
        description: numberedMatch[2].trim(),
        confidence: 0.5,
      });
    }
  }

  return steps;
}

function extractFromText(text: string): ExtractedStep[] {
  const steps: ExtractedStep[] = [];
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  let currentPhase = '';
  let sequence = 0;

  for (const line of lines) {
    // Check for phase header
    if (isPhaseHeader(line)) {
      currentPhase = line;
      continue;
    }

    // Check for numbered steps
    const numberedMatch = line.match(/^(\d+)[.\)]\s*(.+)$/);
    if (numberedMatch) {
      sequence++;
      steps.push({
        id: uuidv4(),
        phase: currentPhase,
        sectionNumber: numberedMatch[1],
        description: numberedMatch[2].trim(),
        confidence: 0.4,
      });
      continue;
    }

    // Check for bullet points or dashes
    const bulletMatch = line.match(/^[-•*]\s*(.+)$/);
    if (bulletMatch && bulletMatch[1].length > 10) {
      sequence++;
      steps.push({
        id: uuidv4(),
        phase: currentPhase,
        description: bulletMatch[1].trim(),
        confidence: 0.3,
      });
    }
  }

  return steps;
}

function parseTableRow(
  row: string[],
  rowIndex: number,
  currentPhase: string
): ExtractedStep | null {
  // Skip rows that are too short or look like headers
  if (row.length < 2) return null;

  const headerKeywords = ['section', 'description', 'interface', 'signature', 'notes'];
  if (row.some((cell) => headerKeywords.some((kw) => cell.toLowerCase().includes(kw)))) {
    return null;
  }

  // Try to identify columns based on content patterns
  let description = '';
  let sectionNumber = '';
  let interfaceType = '';
  let signatures = '';

  for (const cell of row) {
    const cellLower = cell.toLowerCase();

    // Section number (numeric)
    if (/^\d{1,3}$/.test(cell.trim())) {
      sectionNumber = cell.trim();
      continue;
    }

    // Interface type
    if (cellLower === 'sap' || cellLower === 'mes' || cellLower === 'sap/mes') {
      interfaceType = cell.toUpperCase();
      continue;
    }

    // Signature count
    if (/^\d$/.test(cell.trim()) || cell.trim() === 'variable') {
      signatures = cell.trim();
      continue;
    }

    // Description (longest text field)
    if (cell.length > description.length && cell.length > 10) {
      description = cell;
    }
  }

  if (!description) return null;

  let confidence = 0.4;
  if (sectionNumber) confidence += 0.15;
  if (interfaceType) confidence += 0.2;
  if (signatures) confidence += 0.1;

  return {
    id: uuidv4(),
    rowIndex,
    phase: currentPhase,
    interface: interfaceType || undefined,
    sectionNumber: sectionNumber || undefined,
    description,
    signatures: signatures || undefined,
    confidence,
  };
}

function isPhaseHeader(text: string): boolean {
  if (!text) return false;
  const lowerText = text.toLowerCase().trim();
  const phaseKeywords = [
    'set-up', 'setup', 'set up',
    'run', 'production',
    'line cleanup', 'cleanup', 'clean-up',
    'batch record review', 'review',
    'pre-production', 'preparation'
  ];
  return phaseKeywords.some((kw) => lowerText === kw || lowerText.startsWith(kw));
}

function calculateConfidence(steps: ExtractedStep[]): number {
  if (steps.length === 0) return 0;

  const avgConfidence = steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length;
  const hasPhases = steps.some((step) => step.phase);
  const hasInterfaces = steps.some((step) => step.interface);
  const hasStructure = steps.length >= 5;

  let overall = avgConfidence;
  if (hasPhases) overall += 0.1;
  if (hasInterfaces) overall += 0.1;
  if (hasStructure) overall += 0.1;

  return Math.min(1, overall);
}
