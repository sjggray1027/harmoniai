// HarmoniAI Workflow Types
// Based on ISA-88 / PAS-X recipe structure

export interface WorkflowStep {
  id: string;
  sequence: number;
  name: string;
  description?: string;
  interface: 'SAP' | 'MES' | 'SAP/MES' | 'Manual';
  sectionNumber?: number;
  signatures: SignatureRequirement;
  conditional?: boolean;
  conditionalType?: 'ProblemsDetected' | 'ActionDependent' | 'MaterialDependent' | 'CleaningOK';
  parameters?: Parameter[];
  instructions?: string[];
  phases?: Phase[];
  systemAction?: string;
  criticalStep?: boolean;
  applicableTo?: string;
  perSection?: string;
}

export interface Phase {
  id: string;
  sequence: number;
  name: string;
  description?: string;
  interface?: 'SAP' | 'MES';
  sectionNumber?: number;
  signatures: SignatureRequirement;
}

export interface SignatureRequirement {
  required: number | 'variable';
  types?: SignatureType[];
}

export interface SignatureType {
  type: 'Performed' | 'Verified' | 'Reviewed' | 'Approved';
  role: string;
}

export interface Parameter {
  name: string;
  type: 'Numeric' | 'Text' | 'DateTime' | 'Boolean';
  unit?: string;
  lowerLimit?: number;
  upperLimit?: number;
  value?: string | number;
}

export interface UnitProcedure {
  id: string;
  sequence: number;
  name: string;
  description?: string;
  operations: WorkflowStep[];
}

export interface Material {
  id: string;
  name: string;
  type: 'Bulk' | 'PackagingComponent' | 'RawMaterial';
  componentType?: 'VariableCoding' | 'NonVariableCoding';
  quantity?: number;
  unit?: string;
  storageConditions?: string;
}

export interface Equipment {
  id: string;
  name: string;
  equipmentClass: string;
  sections?: EquipmentSection[];
}

export interface EquipmentSection {
  id: string;
  name: string;
}

export interface RecipeHeader {
  recipeId: string;
  recipeName: string;
  recipeVersion: string;
  recipeType: 'Master' | 'Control' | 'Site';
  productType: string;
  description?: string;
  author: string;
  creationDate: string;
  status: 'Draft' | 'In Review' | 'Approved' | 'Effective' | 'Superseded';
  effectiveDate?: string;
  expirationDate?: string;
}

export interface Recipe {
  header: RecipeHeader;
  materials: Material[];
  equipment: Equipment[];
  unitProcedures: UnitProcedure[];
  signatureStrategy?: SignatureStrategy;
  cleaningManagement?: CleaningManagement;
}

export interface SignatureStrategy {
  criticalSteps: { ref: string; description: string }[];
  systemExecuted: { ref: string; description: string }[];
  notes: string[];
}

export interface CleaningManagement {
  dhtManagement: string;
  chtManagement: string;
  campaignLength: string;
  cleaningLevels: { id: string; name: string }[];
}

// Parsed document result
export interface ParsedDocument {
  fileName: string;
  fileType: 'excel' | 'word' | 'pdf';
  extractedSteps: ExtractedStep[];
  rawData?: unknown;
  parseDate: string;
  confidence: number;
}

export interface ExtractedStep {
  id: string;
  rowIndex?: number;
  phase?: string;
  interface?: string;
  sectionNumber?: string;
  description: string;
  clarification?: string;
  signatures?: string;
  rawText?: string;
  confidence: number;
  // Standards review additions
  complianceNotes?: string;
  reviewStatus?: 'pending' | 'approved' | 'flagged';
}

// Mapping configuration
export interface MappingConfig {
  unitProcedureMapping: {
    [key: string]: string; // e.g., "Set-up" -> "UP-SETUP"
  };
  interfaceMapping: {
    [key: string]: 'SAP' | 'MES' | 'SAP/MES' | 'Manual';
  };
  signatureRules: {
    pattern: string;
    required: number;
  }[];
}
