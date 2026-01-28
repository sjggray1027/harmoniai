// Standards Review Model Factory Functions
// Creates and manages standards-related data structures

import { v4 as uuidv4 } from 'uuid';
import {
  StandardsDocument,
  StandardsSection,
  StandardsRequirement,
  ComplianceQuestion,
  ComplianceResponse,
  ReviewSession,
  SuggestedResolution,
  ComplianceSummary,
} from '@/types/standards';
import { ExtractedStep } from '@/types/workflow';

/**
 * Creates a new standards document
 */
export function createStandardsDocument(
  fileName: string,
  fileType: 'pdf' | 'word' | 'excel',
  options: Partial<StandardsDocument> = {}
): StandardsDocument {
  return {
    id: uuidv4(),
    fileName,
    fileType,
    documentType: options.documentType || 'other',
    title: options.title,
    version: options.version,
    effectiveDate: options.effectiveDate,
    sections: options.sections || [],
    rawContent: options.rawContent,
    parseDate: new Date().toISOString(),
    confidence: options.confidence ?? 0.5,
  };
}

/**
 * Creates a new standards section
 */
export function createStandardsSection(
  title: string,
  content: string,
  options: Partial<StandardsSection> = {}
): StandardsSection {
  return {
    id: uuidv4(),
    sectionNumber: options.sectionNumber,
    title,
    content,
    requirements: options.requirements || [],
    subsections: options.subsections,
  };
}

/**
 * Creates a new standards requirement
 */
export function createStandardsRequirement(
  text: string,
  options: Partial<StandardsRequirement> = {}
): StandardsRequirement {
  return {
    id: uuidv4(),
    text,
    requirementType: options.requirementType || determineRequirementType(text),
    category: options.category,
    keywords: options.keywords || extractKeywords(text),
  };
}

/**
 * Creates a new compliance question
 */
export function createComplianceQuestion(
  stepId: string,
  stepDescription: string,
  standardDocumentId: string,
  standardDocumentName: string,
  standardReference: string,
  standardRequirement: string,
  question: string,
  options: Partial<ComplianceQuestion> = {}
): ComplianceQuestion {
  return {
    id: uuidv4(),
    severity: options.severity || 'warning',
    stepId,
    stepDescription,
    standardDocumentId,
    standardDocumentName,
    standardReference,
    standardRequirement,
    discrepancyType: options.discrepancyType || 'other',
    question,
    context: options.context || '',
    suggestedResolutions: options.suggestedResolutions || createDefaultResolutions(),
    status: 'pending',
    response: undefined,
  };
}

/**
 * Creates default resolution options for a compliance question
 */
export function createDefaultResolutions(): SuggestedResolution[] {
  return [
    {
      id: uuidv4(),
      label: 'Accept & Update',
      description: 'Accept the recommendation and update the workflow step',
      action: 'update_step',
    },
    {
      id: uuidv4(),
      label: 'Acknowledge',
      description: 'Acknowledge the discrepancy without making changes',
      action: 'acknowledge',
    },
    {
      id: uuidv4(),
      label: 'Flag for Review',
      description: 'Flag this item for further review by a subject matter expert',
      action: 'flag_for_review',
    },
    {
      id: uuidv4(),
      label: 'No Action Needed',
      description: 'The current workflow is compliant as-is',
      action: 'no_action',
    },
  ];
}

/**
 * Creates a suggested resolution
 */
export function createSuggestedResolution(
  label: string,
  description: string,
  action: SuggestedResolution['action'],
  stepUpdate?: Partial<ExtractedStep>
): SuggestedResolution {
  return {
    id: uuidv4(),
    label,
    description,
    action,
    stepUpdate,
  };
}

/**
 * Creates a compliance response
 */
export function createComplianceResponse(
  questionId: string,
  resolutionId: string,
  resolutionType: ComplianceResponse['resolutionType'],
  options: Partial<ComplianceResponse> = {}
): ComplianceResponse {
  return {
    questionId,
    resolutionId,
    resolutionType,
    clarificationText: options.clarificationText,
    respondedAt: new Date().toISOString(),
    appliedChanges: options.appliedChanges,
  };
}

/**
 * Creates a new review session
 */
export function createReviewSession(): ReviewSession {
  return {
    id: uuidv4(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'uploading',
    standardsDocuments: [],
    questions: [],
    currentQuestionIndex: 0,
    totalQuestions: 0,
    resolvedCount: 0,
    skippedCount: 0,
    flaggedCount: 0,
  };
}

/**
 * Updates a review session
 */
export function updateReviewSession(
  session: ReviewSession,
  updates: Partial<ReviewSession>
): ReviewSession {
  return {
    ...session,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Creates a compliance summary from a completed review session
 */
export function createComplianceSummary(
  session: ReviewSession,
  appliedChanges: { stepId: string; stepDescription: string; changeType: string; changeDescription: string }[]
): ComplianceSummary {
  const findings = {
    critical: session.questions.filter(q => q.severity === 'critical').length,
    warning: session.questions.filter(q => q.severity === 'warning').length,
    info: session.questions.filter(q => q.severity === 'info').length,
  };

  return {
    sessionId: session.id,
    completedAt: new Date().toISOString(),
    standardsReviewed: session.standardsDocuments.map(doc => ({
      documentId: doc.id,
      documentName: doc.fileName,
      documentType: doc.documentType,
    })),
    findings,
    resolutions: {
      resolved: session.resolvedCount,
      flagged: session.flaggedCount,
      skipped: session.skippedCount,
    },
    changes: appliedChanges,
  };
}

/**
 * Determines the requirement type based on modal verbs in the text
 */
function determineRequirementType(text: string): StandardsRequirement['requirementType'] {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('must') || lowerText.includes('shall not') || lowerText.includes('is required')) {
    return 'must';
  }
  if (lowerText.includes('shall')) {
    return 'shall';
  }
  if (lowerText.includes('should')) {
    return 'should';
  }
  if (lowerText.includes('may') || lowerText.includes('can')) {
    return 'may';
  }

  return 'informative';
}

/**
 * Extracts keywords from requirement text for matching
 */
function extractKeywords(text: string): string[] {
  const keywords: string[] = [];
  const lowerText = text.toLowerCase();

  // Common pharmaceutical/manufacturing compliance keywords
  const keywordPatterns = [
    'signature', 'signatures', 'verify', 'verification', 'verified',
    'approve', 'approval', 'approved', 'review', 'reviewed',
    'document', 'documentation', 'record', 'records',
    'training', 'qualified', 'qualification',
    'calibration', 'calibrated', 'validation', 'validated',
    'cleaning', 'sanitization', 'sterilization',
    'parameter', 'parameters', 'limit', 'limits', 'specification',
    'deviation', 'non-conformance', 'capa', 'investigation',
    'batch', 'lot', 'batch record', 'lot record',
    'sop', 'procedure', 'instructions', 'work instruction',
    'quality', 'qc', 'qa', 'quality assurance', 'quality control',
    'gmp', 'cgmp', 'gxp', 'glp', 'gcp',
    'fda', '21 cfr', 'part 11', 'annex', 'ich',
    'audit trail', 'electronic signature', 'electronic record',
    'equipment', 'instrument', 'system',
    'raw material', 'component', 'packaging',
  ];

  for (const keyword of keywordPatterns) {
    if (lowerText.includes(keyword)) {
      keywords.push(keyword);
    }
  }

  return [...new Set(keywords)];
}

/**
 * Categorizes a discrepancy based on the question context
 */
export function categorizeDiscrepancy(
  question: string,
  requirement: string
): ComplianceQuestion['discrepancyType'] {
  const combined = (question + ' ' + requirement).toLowerCase();

  if (combined.includes('signature') || combined.includes('sign') || combined.includes('verify')) {
    return 'missing_signature';
  }
  if (combined.includes('interface') || combined.includes('system') || combined.includes('sap') || combined.includes('mes')) {
    return 'interface_mismatch';
  }
  if (combined.includes('missing') && combined.includes('step')) {
    return 'missing_step';
  }
  if (combined.includes('document') || combined.includes('record')) {
    return 'documentation_gap';
  }
  if (combined.includes('regulatory') || combined.includes('fda') || combined.includes('compliance') || combined.includes('cfr')) {
    return 'regulatory_issue';
  }
  if (combined.includes('deviation') || combined.includes('differ') || combined.includes('inconsistent')) {
    return 'process_deviation';
  }

  return 'other';
}

/**
 * Determines severity based on requirement type and context
 */
export function determineSeverity(
  requirementType: StandardsRequirement['requirementType'],
  context: string
): ComplianceQuestion['severity'] {
  const lowerContext = context.toLowerCase();

  // Critical: Must/Shall requirements or safety/regulatory mentions
  if (requirementType === 'must' || requirementType === 'shall') {
    if (
      lowerContext.includes('safety') ||
      lowerContext.includes('critical') ||
      lowerContext.includes('patient') ||
      lowerContext.includes('sterile') ||
      lowerContext.includes('gmp') ||
      lowerContext.includes('regulatory')
    ) {
      return 'critical';
    }
    return 'warning';
  }

  // Warning: Should requirements
  if (requirementType === 'should') {
    return 'warning';
  }

  // Info: May/Can or informative requirements
  return 'info';
}
