// HarmoniAI Standards Review Types
// For compliance review and standards document comparison

import { ExtractedStep } from './workflow';

/**
 * Represents a parsed standards document (SOP, regulatory requirement, policy)
 */
export interface StandardsDocument {
  id: string;
  fileName: string;
  fileType: 'pdf' | 'word' | 'excel';
  documentType: 'sop' | 'regulatory' | 'policy' | 'guideline' | 'other';
  title?: string;
  version?: string;
  effectiveDate?: string;
  sections: StandardsSection[];
  rawContent?: string;
  parseDate: string;
  confidence: number;
}

/**
 * A section within a standards document containing requirements
 */
export interface StandardsSection {
  id: string;
  sectionNumber?: string;
  title: string;
  content: string;
  requirements: StandardsRequirement[];
  subsections?: StandardsSection[];
}

/**
 * Individual requirement extracted from a standards document
 */
export interface StandardsRequirement {
  id: string;
  text: string;
  requirementType: 'shall' | 'should' | 'may' | 'must' | 'informative';
  category?: string;
  keywords: string[];
}

/**
 * AI-generated question about a discrepancy between workflow and standards
 */
export interface ComplianceQuestion {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  stepId: string;
  stepDescription: string;
  standardDocumentId: string;
  standardDocumentName: string;
  standardReference: string;
  standardRequirement: string;
  discrepancyType: 'missing_signature' | 'interface_mismatch' | 'missing_step' | 'documentation_gap' | 'regulatory_issue' | 'process_deviation' | 'other';
  question: string;
  context: string;
  suggestedResolutions: SuggestedResolution[];
  status: 'pending' | 'resolved' | 'skipped' | 'flagged';
  response?: ComplianceResponse;
}

/**
 * A suggested resolution option for a compliance question
 */
export interface SuggestedResolution {
  id: string;
  label: string;
  description: string;
  action: 'update_step' | 'add_note' | 'acknowledge' | 'flag_for_review' | 'no_action';
  stepUpdate?: Partial<ExtractedStep>;
}

/**
 * User's response to a compliance question
 */
export interface ComplianceResponse {
  questionId: string;
  resolutionId: string;
  resolutionType: 'accepted' | 'rejected' | 'clarification' | 'acknowledged';
  clarificationText?: string;
  respondedAt: string;
  appliedChanges?: Partial<ExtractedStep>;
}

/**
 * Tracks the state of a compliance review session
 */
export interface ReviewSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'uploading' | 'analyzing' | 'in_progress' | 'completed' | 'cancelled';
  standardsDocuments: StandardsDocument[];
  questions: ComplianceQuestion[];
  currentQuestionIndex: number;
  totalQuestions: number;
  resolvedCount: number;
  skippedCount: number;
  flaggedCount: number;
  analysisProgress?: number;
  analysisMessage?: string;
}

/**
 * Summary of compliance review findings for export/display
 */
export interface ComplianceSummary {
  sessionId: string;
  completedAt: string;
  standardsReviewed: {
    documentId: string;
    documentName: string;
    documentType: string;
  }[];
  findings: {
    critical: number;
    warning: number;
    info: number;
  };
  resolutions: {
    resolved: number;
    flagged: number;
    skipped: number;
  };
  changes: {
    stepId: string;
    stepDescription: string;
    changeType: string;
    changeDescription: string;
  }[];
}

/**
 * Request body for the standards analysis API
 */
export interface StandardsAnalysisRequest {
  steps: ExtractedStep[];
  standardsDocuments: StandardsDocument[];
  options?: {
    strictMode?: boolean;
    categoriesOfInterest?: string[];
    maxQuestions?: number;
  };
}

/**
 * Response from the standards analysis API
 */
export interface StandardsAnalysisResponse {
  success: boolean;
  sessionId: string;
  questions: ComplianceQuestion[];
  summary?: {
    totalDiscrepancies: number;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

// Severity color mapping for consistent UI
export const SEVERITY_COLORS = {
  critical: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    border: 'border-red-200',
    icon: 'text-red-500',
  },
  warning: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    border: 'border-yellow-200',
    icon: 'text-yellow-500',
  },
  info: {
    bg: 'bg-blue-100',
    text: 'text-blue-800',
    border: 'border-blue-200',
    icon: 'text-blue-500',
  },
} as const;

// Discrepancy type labels for display
export const DISCREPANCY_TYPE_LABELS: Record<ComplianceQuestion['discrepancyType'], string> = {
  missing_signature: 'Missing Signature',
  interface_mismatch: 'Interface Mismatch',
  missing_step: 'Missing Step',
  documentation_gap: 'Documentation Gap',
  regulatory_issue: 'Regulatory Issue',
  process_deviation: 'Process Deviation',
  other: 'Other',
};
