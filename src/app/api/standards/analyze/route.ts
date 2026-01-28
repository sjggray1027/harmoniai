import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { analyzeCompliance } from '@/lib/analysis/compliance-analyzer';
import { ExtractedStep } from '@/types/workflow';
import { StandardsDocument, StandardsAnalysisRequest } from '@/types/standards';

export const runtime = 'nodejs';

// Increase timeout for AI analysis
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body: StandardsAnalysisRequest = await request.json();
    const { steps, standardsDocuments, options } = body;

    // Validate input
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json(
        { error: 'No workflow steps provided' },
        { status: 400 }
      );
    }

    if (!standardsDocuments || !Array.isArray(standardsDocuments) || standardsDocuments.length === 0) {
      return NextResponse.json(
        { error: 'No standards documents provided' },
        { status: 400 }
      );
    }

    // Validate steps have required fields
    const validSteps = steps.filter(
      (step): step is ExtractedStep =>
        typeof step === 'object' &&
        typeof step.id === 'string' &&
        typeof step.description === 'string'
    );

    if (validSteps.length === 0) {
      return NextResponse.json(
        { error: 'No valid workflow steps found' },
        { status: 400 }
      );
    }

    // Validate standards documents have required fields
    const validDocs = standardsDocuments.filter(
      (doc): doc is StandardsDocument =>
        typeof doc === 'object' &&
        typeof doc.id === 'string' &&
        typeof doc.fileName === 'string' &&
        Array.isArray(doc.sections)
    );

    if (validDocs.length === 0) {
      return NextResponse.json(
        { error: 'No valid standards documents found' },
        { status: 400 }
      );
    }

    // Perform compliance analysis
    const analysisResult = await analyzeCompliance(
      validSteps,
      validDocs,
      {
        strictMode: options?.strictMode,
        categoriesOfInterest: options?.categoriesOfInterest,
        maxQuestions: options?.maxQuestions,
      }
    );

    const sessionId = uuidv4();

    return NextResponse.json({
      success: true,
      sessionId,
      questions: analysisResult.questions,
      summary: analysisResult.summary,
    });
  } catch (error) {
    console.error('Standards analysis error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to analyze compliance' },
      { status: 500 }
    );
  }
}
