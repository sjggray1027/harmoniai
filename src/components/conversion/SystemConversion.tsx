'use client';

import { useState, useCallback, useRef } from 'react';

interface SystemInfo {
  id: string;
  name: string;
  vendor: string;
  rootElement?: string;
  namespace?: string;
}

interface ConversionResult {
  source: {
    system: string;
    systemName: string;
    vendor: string;
    version?: string;
    detection?: {
      confidence: number;
      method: string;
    };
  };
  target: {
    system: string;
    systemName: string;
    vendor: string;
    format: string;
    fileExtension: string;
  };
  output: {
    xml: string;
    format: string;
    fileExtension: string;
  };
  statistics: {
    parser: {
      unitProcedures: number;
      operations: number;
      phases: number;
      totalElements: number;
    };
    generator: {
      unitProcedures: number;
      operations: number;
      phases: number;
      totalElements: number;
    };
  };
  warnings: {
    parser: string[];
    generator: string[];
  };
}

interface SystemConversionProps {
  onConversionComplete?: (result: ConversionResult) => void;
}

export default function SystemConversion({ onConversionComplete }: SystemConversionProps) {
  const [sourceXml, setSourceXml] = useState<string>('');
  const [sourceSystem, setSourceSystem] = useState<string | null>(null);
  const [targetSystem, setTargetSystem] = useState<string>('');
  const [detectedSystem, setDetectedSystem] = useState<string | null>(null);
  const [detectionConfidence, setDetectionConfidence] = useState<number | null>(null);
  const [sources, setSources] = useState<SystemInfo[]>([]);
  const [targets, setTargets] = useState<SystemInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConversionResult | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch available systems on mount
  useState(() => {
    fetch('/api/convert')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setSources(data.data.sources);
          setTargets(data.data.targets);
        }
      })
      .catch(console.error);
  });

  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setResult(null);
    setDetectedSystem(null);
    setDetectionConfidence(null);
    setSourceSystem(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      setSourceXml(content);

      // Auto-detect source system
      setIsDetecting(true);
      try {
        const response = await fetch('/api/parse-xml', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ xml: content }),
        });

        const data = await response.json();
        if (data.success) {
          setDetectedSystem(data.data.sourceSystem);
          setDetectionConfidence(data.data.detection?.confidence || 1);
        } else {
          // Detection failed but that's okay - user can select manually
          setError(data.error);
        }
      } catch (err) {
        console.error('Detection error:', err);
      } finally {
        setIsDetecting(false);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && (file.name.endsWith('.xml') || file.type === 'application/xml' || file.type === 'text/xml')) {
      // Create a synthetic event to reuse handleFileSelect
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
        handleFileSelect({ target: { files: dataTransfer.files } } as React.ChangeEvent<HTMLInputElement>);
      }
    }
  }, [handleFileSelect]);

  const handleConvert = useCallback(async () => {
    if (!sourceXml || !targetSystem) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceXml,
          sourceSystem: sourceSystem || undefined,
          targetSystem,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Conversion failed');
      }

      setResult(data.data);
      onConversionComplete?.(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setIsLoading(false);
    }
  }, [sourceXml, sourceSystem, targetSystem, onConversionComplete]);

  const handleCopy = async () => {
    if (result?.output.xml) {
      await navigator.clipboard.writeText(result.output.xml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    if (!result?.output.xml) return;

    const blob = new Blob([result.output.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted-${result.target.system}.${result.output.fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleReset = () => {
    setSourceXml('');
    setSourceSystem(null);
    setTargetSystem('');
    setDetectedSystem(null);
    setDetectionConfidence(null);
    setResult(null);
    setError(null);
    setFileName('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Highlight XML for preview
  const highlightXml = (xmlString: string) => {
    return xmlString
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-gray-500">$1</span>')
      .replace(/(&lt;\/?[\w:-]+)/g, '<span class="text-blue-600">$1</span>')
      .replace(/(\s[\w:-]+)=/g, '<span class="text-purple-600">$1</span>=')
      .replace(/"([^"]*)"/g, '"<span class="text-green-600">$1</span>"');
  };

  const effectiveSourceSystem = sourceSystem || detectedSystem;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          System-to-System Conversion
        </h2>
        <p className="text-gray-600">
          Convert batch records between different MES systems.
          Upload an XML file and select your target system.
        </p>
      </div>

      {!result ? (
        <>
          {/* File Upload */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              sourceXml ? 'border-green-300 bg-green-50' : 'border-gray-300 hover:border-blue-400'
            }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              onChange={handleFileSelect}
              className="hidden"
              id="xml-file-input"
            />

            {sourceXml ? (
              <div className="space-y-3">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-gray-900">{fileName}</p>
                  <p className="text-sm text-gray-500">{(sourceXml.length / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  Choose different file
                </button>
              </div>
            ) : (
              <label htmlFor="xml-file-input" className="cursor-pointer block">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <p className="font-medium text-gray-900">Drop XML file here or click to browse</p>
                <p className="text-sm text-gray-500 mt-1">
                  Supports PAS-X, Syncade, PharmaSuite, Opcenter, and MODA formats
                </p>
              </label>
            )}
          </div>

          {/* Detection Result */}
          {isDetecting && (
            <div className="flex items-center justify-center gap-2 text-gray-500">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Detecting source system...
            </div>
          )}

          {detectedSystem && !isDetecting && (
            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-blue-900">
                      Detected: {sources.find(s => s.id === detectedSystem)?.name || detectedSystem}
                    </p>
                    <p className="text-sm text-blue-600">
                      {detectionConfidence && `${Math.round(detectionConfidence * 100)}% confidence`}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSourceSystem(sourceSystem ? null : detectedSystem)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  {sourceSystem ? 'Use detected' : 'Change'}
                </button>
              </div>
            </div>
          )}

          {/* Manual Source Selection (shown if detection failed or user wants to change) */}
          {sourceXml && (sourceSystem || !detectedSystem) && !isDetecting && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-3">Source System</h3>
              <div className="grid grid-cols-5 gap-2">
                {sources.map(source => (
                  <button
                    key={source.id}
                    onClick={() => setSourceSystem(source.id === sourceSystem ? null : source.id)}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      (sourceSystem === source.id || (!sourceSystem && detectedSystem === source.id))
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-sm text-gray-900">{source.name}</p>
                    <p className="text-xs text-gray-500">{source.vendor}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Target System Selection */}
          {sourceXml && effectiveSourceSystem && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-medium text-gray-900 mb-3">Target System</h3>
              <div className="grid grid-cols-5 gap-2">
                {targets.map(target => (
                  <button
                    key={target.id}
                    onClick={() => setTargetSystem(target.id)}
                    disabled={target.id === effectiveSourceSystem}
                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                      target.id === effectiveSourceSystem
                        ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                        : targetSystem === target.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-sm text-gray-900">{target.name}</p>
                    <p className="text-xs text-gray-500">{target.vendor}</p>
                    {target.id === effectiveSourceSystem && (
                      <p className="text-xs text-orange-600 mt-1">Source</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 rounded-xl border border-red-200 p-4">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium text-red-800">Error</p>
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Convert Button */}
          <div className="flex justify-center">
            <button
              onClick={handleConvert}
              disabled={!sourceXml || !targetSystem || isLoading}
              className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Converting...
                </>
              ) : (
                <>
                  Convert to {targets.find(t => t.id === targetSystem)?.name || 'Target'}
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        /* Results View */
        <div className="space-y-6">
          {/* Conversion Summary */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <p className="text-sm text-gray-500">From</p>
                  <p className="font-semibold text-gray-900">{result.source.systemName}</p>
                  <p className="text-xs text-gray-500">{result.source.vendor}</p>
                </div>
                <div className="flex items-center gap-2 text-blue-600">
                  <div className="w-8 h-0.5 bg-blue-300" />
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  <div className="w-8 h-0.5 bg-blue-300" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-500">To</p>
                  <p className="font-semibold text-gray-900">{result.target.systemName}</p>
                  <p className="text-xs text-gray-500">{result.target.vendor}</p>
                </div>
              </div>
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                New Conversion
              </button>
            </div>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Unit Procedures</p>
              <p className="text-2xl font-bold text-gray-900">{result.statistics.generator.unitProcedures}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Operations</p>
              <p className="text-2xl font-bold text-gray-900">{result.statistics.generator.operations}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Phases</p>
              <p className="text-2xl font-bold text-gray-900">{result.statistics.generator.phases}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-sm text-gray-500">Total Elements</p>
              <p className="text-2xl font-bold text-gray-900">{result.statistics.generator.totalElements}</p>
            </div>
          </div>

          {/* Warnings */}
          {(result.warnings.parser.length > 0 || result.warnings.generator.length > 0) && (
            <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4">
              <h3 className="font-medium text-yellow-800 mb-2">Warnings</h3>
              <ul className="text-sm text-yellow-700 space-y-1">
                {result.warnings.parser.map((w, i) => (
                  <li key={`parser-${i}`}>Parser: {w}</li>
                ))}
                {result.warnings.generator.map((w, i) => (
                  <li key={`gen-${i}`}>Generator: {w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* XML Output */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{result.target.format}</h3>
                <p className="text-sm text-gray-500">converted-{result.target.system}.{result.output.fileExtension}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    copied ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
              </div>
            </div>
            <div className="max-h-[500px] overflow-auto">
              <pre className="p-4 text-sm font-mono leading-relaxed">
                <code dangerouslySetInnerHTML={{ __html: highlightXml(result.output.xml) }} />
              </pre>
            </div>
            <div className="px-6 py-3 border-t border-gray-200 bg-gray-50 text-sm text-gray-500">
              {result.output.xml.split('\n').length} lines • {(result.output.xml.length / 1024).toFixed(1)} KB
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
