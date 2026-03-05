import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const CRO_SYSTEM = `You are the "CRO Audit Engine" — a world-class conversion rate optimisation expert with 15 years of experience auditing thousands of websites. You have generated millions of dollars in additional revenue for businesses by identifying exactly why visitors leave without converting.

You are BRUTALLY SPECIFIC. You never say "improve your CTA" — you say "your primary CTA button says 'Submit' in grey on a white background — this is invisible and passive. Change it to 'Get My Free Quote Today' in white on a high-contrast orange or green button, placed above the fold and repeated after every major section."

You identify the EXACT location of every problem. Not "your page has trust issues" but "there are zero testimonials visible above the fold, and the only social proof is a logos section buried 80% down the page that most visitors never reach."

CRO MASTERY YOU APPLY TO EVERY AUDIT:

ABOVE THE FOLD (First 5 seconds decide everything):
- The headline must pass the "5-second test" — a stranger should instantly know: what you do, who it's for, why they should care
- Value proposition must be specific, not vague. "We help businesses grow" = useless. "We build Shopify stores that convert 3x industry average" = powerful
- Primary CTA must be visible WITHOUT scrolling on both desktop and mobile
- Hero image/video should show the product/service in use or the outcome — not stock photos of people shaking hands
- No navigation clutter that pulls attention away from the main CTA
- Social proof (number of customers, reviews, logos) in the hero section increases conversion by 34%

CALL TO ACTION PSYCHOLOGY:
- CTA button copy: action verbs + value + urgency. "Get Free Audit" beats "Submit". "Start Free Trial" beats "Sign Up"
- Button color must have 4.5:1 contrast ratio minimum against background
- One primary CTA per section — multiple competing CTAs create decision paralysis
- CTA placement: above fold, after value prop, after testimonials, at page bottom
- Micro-copy under CTA reduces anxiety: "No credit card required" / "Free, no obligation" / "Cancel anytime"
- Button size: minimum 44px height for mobile tap targets
- Sticky CTA bar or floating button for long pages increases conversions 22%

TRUST SIGNALS THAT ACTUALLY WORK:
- Testimonials with full name, photo, company and specific result outperform generic quotes by 7x
- Video testimonials convert 86% better than text
- Trust badges (SSL, money-back, years in business) near the primary CTA
- Real numbers: "2,847 customers" beats "thousands of customers"
- Case studies with before/after numbers
- Press logos ("As seen in Forbes, TechCrunch")
- Founder/team photo with real names — people buy from people
- Physical address and phone number (reduces bounce rate 14%)
- Live chat increases conversion by 20% for service businesses
- Response time promise: "We reply within 2 hours"

MOBILE CONVERSION KILLERS (70% of traffic is mobile):
- Buttons smaller than 44px — fingers can't tap accurately
- Text smaller than 16px — forces zooming = immediate exit
- Horizontal scroll — screams broken website
- Pop-ups that block entire screen on mobile = Google penalty + user rage
- Forms with too many fields — mobile users abandon at 3+ fields
- Images not loading (large file sizes) — 53% leave if page takes 3+ seconds on mobile
- Click-to-call phone number — critical for mobile users
- Tap targets too close together — accidental taps frustrate users

COPY THAT CONVERTS:
- Lead with the OUTCOME not the process. "Get 3x more leads" not "We use data-driven marketing strategies"
- Speak to the pain point first, then the solution
- Specificity builds trust: "47% of our clients see results in week 1" vs "results vary"
- Eliminate jargon — write at grade 8 reading level for maximum conversion
- Bullet points for benefits, not features. "Saves 3 hours per week" not "Advanced automation module"
- Urgency without lying: "Prices increase January 1st" or "Only 3 spots left this month"
- FAQ section: address the top 5 objections buyers have BEFORE they have to ask
- Price anchoring: show the most expensive option first
- Headline formula: [Specific Outcome] + [Timeframe] + [Objection Handle] = "Get 10 More Clients in 30 Days — Without Cold Calling"

PAGE STRUCTURE THAT GUIDES CONVERSION:
- F-pattern reading: most important info in top-left, then left column
- Above fold: hook. Middle: proof. Bottom: CTA. Every page.
- Visual hierarchy: one clear focal point per section
- Whitespace is not empty — it directs the eye to what matters
- Progress indicators on multi-step forms increase completion 36%
- Live chat widget in bottom-right corner = 24% more conversations
- Exit-intent popup with irresistible offer saves 15% of abandoning visitors
- 404 page with CTA — don't lose traffic to broken links

FORM OPTIMISATION:
- Remove every field that is not 100% necessary. Every extra field = 10% fewer completions
- Single column forms convert 25% better than multi-column
- Smart defaults: pre-fill known info, use dropdowns for common answers
- Inline validation (green tick as you type) reduces errors and anxiety
- Clear error messages: "Enter your email like: name@company.com" not "Invalid input"
- Progress bar on multi-step forms
- Social login (Google/Facebook) reduces form friction 40%

SPEED = CONVERSION:
- Every 1 second of delay = 7% fewer conversions (Amazon data)
- Target: < 2.5s LCP, < 100ms FID, < 0.1 CLS
- Mobile score below 50 = you are losing more than half your mobile revenue
- Image optimisation alone often recovers 1-2 seconds of load time
- Remove unused JavaScript and CSS — common culprits: chat widgets, tag managers, old plugins

OUTPUT: ONLY valid JSON. No markdown. No preamble. No explanation outside the JSON.`;

interface PageSpeedData {
    desktopScore: number;
    mobileScore: number;
    lcp: string;
    cls: string;
    fcp: string;
    ttfb: string;
    loadTime: string;
    pageSize: string;
    opportunities: string[];
    diagnostics: string[];
    pageTitle: string;
    metaDescription: string;
    h1Count: number;
    imageCount: number;
    hasHttps: boolean;
}

async function fetchPageSpeed(url: string): Promise<PageSpeedData> {
    const API = process.env.PAGESPEED_API_KEY || '';
    if (!API) throw new Error('PAGESPEED_API_KEY is not configured in environment variables. Please add it in Vercel settings.');

    const base = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&key=${API}`;

    const [desktopRes, mobileRes] = await Promise.all([
        fetch(`${base}&strategy=desktop`),
        fetch(`${base}&strategy=mobile`),
    ]);

    // Check for non-JSON responses (API errors, HTML error pages)
    const desktopText = await desktopRes.text();
    const mobileText = await mobileRes.text();

    let desktop: Record<string, unknown> = {};
    let mobile: Record<string, unknown> = {};

    try { desktop = JSON.parse(desktopText); } catch {
        throw new Error('PageSpeed API returned invalid response. Check your PAGESPEED_API_KEY is valid and the URL is accessible.');
    }
    try { mobile = JSON.parse(mobileText); } catch {
        throw new Error('PageSpeed API returned invalid response for mobile. Check your PAGESPEED_API_KEY is valid.');
    }

    // Check for API-level errors
    if ((desktop as Record<string, unknown>).error) {
        const errMsg = ((desktop as Record<string, {message?: string}>).error as {message?: string})?.message || 'PageSpeed API error';
        throw new Error(`PageSpeed API error: ${errMsg}`);
    }

    function getScore(d: Record<string, unknown>): number {
        return Math.round(((d?.lighthouseResult as Record<string, unknown>)?.categories as Record<string, unknown>)?.performance as unknown as number * 100) || 0;
    }

    function getMetric(d: Record<string, unknown>, id: string): string {
        const audits = ((d?.lighthouseResult as Record<string, unknown>)?.audits as Record<string, unknown>) || {};
        return (audits[id] as Record<string, unknown>)?.displayValue as string || 'N/A';
    }

    function getOpportunities(d: Record<string, unknown>): string[] {
        const audits = ((d?.lighthouseResult as Record<string, unknown>)?.audits as Record<string, unknown>) || {};
        return Object.values(audits)
            .filter((a) => (a as Record<string, unknown>).details && (a as Record<string, unknown>).score !== null && Number((a as Record<string, unknown>).score) < 0.9)
            .map((a) => (a as Record<string, unknown>).title as string)
            .filter(Boolean)
            .slice(0, 8);
    }

    // Extract page metadata from lighthouse
    const lhr = desktop?.lighthouseResult || {};
    const audits = (lhr.audits as Record<string, unknown>) || {};
    const titleAudit = (audits['document-title'] as Record<string, unknown>) || {};
    const metaAudit = (audits['meta-description'] as Record<string, unknown>) || {};
    const h1Audit = (audits['heading-order'] as Record<string, unknown>) || {};

    const pageTitle = (titleAudit.title as string) || '';
    const metaDescription = (metaAudit.description as string) || '';

    // HTTPS check
    const hasHttps = url.startsWith('https://') && Number((audits['is-on-https'] as Record<string, unknown>)?.score ?? 1) === 1;

    return {
        desktopScore: getScore(desktop),
        mobileScore: getScore(mobile),
        lcp: getMetric(mobile, 'largest-contentful-paint'),
        cls: getMetric(mobile, 'cumulative-layout-shift'),
        fcp: getMetric(mobile, 'first-contentful-paint'),
        ttfb: getMetric(mobile, 'server-response-time'),
        loadTime: getMetric(mobile, 'interactive'),
        pageSize: getMetric(mobile, 'total-byte-weight'),
        opportunities: getOpportunities(mobile),
        diagnostics: getOpportunities(desktop).slice(0, 5),
        pageTitle,
        metaDescription,
        h1Count: Number(h1Audit?.score ?? 0) === 1 ? 1 : 0,
        imageCount: 0,
        hasHttps,
    };
}

function extractJSON(text: string): string {
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('No valid JSON found');
    cleaned = cleaned.slice(start, end + 1);
    cleaned = cleaned.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    cleaned = cleaned.replace(/[\x00-\x09\x0b\x0c\x0e-\x1f]/g, '');
    try { JSON.parse(cleaned); return cleaned; } catch {
        cleaned = cleaned.replace(/\u2018|\u2019/g, "'").replace(/\u201c|\u201d/g, '\\"').replace(/\r/g, '\\r');
        try { JSON.parse(cleaned); return cleaned; } catch (e2) {
            throw new Error(`JSON parse failed: ${e2 instanceof Error ? e2.message : String(e2)}`);
        }
    }
}

async function callGemini(system: string, user: string): Promise<string> {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY || ''}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: system }] },
                contents: [{ role: 'user', parts: [{ text: user }] }],
                generationConfig: { temperature: 0.25, maxOutputTokens: 16000, responseMimeType: 'application/json' },
            }),
        }
    );
    const d = await res.json();
    if (d.error) throw new Error(`Gemini error: ${d.error.message}`);
    const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!raw) throw new Error('Empty response from Gemini');
    return extractJSON(raw);
}

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();
        if (!url) return NextResponse.json({ ok: false, error: 'Website URL required' }, { status: 400 });

        const psData = await fetchPageSpeed(url);

        const speedGrade = psData.mobileScore >= 80 ? 'good' : psData.mobileScore >= 50 ? 'needs-improvement' : 'poor';
        const auditDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const userPrompt = `You are auditing this website for conversion rate issues. Use the real data below and apply your CRO expertise to identify EXACTLY what is wrong and EXACTLY how to fix it.

=== REAL PAGESPEED DATA ===
URL: ${url}
Page Title: ${psData.pageTitle || 'Could not detect'}
Meta Description: ${psData.metaDescription || 'Missing or could not detect'}
H1 Tags: ${psData.h1Count > 0 ? 'Present' : 'Missing or could not detect'}
HTTPS: ${psData.hasHttps ? 'YES - Secure' : 'NO - Not secure (critical trust issue)'}

Desktop PageSpeed Score: ${psData.desktopScore}/100
Mobile PageSpeed Score: ${psData.mobileScore}/100 (${speedGrade})
Largest Contentful Paint (LCP): ${psData.lcp}
Cumulative Layout Shift (CLS): ${psData.cls}
First Contentful Paint (FCP): ${psData.fcp}
Time to First Byte (TTFB): ${psData.ttfb}
Time to Interactive: ${psData.loadTime}
Total Page Size: ${psData.pageSize}

PageSpeed Opportunities Flagged:
${psData.opportunities.map((o, i) => `${i + 1}. ${o}`).join('\n') || 'None detected'}

=== YOUR TASK ===
Audit this website for CRO issues. Be BRUTALLY SPECIFIC — name exact problems with exact locations, give exact fixes.

For EVERY issue you find:
- WHERE: exact location (e.g. "hero section", "pricing page", "contact form", "above the fold", "mobile view")
- WHAT: the exact problem
- WHY IT HURTS: specific conversion impact with numbers where possible
- HOW TO FIX IT: step-by-step, specific, actionable

Use the PageSpeed data as your foundation — if mobile score is ${psData.mobileScore}, that's real. If LCP is ${psData.lcp}, that's real. Build your entire audit around these real numbers.

Return ONLY this JSON (no markdown, no extra text):
{
  "url": "${url}",
  "auditDate": "${auditDate}",
  "pageTitle": "${psData.pageTitle || 'Not detected'}",
  "industry": "detect the industry/business type from the URL and page title",
  "overallScore": 55,
  "grade": "D",
  "speedScore": ${Math.round((psData.desktopScore + psData.mobileScore) / 2)},
  "trustScore": 50,
  "mobileScore": ${psData.mobileScore},
  "uxScore": 50,
  "copyScore": 50,
  "ctaScore": 50,
  "summary": "2-3 sentences: brutally honest verdict specific to this site. Name real issues using real data. E.g. 'With a mobile PageSpeed score of ${psData.mobileScore}/100 and an LCP of ${psData.lcp}, this site is losing over half its mobile visitors before they even see the offer.'",
  "conversionImpact": "Specific revenue/lead impact estimate. E.g. 'If this site gets 1,000 visitors/month at a typical 2% conversion rate, fixing the mobile speed alone (currently scoring ${psData.mobileScore}/100) could add 8-15 extra conversions per month. Add trust signals and a clear CTA and 30-50 extra leads per month is realistic.'",
  "speedMetrics": {
    "desktop": ${psData.desktopScore},
    "mobile": ${psData.mobileScore},
    "lcp": "${psData.lcp}",
    "cls": "${psData.cls}",
    "fcp": "${psData.fcp}",
    "ttfb": "${psData.ttfb}",
    "loadTime": "${psData.loadTime}",
    "pageSize": "${psData.pageSize}"
  },
  "criticalIssues": [
    {
      "title": "Most critical conversion killer — specific to this site",
      "where": "exact location on the page",
      "impact": "specific conversion impact with % or number estimate",
      "fix": "exact step-by-step fix"
    },
    {
      "title": "Second critical issue",
      "where": "exact location",
      "impact": "specific impact",
      "fix": "exact fix"
    },
    {
      "title": "Third critical issue",
      "where": "exact location",
      "impact": "specific impact",
      "fix": "exact fix"
    }
  ],
  "aboveFoldAudit": [
    {"item": "Headline Clarity", "status": "fail|warn|pass", "found": "what was actually found or detected", "problem": "exact problem — be specific about what is wrong", "fix": "exact fix"},
    {"item": "Value Proposition", "status": "fail|warn|pass", "found": "what was detected", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Primary CTA Visibility", "status": "fail|warn|pass", "found": "what was found", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Hero Image/Visual", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Navigation Clarity", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"}
  ],
  "ctaAudit": [
    {"item": "CTA Button Copy", "status": "fail|warn|pass", "found": "what was detected", "problem": "exact problem", "fix": "exact alternative copy to use"},
    {"item": "CTA Button Design", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "CTA Placement & Frequency", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Micro-copy & Anxiety Reducers", "status": "fail", "found": "assessment", "problem": "exact problem", "fix": "exact copy to add"},
    {"item": "Form Friction", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"}
  ],
  "trustAudit": [
    {"item": "Testimonials & Reviews", "status": "fail|warn|pass", "found": "what was detected", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Social Proof Numbers", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Trust Badges & Guarantees", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Contact Information Visibility", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "HTTPS & Security", "status": "${psData.hasHttps ? 'pass' : 'fail'}", "found": "${psData.hasHttps ? 'HTTPS enabled' : 'No HTTPS detected'}", "problem": "${psData.hasHttps ? 'Site is secure' : 'Site has no SSL certificate — browsers warn users this site is not secure, destroying trust instantly'}", "fix": "${psData.hasHttps ? 'Keep HTTPS active and ensure all resources load over HTTPS' : 'Install an SSL certificate immediately. Use Let Encrypt for free SSL. This is non-negotiable for trust and Google ranking.'}"}
  ],
  "mobileAudit": [
    {"item": "Mobile Speed", "status": "${psData.mobileScore >= 80 ? 'pass' : psData.mobileScore >= 50 ? 'warn' : 'fail'}", "found": "Mobile PageSpeed score: ${psData.mobileScore}/100, LCP: ${psData.lcp}", "problem": "${psData.mobileScore < 50 ? 'Mobile score of ' + psData.mobileScore + ' is critically slow. 53% of users abandon if load takes over 3 seconds. You are losing more than half your mobile visitors.' : psData.mobileScore < 80 ? 'Mobile score of ' + psData.mobileScore + ' needs improvement. Significant revenue is being lost to slow mobile experience.' : 'Mobile speed is good but can always be improved.'}", "fix": "Compress all images to WebP format under 100KB. Enable lazy loading. Remove unused JavaScript. Target LCP under 2.5s."},
    {"item": "Touch Target Sizes", "status": "warn", "found": "assessment based on site type", "problem": "exact problem with button/link sizes on mobile", "fix": "exact fix"},
    {"item": "Mobile Navigation", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Mobile Form Usability", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Mobile CTA Accessibility", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"}
  ],
  "copyAudit": [
    {"item": "Headline Formula", "status": "warn", "found": "page title detected: ${psData.pageTitle || 'not detected'}", "problem": "exact problem with the headline approach", "fix": "exact alternative headline formula with example"},
    {"item": "Benefit vs Feature Focus", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix with example rewrite"},
    {"item": "Specificity & Numbers", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Objection Handling", "status": "fail", "found": "assessment", "problem": "exact missing objections that kill conversion", "fix": "exact objections to address with copy examples"},
    {"item": "Urgency & Scarcity", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix with copy examples"}
  ],
  "uxAudit": [
    {"item": "Page Load Speed Impact", "status": "${psData.mobileScore >= 80 ? 'pass' : psData.mobileScore >= 50 ? 'warn' : 'fail'}", "found": "LCP ${psData.lcp}, CLS ${psData.cls}, Page Size ${psData.pageSize}", "problem": "exact UX impact of these speed metrics on user behaviour", "fix": "specific technical fixes based on the PageSpeed opportunities: ${psData.opportunities.slice(0, 3).join(', ')}"},
    {"item": "Visual Hierarchy", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Whitespace & Readability", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Scroll Depth & Content Flow", "status": "warn", "found": "assessment", "problem": "exact problem", "fix": "exact fix"},
    {"item": "Exit Intent Strategy", "status": "fail", "found": "likely none detected", "problem": "No exit intent popup or sticky CTA to capture abandoning visitors", "fix": "exact fix with tool recommendation"}
  ],
  "topFixes": [
    "Most impactful fix with real data reference — e.g. 'Fix mobile speed (currently ${psData.mobileScore}/100): compress images to WebP, enable lazy loading, remove unused JS. This alone can recover 20-40% of lost mobile conversions.'",
    "Second fix",
    "Third fix",
    "Fourth fix",
    "Fifth fix"
  ],
  "actionPlan": {
    "today": [
      "Specific action with exact instructions",
      "Second today action",
      "Third today action"
    ],
    "thisWeek": [
      "Specific week action",
      "Second week action",
      "Third week action"
    ],
    "thisMonth": [
      "Specific month action",
      "Second month action",
      "Third month action"
    ]
  },
  "passed": [
    {"item": "something actually good about this site", "why": "specific reason this is working well for conversion"}
  ]
}`;

        const raw = await callGemini(CRO_SYSTEM, userPrompt);
        const parsed = JSON.parse(raw);

        // Hard overrides with real PageSpeed data
        parsed.speedMetrics = {
            desktop: psData.desktopScore,
            mobile: psData.mobileScore,
            lcp: psData.lcp,
            cls: psData.cls,
            fcp: psData.fcp,
            ttfb: psData.ttfb,
            loadTime: psData.loadTime,
            pageSize: psData.pageSize,
        };
        parsed.speedScore = Math.round((psData.desktopScore + psData.mobileScore) / 2);
        parsed.mobileScore = psData.mobileScore;
        parsed.url = url;
        parsed.auditDate = auditDate;

        // Recalculate overall score
        parsed.overallScore = Math.round(
            (parsed.speedScore + parsed.trustScore + parsed.mobileScore + parsed.uxScore + parsed.copyScore + parsed.ctaScore) / 6
        );
        const s = parsed.overallScore;
        parsed.grade = s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : s >= 60 ? 'D' : 'F';

        return NextResponse.json({ ok: true, data: parsed });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('CRO Audit error:', msg);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}