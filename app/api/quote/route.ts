import { NextRequest, NextResponse } from 'next/server'
import { fetchComposerQuote } from '@/lib/lifi'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { chainId, vaultAddress, walletAddress, fromAmountUsd, fromTokenAddress, assetDecimals } = body || {}

    if (!chainId || !vaultAddress || !walletAddress || !fromAmountUsd) {
      return NextResponse.json(
        {
          success: false,
          error: 'chainId, vaultAddress, walletAddress, and fromAmountUsd are required.',
        },
        { status: 400 },
      )
    }

    const quote = await fetchComposerQuote({
      chainId: Number(chainId),
      vaultAddress: String(vaultAddress),
      walletAddress: String(walletAddress),
      fromAmountUsd: Number(fromAmountUsd),
      fromTokenAddress: fromTokenAddress ? String(fromTokenAddress) : undefined,
      assetDecimals: assetDecimals ? Number(assetDecimals) : undefined,
    })

    return NextResponse.json({
      success: true,
      quote,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to prepare LI.FI Composer quote.',
      },
      { status: 500 },
    )
  }
}
