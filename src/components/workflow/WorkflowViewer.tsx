'use client';

import { useState, useMemo } from 'react';
import { ParsedDocument, ExtractedStep } from '@/types/workflow';

interface WorkflowViewerProps {
  document: ParsedDocument;
  onStepsChange: (steps: ExtractedStep[]) => void;
}

export default function WorkflowViewer({ document, onStepsChange }: WorkflowViewerProps) {
  const [selectedPhase, setSelectedPhase] = useState<string | null>(null);
  const [editingStep, setEditingStep] = useState<string | null>(null);

  const phases = useMemo(() => {
    const phaseSet = new Set<string>();
    document.extractedSteps.forEach((step) => {
      if (step.phase) phaseSet.add(step.phase);
    });
    return Array.from(phaseSet);
  }, [document.extractedSteps]);

  const filteredSteps = useMemo(() => {
    if (!selectedPhase) return document.extractedSteps;
    return document.extractedSteps.filter((step) => step.phase === selectedPhase);
  }, [document.extractedSteps, selectedPhase]);

  const handleStepUpdate = (stepId: string, field: keyof ExtractedStep, value: string) => {
    const updatedSteps = document.extractedSteps.map((step) => {
      if (step.id === stepId) {
        return { ...step, [field]: value };
      }
      return step;
    });
    onStepsChange(updatedSteps);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.7) return 'bg-green-100 text-green-800';
    if (confidence >= 0.4) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getInterfaceColor = (iface?: string) => {
    switch (iface?.toUpperCase()) {
      case 'SAP':
        return 'bg-blue-100 text-blue-800';
      case 'MES':
        return 'bg-purple-100 text-purple-800';
      case 'SAP/MES':
        return 'bg-indigo-100 text-indigo-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Extracted Workflow</h2>
            <p className="text-sm text-gray-500">
              {document.extractedSteps.length} steps from {document.fileName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Confidence:</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(document.confidence)}`}>
              {Math.round(document.confidence * 100)}%
            </span>
          </div>
        </div>

        {/* Phase Filter */}
        {phases.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedPhase(null)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                !selectedPhase
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All ({document.extractedSteps.length})
            </button>
            {phases.map((phase) => {
              const count = document.extractedSteps.filter((s) => s.phase === phase).length;
              return (
                <button
                  key={phase}
                  onClick={() => setSelectedPhase(phase)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    selectedPhase === phase
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {phase} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Steps List */}
      <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
        {filteredSteps.map((step, index) => (
          <div
            key={step.id}
            className={`p-4 hover:bg-gray-50 transition-colors ${
              editingStep === step.id ? 'bg-blue-50' : ''
            }`}
          >
            <div className="flex items-start gap-4">
              {/* Sequence Number */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                {index + 1}
              </div>

              {/* Step Content */}
              <div className="flex-grow min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {step.sectionNumber && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-mono">
                      §{step.sectionNumber}
                    </span>
                  )}
                  {step.interface && (
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getInterfaceColor(step.interface)}`}>
                      {step.interface}
                    </span>
                  )}
                  {step.signatures && (
                    <span className="px-2 py-0.5 bg-orange-100 text-orange-800 rounded text-xs">
                      {step.signatures === 'variable' ? 'Variable' : `${step.signatures} sig`}
                    </span>
                  )}
                  <span className={`px-2 py-0.5 rounded text-xs ${getConfidenceColor(step.confidence)}`}>
                    {Math.round(step.confidence * 100)}%
                  </span>
                </div>

                {editingStep === step.id ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={step.description}
                      onChange={(e) => handleStepUpdate(step.id, 'description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="flex gap-2">
                      <select
                        value={step.interface || ''}
                        onChange={(e) => handleStepUpdate(step.id, 'interface', e.target.value)}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No Interface</option>
                        <option value="SAP">SAP</option>
                        <option value="MES">MES</option>
                        <option value="SAP/MES">SAP/MES</option>
                      </select>
                      <input
                        type="text"
                        value={step.signatures || ''}
                        onChange={(e) => handleStepUpdate(step.id, 'signatures', e.target.value)}
                        placeholder="Signatures"
                        className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => setEditingStep(null)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-gray-900 font-medium">{step.description}</p>
                    {step.clarification && (
                      <p className="text-sm text-gray-500 mt-1">{step.clarification}</p>
                    )}
                  </>
                )}
              </div>

              {/* Edit Button */}
              {editingStep !== step.id && (
                <button
                  onClick={() => setEditingStep(step.id)}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredSteps.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          No steps found {selectedPhase ? `in ${selectedPhase} phase` : ''}
        </div>
      )}
    </div>
  );
}
