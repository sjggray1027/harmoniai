import { NextRequest, NextResponse } from 'next/server';
import {
  generatePasXRecipe,
  recipeToXml,
  getGeneratorInfo,
  getGenerator,
  generate,
  generateMultiple,
  GeneratorOptions,
} from '@/lib/generators';
import { convertToProcedure, ConversionOptions, getConversionStats } from '@/lib/converters/steps-to-isa88';
import { ExtractedStep } from '@/types/workflow';

export const runtime = 'nodejs';

interface GenerateRequest {
  steps: ExtractedStep[];
  options?: GeneratorOptions & ConversionOptions;
  generator?: string; // Generator ID (pasx, syncade, pharmasuite, opcenter, moda)
  generators?: string[]; // Multiple generator IDs for batch generation
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { steps, options, generator, generators } = body;

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json(
        { error: 'No workflow steps provided' },
        { status: 400 }
      );
    }

    // Default to PAS-X for backward compatibility
    const targetGenerator = generator || 'pasx';
    const targetGenerators = generators || [targetGenerator];

    // Check if using legacy mode (no generator specified and pasx)
    if (!generator && !generators) {
      // Legacy mode: use original PAS-X generator for backward compatibility
      const recipe = generatePasXRecipe(steps, options);
      const xml = recipeToXml(recipe, options?.includeComments ?? true);

      return NextResponse.json({
        success: true,
        data: {
          recipe,
          xml,
        },
      });
    }

    // New mode: use ISA-88 canonical model
    const conversionOptions: ConversionOptions = {
      recipeName: options?.recipeName || 'Generated Recipe',
      recipeVersion: options?.recipeVersion || '1.0',
      productCode: options?.productCode,
      productName: options?.productName,
      author: options?.author || 'HarmoniAI',
      description: options?.description,
      defaultSignatures: true,
      groupByPhase: true,
    };

    // Convert steps to ISA-88 canonical model
    const procedure = convertToProcedure(steps, conversionOptions);
    const stats = getConversionStats(procedure);

    // Generate for single or multiple targets
    if (targetGenerators.length === 1) {
      const gen = getGenerator(targetGenerators[0]);
      if (!gen) {
        return NextResponse.json(
          {
            error: `Unknown generator: ${targetGenerators[0]}`,
            availableGenerators: getGeneratorInfo().map(g => g.id),
          },
          { status: 400 }
        );
      }

      const result = generate(targetGenerators[0], procedure, options);

      return NextResponse.json({
        success: true,
        data: {
          generator: gen.id,
          generatorName: gen.name,
          vendor: gen.vendor,
          content: result.content,
          format: result.format,
          fileExtension: result.fileExtension,
          mimeType: result.mimeType,
          metadata: result.metadata,
          warnings: result.warnings,
          procedure: {
            id: procedure.id,
            name: procedure.header.name,
            stats,
          },
        },
      });
    } else {
      // Multiple generators
      const results = generateMultiple(targetGenerators, procedure, options);

      return NextResponse.json({
        success: true,
        data: {
          generators: Object.entries(results).map(([id, result]) => ({
            id,
            name: getGenerator(id)?.name || id,
            vendor: getGenerator(id)?.vendor || 'Unknown',
            content: result.content,
            format: result.format,
            fileExtension: result.fileExtension,
            mimeType: result.mimeType,
            metadata: result.metadata,
            warnings: result.warnings,
          })),
          procedure: {
            id: procedure.id,
            name: procedure.header.name,
            stats,
          },
        },
      });
    }
  } catch (error) {
    console.error('Generate error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate recipe' },
      { status: 500 }
    );
  }
}

// GET endpoint to list available generators
export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      generators: getGeneratorInfo(),
    },
  });
}
