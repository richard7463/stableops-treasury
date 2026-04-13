import { NextRequest, NextResponse } from 'next/server'
import { discoverTreasuryPlan } from '@/lib/lifi'
import { normalizePolicy } from '@/lib/stableops'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const policy = normalizePolicy(body?.policy)
    const plan = await discoverTreasuryPlan(policy)

    return NextResponse.json({
      success: true,
      plan,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to build StableOps treasury plan.',
      },
      { status: 500 },
    )
  }
}
