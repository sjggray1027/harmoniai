/**
 * MES Generators Registry
 *
 * Central registry for all MES format generators.
 * Each generator converts the ISA-88 canonical model to a specific MES format.
 */

import { MESGenerator, GeneratorOptions, GeneratorResult } from './base-generator';
import { Procedure } from '../models/isa88-canonical';

// Import all generators
import { PasXGenerator, pasxGenerator } from './pasx-generator';
import { SyncadeGenerator, syncadeGenerator } from './syncade-generator';
import { PharmaSuiteGenerator, pharmaSuiteGenerator } from './pharmasuite-generator';
import { OpcenterGenerator, opcenterGenerator } from './opcenter-generator';
import { ModaGenerator, modaGenerator } from './moda-generator';

// Re-export everything
export * from './base-generator';
export * from './pasx-generator';
export * from './syncade-generator';
export * from './pharmasuite-generator';
export * from './opcenter-generator';
export * from './moda-generator';

// Legacy exports for backward compatibility
export { generatePasXRecipe, recipeToXml } from './pasx-generator';

/**
 * Registry of all available MES generators
 */
export const generatorRegistry: Record<string, MESGenerator> = {
  pasx: pasxGenerator,
  syncade: syncadeGenerator,
  pharmasuite: pharmaSuiteGenerator,
  opcenter: opcenterGenerator,
  moda: modaGenerator,
};

/**
 * Get a generator by its ID
 */
export function getGenerator(id: string): MESGenerator | undefined {
  return generatorRegistry[id.toLowerCase()];
}

/**
 * Get all available generators
 */
export function getAllGenerators(): MESGenerator[] {
  return Object.values(generatorRegistry);
}

/**
 * Get generator metadata for UI display
 */
export function getGeneratorInfo(): Array<{
  id: string;
  name: string;
  description: string;
  vendor: string;
  versions: string[];
}> {
  return getAllGenerators().map(gen => ({
    id: gen.id,
    name: gen.name,
    description: gen.description,
    vendor: gen.vendor,
    versions: gen.supportedVersions,
  }));
}

/**
 * Generate output using a specific generator
 */
export function generate(
  generatorId: string,
  procedure: Procedure,
  options?: GeneratorOptions
): GeneratorResult {
  const generator = getGenerator(generatorId);
  if (!generator) {
    throw new Error(`Unknown generator: ${generatorId}. Available: ${Object.keys(generatorRegistry).join(', ')}`);
  }
  return generator.generate(procedure, options);
}

/**
 * Generate outputs for multiple formats simultaneously
 */
export function generateMultiple(
  generatorIds: string[],
  procedure: Procedure,
  options?: GeneratorOptions
): Record<string, GeneratorResult> {
  const results: Record<string, GeneratorResult> = {};

  for (const id of generatorIds) {
    try {
      results[id] = generate(id, procedure, options);
    } catch (error) {
      results[id] = {
        content: '',
        format: 'Error',
        mimeType: 'text/plain',
        fileExtension: 'txt',
        metadata: {
          generator: id,
          version: '',
          generatedAt: new Date().toISOString(),
          procedureName: procedure.header.name,
          statistics: { unitProcedures: 0, operations: 0, phases: 0, totalElements: 0 },
        },
        warnings: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  return results;
}

/**
 * Validate a procedure against a specific generator
 */
export function validateForGenerator(
  generatorId: string,
  procedure: Procedure
): { compatible: boolean; issues: Array<{ type: 'error' | 'warning'; message: string; path?: string }> } {
  const generator = getGenerator(generatorId);
  if (!generator) {
    return {
      compatible: false,
      issues: [{ type: 'error', message: `Unknown generator: ${generatorId}` }],
    };
  }
  return generator.validate(procedure);
}

/**
 * Generator class exports for direct instantiation
 */
export const Generators = {
  PasX: PasXGenerator,
  Syncade: SyncadeGenerator,
  PharmaSuite: PharmaSuiteGenerator,
  Opcenter: OpcenterGenerator,
  Moda: ModaGenerator,
};
