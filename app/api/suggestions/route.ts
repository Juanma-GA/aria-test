/**
 * API endpoint for predictive autocomplete suggestions
 * Aggregates historical data from all audits/processes
 */

import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import { Process } from '@/lib/models';

type SuggestionField = 'norms' | 'certs' | 'tools' | 'inputs' | 'outputs';

export async function GET(req: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(req.url);
    const field = searchParams.get('field') as SuggestionField;
    const query = searchParams.get('query') || '';

    if (
      !field ||
      !['norms', 'certs', 'tools', 'inputs', 'outputs'].includes(field)
    ) {
      return NextResponse.json(
        { error: 'Invalid field parameter' },
        { status: 400 },
      );
    }

    // Fetch all processes
    const processes = await Process.find({}).lean();

    // Aggregate values by field
    const valueMap = new Map<string, number>();

    for (const proc of processes) {
      let values: string[] = [];

      switch (field) {
        case 'norms':
          values = proc.applicableNorms || [];
          break;
        case 'certs':
          values = proc.activeCertifications || [];
          break;
        case 'tools':
        case 'inputs':
        case 'outputs':
          const activities = (proc.b3?.activities || []) as Array<{
            tools?: string[];
            inputs?: string[];
            outputs?: string[];
          }>;
          for (const act of activities) {
            const actValues =
              field === 'tools'
                ? act.tools || []
                : field === 'inputs'
                  ? act.inputs || []
                  : act.outputs || [];
            values.push(...actValues);
          }
          break;
      }

      // Count occurrences
      for (const value of values) {
        if (value && value.trim()) {
          const trimmed = value.trim();
          valueMap.set(trimmed, (valueMap.get(trimmed) || 0) + 1);
        }
      }
    }

    // Filter by query (case-insensitive substring match)
    const queryLower = query.toLowerCase();
    const filtered = Array.from(valueMap.entries())
      .filter(([value]) => value.toLowerCase().includes(queryLower))
      .sort((a, b) => b[1] - a[1]) // Sort by frequency descending
      .slice(0, 10) // Top 10 suggestions
      .map(([value, count]) => ({ value, count }));

    return NextResponse.json({ suggestions: filtered });
  } catch (err) {
    console.error('[API] Suggestions error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
