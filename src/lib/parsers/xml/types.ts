/**
 * XML Parser Types
 *
 * Type definitions for the MES XML parser system.
 * These parsers reverse the generator logic, enabling system-to-system
 * MES conversion (e.g., PAS-X to Syncade, Opcenter to MODA).
 */

import { Procedure } from '../../models/isa88-canonical';

/**
 * Supported MES system identifiers
 */
export type MESSystemId = 'pasx' | 'syncade' | 'pharmasuite' | 'opcenter' | 'moda';

/**
 * MES system metadata
 */
export interface MESSystemInfo {
  id: MESSystemId;
  name: string;
  vendor: string;
  rootElement: string;
  namespace: string;
  supportedVersions: string[];
}

/**
 * Parser options for controlling parsing behavior
 */
export interface ParserOptions {
  /** Enable strict validation of XML structure */
  strictValidation?: boolean;
  /** Preserve data that doesn't map to ISA-88 model in metadata */
  preserveUnmappedData?: boolean;
  /** Target version for parsing (affects element mapping) */
  targetVersion?: string;
}

/**
 * Statistics about the parsed procedure
 */
export interface ParserStatistics {
  unitProcedures: number;
  operations: number;
  phases: number;
  parameters: number;
  materials: number;
  signatures: number;
  totalElements: number;
}

/**
 * Result of parsing MES XML to ISA-88 model
 */
export interface ParserResult {
  /** The parsed ISA-88 procedure */
  procedure: Procedure;
  /** Source MES system that was detected/used */
  sourceSystem: MESSystemId;
  /** Source system display name */
  sourceSystemName: string;
  /** Source system vendor */
  sourceVendor: string;
  /** Detected version of the source format */
  sourceVersion?: string;
  /** Statistics about the parsed content */
  statistics: ParserStatistics;
  /** Parsing timestamp */
  parsedAt: string;
  /** Any warnings generated during parsing */
  warnings: string[];
  /** Unmapped data preserved from source (if preserveUnmappedData option enabled) */
  unmappedData?: Record<string, unknown>;
}

/**
 * Result of auto-detecting the MES system from XML content
 */
export interface DetectionResult {
  /** Detected MES system ID */
  system: MESSystemId;
  /** Confidence score (0-1) */
  confidence: number;
  /** Detection method used */
  detectionMethod: 'namespace' | 'root-element' | 'structure' | 'heuristic';
  /** Detected root element name */
  rootElement: string;
  /** Detected namespace (if any) */
  namespace?: string;
  /** Detected version (if determinable) */
  version?: string;
}

/**
 * Interface for MES XML parsers
 *
 * All MES-specific XML parsers implement this interface to ensure
 * consistent behavior and interoperability. Parsers reverse the
 * corresponding generator's logic, mapping XML elements back to
 * the ISA-88 canonical model.
 */
export interface MESParser {
  /**
   * Unique identifier for this parser (matches generator ID)
   */
  readonly id: MESSystemId;

  /**
   * Display name for UI
   */
  readonly name: string;

  /**
   * Description of the source MES system
   */
  readonly description: string;

  /**
   * Vendor of the MES system
   */
  readonly vendor: string;

  /**
   * Expected root XML element name
   */
  readonly rootElement: string;

  /**
   * Expected XML namespace
   */
  readonly namespace: string;

  /**
   * Supported versions of the source format
   */
  readonly supportedVersions: string[];

  /**
   * Check if this parser can handle the given XML content
   * @param xml The XML content to check
   * @returns True if this parser can parse the content
   */
  canParse(xml: string): boolean;

  /**
   * Parse XML content to ISA-88 procedure
   * @param xml The XML content to parse
   * @param options Parser options
   * @returns The parsed result containing the ISA-88 procedure
   */
  parse(xml: string, options?: ParserOptions): ParserResult;

  /**
   * Detect the format version from XML content
   * @param xml The XML content to analyze
   * @returns Detected version or undefined if not determinable
   */
  detectVersion(xml: string): string | undefined;

  /**
   * Get default options for this parser
   */
  getDefaultOptions(): ParserOptions;
}

/**
 * Conversion request for API endpoints
 */
export interface ConversionRequest {
  /** Source XML content */
  sourceXml: string;
  /** Source system (optional, will auto-detect if not provided) */
  sourceSystem?: MESSystemId;
  /** Target system for generation */
  targetSystem: MESSystemId;
  /** Parser options */
  parserOptions?: ParserOptions;
  /** Generator options */
  generatorOptions?: Record<string, unknown>;
}

/**
 * Conversion result from API endpoints
 */
export interface ConversionResult {
  /** Source system that was detected/used */
  sourceSystem: MESSystemId;
  /** Target system used for generation */
  targetSystem: MESSystemId;
  /** Detection confidence (if auto-detected) */
  detectionConfidence?: number;
  /** Intermediate ISA-88 procedure */
  procedure: Procedure;
  /** Generated target XML content */
  targetXml: string;
  /** Target format name */
  targetFormat: string;
  /** File extension for target */
  targetFileExtension: string;
  /** Statistics from parsing */
  parserStatistics: ParserStatistics;
  /** Statistics from generation */
  generatorStatistics: {
    unitProcedures: number;
    operations: number;
    phases: number;
    totalElements: number;
  };
  /** Warnings from parsing */
  parserWarnings: string[];
  /** Warnings from generation */
  generatorWarnings: string[];
  /** Conversion timestamp */
  convertedAt: string;
}
