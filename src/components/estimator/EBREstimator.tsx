'use client';

import { useState, useCallback } from 'react';
import { ParsedDocument } from '@/types/workflow';
import { ProjectEstimate, DEFAULT_WEIGHTS, EstimationWeights } from '@/types/estimator';

interface UploadedFile {
  file: File;
  status: 'pending' | 'parsing' | 'parsed' | 'error';
  parsedData?: ParsedDocument;
  error?: string;
}

export default function EBREstimator() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [projectName, setProjectName] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimate, setEstimate] = useState<ProjectEstimate | null>(null);
  const [showWeights, setShowWeights] = useState(false);
  const [weights, setWeights] = useState<EstimationWeights>(DEFAULT_WEIGHTS);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const newFiles: UploadedFile[] = selectedFiles.map(file => ({
      file,
      status: 'pending',
    }));
    setFiles(prev => [...prev, ...newFiles]);
    setEstimate(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    const newFiles: UploadedFile[] = droppedFiles
      .filter(f => /\.(pdf|docx?|xlsx?)$/i.test(f.name))
      .map(file => ({
        file,
        status: 'pending',
      }));
    setFiles(prev => [...prev, ...newFiles]);
    setEstimate(null);
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setEstimate(null);
  }, []);

  const parseFile = async (uploadedFile: UploadedFile): Promise<ParsedDocument | null> => {
    const formData = new FormData();
    formData.append('file', uploadedFile.file);

    const response = await fetch('/api/parse', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to parse file');
    }

    const result = await response.json();
    return result.data;
  };

  const handleEstimate = async () => {
    if (files.length === 0) return;

    setIsEstimating(true);
    setEstimate(null);

    // Parse all pending files
    const updatedFiles = [...files];
    const parsedDocs: ParsedDocument[] = [];

    for (let i = 0; i < updatedFiles.length; i++) {
      const uf = updatedFiles[i];

      if (uf.status === 'parsed' && uf.parsedData) {
        parsedDocs.push(uf.parsedData);
        continue;
      }

      updatedFiles[i] = { ...uf, status: 'parsing' };
      setFiles([...updatedFiles]);

      try {
        const parsed = await parseFile(uf);
        if (parsed) {
          updatedFiles[i] = { ...uf, status: 'parsed', parsedData: parsed };
          parsedDocs.push(parsed);
        }
      } catch (error) {
        updatedFiles[i] = {
          ...uf,
          status: 'error',
          error: error instanceof Error ? error.message : 'Parse failed',
        };
      }
      setFiles([...updatedFiles]);
    }

    // Generate estimate
    if (parsedDocs.length > 0) {
      try {
        const response = await fetch('/api/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documents: parsedDocs,
            projectName: projectName || 'EBR Implementation Project',
            weights,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          setEstimate(result.data);
        }
      } catch (error) {
        console.error('Estimation error:', error);
      }
    }

    setIsEstimating(false);
  };

  const handleExportExcel = async () => {
    if (!estimate) return;

    const parsedDocs = files
      .filter(f => f.status === 'parsed' && f.parsedData)
      .map(f => f.parsedData!);

    const response = await fetch('/api/estimate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documents: parsedDocs,
        projectName: projectName || 'EBR Implementation Project',
        weights,
        exportExcel: true,
      }),
    });

    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName || 'ebr-estimate'}-${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const getStatusIcon = (status: UploadedFile['status']) => {
    switch (status) {
      case 'pending': return '⏳';
      case 'parsing': return '🔄';
      case 'parsed': return '✅';
      case 'error': return '❌';
    }
  };

  const getStatusColor = (status: UploadedFile['status']) => {
    switch (status) {
      case 'pending': return 'text-gray-500';
      case 'parsing': return 'text-blue-500';
      case 'parsed': return 'text-green-600';
      case 'error': return 'text-red-500';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">EBR Workload Estimator</h2>
        <p className="text-gray-600 mt-1">
          Upload batch record documents to estimate implementation effort
        </p>
      </div>

      {/* Project Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Project Name
        </label>
        <input
          type="text"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
          placeholder="Enter project name..."
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* File Upload Area */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
      >
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="cursor-pointer">
          <div className="text-4xl mb-2">📁</div>
          <p className="text-gray-700 font-medium">
            Drop files here or click to browse
          </p>
          <p className="text-gray-500 text-sm mt-1">
            Supports PDF, Word (.docx), and Excel (.xlsx) - Multiple files allowed
          </p>
        </label>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-800">
              Uploaded Files ({files.length})
            </h3>
            <button
              onClick={() => { setFiles([]); setEstimate(null); }}
              className="text-sm text-red-600 hover:text-red-800"
            >
              Clear All
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {files.map((uf, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <span className={getStatusColor(uf.status)}>
                    {getStatusIcon(uf.status)}
                  </span>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{uf.file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(uf.file.size / 1024).toFixed(1)} KB
                      {uf.error && <span className="text-red-500 ml-2">{uf.error}</span>}
                      {uf.parsedData && (
                        <span className="text-green-600 ml-2">
                          {uf.parsedData.extractedSteps.length} steps extracted
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(idx)}
                  className="text-gray-400 hover:text-red-500"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weights Configuration */}
      <div className="bg-gray-50 rounded-xl p-4">
        <button
          onClick={() => setShowWeights(!showWeights)}
          className="flex items-center justify-between w-full text-left"
        >
          <span className="font-semibold text-gray-800">Estimation Weights</span>
          <span className="text-gray-500">{showWeights ? '▼' : '▶'}</span>
        </button>

        {showWeights && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: 'unitOperation', label: 'Unit Operation (hrs)' },
              { key: 'processStep', label: 'Process Step (hrs)' },
              { key: 'simpleCalculation', label: 'Simple Calc (hrs)' },
              { key: 'complexCalculation', label: 'Complex Calc (hrs)' },
              { key: 'conditionalLogic', label: 'Conditional (hrs)' },
              { key: 'equipmentIntegration', label: 'Integration (hrs)' },
              { key: 'signature', label: 'Signature (hrs)' },
              { key: 'validationFactor', label: 'Validation Factor' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-gray-600 mb-1">{label}</label>
                <input
                  type="number"
                  step="0.1"
                  value={weights[key as keyof EstimationWeights] as number}
                  onChange={e => setWeights(prev => ({
                    ...prev,
                    [key]: parseFloat(e.target.value) || 0,
                  }))}
                  className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Estimate Button */}
      <button
        onClick={handleEstimate}
        disabled={files.length === 0 || isEstimating}
        className="w-full py-3 px-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
      >
        {isEstimating ? 'Analyzing Documents...' : 'Generate Estimate'}
      </button>

      {/* Results */}
      {estimate && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
            <h3 className="text-xl font-bold">{estimate.projectName}</h3>
            <p className="text-blue-100 text-sm mt-1">
              {estimate.files.length} file{estimate.files.length !== 1 ? 's' : ''} analyzed
            </p>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gray-50">
            <div className="text-center">
              <p className="text-3xl font-bold text-blue-600">
                {estimate.totals.estimate.buildHours}
              </p>
              <p className="text-sm text-gray-600">Build Hours</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-green-600">
                {estimate.totals.estimate.validateHours}
              </p>
              <p className="text-sm text-gray-600">Validation Hours</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-purple-600">
                {estimate.totals.estimate.totalHours}
              </p>
              <p className="text-sm text-gray-600">Total Hours</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-gray-700">
                {estimate.totals.estimate.confidence}%
              </p>
              <p className="text-sm text-gray-600">Confidence</p>
            </div>
          </div>

          {/* Breakdown */}
          <div className="p-6">
            <h4 className="font-semibold text-gray-800 mb-4">Breakdown by Category</h4>
            <div className="space-y-3">
              {Object.entries(estimate.totals.estimate.breakdown).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-600 capitalize">
                      {key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                    <span className="text-sm text-gray-400">({value.count})</span>
                  </div>
                  <span className="font-medium text-gray-800">{value.hours} hrs</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-File Breakdown */}
          {estimate.files.length > 1 && (
            <div className="p-6 border-t">
              <h4 className="font-semibold text-gray-800 mb-4">By File</h4>
              <div className="space-y-2">
                {estimate.files.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{file.fileName}</p>
                      <p className="text-xs text-gray-500">
                        {file.factors.processSteps} steps, {file.factors.unitOperations} unit ops
                      </p>
                    </div>
                    <span className="font-semibold text-blue-600">
                      {file.estimate.totalHours} hrs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export Button */}
          <div className="p-6 bg-gray-50 border-t">
            <button
              onClick={handleExportExcel}
              className="w-full py-3 px-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              <span>📊</span>
              Download Excel Report
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
