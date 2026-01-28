/**
 * Converter: Extracted Steps → ISA-88 Canonical Model
 *
 * This module converts the parsed document steps into the ISA-88
 * canonical representation that can be consumed by any MES generator.
 */

import { ExtractedStep } from '@/types/workflow';
import {
  Procedure,
  UnitProcedure,
  Operation,
  Phase,
  Signature,
  InterfacePoint,
  SignatureType,
  InterfaceSystem,
  RecipeType,
  TransitionType,
  createProcedure,
  createUnitProcedure,
  createOperation,
  createPhase,
  createSignature,
} from '../models/isa88-canonical';

export interface ConversionOptions {
  recipeName: string;
  recipeVersion?: string;
  productCode?: string;
  productName?: string;
  author?: string;
  description?: string;
  recipeType?: RecipeType;
  defaultSignatures?: boolean;
  groupByPhase?: boolean;
}

interface PhaseGroup {
  name: string;
  steps: ExtractedStep[];
}

/**
 * Convert extracted steps to ISA-88 Procedure
 */
export function convertToProcedure(
  steps: ExtractedStep[],
  options: ConversionOptions
): Procedure {
  const procedure = createProcedure(options.recipeName, {
    version: options.recipeVersion || '1.0',
    productCode: options.productCode,
    productName: options.productName,
    author: options.author,
    description: options.description,
    recipeType: options.recipeType || RecipeType.MASTER,
  });

  // Group steps by phase if requested
  const phaseGroups = options.groupByPhase !== false
    ? groupStepsByPhase(steps)
    : [{ name: 'Main', steps }];

  // Convert each phase group to a Unit Procedure
  phaseGroups.forEach((group, groupIndex) => {
    const unitProcedure = createUnitProcedureFromGroup(
      group,
      groupIndex + 1,
      options.defaultSignatures
    );
    procedure.unitProcedures.push(unitProcedure);
  });

  // Add sequential transitions between unit procedures
  for (let i = 0; i < procedure.unitProcedures.length - 1; i++) {
    procedure.transitions.push({
      id: `trans-up-${i}`,
      type: TransitionType.SEQUENTIAL,
      sourceId: procedure.unitProcedures[i].id,
      targetId: procedure.unitProcedures[i + 1].id,
    });
  }

  return procedure;
}

/**
 * Group steps by their phase property
 */
function groupStepsByPhase(steps: ExtractedStep[]): PhaseGroup[] {
  const groups: Map<string, ExtractedStep[]> = new Map();
  const orderedPhases: string[] = [];

  steps.forEach(step => {
    const phaseName = normalizePhaseNAme(step.phase || 'Unassigned');

    if (!groups.has(phaseName)) {
      groups.set(phaseName, []);
      orderedPhases.push(phaseName);
    }
    groups.get(phaseName)!.push(step);
  });

  return orderedPhases.map(name => ({
    name,
    steps: groups.get(name)!,
  }));
}

/**
 * Normalize phase names to standard ISA-88 conventions
 */
function normalizePhaseNAme(phase: string): string {
  const lower = phase.toLowerCase().trim();

  // Map common variations to standard names
  const mappings: Record<string, string> = {
    'setup': 'Set-up',
    'set-up': 'Set-up',
    'set up': 'Set-up',
    'preparation': 'Set-up',
    'prep': 'Set-up',
    'run': 'Production',
    'production': 'Production',
    'execute': 'Production',
    'execution': 'Production',
    'main': 'Production',
    'cleanup': 'Clean-up',
    'clean-up': 'Clean-up',
    'clean up': 'Clean-up',
    'line cleanup': 'Clean-up',
    'line clean-up': 'Clean-up',
    'cleaning': 'Clean-up',
    'review': 'Review',
    'batch record review': 'Review',
    'verification': 'Review',
    'qc': 'Review',
    'unassigned': 'General',
  };

  return mappings[lower] || phase;
}

/**
 * Create a Unit Procedure from a phase group
 */
function createUnitProcedureFromGroup(
  group: PhaseGroup,
  sequence: number,
  addDefaultSignatures?: boolean
): UnitProcedure {
  const unitProcedure = createUnitProcedure(group.name, sequence);

  // Group steps into operations (batch of related steps)
  const operationGroups = groupStepsIntoOperations(group.steps);

  operationGroups.forEach((opGroup, opIndex) => {
    const operation = createOperationFromSteps(
      opGroup.name,
      opGroup.steps,
      opIndex + 1,
      addDefaultSignatures
    );
    unitProcedure.operations.push(operation);
  });

  // Add transitions between operations
  for (let i = 0; i < unitProcedure.operations.length - 1; i++) {
    unitProcedure.transitions.push({
      id: `trans-op-${unitProcedure.id}-${i}`,
      type: TransitionType.SEQUENTIAL,
      sourceId: unitProcedure.operations[i].id,
      targetId: unitProcedure.operations[i + 1].id,
    });
  }

  // Add unit procedure level signatures if requested
  if (addDefaultSignatures) {
    unitProcedure.signatures.push(
      createSignature(SignatureType.PERFORM, 'Operator', 1),
      createSignature(SignatureType.VERIFY, 'Supervisor', 2)
    );
  }

  return unitProcedure;
}

interface OperationGroup {
  name: string;
  steps: ExtractedStep[];
}

/**
 * Group steps into logical operations
 */
function groupStepsIntoOperations(steps: ExtractedStep[]): OperationGroup[] {
  // Strategy: Group by section number prefix or create operations of ~5-10 steps
  const groups: OperationGroup[] = [];
  let currentGroup: ExtractedStep[] = [];
  let currentSection: string | null = null;

  steps.forEach((step, index) => {
    const section = step.sectionNumber?.split('.')[0] || null;

    // Start new group if section changes or group is too large
    if (
      (section && section !== currentSection) ||
      currentGroup.length >= 10
    ) {
      if (currentGroup.length > 0) {
        groups.push({
          name: getOperationName(currentGroup, groups.length + 1),
          steps: currentGroup,
        });
      }
      currentGroup = [step];
      currentSection = section;
    } else {
      currentGroup.push(step);
    }

    // Handle last step
    if (index === steps.length - 1 && currentGroup.length > 0) {
      groups.push({
        name: getOperationName(currentGroup, groups.length + 1),
        steps: currentGroup,
      });
    }
  });

  // If no groups were created, create one with all steps
  if (groups.length === 0 && steps.length > 0) {
    groups.push({
      name: 'Operation 1',
      steps,
    });
  }

  return groups;
}

/**
 * Generate operation name from steps
 */
function getOperationName(steps: ExtractedStep[], index: number): string {
  // Try to extract meaningful name from first step
  const firstStep = steps[0];

  if (firstStep.sectionNumber) {
    return `Section ${firstStep.sectionNumber.split('.')[0]}`;
  }

  // Extract key action words from description
  const actionWords = ['weigh', 'mix', 'blend', 'granulate', 'dry', 'mill',
    'compress', 'coat', 'package', 'inspect', 'sample', 'clean', 'verify',
    'prepare', 'charge', 'discharge', 'filter', 'transfer'];

  const desc = firstStep.description.toLowerCase();
  const foundAction = actionWords.find(word => desc.includes(word));

  if (foundAction) {
    return `${foundAction.charAt(0).toUpperCase() + foundAction.slice(1)} Operation`;
  }

  return `Operation ${index}`;
}

/**
 * Create an Operation from steps
 */
function createOperationFromSteps(
  name: string,
  steps: ExtractedStep[],
  sequence: number,
  addDefaultSignatures?: boolean
): Operation {
  const operation = createOperation(name, sequence);

  // Convert each step to a Phase
  steps.forEach((step, index) => {
    const phase = createPhaseFromStep(step, index + 1);
    operation.phases.push(phase);
  });

  // Add transitions between phases
  for (let i = 0; i < operation.phases.length - 1; i++) {
    operation.transitions.push({
      id: `trans-ph-${operation.id}-${i}`,
      type: TransitionType.SEQUENTIAL,
      sourceId: operation.phases[i].id,
      targetId: operation.phases[i + 1].id,
    });
  }

  // Add operation level signatures
  if (addDefaultSignatures) {
    operation.signatures.push(
      createSignature(SignatureType.PERFORM, 'Operator', 1)
    );
  }

  return operation;
}

/**
 * Create a Phase from an extracted step
 */
function createPhaseFromStep(step: ExtractedStep, sequence: number): Phase {
  const phase = createPhase(
    step.description.substring(0, 100),
    sequence,
    determinePhaseType(step)
  );

  phase.instructions = step.description;

  if (step.clarification) {
    phase.description = step.clarification;
  }

  // Add interface points
  if (step.interface) {
    phase.interfaces.push(createInterfacePoint(step.interface));
  }

  // Add signatures based on step configuration
  if (step.signatures) {
    const sigs = parseSignatures(step.signatures);
    phase.signatures.push(...sigs);
  }

  return phase;
}

/**
 * Determine phase type from step characteristics
 */
function determinePhaseType(step: ExtractedStep): Phase['type'] {
  const desc = step.description.toLowerCase();

  // Automatic if interface with automation system
  if (step.interface === 'MES' || step.interface === 'SAP/MES') {
    return 'semi-automatic';
  }

  // Check for automation keywords
  const autoKeywords = ['automatically', 'auto', 'system will', 'plc', 'dcs'];
  if (autoKeywords.some(kw => desc.includes(kw))) {
    return 'automatic';
  }

  // Check for semi-automatic keywords
  const semiAutoKeywords = ['scan', 'barcode', 'rfid', 'confirm', 'acknowledge'];
  if (semiAutoKeywords.some(kw => desc.includes(kw))) {
    return 'semi-automatic';
  }

  return 'manual';
}

/**
 * Create interface point from interface string
 */
function createInterfacePoint(interfaceStr: string): InterfacePoint {
  const systemMap: Record<string, InterfaceSystem> = {
    'SAP': InterfaceSystem.SAP,
    'MES': InterfaceSystem.MES,
    'SAP/MES': InterfaceSystem.MES,
    'LIMS': InterfaceSystem.LIMS,
    'DCS': InterfaceSystem.DCS,
    'SCADA': InterfaceSystem.SCADA,
  };

  return {
    id: `interface-${Date.now()}`,
    system: systemMap[interfaceStr.toUpperCase()] || InterfaceSystem.MES,
    direction: 'bidirectional',
    dataMapping: [],
  };
}

/**
 * Parse signatures from step configuration
 */
function parseSignatures(sigConfig: string | number): Signature[] {
  const signatures: Signature[] = [];

  if (typeof sigConfig === 'number') {
    // Simple count of signatures
    for (let i = 0; i < sigConfig; i++) {
      signatures.push(createSignature(
        i === 0 ? SignatureType.PERFORM : SignatureType.VERIFY,
        i === 0 ? 'Operator' : 'Verifier',
        i + 1
      ));
    }
  } else if (sigConfig === 'variable') {
    // Variable signatures - add placeholder
    signatures.push(createSignature(SignatureType.PERFORM, 'Operator', 1));
    signatures.push(createSignature(SignatureType.VERIFY, 'Verifier', 2));
  } else {
    // Parse string configuration (e.g., "2 sig", "perform+verify")
    const count = parseInt(sigConfig) || 1;
    for (let i = 0; i < count; i++) {
      signatures.push(createSignature(
        i === 0 ? SignatureType.PERFORM : SignatureType.VERIFY,
        i === 0 ? 'Operator' : 'Verifier',
        i + 1
      ));
    }
  }

  return signatures;
}

/**
 * Get statistics about the conversion
 */
export function getConversionStats(procedure: Procedure): {
  unitProcedures: number;
  operations: number;
  phases: number;
  signatures: number;
  interfaces: number;
} {
  let operations = 0;
  let phases = 0;
  let signatures = 0;
  let interfaces = 0;

  procedure.unitProcedures.forEach(up => {
    signatures += up.signatures.length;
    up.operations.forEach(op => {
      operations++;
      signatures += op.signatures.length;
      op.phases.forEach(ph => {
        phases++;
        signatures += ph.signatures.length;
        interfaces += ph.interfaces.length;
      });
    });
  });

  return {
    unitProcedures: procedure.unitProcedures.length,
    operations,
    phases,
    signatures,
    interfaces,
  };
}
