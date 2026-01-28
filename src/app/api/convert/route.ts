/**
 * Convert API Route
 *
 * Full MES-to-MES conversion (parse XML → ISA-88 → generate target XML).
 *
 * POST: Convert XML from one MES format to another
 * - Supports auto-detection of source system
 * - Returns converted XML and metadata
 *
 * GET: List supported conversions
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  parseXml,
  parseXmlAs,
  detectMESSystem,
  getParserInfo,
  getSupportedConversions,
  MESSystemId,
  ParserOptions,
  mesSystemInfo,
} from '@/lib/parsers/xml';
import {
  getGenerator,
  getGeneratorInfo,
  generate,
  GeneratorOptions,
} from '@/lib/generators';

export const runtime = 'nodejs';

interface ConvertRequest {
  /** Source XML content */
  sourceXml: string;
  /** Source system ID (optional - will auto-detect if not provided) */
  sourceSystem?: MESSystemId;
  /** Target system ID (required) */
  targetSystem: MESSystemId;
  /** Parser options */
  parserOptions?: ParserOptions;
  /** Generator options */
  generatorOptions?: GeneratorOptions;
}

export async function POST(request: NextRequest) {
  try {
    const body: ConvertRequest = await request.json();
    const { sourceXml, sourceSystem, targetSystem, parserOptions, generatorOptions } = body;

    // Validate input
    if (!sourceXml || typeof sourceXml !== 'string') {
      return NextResponse.json(
        { error: 'Source XML content is required' },
        { status: 400 }
      );
    }

    if (!targetSystem) {
      return NextResponse.json(
        {
          error: 'Target system is required',
          availableTargets: getGeneratorInfo().map(g => ({
            id: g.id,
            name: g.name,
            vendor: g.vendor,
          })),
        },
        { status: 400 }
      );
    }

    // Validate target system
    const targetGenerator = getGenerator(targetSystem);
    if (!targetGenerator) {
      return NextResponse.json(
        {
          error: `Unknown target system: ${targetSystem}`,
          availableTargets: getGeneratorInfo().map(g => ({
            id: g.id,
            name: g.name,
            vendor: g.vendor,
          })),
        },
        { status: 400 }
      );
    }

    // Check if content looks like XML
    const trimmedXml = sourceXml.trim();
    if (!trimmedXml.startsWith('<?xml') && !trimmedXml.startsWith('<')) {
      return NextResponse.json(
        { error: 'Invalid XML format: content does not appear to be XML' },
        { status: 400 }
      );
    }

    // Detect source system if not provided
    let detectionResult = null;
    let detectedSourceSystem: MESSystemId | undefined = sourceSystem;

    if (!sourceSystem) {
      detectionResult = detectMESSystem(sourceXml);
      if (!detectionResult) {
        return NextResponse.json(
          {
            error: 'Unable to auto-detect source MES system from XML content',
            suggestion: 'Please specify the sourceSystem parameter explicitly',
            availableSources: getParserInfo().map(p => ({
              id: p.id,
              name: p.name,
              vendor: p.vendor,
            })),
          },
          { status: 400 }
        );
      }
      detectedSourceSystem = detectionResult.system;
    }

    // Prevent same-system conversion
    if (detectedSourceSystem === targetSystem) {
      return NextResponse.json(
        {
          error: 'Source and target systems are the same',
          suggestion: 'Select a different target system for conversion',
        },
        { status: 400 }
      );
    }

    // Step 1: Parse source XML to ISA-88 model
    const parseResult = sourceSystem
      ? parseXmlAs(sourceXml, sourceSystem, parserOptions)
      : parseXml(sourceXml, parserOptions);

    // Step 2: Generate target XML from ISA-88 model
    const generateResult = generate(targetSystem, parseResult.procedure, generatorOptions);

    // Build response
    const sourceInfo = mesSystemInfo[detectedSourceSystem!];
    const targetInfo = mesSystemInfo[targetSystem];

    return NextResponse.json({
      success: true,
      data: {
        // Source information
        source: {
          system: parseResult.sourceSystem,
          systemName: parseResult.sourceSystemName,
          vendor: parseResult.sourceVendor,
          version: parseResult.sourceVersion,
          detection: detectionResult
            ? {
                confidence: detectionResult.confidence,
                method: detectionResult.detectionMethod,
              }
            : undefined,
        },
        // Target information
        target: {
          system: targetSystem,
          systemName: targetGenerator.name,
          vendor: targetGenerator.vendor,
          format: generateResult.format,
          fileExtension: generateResult.fileExtension,
          mimeType: generateResult.mimeType,
        },
        // Intermediate procedure info
        procedure: {
          id: parseResult.procedure.id,
          name: parseResult.procedure.header.name,
          version: parseResult.procedure.header.version,
        },
        // Generated output
        output: {
          xml: generateResult.content,
          format: generateResult.format,
          fileExtension: generateResult.fileExtension,
        },
        // Statistics
        statistics: {
          parser: parseResult.statistics,
          generator: generateResult.metadata.statistics,
        },
        // Warnings from both stages
        warnings: {
          parser: parseResult.warnings,
          generator: generateResult.warnings || [],
        },
        // Conversion timestamp
        convertedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Convert error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to convert XML',
        type: 'conversion_error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to list supported conversions
 */
export async function GET() {
  const conversions = getSupportedConversions();
  const parsers = getParserInfo();
  const generators = getGeneratorInfo();

  // Create a matrix of supported conversions
  const conversionMatrix: Record<string, string[]> = {};
  for (const { source, target } of conversions) {
    if (!conversionMatrix[source]) {
      conversionMatrix[source] = [];
    }
    conversionMatrix[source].push(target);
  }

  return NextResponse.json({
    success: true,
    data: {
      // List of all supported source systems
      sources: parsers.map(p => ({
        id: p.id,
        name: p.name,
        vendor: p.vendor,
        rootElement: p.rootElement,
        namespace: p.namespace,
      })),
      // List of all supported target systems
      targets: generators.map(g => ({
        id: g.id,
        name: g.name,
        vendor: g.vendor,
      })),
      // All conversion combinations
      conversions: conversions.map(c => ({
        source: c.source,
        sourceName: mesSystemInfo[c.source].name,
        target: c.target,
        targetName: mesSystemInfo[c.target as MESSystemId]?.name || generators.find(g => g.id === c.target)?.name,
      })),
      // Conversion matrix (source → targets[])
      conversionMatrix,
      // Statistics
      stats: {
        totalSources: parsers.length,
        totalTargets: generators.length,
        totalConversions: conversions.length,
      },
    },
  });
}
