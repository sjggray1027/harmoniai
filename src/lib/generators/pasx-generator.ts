import { v4 as uuidv4 } from 'uuid';
import {
  Recipe,
  RecipeHeader,
  UnitProcedure,
  WorkflowStep,
  Material,
  Equipment,
  ExtractedStep,
  SignatureRequirement,
} from '@/types/workflow';
import {
  Procedure,
  UnitProcedure as ISA88UnitProcedure,
  Operation,
  Phase,
  SignatureType,
} from '../models/isa88-canonical';
import { BaseGenerator, GeneratorOptions as BaseGeneratorOptions, GeneratorResult } from './base-generator';

// Legacy options interface for backward compatibility
export interface LegacyGeneratorOptions {
  recipeId?: string;
  recipeName?: string;
  productType?: string;
  author?: string;
  includeComments?: boolean;
}

// Extended options for new class-based generator
export interface PasXOptions extends BaseGeneratorOptions {
  namespace?: string;
  schemaVersion?: string;
  includeCleaningManagement?: boolean;
  signatureStrategy?: 'per-phase' | 'per-operation' | 'per-unit-procedure';
}

/**
 * PAS-X Generator Class (ISA-88 Canonical Model)
 *
 * Generates Werum PAS-X MES compatible XML from ISA-88 canonical model.
 * PAS-X follows ISA-88/IEC 61512 standards for batch control.
 */
export class PasXGenerator extends BaseGenerator {
  readonly id = 'pasx';
  readonly name = 'Werum PAS-X';
  readonly description = 'Werum PAS-X Manufacturing Execution System';
  readonly vendor = 'Werum IT Solutions (Körber)';
  readonly supportedVersions = ['3.2', '3.3', '4.0'];

  private readonly defaultNamespace = 'http://www.werum.com/pas-x/recipe';

  generate(procedure: Procedure, options?: PasXOptions): GeneratorResult {
    const opts: PasXOptions = {
      ...this.getDefaultOptions(),
      ...options,
    };

    const xml = this.buildXml(procedure, opts);
    const stats = this.generateStatistics(procedure);

    return {
      content: opts.prettyPrint ? this.formatXml(xml) : xml,
      format: 'PAS-X Recipe XML',
      mimeType: 'application/xml',
      fileExtension: 'xml',
      metadata: {
        generator: this.id,
        version: opts.targetVersion || '3.3',
        generatedAt: new Date().toISOString(),
        procedureName: procedure.header.name,
        statistics: stats,
      },
    };
  }

  getDefaultOptions(): PasXOptions {
    return {
      ...super.getDefaultOptions(),
      namespace: this.defaultNamespace,
      schemaVersion: '3.3',
      includeCleaningManagement: true,
      signatureStrategy: 'per-phase',
    };
  }

  private buildXml(procedure: Procedure, options: PasXOptions): string {
    const parts: string[] = [];

    parts.push(`<?xml version="1.0" encoding="${options.encoding || 'UTF-8'}"?>`);
    parts.push(`<Recipe xmlns="${options.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`);
    parts.push(this.buildHeader(procedure, options));

    if (procedure.equipmentRequirements.length > 0) {
      parts.push(this.buildEquipmentRequirements(procedure));
    }

    if (procedure.formula) {
      parts.push(this.buildFormula(procedure));
    }

    parts.push(this.buildProcedureBody(procedure, options));

    if (options.includeCleaningManagement) {
      parts.push(this.buildCleaningManagement(procedure));
    }

    parts.push(this.buildSignatureStrategy(procedure, options));
    parts.push('</Recipe>');

    return parts.join('\n');
  }

  private buildHeader(procedure: Procedure, options: PasXOptions): string {
    const h = procedure.header;
    return `
  <Header>
    <RecipeId>${this.escapeXml(h.id)}</RecipeId>
    <RecipeName>${this.escapeXml(h.name)}</RecipeName>
    <Version>${this.escapeXml(h.version)}</Version>
    <Status>${h.status.toUpperCase()}</Status>
    <RecipeType>${h.recipeType.toUpperCase()}</RecipeType>
    ${h.productCode ? `<ProductCode>${this.escapeXml(h.productCode)}</ProductCode>` : ''}
    ${h.productName ? `<ProductName>${this.escapeXml(h.productName)}</ProductName>` : ''}
    ${h.description ? `<Description>${this.escapeXml(h.description)}</Description>` : ''}
    <CreatedDate>${h.createdDate}</CreatedDate>
    <ModifiedDate>${h.modifiedDate}</ModifiedDate>
    ${h.author ? `<Author>${this.escapeXml(h.author)}</Author>` : ''}
  </Header>`;
  }

  private buildEquipmentRequirements(procedure: Procedure): string {
    return `
  <EquipmentRequirements>
    ${procedure.equipmentRequirements.map(eq => `
    <Equipment>
      <EquipmentId>${this.escapeXml(eq.id)}</EquipmentId>
      <EquipmentCode>${this.escapeXml(eq.code)}</EquipmentCode>
      <EquipmentName>${this.escapeXml(eq.name)}</EquipmentName>
      <EquipmentType>${this.escapeXml(eq.type)}</EquipmentType>
    </Equipment>`).join('')}
  </EquipmentRequirements>`;
  }

  private buildFormula(procedure: Procedure): string {
    if (!procedure.formula) return '';
    return `
  <Formula>
    <Materials>
      ${procedure.formula.materials.map(mat => `
      <Material>
        <MaterialCode>${this.escapeXml(mat.code)}</MaterialCode>
        <MaterialName>${this.escapeXml(mat.name)}</MaterialName>
        <Quantity>${mat.quantity}</Quantity>
        <Unit>${this.escapeXml(mat.unit)}</Unit>
        <Type>${mat.type.toUpperCase()}</Type>
        <Scalable>${mat.scalable}</Scalable>
      </Material>`).join('')}
    </Materials>
  </Formula>`;
  }

  private buildProcedureBody(procedure: Procedure, options: PasXOptions): string {
    return `
  <ProcedureBody>
    ${procedure.unitProcedures.map(up => this.buildUnitProcedure(up, options)).join('')}
  </ProcedureBody>`;
  }

  private buildUnitProcedure(up: ISA88UnitProcedure, options: PasXOptions): string {
    return `
    <UnitProcedure>
      <UnitProcedureId>${this.escapeXml(up.id)}</UnitProcedureId>
      <Name>${this.escapeXml(up.name)}</Name>
      <Sequence>${up.sequence}</Sequence>
      ${up.description ? `<Description>${this.escapeXml(up.description)}</Description>` : ''}
      <Operations>
        ${up.operations.map(op => this.buildOperation(op, options)).join('')}
      </Operations>
    </UnitProcedure>`;
  }

  private buildOperation(op: Operation, options: PasXOptions): string {
    return `
        <Operation>
          <OperationId>${this.escapeXml(op.id)}</OperationId>
          <Name>${this.escapeXml(op.name)}</Name>
          <Sequence>${op.sequence}</Sequence>
          ${op.description ? `<Description>${this.escapeXml(op.description)}</Description>` : ''}
          <Phases>
            ${op.phases.map(ph => this.buildPhase(ph, options)).join('')}
          </Phases>
        </Operation>`;
  }

  private buildPhase(phase: Phase, options: PasXOptions): string {
    return `
            <Phase>
              <PhaseId>${this.escapeXml(phase.id)}</PhaseId>
              <Name>${this.escapeXml(phase.name)}</Name>
              <Sequence>${phase.sequence}</Sequence>
              <Type>${phase.type.toUpperCase()}</Type>
              ${phase.instructions ? `<Instructions>${this.escapeXml(phase.instructions)}</Instructions>` : ''}
              ${phase.interfaces.length > 0 ? `
              <Interfaces>
                ${phase.interfaces.map(iface => `
                <Interface>
                  <System>${iface.system}</System>
                  <Direction>${iface.direction.toUpperCase()}</Direction>
                </Interface>`).join('')}
              </Interfaces>` : ''}
              ${options.signatureStrategy === 'per-phase' && phase.signatures.length > 0 ? `
              <Signatures>
                ${phase.signatures.map(sig => this.buildSignature(sig)).join('')}
              </Signatures>` : ''}
            </Phase>`;
  }

  private buildSignature(sig: Phase['signatures'][0]): string {
    const typeMap: Record<SignatureType, string> = {
      [SignatureType.PERFORM]: 'PERFORM',
      [SignatureType.VERIFY]: 'VERIFY',
      [SignatureType.APPROVE]: 'APPROVE',
      [SignatureType.REVIEW]: 'REVIEW',
      [SignatureType.WITNESS]: 'WITNESS',
    };

    return `
                <Signature>
                  <Type>${typeMap[sig.type]}</Type>
                  <Role>${this.escapeXml(sig.role)}</Role>
                  <Order>${sig.order}</Order>
                  <Required>${sig.required}</Required>
                </Signature>`;
  }

  private buildCleaningManagement(procedure: Procedure): string {
    return `
  <CleaningManagement>
    <CleaningStrategy>CAMPAIGN</CleaningStrategy>
    <MaxCampaignBatches>10</MaxCampaignBatches>
  </CleaningManagement>`;
  }

  private buildSignatureStrategy(procedure: Procedure, options: PasXOptions): string {
    const strategyMap = {
      'per-phase': 'PHASE_LEVEL',
      'per-operation': 'OPERATION_LEVEL',
      'per-unit-procedure': 'UNIT_PROCEDURE_LEVEL',
    };

    return `
  <SignatureStrategy>
    <Level>${strategyMap[options.signatureStrategy || 'per-phase']}</Level>
    <ElectronicSignature>true</ElectronicSignature>
    <RequireComment>false</RequireComment>
  </SignatureStrategy>`;
  }
}

// Export singleton instance for registry
export const pasxGenerator = new PasXGenerator();

// ============================================================================
// LEGACY FUNCTIONS (for backward compatibility)
// ============================================================================

export function generatePasXRecipe(
  extractedSteps: ExtractedStep[],
  options: LegacyGeneratorOptions = {}
): Recipe {
  const header = createRecipeHeader(options);
  const materials = createDefaultMaterials();
  const equipment = createDefaultEquipment();
  const unitProcedures = convertStepsToUnitProcedures(extractedSteps);

  return {
    header,
    materials,
    equipment,
    unitProcedures,
    signatureStrategy: createSignatureStrategy(unitProcedures),
    cleaningManagement: createCleaningManagement(),
  };
}

function createRecipeHeader(options: LegacyGeneratorOptions): RecipeHeader {
  return {
    recipeId: options.recipeId || `PKG-MBR-${Date.now()}`,
    recipeName: options.recipeName || 'Generated Master Batch Record',
    recipeVersion: '1.0',
    recipeType: 'Master',
    productType: options.productType || 'Packaging',
    description: 'Generated by HarmoniAI from source document',
    author: options.author || 'HarmoniAI',
    creationDate: new Date().toISOString().split('T')[0],
    status: 'Draft',
  };
}

function createDefaultMaterials(): Material[] {
  return [
    {
      id: 'BULK-001',
      name: 'Bulk Product',
      type: 'Bulk',
      storageConditions: 'As per specification',
    },
    {
      id: 'PKG-COMP-001',
      name: 'Primary Packaging Component',
      type: 'PackagingComponent',
      componentType: 'VariableCoding',
    },
  ];
}

function createDefaultEquipment(): Equipment[] {
  return [
    {
      id: 'PKG-LINE-01',
      name: 'Packaging Line 01',
      equipmentClass: 'PackagingLine',
      sections: [
        { id: 'PRIMARY', name: 'Primary Packaging' },
        { id: 'SECONDARY', name: 'Secondary Packaging' },
      ],
    },
  ];
}

function convertStepsToUnitProcedures(steps: ExtractedStep[]): UnitProcedure[] {
  // Group steps by phase
  const phaseGroups = new Map<string, ExtractedStep[]>();
  let currentPhase = 'Set-up'; // Default phase

  for (const step of steps) {
    const phase = normalizePhase(step.phase || currentPhase);
    currentPhase = phase;

    if (!phaseGroups.has(phase)) {
      phaseGroups.set(phase, []);
    }
    phaseGroups.get(phase)!.push(step);
  }

  // Create unit procedures
  const unitProcedures: UnitProcedure[] = [];
  const phaseOrder = ['Set-up', 'Run', 'Line Cleanup', 'Batch Record Review'];

  let sequence = 0;
  for (const phaseName of phaseOrder) {
    const phaseSteps = phaseGroups.get(phaseName);
    if (!phaseSteps || phaseSteps.length === 0) continue;

    sequence++;
    unitProcedures.push({
      id: `UP-${phaseName.toUpperCase().replace(/\s+/g, '-').replace('LINE-', '')}`,
      sequence,
      name: phaseName,
      description: `${phaseName} activities`,
      operations: phaseSteps.map((step, idx) => convertStepToOperation(step, idx + 1, phaseName)),
    });
  }

  // Add any steps from unknown phases
  for (const [phaseName, phaseSteps] of phaseGroups) {
    if (!phaseOrder.includes(phaseName) && phaseSteps.length > 0) {
      sequence++;
      unitProcedures.push({
        id: `UP-${phaseName.toUpperCase().replace(/\s+/g, '-')}`,
        sequence,
        name: phaseName,
        description: `${phaseName} activities`,
        operations: phaseSteps.map((step, idx) => convertStepToOperation(step, idx + 1, phaseName)),
      });
    }
  }

  return unitProcedures;
}

function normalizePhase(phase: string): string {
  const phaseLower = phase.toLowerCase().trim();

  if (phaseLower.includes('set') || phaseLower.includes('setup')) return 'Set-up';
  if (phaseLower.includes('run') || phaseLower.includes('production')) return 'Run';
  if (phaseLower.includes('cleanup') || phaseLower.includes('clean')) return 'Line Cleanup';
  if (phaseLower.includes('review')) return 'Batch Record Review';

  return phase || 'Set-up';
}

function convertStepToOperation(
  step: ExtractedStep,
  sequence: number,
  phaseName: string
): WorkflowStep {
  const phasePrefix = getPhasePrefix(phaseName);
  const operationId = `OP-${phasePrefix}-${String(sequence).padStart(2, '0')}`;

  return {
    id: operationId,
    sequence,
    name: step.description,
    description: step.clarification || undefined,
    interface: normalizeInterface(step.interface),
    sectionNumber: step.sectionNumber ? parseInt(step.sectionNumber, 10) : undefined,
    signatures: parseSignatures(step.signatures),
    instructions: step.rawText ? [step.rawText] : undefined,
    criticalStep: isCriticalStep(step.description),
  };
}

function getPhasePrefix(phaseName: string): string {
  const prefixes: Record<string, string> = {
    'Set-up': 'SETUP',
    'Run': 'RUN',
    'Line Cleanup': 'CLEANUP',
    'Batch Record Review': 'REVIEW',
  };
  return prefixes[phaseName] || phaseName.toUpperCase().replace(/\s+/g, '-');
}

function normalizeInterface(interfaceStr?: string): 'SAP' | 'MES' | 'SAP/MES' | 'Manual' {
  if (!interfaceStr) return 'MES';

  const upper = interfaceStr.toUpperCase().trim();
  if (upper === 'SAP') return 'SAP';
  if (upper === 'MES') return 'MES';
  if (upper.includes('SAP') && upper.includes('MES')) return 'SAP/MES';

  return 'MES';
}

function parseSignatures(sigStr?: string): SignatureRequirement {
  if (!sigStr) return { required: 0 };

  if (sigStr.toLowerCase() === 'variable' || sigStr.toLowerCase().includes('depend')) {
    return { required: 'variable' };
  }

  const num = parseInt(sigStr, 10);
  if (!isNaN(num)) {
    const types = [];
    if (num >= 1) types.push({ type: 'Performed' as const, role: 'Operator' });
    if (num >= 2) types.push({ type: 'Verified' as const, role: 'Second Person' });
    return { required: num, types };
  }

  return { required: 0 };
}

function isCriticalStep(description: string): boolean {
  const criticalKeywords = [
    'variable coding',
    'checkweigher',
    'detection system',
    'critical process',
    'cpp',
    'environmental condition',
  ];
  const lowerDesc = description.toLowerCase();
  return criticalKeywords.some((kw) => lowerDesc.includes(kw));
}

function createSignatureStrategy(unitProcedures: UnitProcedure[]) {
  const criticalSteps: { ref: string; description: string }[] = [];
  const systemExecuted: { ref: string; description: string }[] = [];

  for (const up of unitProcedures) {
    for (const op of up.operations) {
      if (op.criticalStep) {
        criticalSteps.push({
          ref: op.id,
          description: `${op.name} - 2nd person check required`,
        });
      }
      if (op.systemAction) {
        systemExecuted.push({
          ref: op.id,
          description: `${op.name} - Executed by system`,
        });
      }
    }
  }

  return {
    criticalSteps,
    systemExecuted,
    notes: [
      'Two different people required for execution and inspection E-signatures',
      'PAS-X will verify execution and inspection E-signatures are from different persons',
    ],
  };
}

function createCleaningManagement() {
  return {
    dhtManagement: 'Dirty Holding Time fully managed by validated state diagram',
    chtManagement: 'Clean Holding Time verification included in signature/date entry',
    campaignLength: 'Campaign length verification on equipment allocation',
    cleaningLevels: [
      { id: 'DRY', name: 'Dry Clean' },
      { id: 'WET', name: 'Wet Clean - Manual validated procedure' },
    ],
  };
}

// XML Generation
export function recipeToXml(recipe: Recipe, includeComments = true): string {
  const lines: string[] = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');

  if (includeComments) {
    lines.push('<!--');
    lines.push('  PAS-X Master Batch Record (MBR) Recipe');
    lines.push(`  Generated by: HarmoniAI`);
    lines.push(`  Date: ${new Date().toISOString()}`);
    lines.push('  ');
    lines.push('  This XML follows PAS-X recipe structure based on ISA-88 standard.');
    lines.push('-->');
  }

  lines.push('<Recipe xmlns="http://www.werum.com/pas-x/recipe"');
  lines.push('        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
  lines.push('        version="1.0">');

  // Recipe Header
  lines.push('  ');
  lines.push('  <RecipeHeader>');
  lines.push(`    <RecipeId>${escapeXml(recipe.header.recipeId)}</RecipeId>`);
  lines.push(`    <RecipeName>${escapeXml(recipe.header.recipeName)}</RecipeName>`);
  lines.push(`    <RecipeVersion>${recipe.header.recipeVersion}</RecipeVersion>`);
  lines.push(`    <RecipeType>${recipe.header.recipeType}</RecipeType>`);
  lines.push(`    <ProductType>${recipe.header.productType}</ProductType>`);
  if (recipe.header.description) {
    lines.push(`    <Description>${escapeXml(recipe.header.description)}</Description>`);
  }
  lines.push(`    <Author>${escapeXml(recipe.header.author)}</Author>`);
  lines.push(`    <CreationDate>${recipe.header.creationDate}</CreationDate>`);
  lines.push(`    <Status>${recipe.header.status}</Status>`);
  lines.push('    <EffectiveDate></EffectiveDate>');
  lines.push('    <ExpirationDate></ExpirationDate>');
  lines.push('  </RecipeHeader>');

  // Recipe Formula (Materials)
  lines.push('  ');
  lines.push('  <RecipeFormula>');
  lines.push('    <Materials>');
  for (const material of recipe.materials) {
    lines.push(`      <Material type="${material.type}">`);
    lines.push(`        <MaterialId>${escapeXml(material.id)}</MaterialId>`);
    lines.push(`        <MaterialName>${escapeXml(material.name)}</MaterialName>`);
    if (material.componentType) {
      lines.push(`        <ComponentType>${material.componentType}</ComponentType>`);
    }
    if (material.storageConditions) {
      lines.push(`        <StorageConditions>${escapeXml(material.storageConditions)}</StorageConditions>`);
    }
    lines.push('      </Material>');
  }
  lines.push('    </Materials>');
  lines.push('  </RecipeFormula>');

  // Equipment
  lines.push('  ');
  lines.push('  <Equipment>');
  for (const equip of recipe.equipment) {
    lines.push(`    <EquipmentGroup id="${equip.id}">`);
    lines.push(`      <Name>${escapeXml(equip.name)}</Name>`);
    lines.push(`      <EquipmentClass>${equip.equipmentClass}</EquipmentClass>`);
    if (equip.sections && equip.sections.length > 0) {
      lines.push('      <Sections>');
      for (const section of equip.sections) {
        lines.push(`        <Section id="${section.id}">${escapeXml(section.name)}</Section>`);
      }
      lines.push('      </Sections>');
    }
    lines.push('    </EquipmentGroup>');
  }
  lines.push('  </Equipment>');

  // Procedure with Unit Procedures
  lines.push('  ');
  lines.push('  <Procedure>');
  lines.push(`    <ProcedureId>PROC-${recipe.header.recipeId}</ProcedureId>`);
  lines.push(`    <ProcedureName>${escapeXml(recipe.header.recipeName)} Procedure</ProcedureName>`);

  for (const up of recipe.unitProcedures) {
    lines.push('    ');
    if (includeComments) {
      lines.push(`    <!-- ${'='.repeat(60)} -->`);
      lines.push(`    <!-- UNIT PROCEDURE: ${up.name.toUpperCase()} -->`);
      lines.push(`    <!-- ${'='.repeat(60)} -->`);
    }
    lines.push(`    <UnitProcedure id="${up.id}" sequence="${up.sequence}">`);
    lines.push(`      <Name>${escapeXml(up.name)}</Name>`);
    if (up.description) {
      lines.push(`      <Description>${escapeXml(up.description)}</Description>`);
    }

    for (const op of up.operations) {
      lines.push('      ');
      lines.push(`      <Operation id="${op.id}" sequence="${op.sequence}">`);
      lines.push(`        <Name>${escapeXml(op.name)}</Name>`);
      lines.push(`        <Interface>${op.interface}</Interface>`);
      if (op.sectionNumber !== undefined) {
        lines.push(`        <SectionNumber>${op.sectionNumber}</SectionNumber>`);
      }
      if (op.description) {
        lines.push(`        <Description>${escapeXml(op.description)}</Description>`);
      }
      if (op.criticalStep) {
        lines.push('        <CriticalStep>true</CriticalStep>');
      }

      // Instructions
      if (op.instructions && op.instructions.length > 0) {
        lines.push('        <Instructions>');
        for (const instr of op.instructions) {
          lines.push(`          <Instruction>${escapeXml(instr)}</Instruction>`);
        }
        lines.push('        </Instructions>');
      }

      // Signatures
      const sigRequired = typeof op.signatures.required === 'number'
        ? op.signatures.required
        : 'variable';
      lines.push(`        <Signatures required="${sigRequired}">`);
      if (op.signatures.types) {
        for (const sig of op.signatures.types) {
          lines.push(`          <Signature type="${sig.type}">${escapeXml(sig.role)}</Signature>`);
        }
      }
      lines.push('        </Signatures>');

      // Parameters
      if (op.parameters && op.parameters.length > 0) {
        lines.push('        <Parameters>');
        for (const param of op.parameters) {
          lines.push(`          <Parameter name="${escapeXml(param.name)}" type="${param.type}"${param.unit ? ` unit="${param.unit}"` : ''}>`);
          if (param.lowerLimit !== undefined) {
            lines.push(`            <LowerLimit>${param.lowerLimit}</LowerLimit>`);
          }
          if (param.upperLimit !== undefined) {
            lines.push(`            <UpperLimit>${param.upperLimit}</UpperLimit>`);
          }
          lines.push('          </Parameter>');
        }
        lines.push('        </Parameters>');
      }

      // System Action
      if (op.systemAction) {
        lines.push(`        <SystemAction>${op.systemAction}</SystemAction>`);
      }

      lines.push('      </Operation>');
    }

    lines.push('    </UnitProcedure>');
  }

  lines.push('  ');
  lines.push('  </Procedure>');

  // Signature Strategy
  if (recipe.signatureStrategy) {
    lines.push('  ');
    lines.push('  <SignatureStrategy>');
    if (recipe.signatureStrategy.criticalSteps.length > 0) {
      lines.push('    <CriticalSteps>');
      for (const cs of recipe.signatureStrategy.criticalSteps) {
        lines.push(`      <Step ref="${cs.ref}">${escapeXml(cs.description)}</Step>`);
      }
      lines.push('    </CriticalSteps>');
    }
    if (recipe.signatureStrategy.systemExecuted.length > 0) {
      lines.push('    <SystemExecuted>');
      for (const se of recipe.signatureStrategy.systemExecuted) {
        lines.push(`      <Step ref="${se.ref}">${escapeXml(se.description)}</Step>`);
      }
      lines.push('    </SystemExecuted>');
    }
    if (recipe.signatureStrategy.notes.length > 0) {
      lines.push('    <Notes>');
      for (const note of recipe.signatureStrategy.notes) {
        lines.push(`      <Note>${escapeXml(note)}</Note>`);
      }
      lines.push('    </Notes>');
    }
    lines.push('  </SignatureStrategy>');
  }

  // Cleaning Management
  if (recipe.cleaningManagement) {
    lines.push('  ');
    lines.push('  <CleaningManagement>');
    lines.push(`    <DHT_Management>${escapeXml(recipe.cleaningManagement.dhtManagement)}</DHT_Management>`);
    lines.push(`    <CHT_Management>${escapeXml(recipe.cleaningManagement.chtManagement)}</CHT_Management>`);
    lines.push(`    <CampaignLength>${escapeXml(recipe.cleaningManagement.campaignLength)}</CampaignLength>`);
    lines.push('    <CleaningLevels>');
    for (const level of recipe.cleaningManagement.cleaningLevels) {
      lines.push(`      <Level id="${level.id}">${escapeXml(level.name)}</Level>`);
    }
    lines.push('    </CleaningLevels>');
    lines.push('  </CleaningManagement>');
  }

  lines.push('  ');
  lines.push('</Recipe>');

  return lines.join('\n');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
