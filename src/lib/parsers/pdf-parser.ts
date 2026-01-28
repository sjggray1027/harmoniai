import { v4 as uuidv4 } from 'uuid';
import { ParsedDocument, ExtractedStep } from '@/types/workflow';

// Note: pdf-parse has issues with Next.js edge runtime
// This parser works in Node.js API routes only

export interface PdfParseOptions {
  maxPages?: number;
}

export async function parsePdfFile(
  buffer: Buffer,
  fileName: string,
  options: PdfParseOptions = {}
): Promise<ParsedDocument> {
  // Dynamic import to avoid issues with Next.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse');

  const data = await pdfParse(buffer, {
    max: options.maxPages || 0, // 0 = all pages
  });

  const text = data.text;
  const extractedSteps = extractStepsFromPdf(text);

  return {
    fileName,
    fileType: 'pdf',
    extractedSteps,
    rawData: {
      numPages: data.numpages,
      textLength: text.length,
      info: data.info,
    },
    parseDate: new Date().toISOString(),
    confidence: calculateConfidence(extractedSteps),
  };
}

function extractStepsFromPdf(text: string): ExtractedStep[] {
  const steps: ExtractedStep[] = [];
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);

  let currentPhase = '';
  let sequence = 0;

  // Patterns for identifying workflow elements
  const phasePatterns = [
    /^(set[-\s]?up|setup)\s*$/i,
    /^(run|production)\s*$/i,
    /^(line\s*clean[-\s]?up|cleanup)\s*$/i,
    /^(batch\s*record\s*review|review)\s*$/i,
  ];

  const stepPatterns = [
    // Numbered steps: "1. Description" or "1) Description" or "Step 1: Description"
    /^(?:step\s*)?(\d+)[.\):\s]+(.+)$/i,
    // Section format: "Section 1 - Description"
    /^section\s*(\d+)\s*[-:]\s*(.+)$/i,
    // Operation format: "OP-XXX-01: Description"
    /^(OP-\w+-\d+)[:\s]+(.+)$/i,
  ];

  const interfacePatterns = [
    /\b(SAP|MES|SAP\/MES)\b/i,
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for phase headers
    if (phasePatterns.some((pattern) => pattern.test(line))) {
      currentPhase = line.replace(/[-_]/g, ' ').trim();
      continue;
    }

    // Check for longer phase header text
    if (isPhaseHeader(line)) {
      currentPhase = extractPhaseName(line);
      continue;
    }

    // Try to match step patterns
    let matched = false;
    for (const pattern of stepPatterns) {
      const match = line.match(pattern);
      if (match) {
        sequence++;
        const description = match[2].trim();

        // Try to extract interface from description or nearby lines
        let interfaceType: string | undefined;
        const interfaceMatch = line.match(interfacePatterns[0]);
        if (interfaceMatch) {
          interfaceType = interfaceMatch[1].toUpperCase();
        }

        steps.push({
          id: uuidv4(),
          rowIndex: i,
          phase: currentPhase,
          sectionNumber: match[1],
          description,
          interface: interfaceType,
          confidence: 0.5,
        });

        matched = true;
        break;
      }
    }

    // If no pattern matched, check if it might be a continuation or standalone step
    if (!matched && line.length > 20) {
      // Check if this line mentions interface systems
      const interfaceMatch = line.match(interfacePatterns[0]);
      if (interfaceMatch) {
        // This might be a step description with interface info
        sequence++;
        steps.push({
          id: uuidv4(),
          rowIndex: i,
          phase: currentPhase,
          description: line,
          interface: interfaceMatch[1].toUpperCase(),
          confidence: 0.3,
        });
      }
    }
  }

  // Post-process: merge related steps, improve confidence
  return postProcessSteps(steps);
}

function isPhaseHeader(text: string): boolean {
  const lowerText = text.toLowerCase();
  const phaseKeywords = [
    'set-up phase', 'setup phase', 'set up phase',
    'run phase', 'production phase',
    'line cleanup phase', 'cleanup phase',
    'batch record review',
    'unit procedure',
  ];
  return phaseKeywords.some((kw) => lowerText.includes(kw));
}

function extractPhaseName(text: string): string {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('set')) return 'Set-up';
  if (lowerText.includes('run') || lowerText.includes('production')) return 'Run';
  if (lowerText.includes('cleanup') || lowerText.includes('clean')) return 'Line Cleanup';
  if (lowerText.includes('review')) return 'Batch Record Review';

  return text.substring(0, 50);
}

function postProcessSteps(steps: ExtractedStep[]): ExtractedStep[] {
  // Remove duplicates based on description similarity
  const uniqueSteps: ExtractedStep[] = [];
  const seen = new Set<string>();

  for (const step of steps) {
    const key = step.description.toLowerCase().substring(0, 50);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSteps.push(step);
    }
  }

  // Improve confidence based on context
  return uniqueSteps.map((step, index) => {
    let confidence = step.confidence;

    // Higher confidence if step has section number
    if (step.sectionNumber) confidence += 0.1;

    // Higher confidence if step has interface
    if (step.interface) confidence += 0.1;

    // Higher confidence if it's part of a sequence
    if (index > 0 && uniqueSteps[index - 1].phase === step.phase) {
      confidence += 0.05;
    }

    return {
      ...step,
      confidence: Math.min(0.9, confidence),
    };
  });
}

function calculateConfidence(steps: ExtractedStep[]): number {
  if (steps.length === 0) return 0;

  const avgConfidence = steps.reduce((sum, step) => sum + step.confidence, 0) / steps.length;
  const hasPhases = steps.some((step) => step.phase);
  const hasInterfaces = steps.some((step) => step.interface);
  const hasSectionNumbers = steps.some((step) => step.sectionNumber);

  let overall = avgConfidence;
  if (hasPhases) overall += 0.1;
  if (hasInterfaces) overall += 0.1;
  if (hasSectionNumbers) overall += 0.1;

  // PDF parsing is inherently less reliable
  overall *= 0.9;

  return Math.min(1, overall);
}
