'use client';

import { useState, useEffect, useCallback } from 'react';
import FileUpload from '@/components/upload/FileUpload';
import WorkflowViewer from '@/components/workflow/WorkflowViewer';
import XmlPreview from '@/components/export/XmlPreview';
import { StandardsUpload, ComplianceReview, DiscrepancySummary } from '@/components/standards';
import SystemConversion from '@/components/conversion/SystemConversion';
import { EBREstimator } from '@/components/estimator';
import { ParsedDocument, ExtractedStep, Recipe } from '@/types/workflow';
import {
  StandardsDocument,
  ComplianceQuestion,
  ComplianceResponse,
  ComplianceSummary,
  ReviewSession,
} from '@/types/standards';
import { createReviewSession, updateReviewSession, createComplianceSummary } from '@/lib/models/standards';

type AppMode = 'document-upload' | 'system-conversion' | 'ebr-estimator';
type AppState = 'upload' | 'review' | 'standards-review' | 'standards-summary' | 'export';

interface GeneratorInfo {
  id: string;
  name: string;
  description: string;
  vendor: string;
  versions: string[];
}

interface GeneratedResult {
  generator: string;
  generatorName: string;
  vendor: string;
  content: string;
  format: string;
  fileExtension: string;
  metadata: {
    statistics: {
      unitProcedures: number;
      operations: number;
      phases: number;
    };
  };
}

export default function Home() {
  // Mode selection state
  const [mode, setMode] = useState<AppMode>('document-upload');

  const [state, setState] = useState<AppState>('upload');
  const [parsedDocument, setParsedDocument] = useState<ParsedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generatedXml, setGeneratedXml] = useState<string | null>(null);
  const [generatedRecipe, setGeneratedRecipe] = useState<Recipe | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GeneratedResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generators, setGenerators] = useState<GeneratorInfo[]>([]);
  const [selectedGenerator, setSelectedGenerator] = useState<string>('pasx');

  // Standards review state
  const [standardsDocuments, setStandardsDocuments] = useState<StandardsDocument[]>([]);
  const [complianceQuestions, setComplianceQuestions] = useState<ComplianceQuestion[]>([]);
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null);
  const [complianceSummary, setComplianceSummary] = useState<ComplianceSummary | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState('');

  // Fetch available generators on mount
  useEffect(() => {
    fetch('/api/generate')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data.generators) {
          setGenerators(data.data.generators);
        }
      })
      .catch(console.error);
  }, []);

  const handleParsed = (data: ParsedDocument) => {
    setParsedDocument(data);
    setError(null);
    setState('review');
  };

  const handleError = (errorMessage: string) => {
    setError(errorMessage);
  };

  const handleStepsChange = (steps: ExtractedStep[]) => {
    if (parsedDocument) {
      setParsedDocument({
        ...parsedDocument,
        extractedSteps: steps,
      });
    }
  };

  // Standards document handlers
  const handleStandardsDocumentParsed = useCallback((document: StandardsDocument) => {
    setStandardsDocuments(prev => [...prev, document]);
    setError(null);
  }, []);

  const handleRemoveStandardsDocument = useCallback((documentId: string) => {
    setStandardsDocuments(prev => prev.filter(doc => doc.id !== documentId));
  }, []);

  const handleStartComplianceReview = useCallback(async () => {
    if (!parsedDocument || standardsDocuments.length === 0) {
      setError('Please upload at least one standards document before starting the review.');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisMessage('Preparing analysis...');
    setError(null);

    // Create a new review session
    const session = createReviewSession();
    setReviewSession(updateReviewSession(session, {
      status: 'analyzing',
      standardsDocuments,
    }));

    try {
      // Simulate progress for user experience
      setAnalysisProgress(10);
      setAnalysisMessage('Analyzing workflow steps...');

      const response = await fetch('/api/standards/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: parsedDocument.extractedSteps,
          standardsDocuments,
          options: {
            strictMode: false,
            maxQuestions: 20,
          },
        }),
      });

      setAnalysisProgress(80);
      setAnalysisMessage('Processing results...');

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to analyze compliance');
      }

      setAnalysisProgress(100);
      setAnalysisMessage('Analysis complete');

      // Update state with results
      const questions = result.questions || [];
      setComplianceQuestions(questions);

      // Update review session
      setReviewSession(prev => prev ? updateReviewSession(prev, {
        status: questions.length > 0 ? 'in_progress' : 'completed',
        questions,
        totalQuestions: questions.length,
      }) : null);

      // Transition to appropriate state
      if (questions.length > 0) {
        setState('standards-review');
      } else {
        // No issues found, skip to summary
        setComplianceSummary(createComplianceSummary(
          updateReviewSession(session, {
            status: 'completed',
            standardsDocuments,
            questions: [],
            totalQuestions: 0,
          }),
          []
        ));
        setState('standards-summary');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compliance analysis failed');
      setReviewSession(prev => prev ? updateReviewSession(prev, { status: 'cancelled' }) : null);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      setAnalysisMessage('');
    }
  }, [parsedDocument, standardsDocuments]);

  const handleQuestionResolved = useCallback((
    questionId: string,
    response: ComplianceResponse,
    stepUpdate?: Partial<ExtractedStep>
  ) => {
    // Update the question status
    setComplianceQuestions(prev => prev.map(q => {
      if (q.id === questionId) {
        return {
          ...q,
          status: response.resolutionType === 'acknowledged' ? 'flagged' : 'resolved',
          response,
        };
      }
      return q;
    }));

    // Apply step updates if any
    if (stepUpdate && parsedDocument) {
      const question = complianceQuestions.find(q => q.id === questionId);
      if (question) {
        const updatedSteps = parsedDocument.extractedSteps.map(step => {
          if (step.id === question.stepId) {
            return {
              ...step,
              ...stepUpdate,
              reviewStatus: 'approved' as const,
            };
          }
          return step;
        });
        setParsedDocument({
          ...parsedDocument,
          extractedSteps: updatedSteps,
        });
      }
    }

    // Update review session counts
    setReviewSession(prev => {
      if (!prev) return null;
      const resolved = prev.resolvedCount + (response.resolutionType !== 'acknowledged' ? 1 : 0);
      const flagged = prev.flaggedCount + (response.resolutionType === 'acknowledged' ? 1 : 0);
      return updateReviewSession(prev, { resolvedCount: resolved, flaggedCount: flagged });
    });
  }, [parsedDocument, complianceQuestions]);

  const handleSkipQuestion = useCallback((questionId: string) => {
    setComplianceQuestions(prev => prev.map(q => {
      if (q.id === questionId) {
        return { ...q, status: 'skipped' };
      }
      return q;
    }));

    setReviewSession(prev => {
      if (!prev) return null;
      return updateReviewSession(prev, { skippedCount: prev.skippedCount + 1 });
    });
  }, []);

  const handleComplianceReviewComplete = useCallback(() => {
    // Create the compliance summary
    const changes = complianceQuestions
      .filter(q => q.status === 'resolved' && q.response?.appliedChanges)
      .map(q => ({
        stepId: q.stepId,
        stepDescription: q.stepDescription,
        changeType: q.discrepancyType,
        changeDescription: q.question,
      }));

    if (reviewSession) {
      const summary = createComplianceSummary(
        updateReviewSession(reviewSession, {
          status: 'completed',
          questions: complianceQuestions,
        }),
        changes
      );
      setComplianceSummary(summary);
    }

    setState('standards-summary');
  }, [complianceQuestions, reviewSession]);

  const handleBackToStandardsUpload = useCallback(() => {
    setState('review');
  }, []);

  const handleGenerate = async () => {
    if (!parsedDocument) return;

    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: parsedDocument.extractedSteps,
          generator: selectedGenerator,
          options: {
            recipeName: parsedDocument.fileName.replace(/\.[^/.]+$/, ''),
            includeComments: true,
          },
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate XML');
      }

      // Handle new generator format
      if (result.data.content) {
        setGeneratedResult(result.data);
        setGeneratedXml(result.data.content);
        // Create a minimal recipe object for backward compatibility
        setGeneratedRecipe({
          header: {
            recipeId: result.data.procedure?.id || 'generated',
            recipeName: result.data.procedure?.name || parsedDocument.fileName,
            recipeVersion: '1.0',
            recipeType: 'Master',
            productType: 'Manufacturing',
            description: `Generated by ${result.data.generatorName}`,
            author: 'HarmoniAI',
            creationDate: new Date().toISOString().split('T')[0],
            status: 'Draft',
          },
          materials: [],
          equipment: [],
          unitProcedures: [],
        });
      } else {
        // Legacy format
        setGeneratedXml(result.data.xml);
        setGeneratedRecipe(result.data.recipe);
        setGeneratedResult(null);
      }
      setState('export');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleContinueToExport = () => {
    handleGenerate();
  };

  const handleReset = () => {
    setState('upload');
    setParsedDocument(null);
    setGeneratedXml(null);
    setGeneratedRecipe(null);
    setGeneratedResult(null);
    setError(null);
    setSelectedGenerator('pasx');
    // Reset standards review state
    setStandardsDocuments([]);
    setComplianceQuestions([]);
    setReviewSession(null);
    setComplianceSummary(null);
  };

  const handleModeChange = (newMode: AppMode) => {
    setMode(newMode);
    handleReset();
  };

  // Determine progress steps for header
  const getProgressSteps = () => {
    const baseSteps = ['Upload', 'Review'];
    if (standardsDocuments.length > 0 || state === 'standards-review' || state === 'standards-summary') {
      baseSteps.push('Compliance');
    }
    baseSteps.push('Export');
    return baseSteps;
  };

  const progressSteps = getProgressSteps();

  const isStepActive = (step: string) => {
    const stepLower = step.toLowerCase();
    if (stepLower === 'compliance') {
      return state === 'standards-review' || state === 'standards-summary';
    }
    return state === stepLower;
  };

  const isStepPast = (step: string, index: number) => {
    const stateOrder: Record<AppState, number> = {
      'upload': 0,
      'review': 1,
      'standards-review': 2,
      'standards-summary': 2.5,
      'export': 3,
    };

    const stepLower = step.toLowerCase();
    const currentOrder = stateOrder[state];

    if (stepLower === 'upload') return currentOrder > 0;
    if (stepLower === 'review') return currentOrder > 1;
    if (stepLower === 'compliance') return currentOrder > 2.5;
    if (stepLower === 'export') return false;

    return false;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">HarmoniAI</h1>
                <p className="text-xs text-gray-500">
                  {mode === 'system-conversion' ? 'MES-to-MES Conversion' : mode === 'ebr-estimator' ? 'Workload Estimation' : 'Paper to MES Conversion'}
                </p>
              </div>
            </div>

            {/* Progress Steps */}
            <div className="hidden md:flex items-center gap-4">
              {progressSteps.map((step, index) => {
                const isActive = isStepActive(step);
                const isPast = isStepPast(step, index);

                return (
                  <div key={step} className="flex items-center">
                    {index > 0 && (
                      <div className={`w-12 h-0.5 mr-4 ${isPast ? 'bg-blue-600' : 'bg-gray-200'}`} />
                    )}
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : isPast
                            ? 'bg-blue-100 text-blue-600'
                            : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {isPast ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          index + 1
                        )}
                      </div>
                      <span className={`text-sm ${isActive ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                        {step}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {state !== 'upload' && (
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Start Over
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-red-800">Error</p>
              <p className="text-sm text-red-600">{error}</p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-400 hover:text-red-600"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Upload State */}
        {state === 'upload' && (
          <div className="max-w-3xl mx-auto">
            {/* Mode Toggle */}
            <div className="flex justify-center mb-8">
              <div className="inline-flex bg-gray-100 rounded-xl p-1">
                <button
                  onClick={() => handleModeChange('document-upload')}
                  className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                    mode === 'document-upload'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Document Upload
                  </span>
                </button>
                <button
                  onClick={() => handleModeChange('system-conversion')}
                  className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                    mode === 'system-conversion'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                    System Conversion
                  </span>
                </button>
                <button
                  onClick={() => handleModeChange('ebr-estimator')}
                  className={`px-6 py-3 rounded-lg text-sm font-medium transition-all ${
                    mode === 'ebr-estimator'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    EBR Estimator
                  </span>
                </button>
              </div>
            </div>

            {/* Document Upload Mode */}
            {mode === 'document-upload' && (
              <>
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Convert Batch Records to Any Format
                  </h2>
                  <p className="text-gray-600">
                    Upload your batch record document and we&apos;ll extract the workflow steps
                    and generate MES-compatible XML for your target system.
                  </p>
                </div>
                <FileUpload onParsed={handleParsed} onError={handleError} />

                <div className="mt-8 grid grid-cols-4 gap-4">
                  {[
                    { icon: '📊', title: 'Excel', desc: 'Gap assessments, flow charts' },
                    { icon: '📄', title: 'Word', desc: 'Procedure documents' },
                    { icon: '📑', title: 'PDF', desc: 'Scanned batch records' },
                    { icon: '📋', title: 'XML', desc: 'MES recipe formats' },
                  ].map((item) => (
                    <div key={item.title} className="p-4 bg-white rounded-xl border border-gray-200 text-center">
                      <div className="text-2xl mb-2">{item.icon}</div>
                      <p className="font-medium text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-500">{item.desc}</p>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* System Conversion Mode */}
            {mode === 'system-conversion' && (
              <SystemConversion />
            )}

            {/* EBR Estimator Mode */}
            {mode === 'ebr-estimator' && (
              <EBREstimator />
            )}
          </div>
        )}

        {/* Review State */}
        {state === 'review' && parsedDocument && (
          <div className="space-y-6">
            {/* Generator Selection */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Target MES System</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {generators.map((gen) => (
                  <button
                    key={gen.id}
                    onClick={() => setSelectedGenerator(gen.id)}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      selectedGenerator === gen.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className={`font-semibold ${selectedGenerator === gen.id ? 'text-blue-600' : 'text-gray-900'}`}>
                      {gen.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">{gen.vendor}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Standards Upload Section */}
            <StandardsUpload
              onDocumentParsed={handleStandardsDocumentParsed}
              onError={handleError}
              uploadedDocuments={standardsDocuments}
              onRemoveDocument={handleRemoveStandardsDocument}
            />

            {/* Start Compliance Review Button */}
            {standardsDocuments.length > 0 && (
              <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-blue-900">Ready for Compliance Review</p>
                      <p className="text-sm text-blue-600">
                        {standardsDocuments.length} document{standardsDocuments.length > 1 ? 's' : ''} uploaded.
                        AI will analyze your workflow against these standards.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleStartComplianceReview}
                    disabled={isAnalyzing}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isAnalyzing ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Analyzing...
                      </>
                    ) : (
                      <>
                        Start Compliance Review
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>

                {/* Analysis Progress */}
                {isAnalyzing && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-sm text-blue-600 mb-2">
                      <span>{analysisMessage}</span>
                      <span>{analysisProgress}%</span>
                    </div>
                    <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-300"
                        style={{ width: `${analysisProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Review Extracted Steps</h2>
                <p className="text-gray-600">
                  Verify and edit the extracted workflow before generating XML
                </p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    {standardsDocuments.length > 0 ? 'Skip Review & ' : ''}Generate {generators.find(g => g.id === selectedGenerator)?.name || 'MES'} XML
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </div>

            <WorkflowViewer document={parsedDocument} onStepsChange={handleStepsChange} />
          </div>
        )}

        {/* Standards Review State */}
        {state === 'standards-review' && (
          <ComplianceReview
            questions={complianceQuestions}
            onQuestionResolved={handleQuestionResolved}
            onSkipQuestion={handleSkipQuestion}
            onComplete={handleComplianceReviewComplete}
            onBack={handleBackToStandardsUpload}
          />
        )}

        {/* Standards Summary State */}
        {state === 'standards-summary' && (
          <DiscrepancySummary
            questions={complianceQuestions}
            summary={complianceSummary}
            onBackToReview={() => setState('standards-review')}
            onContinueToExport={handleContinueToExport}
          />
        )}

        {/* Export State */}
        {state === 'export' && generatedXml && generatedRecipe && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  Generated {generatedResult?.generatorName || 'PAS-X'} Recipe
                </h2>
                <p className="text-gray-600">
                  {generatedResult ? (
                    <>
                      {generatedResult.metadata.statistics.unitProcedures} unit procedures,{' '}
                      {generatedResult.metadata.statistics.operations} operations,{' '}
                      {generatedResult.metadata.statistics.phases} phases
                    </>
                  ) : (
                    <>
                      {generatedRecipe.unitProcedures.length} unit procedures,{' '}
                      {generatedRecipe.unitProcedures.reduce((sum, up) => sum + up.operations.length, 0)} operations
                    </>
                  )}
                </p>
                {generatedResult && (
                  <p className="text-sm text-gray-400 mt-1">
                    Generated by: {generatedResult.vendor}
                  </p>
                )}
              </div>
              <button
                onClick={() => setState('review')}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
                </svg>
                Back to Review
              </button>
            </div>

            {/* Compliance Summary Badge (if review was done) */}
            {complianceSummary && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-green-900">Compliance Review Completed</p>
                    <p className="text-sm text-green-600">
                      {complianceSummary.resolutions.resolved} issues resolved,{' '}
                      {complianceSummary.resolutions.flagged} flagged,{' '}
                      {complianceSummary.changes.length} changes applied
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Recipe Summary */}
            {generatedResult ? (
              <div className="grid grid-cols-4 gap-4">
                <div className="p-4 bg-white rounded-xl border border-gray-200">
                  <p className="text-sm text-gray-500">MES System</p>
                  <p className="font-semibold text-gray-900">{generatedResult.generatorName}</p>
                  <p className="text-sm text-blue-600">{generatedResult.format}</p>
                </div>
                <div className="p-4 bg-white rounded-xl border border-gray-200">
                  <p className="text-sm text-gray-500">Unit Procedures</p>
                  <p className="font-semibold text-gray-900">{generatedResult.metadata.statistics.unitProcedures}</p>
                </div>
                <div className="p-4 bg-white rounded-xl border border-gray-200">
                  <p className="text-sm text-gray-500">Operations</p>
                  <p className="font-semibold text-gray-900">{generatedResult.metadata.statistics.operations}</p>
                </div>
                <div className="p-4 bg-white rounded-xl border border-gray-200">
                  <p className="text-sm text-gray-500">Phases</p>
                  <p className="font-semibold text-gray-900">{generatedResult.metadata.statistics.phases}</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                {generatedRecipe.unitProcedures.map((up) => (
                  <div key={up.id} className="p-4 bg-white rounded-xl border border-gray-200">
                    <p className="text-sm text-gray-500">Unit Procedure</p>
                    <p className="font-semibold text-gray-900">{up.name}</p>
                    <p className="text-sm text-blue-600">{up.operations.length} operations</p>
                  </div>
                ))}
              </div>
            )}

            <XmlPreview
              xml={generatedXml}
              fileName={`${generatedResult?.generator || generatedRecipe.header.recipeId}.${generatedResult?.fileExtension || 'xml'}`}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4 text-center text-sm text-gray-500">
          HarmoniAI — Paper to Electronic Batch Record Conversion
        </div>
      </footer>
    </div>
  );
}
