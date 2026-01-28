import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { ParsedDocument, ExtractedStep } from '@/types/workflow';

export interface ExcelParseOptions {
  sheetName?: string;
  headerRow?: number;
  dataStartRow?: number;
}

export async function parseExcelFile(
  buffer: Buffer,
  fileName: string,
  options: ExcelParseOptions = {}
): Promise<ParsedDocument> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });

  // Try to find the workflow sheet
  const targetSheetNames = [
    options.sheetName,
    'Pkg Flow Chart Assessment',
    'Flow Chart',
    'Workflow',
    'Process Flow',
    'MBR',
  ].filter(Boolean);

  let sheetName = workbook.SheetNames[0];
  for (const target of targetSheetNames) {
    if (target && workbook.SheetNames.includes(target)) {
      sheetName = target;
      break;
    }
  }

  const sheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

  const extractedSteps = extractWorkflowSteps(jsonData, options);

  return {
    fileName,
    fileType: 'excel',
    extractedSteps,
    rawData: { sheetName, totalRows: jsonData.length },
    parseDate: new Date().toISOString(),
    confidence: calculateConfidence(extractedSteps),
  };
}

function extractWorkflowSteps(
  data: unknown[][],
  options: ExcelParseOptions
): ExtractedStep[] {
  const steps: ExtractedStep[] = [];
  const headerRow = options.headerRow ?? findHeaderRow(data);
  const dataStartRow = options.dataStartRow ?? headerRow + 1;

  // Find column indices
  const headers = data[headerRow] as string[];
  const columnMap = mapColumns(headers);

  let currentPhase = '';

  for (let i = dataStartRow; i < data.length; i++) {
    const row = data[i] as (string | number | undefined)[];
    if (!row || row.every((cell) => !cell)) continue;

    // Check for phase headers (Set-up, Run, Line Cleanup, etc.)
    const firstCell = String(row[0] || row[1] || '').trim();
    if (isPhaseHeader(firstCell)) {
      currentPhase = firstCell;
      continue;
    }

    // Extract step data
    const step = extractStepFromRow(row, columnMap, i, currentPhase);
    if (step) {
      steps.push(step);
    }
  }

  return steps;
}

function findHeaderRow(data: unknown[][]): number {
  const headerKeywords = ['interface', 'section', 'description', 'signatures', 'notes', 'batch record'];

  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i] as string[];
    if (!row || row.length < 3) continue;

    const rowText = row.map((cell) => String(cell || '').toLowerCase()).join(' ');
    const matches = headerKeywords.filter((kw) => rowText.includes(kw));

    // Need at least 2 keyword matches to identify header row
    if (matches.length >= 2) {
      return i;
    }
  }

  return 4; // Default based on sample file structure
}

function mapColumns(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  const mappings: [string[], string][] = [
    [['notes', 'note'], 'notes'],
    [['interface', 'system', 'interface solution'], 'interface'],
    [['section #', 'section number', 'batch record section', 'id #', 'id'], 'sectionNumber'],
    [['description', 'section description', 'step', 'principles'], 'description'],
    [['clarification', 'additional', 'detail'], 'clarification'],
    [['signature', 'signatures', 'number of signatures'], 'signatures'],
    [['gap', 'question', 'comment'], 'comments'],
  ];

  headers.forEach((header, index) => {
    const headerLower = String(header || '').toLowerCase();
    for (const [keywords, fieldName] of mappings) {
      if (keywords.some((kw) => headerLower.includes(kw))) {
        // Don't overwrite if already mapped (prefer earlier matches)
        if (map[fieldName] === undefined) {
          map[fieldName] = index;
        }
        break;
      }
    }
  });

  // Debug logging for development
  console.log('Column map:', map, 'from headers:', headers);

  return map;
}

function isPhaseHeader(text: string): boolean {
  const phaseKeywords = [
    'set-up', 'setup', 'set up', 'run', 'line cleanup', 'cleanup', 'line clean-up',
    'batch record review', 'review', 'general section', 'a. general', 'b. ', 'c. ', 'd. '
  ];
  const lowerText = text.toLowerCase().trim();
  return phaseKeywords.some((kw) => lowerText === kw || lowerText.startsWith(kw));
}

function extractStepFromRow(
  row: (string | number | undefined)[],
  columnMap: Record<string, number>,
  rowIndex: number,
  currentPhase: string
): ExtractedStep | null {
  const description = String(row[columnMap.description] || '').trim();

  // Skip empty or header-like rows
  if (!description || description.length < 3) {
    return null;
  }

  const interfaceValue = String(row[columnMap.interface] || '').trim();
  const sectionNumber = String(row[columnMap.sectionNumber] || '').trim();
  const clarification = String(row[columnMap.clarification] || '').trim();
  const signatures = String(row[columnMap.signatures] || '').trim();
  const notes = String(row[columnMap.notes] || '').trim();

  // Calculate confidence based on data completeness
  let confidence = 0.5;
  if (interfaceValue) confidence += 0.15;
  if (sectionNumber) confidence += 0.15;
  if (signatures) confidence += 0.1;
  if (clarification) confidence += 0.1;

  return {
    id: uuidv4(),
    rowIndex,
    phase: currentPhase,
    interface: interfaceValue || undefined,
    sectionNumber: sectionNumber || undefined,
    description,
    clarification: clarification || undefined,
    signatures: signatures || undefined,
    rawText: notes || undefined,
    confidence,
  };
}

function calculateConfidence(steps: ExtractedStep[]): number {
  if (steps.length === 0) return 0;

  const avgConfidence = steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length;
  const hasPhases = steps.some((step) => step.phase);
  const hasInterfaces = steps.some((step) => step.interface);

  let overallConfidence = avgConfidence;
  if (hasPhases) overallConfidence += 0.1;
  if (hasInterfaces) overallConfidence += 0.1;

  return Math.min(1, overallConfidence);
}
