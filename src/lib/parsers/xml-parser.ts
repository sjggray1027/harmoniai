import { v4 as uuidv4 } from 'uuid';
import { ParsedDocument, ExtractedStep } from '@/types/workflow';
import { parseXml, detectMESSystem, ParserResult } from './xml';

export interface XmlParseOptions {
  sourceSystem?: string;
}

/**
 * Parse an XML file (MES format) into a ParsedDocument
 * This converts the ISA-88 procedure format to ExtractedStep[] for the document workflow
 */
export async function parseXmlFile(
  buffer: Buffer,
  fileName: string,
  options: XmlParseOptions = {}
): Promise<ParsedDocument> {
  const xmlContent = buffer.toString('utf-8');

  // Detect and parse the XML
  const detection = detectMESSystem(xmlContent);
  let result: ParserResult;

  try {
    result = parseXml(xmlContent);
  } catch (error) {
    // If auto-detection fails, try to extract steps from generic XML
    return parseGenericXml(xmlContent, fileName);
  }

  // Convert ISA-88 procedure to ExtractedStep[]
  const extractedSteps = convertProcedureToSteps(result);

  return {
    fileName,
    fileType: 'xml',
    extractedSteps,
    rawData: {
      sourceSystem: result.sourceSystem,
      sourceSystemName: result.sourceSystemName,
      sourceVendor: result.sourceVendor,
      sourceVersion: result.sourceVersion,
      statistics: result.statistics,
      detection: detection ? {
        confidence: detection.confidence,
        method: detection.detectionMethod,
      } : undefined,
    },
    parseDate: new Date().toISOString(),
    confidence: detection?.confidence || 0.5,
  };
}

/**
 * Convert ISA-88 Procedure to ExtractedStep[]
 */
function convertProcedureToSteps(result: ParserResult): ExtractedStep[] {
  const steps: ExtractedStep[] = [];
  const procedure = result.procedure;

  if (!procedure) {
    return steps;
  }

  let stepIndex = 0;

  // Process unit procedures
  for (const unitProcedure of procedure.unitProcedures || []) {
    // Process operations within each unit procedure
    for (const operation of unitProcedure.operations || []) {
      // Process phases within each operation
      for (const phase of operation.phases || []) {
        stepIndex++;

        // Determine interface from phase type
        let interfaceType = 'Manual';
        if (phase.type === 'automatic') {
          interfaceType = 'MES';
        } else if (phase.type === 'semi-automatic') {
          interfaceType = 'SAP/MES';
        }

        // Count signatures
        const signatureCount = phase.signatures?.length || 0;

        steps.push({
          id: uuidv4(),
          rowIndex: stepIndex,
          phase: unitProcedure.name,
          interface: interfaceType,
          sectionNumber: `${unitProcedure.sequence}.${operation.sequence}.${phase.sequence}`,
          description: phase.name || phase.description || '',
          clarification: Array.isArray(phase.instructions) ? phase.instructions.join('; ') : phase.instructions,
          signatures: signatureCount > 0 ? String(signatureCount) : undefined,
          rawText: phase.description,
          confidence: 0.8,
        });

        // Also process interfaces within the phase
        for (const iface of phase.interfaces || []) {
          stepIndex++;
          steps.push({
            id: uuidv4(),
            rowIndex: stepIndex,
            phase: unitProcedure.name,
            interface: String(iface.system) || 'MES',
            sectionNumber: `${unitProcedure.sequence}.${operation.sequence}.${phase.sequence}`,
            description: `Interface: ${iface.direction} - ${iface.system}`,
            confidence: 0.7,
          });
        }
      }

      // If operation has no phases, add the operation itself as a step
      if (!operation.phases || operation.phases.length === 0) {
        stepIndex++;
        steps.push({
          id: uuidv4(),
          rowIndex: stepIndex,
          phase: unitProcedure.name,
          sectionNumber: `${unitProcedure.sequence}.${operation.sequence}`,
          description: operation.name || operation.description || '',
          confidence: 0.7,
        });
      }
    }
  }

  return steps;
}

/**
 * Parse generic XML that doesn't match any known MES format
 * Extracts any step-like elements it can find
 */
function parseGenericXml(xmlContent: string, fileName: string): ParsedDocument {
  const steps: ExtractedStep[] = [];
  let stepIndex = 0;

  // Common patterns for step-like elements in XML
  const stepPatterns = [
    /<(?:Step|Operation|Phase|Task|Action|Instruction)[^>]*>([^<]*(?:<(?!\/(?:Step|Operation|Phase|Task|Action|Instruction))[^>]*>[^<]*)*)<\/(?:Step|Operation|Phase|Task|Action|Instruction)>/gi,
    /<(?:step|operation|phase|task|action|instruction)[^>]*name=["']([^"']+)["'][^>]*>/gi,
    /<Description>([^<]+)<\/Description>/gi,
    /<Name>([^<]+)<\/Name>/gi,
  ];

  // Try to extract step-like content
  for (const pattern of stepPatterns) {
    let match;
    while ((match = pattern.exec(xmlContent)) !== null) {
      const content = match[1]?.trim();
      if (content && content.length > 5 && content.length < 500) {
        stepIndex++;
        steps.push({
          id: uuidv4(),
          rowIndex: stepIndex,
          description: content,
          confidence: 0.4,
        });
      }
    }
  }

  // Remove duplicates based on description
  const uniqueSteps = steps.filter((step, index, self) =>
    index === self.findIndex(s => s.description === step.description)
  );

  return {
    fileName,
    fileType: 'xml',
    extractedSteps: uniqueSteps,
    rawData: {
      isGenericXml: true,
      originalLength: xmlContent.length,
    },
    parseDate: new Date().toISOString(),
    confidence: uniqueSteps.length > 0 ? 0.4 : 0.1,
  };
}
