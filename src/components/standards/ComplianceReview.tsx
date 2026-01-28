'use client';

import { useState, useMemo, useCallback } from 'react';
import {
  ComplianceQuestion,
  ComplianceResponse,
  SuggestedResolution,
  SEVERITY_COLORS,
  DISCREPANCY_TYPE_LABELS,
} from '@/types/standards';
import { ExtractedStep } from '@/types/workflow';
import { createComplianceResponse } from '@/lib/models/standards';

interface ComplianceReviewProps {
  questions: ComplianceQuestion[];
  onQuestionResolved: (questionId: string, response: ComplianceResponse, stepUpdate?: Partial<ExtractedStep>) => void;
  onSkipQuestion: (questionId: string) => void;
  onComplete: () => void;
  onBack: () => void;
}

export default function ComplianceReview({
  questions,
  onQuestionResolved,
  onSkipQuestion,
  onComplete,
  onBack,
}: ComplianceReviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clarificationText, setClarificationText] = useState('');
  const [showClarification, setShowClarification] = useState(false);

  const currentQuestion = questions[currentIndex];

  const progress = useMemo(() => {
    const resolved = questions.filter(q => q.status === 'resolved').length;
    const skipped = questions.filter(q => q.status === 'skipped').length;
    const flagged = questions.filter(q => q.status === 'flagged').length;
    return {
      resolved,
      skipped,
      flagged,
      pending: questions.length - resolved - skipped - flagged,
      total: questions.length,
      percentage: Math.round(((resolved + skipped + flagged) / questions.length) * 100),
    };
  }, [questions]);

  const getSeverityIcon = (severity: ComplianceQuestion['severity']) => {
    switch (severity) {
      case 'critical':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        );
      case 'warning':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'info':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
    }
  };

  const handleResolution = useCallback((resolution: SuggestedResolution) => {
    if (!currentQuestion) return;

    let resolutionType: ComplianceResponse['resolutionType'];
    switch (resolution.action) {
      case 'update_step':
        resolutionType = 'accepted';
        break;
      case 'no_action':
        resolutionType = 'rejected';
        break;
      case 'flag_for_review':
        resolutionType = 'acknowledged';
        break;
      default:
        resolutionType = 'acknowledged';
    }

    const response = createComplianceResponse(
      currentQuestion.id,
      resolution.id,
      resolutionType,
      {
        clarificationText: clarificationText || undefined,
        appliedChanges: resolution.stepUpdate,
      }
    );

    onQuestionResolved(currentQuestion.id, response, resolution.stepUpdate);
    setClarificationText('');
    setShowClarification(false);

    // Move to next question if available
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentQuestion, currentIndex, questions.length, clarificationText, onQuestionResolved]);

  const handleSkip = useCallback(() => {
    if (!currentQuestion) return;
    onSkipQuestion(currentQuestion.id);

    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  }, [currentQuestion, currentIndex, questions.length, onSkipQuestion]);

  const handlePrevious = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setClarificationText('');
      setShowClarification(false);
    }
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setClarificationText('');
      setShowClarification(false);
    }
  }, [currentIndex, questions.length]);

  // Check if all questions are addressed
  const allAddressed = progress.pending === 0;

  if (!currentQuestion) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Compliance Issues Found</h3>
        <p className="text-gray-600 mb-6">
          Your workflow appears to be compliant with the uploaded standards documents.
        </p>
        <button
          onClick={onComplete}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700"
        >
          Continue to Export
        </button>
      </div>
    );
  }

  const severityColors = SEVERITY_COLORS[currentQuestion.severity];

  return (
    <div className="space-y-4">
      {/* Progress Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Compliance Review</h2>
          <span className="text-sm text-gray-500">
            Question {currentIndex + 1} of {questions.length}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${progress.percentage}%` }}
          />
        </div>

        {/* Progress Stats */}
        <div className="flex items-center gap-4 mt-3 text-sm">
          <span className="flex items-center gap-1 text-green-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {progress.resolved} resolved
          </span>
          <span className="flex items-center gap-1 text-yellow-600">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {progress.flagged} flagged
          </span>
          <span className="flex items-center gap-1 text-gray-500">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            {progress.skipped} skipped
          </span>
        </div>
      </div>

      {/* Question Card */}
      <div className={`bg-white rounded-xl shadow-sm border-2 ${severityColors.border} overflow-hidden`}>
        {/* Question Header */}
        <div className={`px-6 py-4 ${severityColors.bg}`}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={severityColors.icon}>
                {getSeverityIcon(currentQuestion.severity)}
              </div>
              <div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${severityColors.text}`}>
                  {currentQuestion.severity.toUpperCase()}
                </span>
                <span className="ml-2 px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                  {DISCREPANCY_TYPE_LABELS[currentQuestion.discrepancyType]}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Question Content */}
        <div className="p-6 space-y-4">
          {/* Affected Step */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-500 mb-1">Workflow Step</p>
            <p className="text-gray-900">{currentQuestion.stepDescription}</p>
          </div>

          {/* Standard Reference */}
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-700 mb-1">
              Standard ({currentQuestion.standardReference})
            </p>
            <p className="text-blue-900">{currentQuestion.standardRequirement}</p>
          </div>

          {/* Question */}
          <div className="border-l-4 border-blue-600 pl-4">
            <p className="text-lg font-medium text-gray-900">{currentQuestion.question}</p>
          </div>

          {/* Context */}
          {currentQuestion.context && (
            <p className="text-sm text-gray-600">{currentQuestion.context}</p>
          )}

          {/* Resolution Options */}
          <div className="space-y-2 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Choose a resolution:</p>
            {currentQuestion.suggestedResolutions.map((resolution) => (
              <button
                key={resolution.id}
                onClick={() => handleResolution(resolution)}
                className="w-full p-4 text-left border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 group-hover:text-blue-700">
                      {resolution.label}
                    </p>
                    <p className="text-sm text-gray-500">{resolution.description}</p>
                    {resolution.stepUpdate && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {resolution.stepUpdate.signatures && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs">
                            Signatures: {resolution.stepUpdate.signatures}
                          </span>
                        )}
                        {resolution.stepUpdate.interface && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                            Interface: {resolution.stepUpdate.interface}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>

          {/* Add Clarification Option */}
          <div className="pt-2">
            {!showClarification ? (
              <button
                onClick={() => setShowClarification(true)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Add clarification or notes
              </button>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Clarification or Notes
                </label>
                <textarea
                  value={clarificationText}
                  onChange={(e) => setClarificationText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="Add any additional context or reasoning..."
                />
              </div>
            )}
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              Skip
            </button>
          </div>

          <div className="flex items-center gap-2">
            {currentIndex < questions.length - 1 ? (
              <button
                onClick={handleNext}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Next
              </button>
            ) : allAddressed ? (
              <button
                onClick={onComplete}
                className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
              >
                Complete Review
              </button>
            ) : (
              <span className="text-sm text-gray-500">
                {progress.pending} questions remaining
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Back Button */}
      <div className="flex justify-start">
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
          </svg>
          Back to Standards Upload
        </button>
      </div>
    </div>
  );
}
