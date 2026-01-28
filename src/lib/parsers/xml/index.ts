/**
 * MES XML Parsers Registry
 *
 * Central registry for all MES XML parsers.
 * Each parser converts a specific MES XML format to the ISA-88 canonical model.
 *
 * Supported conversions (5 sources × 4 targets = 20 combinations):
 * - PAS-X → Syncade, PharmaSuite, Opcenter, MODA
 * - Syncade → PAS-X, PharmaSuite, Opcenter, MODA
 * - PharmaSuite → PAS-X, Syncade, Opcenter, MODA
 * - Opcenter → PAS-X, Syncade, PharmaSuite, MODA
 * - MODA → PAS-X, Syncade, PharmaSuite, Opcenter
 */

import {
  MESParser,
  MESSystemId,
  MESSystemInfo,
  ParserOptions,
  ParserResult,
  DetectionResult,
} from './types';

// Import all parsers
import { PasXParser, pasxParser } from './pasx-parser';
import { SyncadeParser, syncadeParser } from './syncade-parser';
import { PharmaSuiteParser, pharmaSuiteParser } from './pharmasuite-parser';
import { OpcenterParser, opcenterParser } from './opcenter-parser';
import { ModaParser, modaParser } from './moda-parser';

// Re-export everything
export * from './types';
export * from './base-parser';
export * from './pasx-parser';
export * from './syncade-parser';
export * from './pharmasuite-parser';
export * from './opcenter-parser';
export * from './moda-parser';

/**
 * Registry of all available MES XML parsers
 */
export const parserRegistry: Record<MESSystemId, MESParser> = {
  pasx: pasxParser,
  syncade: syncadeParser,
  pharmasuite: pharmaSuiteParser,
  opcenter: opcenterParser,
  moda: modaParser,
};

/**
 * MES system metadata for all supported systems
 */
export const mesSystemInfo: Record<MESSystemId, MESSystemInfo> = {
  pasx: {
    id: 'pasx',
    name: 'Werum PAS-X',
    vendor: 'Werum IT Solutions (Körber)',
    rootElement: 'Recipe',
    namespace: 'http://www.werum.com/pas-x/recipe',
    supportedVersions: ['3.2', '3.3', '4.0'],
  },
  syncade: {
    id: 'syncade',
    name: 'Emerson Syncade',
    vendor: 'Emerson',
    rootElement: 'SyncadeRecipe',
    namespace: 'http://www.emerson.com/syncade/recipe',
    supportedVersions: ['5.0', '5.1', '5.2', '6.0'],
  },
  pharmasuite: {
    id: 'pharmasuite',
    name: 'Rockwell PharmaSuite',
    vendor: 'Rockwell Automation',
    rootElement: 'ProductDefinition',
    namespace: 'http://www.mesa.org/xml/B2MML',
    supportedVersions: ['6.0', '6.1', '7.0'],
  },
  opcenter: {
    id: 'opcenter',
    name: 'Siemens Opcenter',
    vendor: 'Siemens',
    rootElement: 'OpcenterRecipe',
    namespace: 'http://www.siemens.com/opcenter/pharma',
    supportedVersions: ['8.0', '8.1', '8.2', '2020', '2022'],
  },
  moda: {
    id: 'moda',
    name: 'Lonza MODA',
    vendor: 'Lonza',
    rootElement: 'ModaEBRTemplate',
    namespace: 'http://www.lonza.com/moda/ebr',
    supportedVersions: ['3.0', '3.5', '4.0'],
  },
};

/**
 * Get a parser by its ID
 */
export function getParser(id: MESSystemId): MESParser | undefined {
  return parserRegistry[id];
}

/**
 * Get all available parsers
 */
export function getAllParsers(): MESParser[] {
  return Object.values(parserRegistry);
}

/**
 * Get parser metadata for UI display
 */
export function getParserInfo(): Array<{
  id: MESSystemId;
  name: string;
  description: string;
  vendor: string;
  versions: string[];
  rootElement: string;
  namespace: string;
}> {
  return getAllParsers().map(parser => ({
    id: parser.id,
    name: parser.name,
    description: parser.description,
    vendor: parser.vendor,
    versions: parser.supportedVersions,
    rootElement: parser.rootElement,
    namespace: parser.namespace,
  }));
}

/**
 * Auto-detect the MES system from XML content
 *
 * @param xml The XML content to analyze
 * @returns Detection result with system ID and confidence score
 */
export function detectMESSystem(xml: string): DetectionResult | null {
  // Try each parser's canParse method
  for (const parser of getAllParsers()) {
    if (parser.canParse(xml)) {
      // Determine detection method based on what matched
      let detectionMethod: DetectionResult['detectionMethod'] = 'structure';
      let namespace: string | undefined;
      let version: string | undefined;

      // Extract namespace and root element from XML for result
      const nsMatch = xml.match(/xmlns\s*=\s*["']([^"']+)["']/);
      const rootMatch = xml.match(/<([a-zA-Z][a-zA-Z0-9_]*)/);

      if (nsMatch) {
        namespace = nsMatch[1];
        detectionMethod = 'namespace';
      }

      const rootElement = rootMatch ? rootMatch[1] : parser.rootElement;

      // Try to detect version
      version = parser.detectVersion(xml);

      return {
        system: parser.id,
        confidence: namespace ? 1.0 : 0.9, // Higher confidence with namespace match
        detectionMethod,
        rootElement,
        namespace,
        version,
      };
    }
  }

  // Try heuristic detection based on content patterns
  const heuristicResult = detectByHeuristics(xml);
  if (heuristicResult) {
    return heuristicResult;
  }

  return null;
}

/**
 * Heuristic detection for cases where standard detection fails
 */
function detectByHeuristics(xml: string): DetectionResult | null {
  const patterns: Array<{ pattern: RegExp; system: MESSystemId; confidence: number }> = [
    // PAS-X patterns
    { pattern: /RecipeId|ProcedureBody|CleaningManagement/i, system: 'pasx', confidence: 0.7 },
    // Syncade patterns
    { pattern: /ProcessSegment|ProcessOperation|ProcessAction/i, system: 'syncade', confidence: 0.7 },
    // PharmaSuite/B2MML patterns
    { pattern: /ProductSegment|OperationsSegment|WorkMaster/i, system: 'pharmasuite', confidence: 0.7 },
    // Opcenter patterns
    { pattern: /RoutingStep|ElectronicWorkInstructions|GenealogyConfiguration/i, system: 'opcenter', confidence: 0.7 },
    // MODA patterns
    { pattern: /ModaEBR|TemplateHeader|PhaseSignoffs|TaskSignatures/i, system: 'moda', confidence: 0.7 },
  ];

  for (const { pattern, system, confidence } of patterns) {
    if (pattern.test(xml)) {
      const rootMatch = xml.match(/<([a-zA-Z][a-zA-Z0-9_]*)/);
      return {
        system,
        confidence,
        detectionMethod: 'heuristic',
        rootElement: rootMatch ? rootMatch[1] : 'Unknown',
      };
    }
  }

  return null;
}

/**
 * Parse XML with auto-detection of the source system
 *
 * @param xml The XML content to parse
 * @param options Parser options
 * @returns Parse result or throws if system cannot be detected
 */
export function parseXml(xml: string, options?: ParserOptions): ParserResult {
  const detection = detectMESSystem(xml);

  if (!detection) {
    throw new Error('Unable to detect MES system from XML content. Please specify the source system explicitly.');
  }

  const parser = getParser(detection.system);
  if (!parser) {
    throw new Error(`No parser available for detected system: ${detection.system}`);
  }

  const result = parser.parse(xml, options);

  // Add detection info to result
  result.sourceVersion = detection.version || result.sourceVersion;

  return result;
}

/**
 * Parse XML with explicit source system specification
 *
 * @param xml The XML content to parse
 * @param system The source MES system ID
 * @param options Parser options
 * @returns Parse result
 */
export function parseXmlAs(xml: string, system: MESSystemId, options?: ParserOptions): ParserResult {
  const parser = getParser(system);

  if (!parser) {
    throw new Error(`Unknown parser: ${system}. Available: ${Object.keys(parserRegistry).join(', ')}`);
  }

  return parser.parse(xml, options);
}

/**
 * Check if a specific parser can handle the given XML
 *
 * @param xml The XML content to check
 * @param system The MES system to check against
 * @returns True if the parser can handle the XML
 */
export function canParseAs(xml: string, system: MESSystemId): boolean {
  const parser = getParser(system);
  return parser ? parser.canParse(xml) : false;
}

/**
 * Get list of supported conversion paths
 * Returns all valid source-to-target combinations
 */
export function getSupportedConversions(): Array<{ source: MESSystemId; target: MESSystemId }> {
  const systems = Object.keys(parserRegistry) as MESSystemId[];
  const conversions: Array<{ source: MESSystemId; target: MESSystemId }> = [];

  for (const source of systems) {
    for (const target of systems) {
      if (source !== target) {
        conversions.push({ source, target });
      }
    }
  }

  return conversions;
}

/**
 * Parser class exports for direct instantiation
 */
export const Parsers = {
  PasX: PasXParser,
  Syncade: SyncadeParser,
  PharmaSuite: PharmaSuiteParser,
  Opcenter: OpcenterParser,
  Moda: ModaParser,
};
