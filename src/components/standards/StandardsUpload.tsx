'use client';

import { useState, useCallback } from 'react';
import { StandardsDocument } from '@/types/standards';

interface StandardsUploadProps {
  onDocumentParsed: (document: StandardsDocument) => void;
  onError: (error: string) => void;
  uploadedDocuments: StandardsDocument[];
  onRemoveDocument: (documentId: string) => void;
}

type DocumentTypeOption = {
  value: StandardsDocument['documentType'];
  label: string;
  description: string;
};

const documentTypes: DocumentTypeOption[] = [
  { value: 'sop', label: 'SOP', description: 'Standard Operating Procedure' },
  { value: 'regulatory', label: 'Regulatory', description: 'FDA, ICH, EU GMP requirements' },
  { value: 'policy', label: 'Policy', description: 'Company policies' },
  { value: 'guideline', label: 'Guideline', description: 'Best practice guidelines' },
  { value: 'other', label: 'Other', description: 'Other standards document' },
];

export default function StandardsUpload({
  onDocumentParsed,
  onError,
  uploadedDocuments,
  onRemoveDocument,
}: StandardsUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [selectedDocumentType, setSelectedDocumentType] = useState<StandardsDocument['documentType']>('sop');

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setCurrentFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', selectedDocumentType);

      const response = await fetch('/api/standards/parse', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse standards document');
      }

      onDocumentParsed(result.data);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to upload file');
    } finally {
      setIsLoading(false);
      setCurrentFileName(null);
    }
  }, [onDocumentParsed, onError, selectedDocumentType]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
    // Reset the input so the same file can be selected again
    e.target.value = '';
  }, [handleFile]);

  const getDocumentTypeIcon = (type: StandardsDocument['documentType']) => {
    switch (type) {
      case 'sop':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        );
      case 'regulatory':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
          </svg>
        );
      case 'policy':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        );
    }
  };

  const getDocumentTypeColor = (type: StandardsDocument['documentType']) => {
    switch (type) {
      case 'sop':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'regulatory':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'policy':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'guideline':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900">Standards & Compliance Review</h3>
        <p className="text-sm text-gray-500 mt-1">
          Upload standards documents to validate your workflow against SOPs, regulatory requirements, and policies.
        </p>
      </div>

      <div className="p-6 space-y-4">
        {/* Document Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Document Type
          </label>
          <div className="flex flex-wrap gap-2">
            {documentTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedDocumentType(type.value)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  selectedDocumentType === type.value
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                }`}
                title={type.description}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* Upload Area */}
        <div
          className={`
            relative border-2 border-dashed rounded-xl p-6
            transition-all duration-200 ease-in-out
            ${isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400 bg-gray-50'
            }
            ${isLoading ? 'opacity-75 pointer-events-none' : ''}
          `}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.docx,.doc,.pdf"
            onChange={handleInputChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isLoading}
          />

          <div className="text-center">
            {isLoading ? (
              <>
                <div className="mx-auto w-10 h-10 mb-3">
                  <svg className="animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
                <p className="text-gray-600 text-sm">Parsing {currentFileName}...</p>
              </>
            ) : (
              <>
                <div className="mx-auto w-10 h-10 mb-3 text-gray-400">
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Drop a standards document here or click to browse
                </p>
                <p className="text-xs text-gray-500">
                  Supports PDF, Word, and Excel files
                </p>
              </>
            )}
          </div>
        </div>

        {/* Uploaded Documents List */}
        {uploadedDocuments.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Uploaded Documents</h4>
            <div className="space-y-2">
              {uploadedDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${getDocumentTypeColor(doc.documentType)}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      {getDocumentTypeIcon(doc.documentType)}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{doc.fileName}</p>
                      <p className="text-xs opacity-75">
                        {doc.sections.length} sections,{' '}
                        {doc.sections.reduce((sum, s) => sum + s.requirements.length, 0)} requirements
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveDocument(doc.id)}
                    className="p-1.5 rounded-lg hover:bg-white/50 transition-colors"
                    title="Remove document"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
