/**
 * Parse XML API Route
 *
 * Parses MES XML files to ISA-88 canonical model.
 *
 * POST: Parse XML content
 * - Supports auto-detection or explicit source system
 * - Returns ISA-88 procedure and parsing statistics
 *
 * GET: List available parsers
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  parseXml,
  parseXmlAs,
  detectMESSystem,
  getParserInfo,
  MESSystemId,
  ParserOptions,
} from '@/lib/parsers/xml';

export const runtime = 'nodejs';

interface ParseXmlRequest {
  /** XML content to parse */
  xml: string;
  /** Source system ID (optional - will auto-detect if not provided) */
  sourceSystem?: MESSystemId;
  /** Parser options */
  options?: ParserOptions;
}

export async function POST(request: NextRequest) {
  try {
    const body: ParseXmlRequest = await request.json();
    const { xml, sourceSystem, options } = body;

    if (!xml || typeof xml !== 'string') {
      return NextResponse.json(
        { error: 'XML content is required' },
        { status: 400 }
      );
    }

    // Check if content looks like XML
    const trimmedXml = xml.trim();
    if (!trimmedXml.startsWith('<?xml') && !trimmedXml.startsWith('<')) {
      return NextResponse.json(
        { error: 'Invalid XML format: content does not appear to be XML' },
        { status: 400 }
      );
    }

    // Detect source system if not provided
    let detectionResult = null;
    if (!sourceSystem) {
      detectionResult = detectMESSystem(xml);
      if (!detectionResult) {
        return NextResponse.json(
          {
            error: 'Unable to auto-detect MES system from XML content',
            suggestion: 'Please specify the sourceSystem parameter explicitly',
            availableSystems: getParserInfo().map(p => ({
              id: p.id,
              name: p.name,
              vendor: p.vendor,
            })),
          },
          { status: 400 }
        );
      }
    }

    // Parse the XML
    const result = sourceSystem
      ? parseXmlAs(xml, sourceSystem, options)
      : parseXml(xml, options);

    return NextResponse.json({
      success: true,
      data: {
        procedure: result.procedure,
        sourceSystem: result.sourceSystem,
        sourceSystemName: result.sourceSystemName,
        sourceVendor: result.sourceVendor,
        sourceVersion: result.sourceVersion,
        statistics: result.statistics,
        parsedAt: result.parsedAt,
        warnings: result.warnings,
        unmappedData: result.unmappedData,
        detection: detectionResult
          ? {
              confidence: detectionResult.confidence,
              method: detectionResult.detectionMethod,
              rootElement: detectionResult.rootElement,
              namespace: detectionResult.namespace,
            }
          : undefined,
      },
    });
  } catch (error) {
    console.error('Parse XML error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to parse XML',
        type: 'parse_error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to list available parsers
 */
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      parsers: getParserInfo(),
      supportedFormats: getParserInfo().map(p => ({
        id: p.id,
        name: p.name,
        vendor: p.vendor,
        rootElement: p.rootElement,
        namespace: p.namespace,
        versions: p.versions,
      })),
    },
  });
}
