import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 55;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();
        if (!url) return NextResponse.json({ ok: false, error: 'URL required' }, { status: 400 });

        const API = process.env.PAGESPEED_API_KEY || '';
        if (!API) return NextResponse.json({ ok: false, error: 'PAGESPEED_API_KEY not set' }, { status: 500 });

        // fields param = only fetch what we need, 90% smaller response = 3-4x faster
        const fields = 'lighthouseResult(categories,audits(largest-contentful-paint,cumulative-layout-shift,first-contentful-paint,server-response-time,interactive,total-byte-weight,is-on-https,document-title,heading-order,render-blocking-resources,uses-optimized-images,uses-webp-images,unused-javascript,unused-css-rules,uses-responsive-images))';
        const base = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${API}&fields=${encodeURIComponent(fields)}`;

        // Both desktop + mobile in parallel
        const [desktopRes, mobileRes] = await Promise.all([
            fetch(`${base}&strategy=desktop`),
            fetch(`${base}&strategy=mobile`),
        ]);

        const [desktopText, mobileText] = await Promise.all([
            desktopRes.text(),
            mobileRes.text(),
        ]);

        let desktop: Record<string, unknown> = {};
        let mobile: Record<string, unknown> = {};

        try { desktop = JSON.parse(desktopText); } catch {
            return NextResponse.json({ ok: false, error: 'PageSpeed desktop parse failed. Check PAGESPEED_API_KEY.' }, { status: 500 });
        }
        try { mobile = JSON.parse(mobileText); } catch {
            return NextResponse.json({ ok: false, error: 'PageSpeed mobile parse failed. Check PAGESPEED_API_KEY.' }, { status: 500 });
        }

        if ((desktop as Record<string, {message?: string}>).error) {
            const msg = ((desktop as Record<string, {message?: string}>).error as {message?: string})?.message || 'API error';
            return NextResponse.json({ ok: false, error: `PageSpeed error: ${msg}` }, { status: 500 });
        }

        function getScore(d: Record<string, unknown>): number {
            const cats = ((d?.lighthouseResult as Record<string, unknown>)?.categories as Record<string, unknown>);
            const perf = (cats?.performance as Record<string, unknown>)?.score as number;
            return Math.round((perf || 0) * 100);
        }
        function getMetric(d: Record<string, unknown>, id: string): string {
            const audits = ((d?.lighthouseResult as Record<string, unknown>)?.audits as Record<string, unknown>) || {};
            return (audits[id] as Record<string, unknown>)?.displayValue as string || 'N/A';
        }
        function getOpportunities(d: Record<string, unknown>): string[] {
            const audits = ((d?.lighthouseResult as Record<string, unknown>)?.audits as Record<string, unknown>) || {};
            const known = ['render-blocking-resources','uses-optimized-images','uses-webp-images','unused-javascript','unused-css-rules','uses-responsive-images'];
            return known
                .filter(k => audits[k] && Number((audits[k] as Record<string, unknown>)?.score ?? 1) < 0.9)
                .map(k => (audits[k] as Record<string, unknown>)?.title as string)
                .filter(Boolean)
                .slice(0, 6);
        }

        const lhr = (desktop?.lighthouseResult || {}) as Record<string, unknown>;
        const audits = (lhr.audits as Record<string, unknown>) || {};
        const pageTitle = ((audits['document-title'] as Record<string, unknown>)?.title as string) || '';
        const hasHttps = url.startsWith('https://') && Number((audits['is-on-https'] as Record<string, unknown>)?.score ?? 1) === 1;

        return NextResponse.json({
            ok: true,
            data: {
                desktopScore: getScore(desktop),
                mobileScore: getScore(mobile),
                lcp: getMetric(mobile, 'largest-contentful-paint'),
                cls: getMetric(mobile, 'cumulative-layout-shift'),
                fcp: getMetric(mobile, 'first-contentful-paint'),
                ttfb: getMetric(mobile, 'server-response-time'),
                loadTime: getMetric(mobile, 'interactive'),
                pageSize: getMetric(mobile, 'total-byte-weight'),
                desktopLcp: getMetric(desktop, 'largest-contentful-paint'),
                desktopCls: getMetric(desktop, 'cumulative-layout-shift'),
                opportunities: getOpportunities(mobile),
                pageTitle,
                hasHttps,
            }
        });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Speed route error:', msg);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}