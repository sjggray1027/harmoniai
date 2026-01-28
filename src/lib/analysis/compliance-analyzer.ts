// Compliance Analyzer
// Uses Claude AI to compare workflow steps against standards documents

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { ExtractedStep } from '@/types/workflow';
import {
  StandardsDocument,
  ComplianceQuestion,
  SuggestedResolution,
} from '@/types/standards';
import {
  createComplianceQuestion,
  createSuggestedResolution,
  categorizeDiscrepancy,
  determineSeverity,
} from '@/lib/models/standards';

const anthropic = new Anthropic();

export interface AnalysisOptions {
  strictMode?: boolean;
  categoriesOfInterest?: string[];
  maxQuestions?: number;
}

export interface AnalysisResult {
  questions: ComplianceQuestion[];
  summary: {
    totalDiscrepancies: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

interface AIDiscrepancy {
  stepId: string;
  stepDescription: string;
  severity: 'critical' | 'warning' | 'info';
  discrepancyType: string;
  standardReference: string;
  standardRequirement: string;
  question: string;
  context: string;
  suggestedResolutions: {
    label: string;
    description: string;
    action: string;
    stepUpdate?: {
      signatures?: string;
      interface?: string;
      complianceNotes?: string;
    };
  }[];
}

interface AIAnalysisResponse {
  discrepancies: AIDiscrepancy[];
  summary: {
    totalDiscrepancies: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

/**
 * Analyzes workflow steps against standards documents using Claude AI
 */
export async function analyzeCompliance(
  steps: ExtractedStep[],
  standardsDocuments: StandardsDocument[],
  options: AnalysisOptions = {}
): Promise<AnalysisResult> {
  const prompt = buildAnalysisPrompt(steps, standardsDocuments, options);

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const analysisResult = parseAIResponse(content.text, standardsDocuments);

    // Apply max questions limit if specified
    if (options.maxQuestions && analysisResult.questions.length > options.maxQuestions) {
      // Prioritize by severity: critical first, then warning, then info
      analysisResult.questions.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
      analysisResult.questions = analysisResult.questions.slice(0, options.maxQuestions);
    }

    return analysisResult;
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error(
      error instanceof Error
        ? `Compliance analysis failed: ${error.message}`
        : 'Compliance analysis failed'
    );
  }
}

/**
 * Analyzes compliance with streaming for progress updates
 */
export async function analyzeComplianceWithStreaming(
  steps: ExtractedStep[],
  standardsDocuments: StandardsDocument[],
  options: AnalysisOptions = {},
  onProgress?: (message: string, progress: number) => void
): Promise<AnalysisResult> {
  const prompt = buildAnalysisPrompt(steps, standardsDocuments, options);

  onProgress?.('Starting analysis...', 5);

  try {
    let fullText = '';

    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    let progressPercent = 10;

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;

        // Update progress based on content length
        const estimatedProgress = Math.min(90, 10 + (fullText.length / 100));
        if (estimatedProgress > progressPercent + 5) {
          progressPercent = estimatedProgress;
          onProgress?.('Analyzing discrepancies...', progressPercent);
        }
      }
    }

    onProgress?.('Processing results...', 95);

    const analysisResult = parseAIResponse(fullText, standardsDocuments);

    // Apply max questions limit if specified
    if (options.maxQuestions && analysisResult.questions.length > options.maxQuestions) {
      analysisResult.questions.sort((a, b) => {
        const severityOrder = { critical: 0, warning: 1, info: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
      analysisResult.questions = analysisResult.questions.slice(0, options.maxQuestions);
    }

    onProgress?.('Analysis complete', 100);

    return analysisResult;
  } catch (error) {
    console.error('Claude API streaming error:', error);
    throw new Error(
      error instanceof Error
        ? `Compliance analysis failed: ${error.message}`
        : 'Compliance analysis failed'
    );
  }
}

/**
 * Builds the analysis prompt for Claude
 */
function buildAnalysisPrompt(
  steps: ExtractedStep[],
  standardsDocuments: StandardsDocument[],
  options: AnalysisOptions
): string {
  const stepsJson = steps.map((step, index) => ({
    id: step.id,
    index: index + 1,
    phase: step.phase || 'Unknown',
    interface: step.interface || 'Not specified',
    sectionNumber: step.sectionNumber || 'N/A',
    description: step.description,
    signatures: step.signatures || 'Not specified',
    clarification: step.clarification || '',
  }));

  const standardsContent = standardsDocuments.map(doc => {
    const sectionsText = doc.sections.map(section => {
      const requirementsText = section.requirements
        .map(req => `    - ${req.text}`)
        .join('\n');

      return `  ${section.sectionNumber || ''} ${section.title}:
${section.content}
  Requirements:
${requirementsText}`;
    }).join('\n\n');

    return `
Document: ${doc.fileName}
Type: ${doc.documentType}
Version: ${doc.version || 'Not specified'}

${sectionsText}`;
  }).join('\n\n---\n\n');

  const strictModeInstruction = options.strictMode
    ? 'Be thorough and flag any potential discrepancy, even minor ones.'
    : 'Focus on significant discrepancies that could impact compliance or quality.';

  const categoriesInstruction = options.categoriesOfInterest?.length
    ? `Focus particularly on these categories: ${options.categoriesOfInterest.join(', ')}.`
    : '';

  return `You are a pharmaceutical compliance expert reviewing batch record workflows against standards documents.

STANDARDS DOCUMENTS:
${standardsContent}

WORKFLOW STEPS:
${JSON.stringify(stepsJson, null, 2)}

ANALYSIS INSTRUCTIONS:
${strictModeInstruction}
${categoriesInstruction}

Analyze each workflow step against the standards and identify discrepancies in these categories:
1. Missing signature requirements - Steps that should require verification/approval signatures per the standards
2. Interface/system mismatches - Steps where the specified interface (SAP, MES) doesn't align with standards
3. Missing process steps - Required steps from standards that aren't in the workflow
4. Documentation gaps - Missing documentation or record-keeping requirements
5. Regulatory compliance issues - Potential non-compliance with regulations (FDA, ICH, etc.)
6. Process deviations - Steps that differ from standard procedures

For each discrepancy found, provide:
- The step ID and description it relates to
- Severity: "critical" (must be resolved), "warning" (should be reviewed), or "info" (for awareness)
- The discrepancy type from the categories above
- The exact standard reference (document name, section)
- The specific requirement from the standard
- A clear question for the user
- Context explaining why this is a discrepancy
- 2-4 suggested resolutions with labels, descriptions, and any step updates needed

Respond with valid JSON in this exact format:
{
  "discrepancies": [
    {
      "stepId": "step-uuid",
      "stepDescription": "Brief step description",
      "severity": "critical|warning|info",
      "discrepancyType": "missing_signature|interface_mismatch|missing_step|documentation_gap|regulatory_issue|process_deviation|other",
      "standardReference": "Document Name, Section X.Y",
      "standardRequirement": "The exact requirement text from the standard",
      "question": "Clear question for the user about this discrepancy",
      "context": "Explanation of why this is a discrepancy and its implications",
      "suggestedResolutions": [
        {
          "label": "Short action label",
          "description": "What this resolution means",
          "action": "update_step|add_note|acknowledge|flag_for_review|no_action",
          "stepUpdate": {
            "signatures": "2 (if updating signatures)",
            "interface": "SAP/MES (if updating interface)",
            "complianceNotes": "Note text (if adding notes)"
          }
        }
      ]
    }
  ],
  "summary": {
    "totalDiscrepancies": 5,
    "bySeverity": {"critical": 1, "warning": 3, "info": 1},
    "byCategory": {"missing_signature": 2, "documentation_gap": 2, "regulatory_issue": 1}
  }
}

If no discrepancies are found, return:
{
  "discrepancies": [],
  "summary": {
    "totalDiscrepancies": 0,
    "bySeverity": {"critical": 0, "warning": 0, "info": 0},
    "byCategory": {}
  }
}

Respond ONLY with the JSON, no additional text.`;
}

/**
 * Parses the AI response into structured compliance questions
 */
function parseAIResponse(
  responseText: string,
  standardsDocuments: StandardsDocument[]
): AnalysisResult {
  // Extract JSON from response (handle potential markdown code blocks)
  let jsonText = responseText.trim();

  // Remove markdown code blocks if present
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.slice(7);
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith('```')) {
    jsonText = jsonText.slice(0, -3);
  }
  jsonText = jsonText.trim();

  let parsed: AIAnalysisResponse;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    console.error('Failed to parse AI response:', jsonText.slice(0, 500));
    throw new Error('Failed to parse compliance analysis response');
  }

  // Convert AI discrepancies to ComplianceQuestions
  const questions: ComplianceQuestion[] = parsed.discrepancies.map(disc => {
    // Find the matching standards document
    const standardDoc = standardsDocuments.find(doc =>
      disc.standardReference.toLowerCase().includes(doc.fileName.toLowerCase()) ||
      doc.fileName.toLowerCase().includes(disc.standardReference.split(',')[0].toLowerCase())
    ) || standardsDocuments[0];

    // Convert suggested resolutions
    const suggestedResolutions: SuggestedResolution[] = disc.suggestedResolutions.map(res => {
      const stepUpdate = res.stepUpdate ? {
        signatures: res.stepUpdate.signatures,
        interface: res.stepUpdate.interface,
        complianceNotes: res.stepUpdate.complianceNotes,
      } : undefined;

      return createSuggestedResolution(
        res.label,
        res.description,
        res.action as SuggestedResolution['action'],
        stepUpdate
      );
    });

    return createComplianceQuestion(
      disc.stepId,
      disc.stepDescription,
      standardDoc?.id || 'unknown',
      standardDoc?.fileName || disc.standardReference.split(',')[0],
      disc.standardReference,
      disc.standardRequirement,
      disc.question,
      {
        severity: disc.severity,
        discrepancyType: disc.discrepancyType as ComplianceQuestion['discrepancyType'],
        context: disc.context,
        suggestedResolutions,
      }
    );
  });

  return {
    questions,
    summary: parsed.summary || {
      totalDiscrepancies: questions.length,
      bySeverity: {
        critical: questions.filter(q => q.severity === 'critical').length,
        warning: questions.filter(q => q.severity === 'warning').length,
        info: questions.filter(q => q.severity === 'info').length,
      },
      byCategory: questions.reduce((acc, q) => {
        acc[q.discrepancyType] = (acc[q.discrepancyType] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
  };
}

/**
 * Generates a quick summary of potential compliance issues without full analysis
 */
export async function quickComplianceCheck(
  steps: ExtractedStep[],
  standardsDocuments: StandardsDocument[]
): Promise<{
  hasIssues: boolean;
  estimatedIssues: number;
  categories: string[];
}> {
  // Quick heuristic check without AI call
  let estimatedIssues = 0;
  const categories = new Set<string>();

  for (const step of steps) {
    // Check for signature-related keywords without signatures
    if (
      (step.description.toLowerCase().includes('verify') ||
        step.description.toLowerCase().includes('review') ||
        step.description.toLowerCase().includes('approve')) &&
      (!step.signatures || step.signatures === '0' || step.signatures === '1')
    ) {
      estimatedIssues++;
      categories.add('missing_signature');
    }

    // Check for interface mismatches
    if (
      step.description.toLowerCase().includes('sap') &&
      step.interface?.toLowerCase() !== 'sap' &&
      step.interface?.toLowerCase() !== 'sap/mes'
    ) {
      estimatedIssues++;
      categories.add('interface_mismatch');
    }

    // Check for documentation requirements
    if (
      (step.description.toLowerCase().includes('document') ||
        step.description.toLowerCase().includes('record')) &&
      !step.clarification
    ) {
      estimatedIssues++;
      categories.add('documentation_gap');
    }
  }

  return {
    hasIssues: estimatedIssues > 0,
    estimatedIssues,
    categories: Array.from(categories),
  };
}
