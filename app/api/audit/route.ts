import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 55;
export const dynamic = 'force-dynamic';

const CRO_SYSTEM = `You are the "CRO Audit Engine" — a world-class conversion rate optimisation expert with 15 years of experience auditing thousands of websites. You have generated millions of dollars in additional revenue for businesses by identifying exactly why visitors leave without converting.

You are BRUTALLY SPECIFIC. You never say "improve your CTA" — you say "your primary CTA button says 'Submit' in grey on a white background — this is invisible and passive. Change it to 'Get My Free Quote Today' in white on a high-contrast orange or green button, placed above the fold and repeated after every major section."

You identify the EXACT location of every problem. Not "your page has trust issues" but "there are zero testimonials visible above the fold, and the only social proof is a logos section buried 80% down the page that most visitors never reach."

CRO MASTERY YOU APPLY TO EVERY AUDIT:

ABOVE THE FOLD: The headline must pass the 5-second test. Value prop must be specific not vague. Primary CTA visible without scrolling. Hero image shows outcome not stock photos. Social proof in hero = 34% more conversions.

CTA PSYCHOLOGY: Action verbs + value + urgency. Button color 4.5:1 contrast minimum. One primary CTA per section. Micro-copy reduces anxiety. Min 44px tap targets. Sticky CTA bar increases conversions 22%.

TRUST SIGNALS: Testimonials with name + photo + specific result outperform generic quotes 7x. Real numbers beat vague claims. Trust badges near CTA. Founder photo. Physical address + phone reduces bounce 14%. Live chat increases conversion 20%.

MOBILE (70% of traffic): Buttons under 44px lose taps. Text under 16px forces zoom = exit. Horizontal scroll = broken. Pop-ups on mobile = Google penalty. Every extra form field = 10% fewer completions. 53% leave if load over 3 seconds.

COPY: Lead with outcome not process. Specificity builds trust. Grade 8 reading level. FAQ addresses top 5 objections. Urgency without lying. Headline formula: [Outcome] + [Timeframe] + [Objection Handle].

PAGE STRUCTURE: F-pattern reading. Above fold: hook. Middle: proof. Bottom: CTA. Exit intent popup saves 15% of abandoning visitors. Every 1 second delay = 7% fewer conversions.

OUTPUT: ONLY valid JSON. No markdown. No preamble. No explanation outside the JSON.`;

function extractJSON(text: string): string {
    let cleaned = text.replace(/\`\`\`json\s*/gi, '').replace(/\`\`\`\s*/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No valid JSON found in Gemini response');
    cleaned = cleaned.slice(start, end + 1);
    cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    cleaned = cleaned.replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, '');
    try { JSON.parse(cleaned); return cleaned; } catch {
        cleaned = cleaned.replace(/\u2018|\u2019/g, "\'").replace(/\u201c|\u201d/g, '\\"');
        try { JSON.parse(cleaned); return cleaned; } catch (e2) {
            throw new Error(`JSON parse failed: ${e2 instanceof Error ? e2.message : String(e2)}`);
        }
    }
}

async function callGemini(system: string, user: string): Promise<string> {
    const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
    if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not set');

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: [{ role: 'user', parts: [{ text: user }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 8000, responseMimeType: 'application/json' },
            }),
        }
    );

    const rawText = await res.text();
    let d: Record<string, unknown>;
    try { d = JSON.parse(rawText); } catch {
        throw new Error(`Gemini returned non-JSON. Status: ${res.status}`);
    }
    if (d.error) {
        throw new Error(`Gemini error: ${(d.error as Record<string, string>)?.message || JSON.stringify(d.error)}`);
    }
    const raw = ((d.candidates as Record<string, unknown>[])?.[0]?.content as Record<string, unknown>);
    const text = (raw?.parts as Record<string, unknown>[])?.[0]?.text as string || '';
    if (!text) throw new Error('Gemini returned empty response');
    return extractJSON(text);
}

export async function POST(req: NextRequest) {
    try {
        const { url, psData, auditDate } = await req.json();
        if (!url || !psData) return NextResponse.json({ ok: false, error: 'url and psData required' }, { status: 400 });

        const userPrompt = `Audit this website for CRO conversion issues. Use all real data below.

URL: ${url}
Title: ${psData.pageTitle || 'Unknown'}
HTTPS: ${psData.hasHttps ? 'YES - Secure' : 'NO - Critical trust issue'}
Desktop PageSpeed: ${psData.desktopScore}/100
Mobile PageSpeed: ${psData.mobileScore}/100
Mobile LCP: ${psData.lcp} | CLS: ${psData.cls} | FCP: ${psData.fcp}
Desktop LCP: ${psData.desktopLcp} | Desktop CLS: ${psData.desktopCls}
Load Time: ${psData.loadTime} | Page Size: ${psData.pageSize}
PageSpeed issues flagged: ${(psData.opportunities || []).slice(0,4).join('; ')}

Return ONLY valid JSON (no markdown, no extra text). Fill every field with SPECIFIC insights about THIS site:
{"url":"${url}","auditDate":"${auditDate}","pageTitle":"${psData.pageTitle || 'Unknown'}","industry":"detect from URL and title","overallScore":50,"grade":"F","speedScore":${Math.round((psData.desktopScore + psData.mobileScore) / 2)},"trustScore":45,"mobileScore":${psData.mobileScore},"uxScore":45,"copyScore":45,"ctaScore":40,"summary":"2-3 brutally specific sentences using real numbers desktop:${psData.desktopScore} mobile:${psData.mobileScore} LCP:${psData.lcp}","conversionImpact":"specific lead/revenue estimate e.g. if 1000 visitors/month at 2% conversion fixing mobile score ${psData.mobileScore}/100 could add X leads/month","speedMetrics":{"desktop":${psData.desktopScore},"mobile":${psData.mobileScore},"lcp":"${psData.lcp}","cls":"${psData.cls}","fcp":"${psData.fcp}","ttfb":"${psData.ttfb}","loadTime":"${psData.loadTime}","pageSize":"${psData.pageSize}","desktopLcp":"${psData.desktopLcp}","desktopCls":"${psData.desktopCls}"},"criticalIssues":[{"title":"most critical conversion killer specific to this site","where":"exact page location","impact":"specific % or number impact","fix":"exact step-by-step fix"},{"title":"second critical issue","where":"exact location","impact":"specific impact","fix":"exact fix"},{"title":"third critical issue","where":"exact location","impact":"specific impact","fix":"exact fix"}],"aboveFoldAudit":[{"item":"Headline Clarity","status":"fail","found":"what you detected about this site","problem":"specific problem","fix":"specific fix with example"},{"item":"Value Proposition","status":"warn","found":"what detected","problem":"specific problem","fix":"specific fix"},{"item":"Primary CTA","status":"fail","found":"what detected","problem":"specific problem","fix":"exact copy and placement fix"},{"item":"Hero Visual","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Navigation","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"}],"ctaAudit":[{"item":"CTA Copy","status":"fail","found":"what detected","problem":"specific problem","fix":"exact copy to use instead"},{"item":"CTA Design","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"CTA Placement","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Anxiety Reducers","status":"fail","found":"none detected","problem":"no friction-reducing microcopy below CTA","fix":"add: No credit card required / Free consultation / Cancel anytime"},{"item":"Form Fields","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"}],"trustAudit":[{"item":"Testimonials","status":"fail","found":"what detected","problem":"specific problem","fix":"specific fix"},{"item":"Social Proof","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Trust Badges","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Contact Info","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"HTTPS","status":"${psData.hasHttps ? 'pass' : 'fail'}","found":"${psData.hasHttps ? 'HTTPS enabled' : 'No HTTPS detected'}","problem":"${psData.hasHttps ? 'Site is secure' : 'No SSL certificate — browsers show scary warning destroying trust instantly'}","fix":"${psData.hasHttps ? 'Maintain HTTPS on all resources including images and scripts' : 'Install SSL immediately via your host or Cloudflare free SSL — non-negotiable'}"}],"mobileAudit":[{"item":"Mobile Speed","status":"${psData.mobileScore >= 80 ? 'pass' : psData.mobileScore >= 50 ? 'warn' : 'fail'}","found":"Mobile: ${psData.mobileScore}/100 Desktop: ${psData.desktopScore}/100 LCP: ${psData.lcp}","problem":"${psData.mobileScore < 50 ? 'Critical: mobile score ' + psData.mobileScore + '/100 means 53% of mobile visitors abandon before page loads' : psData.mobileScore < 80 ? 'Mobile score ' + psData.mobileScore + '/100 below 80 target — losing significant mobile revenue' : 'Mobile speed is good'}","fix":"Compress all images to WebP under 100KB, enable lazy loading, remove unused JavaScript. Target LCP under 2.5s"},{"item":"Touch Targets","status":"warn","found":"assessment","problem":"specific problem on this type of site","fix":"minimum 44px height on all buttons and links"},{"item":"Mobile Navigation","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Mobile Forms","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Mobile CTA","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"}],"copyAudit":[{"item":"Headline","status":"warn","found":"${psData.pageTitle || 'not detected'}","problem":"specific headline problem for this site","fix":"rewrite formula: [Specific Outcome] + [Timeframe] + [Objection Handle] with example for this niche"},{"item":"Benefits vs Features","status":"warn","found":"assessment","problem":"specific problem","fix":"before/after rewrite example"},{"item":"Specificity","status":"warn","found":"assessment","problem":"vague claims without proof numbers","fix":"specific numbers to add"},{"item":"Objections","status":"fail","found":"assessment","problem":"top buyer objections not addressed on page","fix":"exact top 5 objections to address in FAQ for this industry"},{"item":"Urgency","status":"warn","found":"none detected","problem":"no urgency triggers — visitors have no reason to act now","fix":"honest urgency copy examples for this type of business"}],"uxAudit":[{"item":"Speed UX Impact","status":"${psData.mobileScore >= 80 ? 'pass' : psData.mobileScore >= 50 ? 'warn' : 'fail'}","found":"Mobile LCP: ${psData.lcp} CLS: ${psData.cls} Size: ${psData.pageSize}","problem":"specific user behaviour impact of these exact metrics","fix":"${(psData.opportunities || [])[0] || 'compress images and remove render-blocking JS'}"},{"item":"Visual Hierarchy","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Readability","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Content Flow","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Exit Intent","status":"fail","found":"none detected","problem":"zero exit intent strategy — losing 100% of abandoning visitors with no recovery","fix":"add exit popup with lead magnet using Hotjar or OptinMonster — saves 15% of abandoning visitors"}],"topFixes":["Fix 1 with real data mobile:${psData.mobileScore}/100 desktop:${psData.desktopScore}/100","Fix 2 specific to this site","Fix 3 specific to this site","Fix 4 specific to this site","Fix 5 specific to this site"],"actionPlan":{"today":["specific action 1","specific action 2","specific action 3"],"thisWeek":["specific action 1","specific action 2","specific action 3"],"thisMonth":["specific action 1","specific action 2","specific action 3"]},"passed":[{"item":"something genuinely good about this site","why":"specific reason this helps conversion"}]}`;

        const raw = await callGemini(CRO_SYSTEM, userPrompt);
        const parsed = JSON.parse(raw);

        // Hard override with real data
        parsed.speedMetrics = {
            desktop: psData.desktopScore,
            mobile: psData.mobileScore,
            lcp: psData.lcp,
            cls: psData.cls,
            fcp: psData.fcp,
            ttfb: psData.ttfb,
            loadTime: psData.loadTime,
            pageSize: psData.pageSize,
            desktopLcp: psData.desktopLcp,
            desktopCls: psData.desktopCls,
        };
        parsed.speedScore = Math.round((psData.desktopScore + psData.mobileScore) / 2);
        parsed.mobileScore = psData.mobileScore;
        parsed.url = url;
        parsed.auditDate = auditDate;
        parsed.overallScore = Math.round(
            (parsed.speedScore + parsed.trustScore + parsed.mobileScore + parsed.uxScore + parsed.copyScore + parsed.ctaScore) / 6
        );
        const s = parsed.overallScore;
        parsed.grade = s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F';

        return NextResponse.json({ ok: true, data: parsed });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Audit route error:', msg);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}