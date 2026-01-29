// EBR Workload Estimation Types

export interface EstimationFactors {
  unitOperations: number;
  processSteps: number;
  simpleCalculations: number;
  complexCalculations: number;
  conditionalLogicBranches: number;
  equipmentIntegrations: number;
  signatures: number;
  integrationComplexity: number; // 1-5 scale
}

export interface EstimationWeights {
  unitOperation: number;
  processStep: number;
  simpleCalculation: number;
  complexCalculation: number;
  conditionalLogic: number;
  equipmentIntegration: number;
  signature: number;
  complexityMultiplier: number[]; // [1.0, 1.2, 1.5, 2.0, 2.5] for ratings 1-5
  validationFactor: number; // Multiplier for validation hours (e.g., 0.5 = 50% of build time)
}

export interface EstimationResult {
  buildHours: number;
  validateHours: number;
  totalHours: number;
  confidence: number;
  breakdown: {
    unitOperations: { count: number; hours: number };
    processSteps: { count: number; hours: number };
    simpleCalculations: { count: number; hours: number };
    complexCalculations: { count: number; hours: number };
    conditionalLogic: { count: number; hours: number };
    equipmentIntegrations: { count: number; hours: number };
    signatures: { count: number; hours: number };
  };
}

export interface FileEstimate {
  fileName: string;
  fileType: string;
  factors: EstimationFactors;
  estimate: EstimationResult;
  extractedElements: {
    phases: string[];
    steps: string[];
    calculations: string[];
    conditionals: string[];
    integrations: string[];
  };
}

export interface ProjectEstimate {
  projectName: string;
  createdAt: string;
  files: FileEstimate[];
  totals: {
    factors: EstimationFactors;
    estimate: EstimationResult;
  };
  weights: EstimationWeights;
}

// Default weights based on typical MES implementation experience
export const DEFAULT_WEIGHTS: EstimationWeights = {
  unitOperation: 8,        // 8 hours per unit operation
  processStep: 0.5,        // 30 min per step
  simpleCalculation: 1,    // 1 hour per simple calculation
  complexCalculation: 4,   // 4 hours per complex calculation
  conditionalLogic: 2,     // 2 hours per conditional branch
  equipmentIntegration: 6, // 6 hours per equipment integration
  signature: 0.25,         // 15 min per signature point
  complexityMultiplier: [1.0, 1.2, 1.5, 2.0, 2.5],
  validationFactor: 0.5,   // Validation = 50% of build time
};
