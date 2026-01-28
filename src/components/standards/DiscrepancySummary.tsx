'use client';

import { useMemo } from 'react';
import {
  ComplianceQuestion,
  ComplianceSummary,
  SEVERITY_COLORS,
  DISCREPANCY_TYPE_LABELS,
} from '@/types/standards';

interface DiscrepancySummaryProps {
  questions: ComplianceQuestion[];
  summary: ComplianceSummary | null;
  onBackToReview: () => void;
  onContinueToExport: () => void;
}

export default function DiscrepancySummary({
  questions,
  summary,
  onBackToReview,
  onContinueToExport,
}: DiscrepancySummaryProps) {
  const stats = useMemo(() => {
    const resolved = questions.filter(q => q.status === 'resolved');
    const flagged = questions.filter(q => q.status === 'flagged');
    const skipped = questions.filter(q => q.status === 'skipped');

    const bySeverity = {
      critical: questions.filter(q => q.severity === 'critical').length,
      warning: questions.filter(q => q.severity === 'warning').length,
      info: questions.filter(q => q.severity === 'info').length,
    };

    const changes = resolved
      .filter(q => q.response?.appliedChanges)
      .map(q => ({
        stepId: q.stepId,
        stepDescription: q.stepDescription,
        changeType: q.discrepancyType,
        changes: q.response!.appliedChanges!,
      }));

    return {
      total: questions.length,
      resolved: resolved.length,
      flagged: flagged.length,
      skipped: skipped.length,
      bySeverity,
      changes,
      resolvedQuestions: resolved,
      flaggedQuestions: flagged,
      skippedQuestions: skipped,
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Compliance Review Complete</h2>
            <p className="text-gray-500">
              {stats.total} items reviewed across {summary?.standardsReviewed.length || 0} standards documents
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 bg-green-50 rounded-xl border border-green-200">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-2xl font-bold text-green-700">{stats.resolved}</span>
            </div>
            <p className="text-sm text-green-600">Resolved</p>
          </div>

          <div className="p-4 bg-yellow-50 rounded-xl border border-yellow-200">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-2xl font-bold text-yellow-700">{stats.flagged}</span>
            </div>
            <p className="text-sm text-yellow-600">Flagged for Review</p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
              <span className="text-2xl font-bold text-gray-700">{stats.skipped}</span>
            </div>
            <p className="text-sm text-gray-500">Skipped</p>
          </div>

          <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="text-2xl font-bold text-blue-700">{stats.changes.length}</span>
            </div>
            <p className="text-sm text-blue-600">Changes Made</p>
          </div>
        </div>
      </div>

      {/* Findings by Severity */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">Findings by Severity</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-4">
            <div className={`p-4 rounded-xl ${SEVERITY_COLORS.critical.bg} border ${SEVERITY_COLORS.critical.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={SEVERITY_COLORS.critical.icon}>
                  {getSeverityIcon('critical')}
                </div>
                <span className={`text-xl font-bold ${SEVERITY_COLORS.critical.text}`}>
                  {stats.bySeverity.critical}
                </span>
              </div>
              <p className={`text-sm ${SEVERITY_COLORS.critical.text}`}>Critical Issues</p>
            </div>

            <div className={`p-4 rounded-xl ${SEVERITY_COLORS.warning.bg} border ${SEVERITY_COLORS.warning.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={SEVERITY_COLORS.warning.icon}>
                  {getSeverityIcon('warning')}
                </div>
                <span className={`text-xl font-bold ${SEVERITY_COLORS.warning.text}`}>
                  {stats.bySeverity.warning}
                </span>
              </div>
              <p className={`text-sm ${SEVERITY_COLORS.warning.text}`}>Warnings</p>
            </div>

            <div className={`p-4 rounded-xl ${SEVERITY_COLORS.info.bg} border ${SEVERITY_COLORS.info.border}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={SEVERITY_COLORS.info.icon}>
                  {getSeverityIcon('info')}
                </div>
                <span className={`text-xl font-bold ${SEVERITY_COLORS.info.text}`}>
                  {stats.bySeverity.info}
                </span>
              </div>
              <p className={`text-sm ${SEVERITY_COLORS.info.text}`}>Informational</p>
            </div>
          </div>
        </div>
      </div>

      {/* Changes Made */}
      {stats.changes.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">Changes Applied</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {stats.changes.map((change, index) => (
              <div key={index} className="p-4">
                <p className="font-medium text-gray-900 mb-1">{change.stepDescription}</p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                    {DISCREPANCY_TYPE_LABELS[change.changeType as keyof typeof DISCREPANCY_TYPE_LABELS] || change.changeType}
                  </span>
                  {change.changes.signatures && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs">
                      Signatures: {change.changes.signatures}
                    </span>
                  )}
                  {change.changes.interface && (
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                      Interface: {change.changes.interface}
                    </span>
                  )}
                  {change.changes.complianceNotes && (
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                      Note added
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Flagged Items */}
      {stats.flaggedQuestions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-yellow-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-yellow-200 bg-yellow-50">
            <h3 className="text-lg font-semibold text-yellow-800">Items Flagged for Review</h3>
            <p className="text-sm text-yellow-600">These items require additional review by a subject matter expert.</p>
          </div>
          <div className="divide-y divide-yellow-100">
            {stats.flaggedQuestions.map((question) => (
              <div key={question.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className={SEVERITY_COLORS[question.severity].icon}>
                    {getSeverityIcon(question.severity)}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{question.question}</p>
                    <p className="text-sm text-gray-500 mt-1">{question.stepDescription}</p>
                    <p className="text-xs text-gray-400 mt-1">{question.standardReference}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBackToReview}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Back to Review
        </button>
        <button
          onClick={onContinueToExport}
          className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 flex items-center gap-2"
        >
          Continue to Export
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
