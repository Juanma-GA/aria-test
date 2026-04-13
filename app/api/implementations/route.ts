import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import Implementation from '@/lib/models/Implementation'

export async function GET() {
  try {
    await dbConnect()
    const implementations = await Implementation.find({})
    return NextResponse.json(implementations)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch implementations' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await dbConnect()
    const body = await request.json()
    const implementation = new Implementation(body)
    await implementation.save()
    return NextResponse.json(implementation, { status: 201 })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create implementation' }, { status: 500 })
  }
}