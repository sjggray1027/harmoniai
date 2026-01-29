import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import {
  EstimationFactors,
  EstimationWeights,
  EstimationResult,
  FileEstimate,
  ProjectEstimate,
  DEFAULT_WEIGHTS,
} from '@/types/estimator';
import { ParsedDocument, ExtractedStep } from '@/types/workflow';

export const runtime = 'nodejs';

// Patterns for detecting different element types
const CALCULATION_PATTERNS = {
  simple: [
    /\b(add|subtract|multiply|divide|sum|total|calculate)\b/i,
    /\b\d+\s*[+\-*/]\s*\d+\b/,
    /\b(percentage|percent|%)\b/i,
    /\b(average|mean)\b/i,
  ],
  complex: [
    /\b(yield|theoretical|actual)\s*(calculation|yield)/i,
    /\b(formula|equation)\b/i,
    /\bif\s*\(.+\)\s*then\b/i,
    /\b(interpolat|extrapol)/i,
    /\b(regression|coefficient)\b/i,
    /\b(limit|specification|spec)\s*(calculation)/i,
  ],
};

const CONDITIONAL_PATTERNS = [
  /\bif\b.+\b(then|proceed|perform|skip|repeat)\b/i,
  /\b(when|unless|otherwise)\b/i,
  /\b(decision|branch|conditional)\b/i,
  /\b(pass|fail)\s*(criteria|test)/i,
  /\b(accept|reject)\b/i,
  /\?.*:/,  // Ternary-like patterns
];

const EQUIPMENT_PATTERNS = [
  /\b(scale|balance|weigh)\b/i,
  /\b(sensor|probe|detector)\b/i,
  /\b(plc|hmi|scada)\b/i,
  /\b(mixer|blender|granulator|tablet\s*press|coater)\b/i,
  /\b(equipment|machine|instrument)\s*id/i,
  /\b(barcode|scanner|reader)\b/i,
  /\b(printer|label)\b/i,
  /\bEQ[-_]?\d+\b/i,
];

function analyzeStep(step: ExtractedStep): {
  isCalculationSimple: boolean;
  isCalculationComplex: boolean;
  isConditional: boolean;
  hasEquipment: boolean;
} {
  const text = `${step.description || ''} ${step.clarification || ''} ${step.rawText || ''}`;

  const isCalculationSimple = CALCULATION_PATTERNS.simple.some(p => p.test(text));
  const isCalculationComplex = CALCULATION_PATTERNS.complex.some(p => p.test(text));
  const isConditional = CONDITIONAL_PATTERNS.some(p => p.test(text));
  const hasEquipment = EQUIPMENT_PATTERNS.some(p => p.test(text)) ||
                       (step.interface === 'MES' || step.interface === 'SAP/MES');

  return { isCalculationSimple, isCalculationComplex, isConditional, hasEquipment };
}

function extractFactors(doc: ParsedDocument): {
  factors: EstimationFactors;
  elements: FileEstimate['extractedElements'];
} {
  const steps = doc.extractedSteps;
  const phases = new Set<string>();
  const calculations: string[] = [];
  const conditionals: string[] = [];
  const integrations: string[] = [];
  const stepDescriptions: string[] = [];

  let simpleCalcs = 0;
  let complexCalcs = 0;
  let conditionalCount = 0;
  let equipmentCount = 0;
  let signatureCount = 0;

  for (const step of steps) {
    // Track phases/unit operations
    if (step.phase) {
      phases.add(step.phase);
    }

    // Track step descriptions
    if (step.description) {
      stepDescriptions.push(step.description);
    }

    // Analyze step content
    const analysis = analyzeStep(step);

    if (analysis.isCalculationComplex) {
      complexCalcs++;
      calculations.push(`[Complex] ${step.description}`);
    } else if (analysis.isCalculationSimple) {
      simpleCalcs++;
      calculations.push(`[Simple] ${step.description}`);
    }

    if (analysis.isConditional) {
      conditionalCount++;
      conditionals.push(step.description);
    }

    if (analysis.hasEquipment) {
      equipmentCount++;
      integrations.push(`${step.interface || 'Equipment'}: ${step.description}`);
    }

    // Count signatures
    if (step.signatures) {
      const sigMatch = step.signatures.match(/\d+/);
      if (sigMatch) {
        signatureCount += parseInt(sigMatch[0], 10);
      } else if (step.signatures.toLowerCase() === 'variable') {
        signatureCount += 2; // Assume 2 for variable
      }
    }
  }

  // Calculate integration complexity (1-5) based on ratio of integrations to steps
  const integrationRatio = steps.length > 0 ? equipmentCount / steps.length : 0;
  let integrationComplexity = 1;
  if (integrationRatio > 0.5) integrationComplexity = 5;
  else if (integrationRatio > 0.35) integrationComplexity = 4;
  else if (integrationRatio > 0.2) integrationComplexity = 3;
  else if (integrationRatio > 0.1) integrationComplexity = 2;

  return {
    factors: {
      unitOperations: phases.size || 1, // At least 1 unit operation
      processSteps: steps.length,
      simpleCalculations: simpleCalcs,
      complexCalculations: complexCalcs,
      conditionalLogicBranches: conditionalCount,
      equipmentIntegrations: equipmentCount,
      signatures: signatureCount,
      integrationComplexity,
    },
    elements: {
      phases: Array.from(phases),
      steps: stepDescriptions.slice(0, 50), // Limit for display
      calculations,
      conditionals,
      integrations,
    },
  };
}

function calculateEstimate(factors: EstimationFactors, weights: EstimationWeights): EstimationResult {
  const complexityMult = weights.complexityMultiplier[factors.integrationComplexity - 1] || 1;

  const breakdown = {
    unitOperations: {
      count: factors.unitOperations,
      hours: factors.unitOperations * weights.unitOperation,
    },
    processSteps: {
      count: factors.processSteps,
      hours: factors.processSteps * weights.processStep,
    },
    simpleCalculations: {
      count: factors.simpleCalculations,
      hours: factors.simpleCalculations * weights.simpleCalculation,
    },
    complexCalculations: {
      count: factors.complexCalculations,
      hours: factors.complexCalculations * weights.complexCalculation,
    },
    conditionalLogic: {
      count: factors.conditionalLogicBranches,
      hours: factors.conditionalLogicBranches * weights.conditionalLogic,
    },
    equipmentIntegrations: {
      count: factors.equipmentIntegrations,
      hours: factors.equipmentIntegrations * weights.equipmentIntegration,
    },
    signatures: {
      count: factors.signatures,
      hours: factors.signatures * weights.signature,
    },
  };

  const baseBuildHours = Object.values(breakdown).reduce((sum, item) => sum + item.hours, 0);
  const buildHours = Math.round(baseBuildHours * complexityMult * 10) / 10;
  const validateHours = Math.round(buildHours * weights.validationFactor * 10) / 10;

  // Confidence based on data quality
  let confidence = 70; // Base confidence
  if (factors.processSteps > 10) confidence += 10;
  if (factors.unitOperations > 1) confidence += 10;
  if (factors.equipmentIntegrations > 0) confidence += 5;
  confidence = Math.min(95, confidence);

  return {
    buildHours,
    validateHours,
    totalHours: buildHours + validateHours,
    confidence,
    breakdown,
  };
}

function aggregateFactors(files: FileEstimate[]): EstimationFactors {
  return files.reduce(
    (acc, file) => ({
      unitOperations: acc.unitOperations + file.factors.unitOperations,
      processSteps: acc.processSteps + file.factors.processSteps,
      simpleCalculations: acc.simpleCalculations + file.factors.simpleCalculations,
      complexCalculations: acc.complexCalculations + file.factors.complexCalculations,
      conditionalLogicBranches: acc.conditionalLogicBranches + file.factors.conditionalLogicBranches,
      equipmentIntegrations: acc.equipmentIntegrations + file.factors.equipmentIntegrations,
      signatures: acc.signatures + file.factors.signatures,
      integrationComplexity: Math.max(acc.integrationComplexity, file.factors.integrationComplexity),
    }),
    {
      unitOperations: 0,
      processSteps: 0,
      simpleCalculations: 0,
      complexCalculations: 0,
      conditionalLogicBranches: 0,
      equipmentIntegrations: 0,
      signatures: 0,
      integrationComplexity: 1,
    }
  );
}

function generateExcel(project: ProjectEstimate): Buffer {
  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryData = [
    ['EBR Workload Estimation Report'],
    ['Project Name', project.projectName],
    ['Generated', project.createdAt],
    ['Total Files', project.files.length],
    [],
    ['PROJECT TOTALS'],
    ['Category', 'Count', 'Estimated Hours'],
    ['Unit Operations', project.totals.factors.unitOperations, project.totals.estimate.breakdown.unitOperations.hours],
    ['Process Steps', project.totals.factors.processSteps, project.totals.estimate.breakdown.processSteps.hours],
    ['Simple Calculations', project.totals.factors.simpleCalculations, project.totals.estimate.breakdown.simpleCalculations.hours],
    ['Complex Calculations', project.totals.factors.complexCalculations, project.totals.estimate.breakdown.complexCalculations.hours],
    ['Conditional Logic', project.totals.factors.conditionalLogicBranches, project.totals.estimate.breakdown.conditionalLogic.hours],
    ['Equipment Integrations', project.totals.factors.equipmentIntegrations, project.totals.estimate.breakdown.equipmentIntegrations.hours],
    ['Signatures', project.totals.factors.signatures, project.totals.estimate.breakdown.signatures.hours],
    [],
    ['Integration Complexity', `${project.totals.factors.integrationComplexity}/5`],
    [],
    ['ESTIMATE SUMMARY'],
    ['Build Hours', project.totals.estimate.buildHours],
    ['Validation Hours', project.totals.estimate.validateHours],
    ['Total Hours', project.totals.estimate.totalHours],
    ['Confidence', `${project.totals.estimate.confidence}%`],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  summarySheet['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // File breakdown sheet
  const fileHeaders = [
    'File Name', 'Type', 'Unit Ops', 'Steps', 'Simple Calcs', 'Complex Calcs',
    'Conditionals', 'Integrations', 'Signatures', 'Complexity', 'Build Hrs', 'Validate Hrs', 'Total Hrs'
  ];
  const fileData = [
    fileHeaders,
    ...project.files.map(f => [
      f.fileName,
      f.fileType,
      f.factors.unitOperations,
      f.factors.processSteps,
      f.factors.simpleCalculations,
      f.factors.complexCalculations,
      f.factors.conditionalLogicBranches,
      f.factors.equipmentIntegrations,
      f.factors.signatures,
      f.factors.integrationComplexity,
      f.estimate.buildHours,
      f.estimate.validateHours,
      f.estimate.totalHours,
    ]),
  ];

  const filesSheet = XLSX.utils.aoa_to_sheet(fileData);
  filesSheet['!cols'] = fileHeaders.map(() => ({ wch: 12 }));
  filesSheet['!cols'][0] = { wch: 30 };
  XLSX.utils.book_append_sheet(wb, filesSheet, 'By File');

  // Weights configuration sheet
  const weightsData = [
    ['Estimation Weights Used'],
    [],
    ['Factor', 'Hours per Unit'],
    ['Unit Operation', project.weights.unitOperation],
    ['Process Step', project.weights.processStep],
    ['Simple Calculation', project.weights.simpleCalculation],
    ['Complex Calculation', project.weights.complexCalculation],
    ['Conditional Logic', project.weights.conditionalLogic],
    ['Equipment Integration', project.weights.equipmentIntegration],
    ['Signature', project.weights.signature],
    [],
    ['Complexity Multipliers'],
    ['Level 1', project.weights.complexityMultiplier[0]],
    ['Level 2', project.weights.complexityMultiplier[1]],
    ['Level 3', project.weights.complexityMultiplier[2]],
    ['Level 4', project.weights.complexityMultiplier[3]],
    ['Level 5', project.weights.complexityMultiplier[4]],
    [],
    ['Validation Factor', project.weights.validationFactor],
  ];

  const weightsSheet = XLSX.utils.aoa_to_sheet(weightsData);
  weightsSheet['!cols'] = [{ wch: 20 }, { wch: 15 }];
  XLSX.utils.book_append_sheet(wb, weightsSheet, 'Weights');

  // Detailed elements sheet (for each file)
  const detailsData: (string | number)[][] = [['Extracted Elements by File']];
  for (const file of project.files) {
    detailsData.push([]);
    detailsData.push([file.fileName]);
    detailsData.push(['Phases/Unit Operations:']);
    file.extractedElements.phases.forEach(p => detailsData.push(['', p]));
    if (file.extractedElements.calculations.length > 0) {
      detailsData.push(['Calculations:']);
      file.extractedElements.calculations.forEach(c => detailsData.push(['', c]));
    }
    if (file.extractedElements.conditionals.length > 0) {
      detailsData.push(['Conditional Logic:']);
      file.extractedElements.conditionals.forEach(c => detailsData.push(['', c]));
    }
    if (file.extractedElements.integrations.length > 0) {
      detailsData.push(['Equipment Integrations:']);
      file.extractedElements.integrations.slice(0, 20).forEach(i => detailsData.push(['', i]));
    }
  }

  const detailsSheet = XLSX.utils.aoa_to_sheet(detailsData);
  detailsSheet['!cols'] = [{ wch: 30 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, detailsSheet, 'Details');

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documents, projectName, weights: customWeights, exportExcel } = body as {
      documents: ParsedDocument[];
      projectName?: string;
      weights?: Partial<EstimationWeights>;
      exportExcel?: boolean;
    };

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return NextResponse.json(
        { error: 'At least one parsed document is required' },
        { status: 400 }
      );
    }

    // Merge custom weights with defaults
    const weights: EstimationWeights = {
      ...DEFAULT_WEIGHTS,
      ...customWeights,
    };

    // Process each file
    const fileEstimates: FileEstimate[] = documents.map(doc => {
      const { factors, elements } = extractFactors(doc);
      const estimate = calculateEstimate(factors, weights);

      return {
        fileName: doc.fileName,
        fileType: doc.fileType,
        factors,
        estimate,
        extractedElements: elements,
      };
    });

    // Calculate project totals
    const totalFactors = aggregateFactors(fileEstimates);
    const totalEstimate = calculateEstimate(totalFactors, weights);

    const projectEstimate: ProjectEstimate = {
      projectName: projectName || 'EBR Implementation Project',
      createdAt: new Date().toISOString(),
      files: fileEstimates,
      totals: {
        factors: totalFactors,
        estimate: totalEstimate,
      },
      weights,
    };

    // Return Excel file if requested
    if (exportExcel) {
      const excelBuffer = generateExcel(projectEstimate);

      return new NextResponse(new Uint8Array(excelBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${projectName || 'ebr-estimate'}-${new Date().toISOString().split('T')[0]}.xlsx"`,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: projectEstimate,
    });
  } catch (error) {
    console.error('Estimation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate estimate' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      defaultWeights: DEFAULT_WEIGHTS,
      description: 'POST parsed documents to receive workload estimates',
    },
  });
}
