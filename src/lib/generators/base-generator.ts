/**
 * Base Generator Interface
 *
 * All MES-specific generators implement this interface to ensure
 * consistent behavior and interoperability.
 */

import { Procedure } from '../models/isa88-canonical';

export interface GeneratorOptions {
  includeComments?: boolean;
  includeValidation?: boolean;
  prettyPrint?: boolean;
  encoding?: string;
  customNamespace?: string;
  targetVersion?: string;
}

export interface GeneratorResult {
  content: string;
  format: string;
  mimeType: string;
  fileExtension: string;
  metadata: {
    generator: string;
    version: string;
    generatedAt: string;
    procedureName: string;
    statistics: {
      unitProcedures: number;
      operations: number;
      phases: number;
      totalElements: number;
    };
  };
  warnings?: string[];
}

export interface MESGenerator {
  /**
   * Unique identifier for this generator
   */
  readonly id: string;

  /**
   * Display name for UI
   */
  readonly name: string;

  /**
   * Description of the target MES system
   */
  readonly description: string;

  /**
   * Vendor of the MES system
   */
  readonly vendor: string;

  /**
   * Supported versions of the target system
   */
  readonly supportedVersions: string[];

  /**
   * Generate output from ISA-88 procedure
   */
  generate(procedure: Procedure, options?: GeneratorOptions): GeneratorResult;

  /**
   * Validate procedure compatibility with this generator
   */
  validate(procedure: Procedure): {
    compatible: boolean;
    issues: Array<{
      type: 'error' | 'warning';
      message: string;
      path?: string;
    }>;
  };

  /**
   * Get default options for this generator
   */
  getDefaultOptions(): GeneratorOptions;
}

/**
 * Abstract base class with common functionality
 */
export abstract class BaseGenerator implements MESGenerator {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly vendor: string;
  abstract readonly supportedVersions: string[];

  abstract generate(procedure: Procedure, options?: GeneratorOptions): GeneratorResult;

  validate(procedure: Procedure): {
    compatible: boolean;
    issues: Array<{ type: 'error' | 'warning'; message: string; path?: string }>;
  } {
    const issues: Array<{ type: 'error' | 'warning'; message: string; path?: string }> = [];

    // Basic validation
    if (!procedure.header.name) {
      issues.push({ type: 'error', message: 'Procedure name is required' });
    }

    if (procedure.unitProcedures.length === 0) {
      issues.push({ type: 'warning', message: 'Procedure has no unit procedures' });
    }

    return {
      compatible: !issues.some(i => i.type === 'error'),
      issues,
    };
  }

  getDefaultOptions(): GeneratorOptions {
    return {
      includeComments: true,
      includeValidation: true,
      prettyPrint: true,
      encoding: 'UTF-8',
    };
  }

  protected escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  protected formatXml(xml: string, indent: string = '  '): string {
    let formatted = '';
    let level = 0;
    const lines = xml.replace(/>\s*</g, '>\n<').split('\n');

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Decrease indent for closing tags
      if (trimmed.startsWith('</')) {
        level--;
      }

      formatted += indent.repeat(Math.max(0, level)) + trimmed + '\n';

      // Increase indent for opening tags (not self-closing)
      if (
        trimmed.startsWith('<') &&
        !trimmed.startsWith('</') &&
        !trimmed.startsWith('<?') &&
        !trimmed.endsWith('/>') &&
        !trimmed.includes('</') // Not a single-line element
      ) {
        level++;
      }
    });

    return formatted.trim();
  }

  protected generateStatistics(procedure: Procedure): {
    unitProcedures: number;
    operations: number;
    phases: number;
    totalElements: number;
  } {
    let operations = 0;
    let phases = 0;

    procedure.unitProcedures.forEach(up => {
      up.operations.forEach(op => {
        operations++;
        phases += op.phases.length;
      });
    });

    return {
      unitProcedures: procedure.unitProcedures.length,
      operations,
      phases,
      totalElements: procedure.unitProcedures.length + operations + phases,
    };
  }
}
