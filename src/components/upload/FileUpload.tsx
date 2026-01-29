'use client';

import { useState, useCallback } from 'react';
import { ParsedDocument } from '@/types/workflow';

interface FileUploadProps {
  onParsed: (data: ParsedDocument) => void;
  onError: (error: string) => void;
}

export default function FileUpload({ onParsed, onError }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setIsLoading(true);
    setFileName(file.name);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/parse', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to parse file');
      }

      onParsed(result.data);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to upload file');
      setFileName(null);
    } finally {
      setIsLoading(false);
    }
  }, [onParsed, onError]);

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
  }, [handleFile]);

  return (
    <div
      className={`
        relative border-2 border-dashed rounded-xl p-8
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
        accept=".xlsx,.xls,.docx,.doc,.pdf,.xml"
        onChange={handleInputChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isLoading}
      />

      <div className="text-center">
        {isLoading ? (
          <>
            <div className="mx-auto w-12 h-12 mb-4">
              <svg className="animate-spin text-blue-600" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <p className="text-gray-600">Parsing {fileName}...</p>
          </>
        ) : (
          <>
            <div className="mx-auto w-12 h-12 mb-4 text-gray-400">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <p className="text-lg font-medium text-gray-700 mb-1">
              Drop your batch record file here
            </p>
            <p className="text-sm text-gray-500 mb-4">
              or click to browse
            </p>
            <div className="flex justify-center gap-2 text-xs text-gray-400 flex-wrap">
              <span className="px-2 py-1 bg-gray-200 rounded">Excel (.xlsx, .xls)</span>
              <span className="px-2 py-1 bg-gray-200 rounded">Word (.docx, .doc)</span>
              <span className="px-2 py-1 bg-gray-200 rounded">PDF (.pdf)</span>
              <span className="px-2 py-1 bg-gray-200 rounded">XML (.xml)</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
