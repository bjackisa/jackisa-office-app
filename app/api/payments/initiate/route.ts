import { NextRequest, NextResponse } from 'next/server'
import { initiatePayment } from '@/lib/payment-gateway'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const result = await initiatePayment(body)
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, message: err?.message || 'Failed to initiate payment' },
      { status: 500 }
    )
  }
}
