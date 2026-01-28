import { NextRequest, NextResponse } from 'next/server';
import { parseStandardsDocument } from '@/lib/parsers/standards-parser';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = formData.get('documentType') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
      'application/vnd.ms-excel', // xls
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
      'application/msword', // doc
      'application/pdf',
    ];

    const allowedExtensions = ['xlsx', 'xls', 'docx', 'doc', 'pdf'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension || '')) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Allowed: Excel, Word, PDF` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse the standards document
    const parsedDocument = await parseStandardsDocument(
      buffer,
      file.name,
      file.type,
      {
        documentType: documentType as 'sop' | 'regulatory' | 'policy' | 'guideline' | 'other' | undefined,
        extractRequirements: true,
      }
    );

    return NextResponse.json({
      success: true,
      data: parsedDocument,
    });
  } catch (error) {
    console.error('Standards parse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse standards document' },
      { status: 500 }
    );
  }
}
