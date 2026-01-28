/**
 * ISA-88 Canonical Model
 *
 * This module defines the canonical data model based on ISA-88 (IEC 61512)
 * standard for batch control. All MES-specific generators consume this
 * intermediate representation.
 *
 * ISA-88 Hierarchy:
 * - Procedure (Recipe)
 *   - Unit Procedure
 *     - Operation
 *       - Phase
 *
 * Physical Model:
 * - Enterprise → Site → Area → Process Cell → Unit → Equipment Module → Control Module
 */

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Enumerations
// ============================================================================

export enum RecipeType {
  GENERAL = 'general',      // Site-independent
  SITE = 'site',            // Site-specific
  MASTER = 'master',        // Product-specific at a site
  CONTROL = 'control',      // Equipment-specific execution
}

export enum ParameterType {
  PROCESS = 'process',      // Process parameters (temp, pressure, etc.)
  EQUIPMENT = 'equipment',  // Equipment-specific parameters
  FORMULA = 'formula',      // Material quantities and ratios
  PROCEDURAL = 'procedural', // Procedural control parameters
}

export enum DataType {
  STRING = 'string',
  INTEGER = 'integer',
  REAL = 'real',
  BOOLEAN = 'boolean',
  ENUMERATION = 'enumeration',
  DATETIME = 'datetime',
  DURATION = 'duration',
}

export enum PhaseState {
  IDLE = 'idle',
  RUNNING = 'running',
  PAUSED = 'paused',
  HOLDING = 'holding',
  COMPLETE = 'complete',
  STOPPED = 'stopped',
  ABORTED = 'aborted',
}

export enum TransitionType {
  SEQUENTIAL = 'sequential',
  PARALLEL = 'parallel',
  SELECTION = 'selection',
  LOOP = 'loop',
}

export enum SignatureType {
  PERFORM = 'perform',
  VERIFY = 'verify',
  APPROVE = 'approve',
  REVIEW = 'review',
  WITNESS = 'witness',
}

export enum InterfaceSystem {
  SAP = 'SAP',
  MES = 'MES',
  LIMS = 'LIMS',
  DCS = 'DCS',
  SCADA = 'SCADA',
  ERP = 'ERP',
  QMS = 'QMS',
}

// ============================================================================
// Core ISA-88 Entities
// ============================================================================

export interface ISA88Header {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  createdDate: string;
  modifiedDate: string;
  status: 'draft' | 'approved' | 'released' | 'obsolete';
  recipeType: RecipeType;
  productCode?: string;
  productName?: string;
  batchSize?: {
    nominal: number;
    minimum: number;
    maximum: number;
    unit: string;
  };
}

export interface Parameter {
  id: string;
  name: string;
  type: ParameterType;
  dataType: DataType;
  value?: string | number | boolean;
  defaultValue?: string | number | boolean;
  unit?: string;
  minimum?: number;
  maximum?: number;
  enumValues?: string[];
  required: boolean;
  description?: string;
  scaling?: {
    factor: number;
    offset: number;
  };
}

export interface Material {
  id: string;
  code: string;
  name: string;
  quantity: number;
  unit: string;
  type: 'raw' | 'intermediate' | 'finished' | 'packaging';
  scalable: boolean;
  tolerancePlus?: number;
  toleranceMinus?: number;
  storageConditions?: string;
  handlingInstructions?: string;
}

export interface Equipment {
  id: string;
  code: string;
  name: string;
  type: string;
  capabilities?: string[];
  cleaningGroup?: string;
  qualificationStatus?: string;
}

export interface Signature {
  id: string;
  type: SignatureType;
  role: string;
  required: boolean;
  order: number;
  meaning?: string;
  timeLimit?: number; // minutes
}

export interface Transition {
  id: string;
  type: TransitionType;
  sourceId: string;
  targetId: string;
  condition?: string;
  priority?: number;
}

export interface InterfacePoint {
  id: string;
  system: InterfaceSystem;
  direction: 'input' | 'output' | 'bidirectional';
  dataMapping: {
    source: string;
    target: string;
    transformation?: string;
  }[];
  triggerEvent?: string;
}

// ============================================================================
// Procedural Elements
// ============================================================================

export interface Phase {
  id: string;
  name: string;
  description?: string;
  sequence: number;
  type: 'manual' | 'automatic' | 'semi-automatic';
  equipment?: Equipment;
  parameters: Parameter[];
  materials: Material[];
  signatures: Signature[];
  interfaces: InterfacePoint[];
  duration?: {
    estimated: number;
    minimum?: number;
    maximum?: number;
    unit: 'seconds' | 'minutes' | 'hours';
  };
  instructions?: string;
  criticalControlPoints?: {
    parameter: string;
    target: number;
    tolerance: number;
    action: string;
  }[];
  exceptions?: {
    condition: string;
    action: string;
    severity: 'warning' | 'alarm' | 'interlock';
  }[];
}

export interface Operation {
  id: string;
  name: string;
  description?: string;
  sequence: number;
  phases: Phase[];
  transitions: Transition[];
  parameters: Parameter[];
  signatures: Signature[];
  preConditions?: string[];
  postConditions?: string[];
  cleaningRequired?: boolean;
  cleaningType?: 'minor' | 'major' | 'campaign';
}

export interface UnitProcedure {
  id: string;
  name: string;
  description?: string;
  sequence: number;
  operations: Operation[];
  transitions: Transition[];
  equipment: Equipment[];
  parameters: Parameter[];
  signatures: Signature[];
  unitType?: string;
  resourceRequirements?: {
    personnel: number;
    duration: number;
    unit: string;
  };
}

export interface Procedure {
  id: string;
  header: ISA88Header;
  unitProcedures: UnitProcedure[];
  transitions: Transition[];
  formula?: {
    materials: Material[];
    parameters: Parameter[];
    scalingBasis?: string;
  };
  equipmentRequirements: Equipment[];
  validationRules?: {
    id: string;
    rule: string;
    severity: 'error' | 'warning';
    message: string;
  }[];
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createProcedure(
  name: string,
  options: Partial<ISA88Header> = {}
): Procedure {
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    header: {
      id: uuidv4(),
      name,
      version: '1.0',
      createdDate: now,
      modifiedDate: now,
      status: 'draft',
      recipeType: RecipeType.MASTER,
      ...options,
    },
    unitProcedures: [],
    transitions: [],
    equipmentRequirements: [],
  };
}

export function createUnitProcedure(
  name: string,
  sequence: number
): UnitProcedure {
  return {
    id: uuidv4(),
    name,
    sequence,
    operations: [],
    transitions: [],
    equipment: [],
    parameters: [],
    signatures: [],
  };
}

export function createOperation(
  name: string,
  sequence: number
): Operation {
  return {
    id: uuidv4(),
    name,
    sequence,
    phases: [],
    transitions: [],
    parameters: [],
    signatures: [],
  };
}

export function createPhase(
  name: string,
  sequence: number,
  type: Phase['type'] = 'manual'
): Phase {
  return {
    id: uuidv4(),
    name,
    sequence,
    type,
    parameters: [],
    materials: [],
    signatures: [],
    interfaces: [],
  };
}

export function createParameter(
  name: string,
  dataType: DataType,
  options: Partial<Parameter> = {}
): Parameter {
  return {
    id: uuidv4(),
    name,
    type: ParameterType.PROCESS,
    dataType,
    required: false,
    ...options,
  };
}

export function createSignature(
  type: SignatureType,
  role: string,
  order: number
): Signature {
  return {
    id: uuidv4(),
    type,
    role,
    required: true,
    order,
  };
}

export function createMaterial(
  code: string,
  name: string,
  quantity: number,
  unit: string
): Material {
  return {
    id: uuidv4(),
    code,
    name,
    quantity,
    unit,
    type: 'raw',
    scalable: true,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

export function validateProcedure(procedure: Procedure): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check header
  if (!procedure.header.name) {
    errors.push('Procedure name is required');
  }
  if (!procedure.header.version) {
    errors.push('Procedure version is required');
  }

  // Check unit procedures
  if (procedure.unitProcedures.length === 0) {
    warnings.push('Procedure has no unit procedures');
  }

  procedure.unitProcedures.forEach((up, upIndex) => {
    if (!up.name) {
      errors.push(`Unit procedure at index ${upIndex} has no name`);
    }
    if (up.operations.length === 0) {
      warnings.push(`Unit procedure "${up.name}" has no operations`);
    }

    up.operations.forEach((op, opIndex) => {
      if (!op.name) {
        errors.push(`Operation at index ${opIndex} in "${up.name}" has no name`);
      }
      if (op.phases.length === 0) {
        warnings.push(`Operation "${op.name}" has no phases`);
      }
    });
  });

  // Check for orphaned transitions
  const allIds = new Set<string>();
  procedure.unitProcedures.forEach(up => {
    allIds.add(up.id);
    up.operations.forEach(op => {
      allIds.add(op.id);
      op.phases.forEach(ph => allIds.add(ph.id));
    });
  });

  procedure.transitions.forEach(t => {
    if (!allIds.has(t.sourceId)) {
      errors.push(`Transition references unknown source: ${t.sourceId}`);
    }
    if (!allIds.has(t.targetId)) {
      errors.push(`Transition references unknown target: ${t.targetId}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function flattenPhases(procedure: Procedure): Phase[] {
  const phases: Phase[] = [];
  procedure.unitProcedures.forEach(up => {
    up.operations.forEach(op => {
      phases.push(...op.phases);
    });
  });
  return phases.sort((a, b) => a.sequence - b.sequence);
}

export function getTotalSignatureCount(procedure: Procedure): number {
  let count = 0;
  procedure.unitProcedures.forEach(up => {
    count += up.signatures.length;
    up.operations.forEach(op => {
      count += op.signatures.length;
      op.phases.forEach(ph => {
        count += ph.signatures.length;
      });
    });
  });
  return count;
}

export function getEquipmentList(procedure: Procedure): Equipment[] {
  const equipmentMap = new Map<string, Equipment>();

  procedure.equipmentRequirements.forEach(eq => {
    equipmentMap.set(eq.id, eq);
  });

  procedure.unitProcedures.forEach(up => {
    up.equipment.forEach(eq => {
      equipmentMap.set(eq.id, eq);
    });
    up.operations.forEach(op => {
      op.phases.forEach(ph => {
        if (ph.equipment) {
          equipmentMap.set(ph.equipment.id, ph.equipment);
        }
      });
    });
  });

  return Array.from(equipmentMap.values());
}

export function getMaterialList(procedure: Procedure): Material[] {
  const materialMap = new Map<string, Material>();

  if (procedure.formula) {
    procedure.formula.materials.forEach(mat => {
      materialMap.set(mat.id, mat);
    });
  }

  procedure.unitProcedures.forEach(up => {
    up.operations.forEach(op => {
      op.phases.forEach(ph => {
        ph.materials.forEach(mat => {
          materialMap.set(mat.id, mat);
        });
      });
    });
  });

  return Array.from(materialMap.values());
}
