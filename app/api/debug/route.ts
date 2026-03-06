import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const test = searchParams.get('test') || 'all';

    const results: Record<string, unknown> = {};

    // Test 1: Are env vars present?
    results.env = {
        PAGESPEED_API_KEY: process.env.PAGESPEED_API_KEY ? `SET (length: ${process.env.PAGESPEED_API_KEY.length})` : 'NOT SET',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ? `SET (length: ${process.env.GEMINI_API_KEY.length})` : 'NOT SET',
    };

    // Test 2: PageSpeed API
    if (test === 'all' || test === 'pagespeed') {
        try {
            const psUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&strategy=mobile&key=${process.env.PAGESPEED_API_KEY || ''}`;
            const res = await fetch(psUrl);
            const text = await res.text();
            results.pagespeed = {
                status: res.status,
                ok: res.ok,
                first300chars: text.slice(0, 300),
                isJSON: text.trim().startsWith('{'),
                isHTML: text.trim().startsWith('<'),
            };
        } catch (e) {
            results.pagespeed = { error: String(e) };
        }
    }

    // Test 3: Gemini API
    if (test === 'all' || test === 'gemini') {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY || ''}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ role: 'user', parts: [{ text: 'Say HELLO in JSON like: {"message":"hello"}' }] }],
                        generationConfig: { maxOutputTokens: 50 },
                    }),
                }
            );
            const text = await res.text();
            results.gemini = {
                status: res.status,
                ok: res.ok,
                first300chars: text.slice(0, 300),
                isJSON: text.trim().startsWith('{'),
                isHTML: text.trim().startsWith('<'),
            };
        } catch (e) {
            results.gemini = { error: String(e) };
        }
    }

    return NextResponse.json(results, { status: 200 });
}