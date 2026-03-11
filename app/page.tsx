'use client';
import { useState } from 'react';

type CROData = {
  url: string;
  auditDate: string;
  pageTitle: string;
  industry: string;
  overallScore: number;
  grade: string;
  speedScore: number;
  trustScore: number;
  mobileScore: number;
  uxScore: number;
  copyScore: number;
  ctaScore: number;
  summary: string;
  conversionImpact: string;
  speedMetrics: {
    desktop: number;
    mobile: number;
    lcp: string;
    cls: string;
    fcp: string;
    ttfb: string;
    loadTime: string;
    pageSize: string;
  };
  criticalIssues: {
    title: string;
    where: string;
    impact: string;
    fix: string;
  }[];
  aboveFoldAudit: {
    item: string;
    status: string;
    found: string;
    problem: string;
    fix: string;
  }[];
  ctaAudit: {
    item: string;
    status: string;
    found: string;
    problem: string;
    fix: string;
  }[];
  trustAudit: {
    item: string;
    status: string;
    found: string;
    problem: string;
    fix: string;
  }[];
  mobileAudit: {
    item: string;
    status: string;
    found: string;
    problem: string;
    fix: string;
  }[];
  copyAudit: {
    item: string;
    status: string;
    found: string;
    problem: string;
    fix: string;
  }[];
  uxAudit: {
    item: string;
    status: string;
    found: string;
    problem: string;
    fix: string;
  }[];
  topFixes: string[];
  actionPlan: {
    today: string[];
    thisWeek: string[];
    thisMonth: string[];
  };
  passed: { item: string; why: string }[];
};

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CROData | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const loadingSteps = [
    'Fetching desktop PageSpeed score...',
    'Fetching mobile PageSpeed score...',
    'Analysing Core Web Vitals...',
    'Running AI conversion audit...',
    'Generating action plan...',
  ];

  async function fetchPS(targetUrl: string, strategy: 'desktop' | 'mobile') {
    const key = process.env.NEXT_PUBLIC_PAGESPEED_API_KEY || '';
    const res = await fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=${strategy}&category=performance&key=${key}`
    );
    if (!res.ok) throw new Error(`PageSpeed ${strategy} request failed (${res.status})`);
    const d = await res.json();
    if (d.error) throw new Error(`PageSpeed error: ${d.error.message}`);
    return d;
  }

  function psScore(d: Record<string, unknown>): number {
    const cats = ((d?.lighthouseResult as Record<string, unknown>)?.categories as Record<string, unknown>);
    return Math.round(((cats?.performance as Record<string, unknown>)?.score as number || 0) * 100);
  }
  function psMetric(d: Record<string, unknown>, id: string): string {
    const audits = ((d?.lighthouseResult as Record<string, unknown>)?.audits as Record<string, unknown>) || {};
    return (audits[id] as Record<string, unknown>)?.displayValue as string || 'N/A';
  }
  function psOpps(d: Record<string, unknown>): string[] {
    const audits = ((d?.lighthouseResult as Record<string, unknown>)?.audits as Record<string, unknown>) || {};
    return Object.values(audits)
        .filter((a) => (a as Record<string, unknown>).details && Number((a as Record<string, unknown>).score ?? 1) < 0.9)
        .map((a) => (a as Record<string, unknown>).title as string)
        .filter(Boolean).slice(0, 6);
  }

  async function runAudit() {
    if (!url) { setError('Please enter a website URL.'); return; }
    let clean = url.trim();
    if (!clean.startsWith('http')) clean = 'https://' + clean;
    setLoading(true); setError(''); setResult(null); setLoadingStep(0);
    try {
      // PageSpeed runs IN THE BROWSER — bypasses Vercel timeout completely
      setLoadingStep(0);
      const [desktop, mobile] = await Promise.all([
        fetchPS(clean, 'desktop'),
        fetchPS(clean, 'mobile'),
      ]);
      setLoadingStep(2);

      const lhr = ((desktop?.lighthouseResult || {}) as Record<string, unknown>);
      const audits = (lhr.audits as Record<string, unknown>) || {};
      const pageTitle = ((audits['document-title'] as Record<string, unknown>)?.title as string) || '';
      const hasHttps = clean.startsWith('https://');

      const psData = {
        desktopScore: psScore(desktop),
        mobileScore:  psScore(mobile),
        lcp:          psMetric(mobile, 'largest-contentful-paint'),
        cls:          psMetric(mobile, 'cumulative-layout-shift'),
        fcp:          psMetric(mobile, 'first-contentful-paint'),
        ttfb:         psMetric(mobile, 'server-response-time'),
        loadTime:     psMetric(mobile, 'interactive'),
        pageSize:     psMetric(mobile, 'total-byte-weight'),
        desktopLcp:   psMetric(desktop, 'largest-contentful-paint'),
        desktopCls:   psMetric(desktop, 'cumulative-layout-shift'),
        opportunities: psOpps(mobile),
        pageTitle,
        hasHttps,
      };

      // Step 2: Scrape real HTML from browser — no Vercel timeout
      setLoadingStep(2);
      let siteData = {};
      try {
        const scrapeRes = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: clean }),
        });
        const scrapeJson = await scrapeRes.json();
        if (scrapeJson.ok) siteData = scrapeJson.data;
      } catch (e) {
        console.warn('Scrape failed, continuing:', e);
      }

      // Step 3: Gemini runs IN THE BROWSER — zero Vercel timeout
      setLoadingStep(3);
      const auditDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      const GEMINI_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
      if (!GEMINI_KEY) throw new Error('GEMINI API key not configured. Add NEXT_PUBLIC_GEMINI_API_KEY to Vercel env vars.');

      const s = siteData as {
        title?: string; metaDesc?: string; h1s?: string[]; h2s?: string[];
        h3s?: string[]; ctaButtons?: string[]; ctaLinks?: string[]; navItems?: string[];
        phones?: string[]; emails?: string[];
        forms?: { count: number; inputs: number };
        trust?: {
          hasPrices?: boolean; hasTestimonials?: boolean; hasNamedTestimonials?: boolean;
          reviewCount?: string; hasCertification?: boolean; hasWhatsapp?: boolean;
          hasLiveChat?: boolean; hasVideo?: boolean; hasGallery?: boolean;
          hasFaq?: boolean; social?: Record<string, boolean>;
        };
        images?: { total: number; withAlt: number };
        hasSchema?: boolean; visibleText?: string;
        isJSRendered?: boolean;
      };

      // ── ISSUE #1 FIX: Dedup all scraped arrays before sending to Gemini ──
      const dedupArr = (arr: string[] | undefined) => [...new Set((arr || []).map(v => v.trim()).filter(Boolean))];
      const cleanCtaButtons = dedupArr(s.ctaButtons);
      const cleanCtaLinks   = dedupArr(s.ctaLinks);
      const cleanNavItems   = dedupArr(s.navItems);
      const cleanPhones     = dedupArr(s.phones);
      const cleanEmails     = dedupArr(s.emails);
      const allCTAs = [...new Set([...cleanCtaButtons, ...cleanCtaLinks])].join(', ') || 'None detected';

      // ── ISSUE #7 FIX: Validate social media — only include platforms actually linked ──
      const rawSocial = s.trust?.social || {};
      // twitter/x.com can be a false positive from embed scripts — only count if found alongside other signals
      const socialList = Object.entries(rawSocial)
          .filter(([k, v]) => v && !(k === 'twitter' && !rawSocial.facebook && !rawSocial.linkedin))
          .map(([k]) => k).join(', ') || 'None';

      // ── ISSUE #2 FIX: Force Content Flow found field to use real H2s ──
      const realH2s = dedupArr(s.h2s);
      const contentFlowData = realH2s.length > 0
          ? `Page sections (H2s): ${realH2s.slice(0, 8).join(' → ')}`
          : 'No H2 sections detected';

      const avgSpeed = Math.round((psData.desktopScore + psData.mobileScore) / 2);
      const httpsStatus   = psData.hasHttps ? 'pass' : 'fail';
      const httpsFound    = psData.hasHttps ? 'HTTPS enabled - Secure' : 'No HTTPS detected';
      const httpsProblem  = psData.hasHttps ? 'Site is secure' : 'No SSL certificate — browsers show a scary warning, destroying trust instantly';
      const httpsFix      = psData.hasHttps ? 'Maintain HTTPS on all resources including images and scripts to ensure continued security and trust.' : 'Install SSL immediately via your host or Cloudflare free SSL — non-negotiable';
      const mobileStatus  = psData.mobileScore >= 80 ? 'pass' : psData.mobileScore >= 50 ? 'warn' : 'fail';
      const mobileProblem = psData.mobileScore < 50
          ? `Critical: mobile score ${psData.mobileScore}/100 means 53% of mobile visitors abandon before page loads`
          : psData.mobileScore < 80
              ? `Mobile score ${psData.mobileScore}/100 is below the 80 target — losing significant mobile revenue`
              : 'Mobile speed is good';
      const speedUxStatus = psData.mobileScore >= 80 ? 'pass' : psData.mobileScore >= 50 ? 'warn' : 'fail';
      const speedFix = (psData.opportunities || [])[0] || 'Compress images to WebP, remove render-blocking JS';

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

      const userPrompt = `You are auditing this SPECIFIC website. Use ALL the real data scraped below — do NOT guess or use generic assumptions.

URL: ${clean}

=== REAL PAGE DATA (scraped live) ===
Page Title: ${s.title || 'Not detected'}
Meta Description: ${s.metaDesc || 'None'}
H1 Headlines: ${dedupArr(s.h1s).join(' | ') || 'None detected'}
H2 Headlines: ${realH2s.join(' | ') || 'None detected'}
H3 Headlines: ${dedupArr(s.h3s).join(' | ') || 'None detected'}
Navigation Items: ${cleanNavItems.join(', ') || 'None detected'}
CTA Buttons found: ${cleanCtaButtons.join(', ') || 'None detected'}
CTA Links found: ${cleanCtaLinks.join(', ') || 'None detected'}
ALL CTAs combined: ${allCTAs}
Phone Numbers: ${cleanPhones.join(', ') || 'None'}
Email Addresses: ${cleanEmails.join(', ') || 'None'}
Forms on page: ${s.forms?.count || 0} forms, ${s.forms?.inputs || 0} input fields
Prices shown: ${s.trust?.hasPrices ? 'YES' : 'NO'}
Testimonials present: ${s.trust?.hasTestimonials ? 'YES' : 'NO'} | Named testimonials confirmed: ${s.trust?.hasNamedTestimonials ? 'YES - mark Testimonials as WARN (present but needs improvement), not FAIL' : 'NO'}
Review count mentioned: ${s.trust?.reviewCount || 'None'}
Certification/Awards: ${s.trust?.hasCertification ? 'YES' : 'NO'}
WhatsApp button: ${s.trust?.hasWhatsapp ? 'YES' : 'NO'}
Live Chat: ${s.trust?.hasLiveChat ? 'YES' : 'NO'}
Video on page: ${s.trust?.hasVideo ? 'YES' : 'NO'}
Gallery present: ${s.trust?.hasGallery ? 'YES' : 'NO'}
FAQ section: ${s.trust?.hasFaq ? 'YES' : 'NO'}
Social media: ${socialList}
Images: ${s.images?.total || 0} total, ${s.images?.withAlt || 0} with alt text
Schema markup: ${s.hasSchema ? 'YES' : 'NO'}
Page content flow: ${contentFlowData}
Above-fold visible text: ${s.visibleText?.slice(0, 500) || 'Not extracted'}

=== PAGESPEED DATA (real from Google API) ===
HTTPS: ${psData.hasHttps ? 'YES - Secure' : 'NO - Critical trust issue'}
Desktop PageSpeed: ${psData.desktopScore}/100
Mobile PageSpeed: ${psData.mobileScore}/100
Mobile LCP: ${psData.lcp} | CLS: ${psData.cls} | FCP: ${psData.fcp}
Desktop LCP: ${psData.desktopLcp} | Desktop CLS: ${psData.desktopCls}
Load Time: ${psData.loadTime} | Page Size: ${psData.pageSize}
PageSpeed issues: ${(psData.opportunities || []).slice(0, 4).join('; ')}

CRITICAL RULES:
- Base EVERY finding on the real scraped data above
- If H1 is "The Home Of Care" — say that exact text, don't invent a different headline
- If testimonials ARE present — mark as pass or warn, NOT fail
- If phone numbers ARE present — mark Contact Info as pass
- If CTAs ARE present — describe the actual CTA copy found, do not say "no CTAs detected"
- ONLY flag something as missing if the scraped data confirms it is absent
- Industry must be detected from the actual title, H1s and content — not guessed from domain name
- For Content Flow found field: use the real H2 page sections provided above
- Navigation found field: list the actual nav items provided above

Return ONLY valid JSON:
{"url":"${clean}","auditDate":"${auditDate}","pageTitle":"${psData.pageTitle || s.title || 'Unknown'}","industry":"detect from URL, title and content","overallScore":50,"grade":"F","speedScore":${avgSpeed},"trustScore":45,"mobileScore":${psData.mobileScore},"uxScore":45,"copyScore":45,"ctaScore":40,"summary":"2-3 brutally specific sentences using real numbers desktop:${psData.desktopScore} mobile:${psData.mobileScore} LCP:${psData.lcp}","conversionImpact":"specific estimate","speedMetrics":{"desktop":${psData.desktopScore},"mobile":${psData.mobileScore},"lcp":"${psData.lcp}","cls":"${psData.cls}","fcp":"${psData.fcp}","ttfb":"${psData.ttfb}","loadTime":"${psData.loadTime}","pageSize":"${psData.pageSize}","desktopLcp":"${psData.desktopLcp}","desktopCls":"${psData.desktopCls}"},"criticalIssues":[{"title":"most critical conversion killer","where":"exact location","impact":"specific % impact","fix":"exact fix"},{"title":"second issue","where":"exact location","impact":"specific impact","fix":"exact fix"},{"title":"third issue","where":"exact location","impact":"specific impact","fix":"exact fix"}],"aboveFoldAudit":[{"item":"Headline Clarity","status":"fail","found":"real H1 text from scraped data","problem":"specific problem","fix":"specific rewrite example"},{"item":"Value Proposition","status":"warn","found":"what detected","problem":"specific problem","fix":"specific fix"},{"item":"Primary CTA","status":"fail","found":"exact CTAs found: ${allCTAs}","problem":"specific problem","fix":"exact copy and placement fix"},{"item":"Hero Visual","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Navigation","status":"warn","found":"Navigation Items: ${cleanNavItems.slice(0,8).join(', ')}","problem":"specific problem","fix":"specific fix"}],"ctaAudit":[{"item":"CTA Copy","status":"fail","found":"exact CTA text: ${allCTAs}","problem":"specific problem","fix":"exact copy to use instead"},{"item":"CTA Design","status":"warn","found":"assessment based on typical patterns for this industry","problem":"specific problem","fix":"specific fix"},{"item":"CTA Placement","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Anxiety Reducers","status":"fail","found":"none detected","problem":"no friction-reducing microcopy below CTA","fix":"add: No credit card required / Free consultation / Cancel anytime"},{"item":"Form Fields","status":"warn","found":"${s.forms?.count || 0} forms, ${s.forms?.inputs || 0} input fields","problem":"specific problem","fix":"specific fix"}],"trustAudit":[{"item":"Testimonials","status":"fail","found":"what detected","problem":"specific problem","fix":"specific fix"},{"item":"Social Proof","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Trust Badges","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Contact Info","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"HTTPS","status":"${httpsStatus}","found":"${httpsFound}","problem":"${httpsProblem}","fix":"${httpsFix}"}],"mobileAudit":[{"item":"Mobile Speed","status":"${mobileStatus}","found":"Mobile: ${psData.mobileScore}/100 Desktop: ${psData.desktopScore}/100 LCP: ${psData.lcp}","problem":"${mobileProblem}","fix":"Compress all images to WebP under 100KB, enable lazy loading, remove unused JavaScript. Target LCP under 2.5s"},{"item":"Touch Targets","status":"warn","found":"assessment","problem":"specific problem on this type of site","fix":"minimum 44px height on all buttons and links"},{"item":"Mobile Navigation","status":"warn","found":"Navigation: ${cleanNavItems.slice(0,6).join(', ')}","problem":"specific problem","fix":"specific fix"},{"item":"Mobile Forms","status":"warn","found":"${s.forms?.count || 0} forms","problem":"specific problem","fix":"specific fix"},{"item":"Mobile CTA","status":"warn","found":"CTAs: ${allCTAs}","problem":"specific problem","fix":"specific fix"}],"copyAudit":[{"item":"Headline","status":"warn","found":"${dedupArr(s.h1s)[0] || psData.pageTitle || 'not detected'}","problem":"specific headline problem for this site","fix":"rewrite: [Outcome] + [Timeframe] + [Objection Handle] with example"},{"item":"Benefits vs Features","status":"warn","found":"assessment using real H2/H3 content","problem":"specific problem","fix":"before/after rewrite example"},{"item":"Specificity","status":"warn","found":"assessment","problem":"vague claims without proof numbers","fix":"specific numbers to add"},{"item":"Objections","status":"fail","found":"FAQ: ${s.trust?.hasFaq ? 'YES' : 'NO'}","problem":"top buyer objections not addressed on page","fix":"top 5 FAQs for this exact industry"},{"item":"Urgency","status":"warn","found":"none detected","problem":"no urgency triggers — visitors have no reason to act now","fix":"honest urgency copy examples for this business type"}],"uxAudit":[{"item":"Speed UX Impact","status":"${speedUxStatus}","found":"Mobile LCP: ${psData.lcp} CLS: ${psData.cls} Size: ${psData.pageSize}","problem":"specific user behaviour impact of these exact metrics","fix":"${speedFix}"},{"item":"Visual Hierarchy","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Readability","status":"warn","found":"assessment","problem":"specific problem","fix":"specific fix"},{"item":"Content Flow","status":"warn","found":"${contentFlowData}","problem":"specific problem with the page structure flow","fix":"restructure using F-pattern: hook → proof → CTA"},{"item":"Exit Intent","status":"fail","found":"none detected","problem":"zero exit intent strategy — 100% of abandoning visitors are lost","fix":"add exit popup with lead magnet using Hotjar or OptinMonster — saves 15% of abandoning visitors"}],"topFixes":["Fix 1 specific to this site","Fix 2 specific to this site","Fix 3 specific to this site","Fix 4 specific to this site","Fix 5 specific to this site"],"actionPlan":{"today":["specific action 1","specific action 2","specific action 3"],"thisWeek":["specific action 1","specific action 2","specific action 3"],"thisMonth":["specific action 1","specific action 2","specific action 3"]},"passed":[{"item":"something genuinely good","why":"specific reason this helps conversion"}]}`;

      // Call Gemini directly from browser — zero Vercel timeout risk
      let parsed: CROData | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: CRO_SYSTEM }] },
                  contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                  generationConfig: { temperature: 0.2, maxOutputTokens: 8000 },
                }),
              }
          );
          const geminiData = await geminiRes.json();
          if (geminiData.error) {
            const msg = geminiData.error.message || '';
            if ((msg.toLowerCase().includes('overloaded') || msg.toLowerCase().includes('high demand')) && attempt < 3) {
              await new Promise(r => setTimeout(r, 3000 * attempt));
              continue;
            }
            throw new Error('Gemini error: ' + msg);
          }
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (!rawText) throw new Error('Empty Gemini response');
          let jsonCleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
          const jStart = jsonCleaned.indexOf('{');
          const jEnd = jsonCleaned.lastIndexOf('}');
          if (jStart === -1 || jEnd === -1) throw new Error('No JSON in Gemini response');
          jsonCleaned = jsonCleaned.slice(jStart, jEnd + 1).replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
          parsed = JSON.parse(jsonCleaned) as CROData;
          break;
        } catch (e) {
          if (attempt === 3) throw e;
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
      if (!parsed) throw new Error('Gemini failed after all retries');

      // ── FIX 1: Hard override ALL speed metrics with real PageSpeed data ────────
      parsed.speedMetrics = {
        desktop: psData.desktopScore, mobile: psData.mobileScore,
        lcp: psData.lcp, cls: psData.cls, fcp: psData.fcp,
        ttfb: psData.ttfb, loadTime: psData.loadTime, pageSize: psData.pageSize,
      };
      parsed.speedScore = Math.round((psData.desktopScore + psData.mobileScore) / 2);
      parsed.mobileScore = psData.mobileScore;
      parsed.url = clean;
      parsed.auditDate = auditDate;
      parsed.overallScore = Math.round(
          (parsed.speedScore + (parsed.trustScore||45) + parsed.mobileScore + (parsed.uxScore||45) + (parsed.copyScore||45) + (parsed.ctaScore||40)) / 6
      );
      const sc2 = parsed.overallScore;
      parsed.grade = sc2 >= 90 ? 'A' : sc2 >= 80 ? 'B' : sc2 >= 70 ? 'C' : sc2 >= 60 ? 'D' : 'F';

      // ── FIX 2: Testimonials — named testimonials confirmed → force WARN not FAIL ─
      if (s.trust?.hasNamedTestimonials) {
        const tItem = (parsed.trustAudit as {item:string;status:string;found:string;problem:string;fix:string}[])
            ?.find(i => i.item === 'Testimonials');
        if (tItem && tItem.status === 'fail') {
          tItem.status = 'warn';
          tItem.found = 'Named testimonials with photos confirmed — check placement';
          tItem.problem = 'Real client testimonials exist but may not be visible above the fold. Most visitors never scroll far enough to see them.';
          tItem.fix = 'Move 2-3 of your strongest named testimonials with photos into the hero section or immediately below the value proposition. Placement above the fold increases trust signal impact by 34%.';
        }
      }

      // ── FIX 3: conversionImpact — always compute locally, never trust Gemini ───
      {
        const mScore = psData.mobileScore;
        const abandonment = mScore < 50 ? '53%' : mScore < 70 ? '35%' : '15%';
        const recoverable = mScore < 50 ? '25-40%' : mScore < 70 ? '15-25%' : '10-15%';
        const lcpNum = parseFloat(psData.lcp);
        const lcpBad = !isNaN(lcpNum) && lcpNum > 3;
        parsed.conversionImpact = `Your mobile speed is ${mScore >= 80 ? 'good' : mScore >= 50 ? 'below average' : 'critically slow'} at ${mScore}/100 (desktop: ${psData.desktopScore}/100)${lcpBad ? `, causing approximately ${abandonment} of mobile visitors to abandon before the page loads` : ''}. Fixing Core Web Vitals to reach 80+ could recover ${recoverable} of that lost traffic. At 1,000 visitors/month with a 2% baseline conversion rate, that's an estimated 5-12 additional leads or bookings per month - without increasing ad spend.`;
      }

      // ── FIX 4: Contact Info — rebuild from real scraped data only ────────────
      {
        const contactItem = (parsed.trustAudit as {item:string;status:string;found:string}[])
            ?.find(i => i.item === 'Contact Info');
        if (contactItem) {
          const ph = cleanPhones.length > 0 ? cleanPhones.join(', ') : 'None detected';
          const em = cleanEmails.length > 0 ? cleanEmails.join(', ') : 'None detected';
          const wa = s.trust?.hasWhatsapp ? 'YES' : 'NO';
          const lc = s.trust?.hasLiveChat ? 'YES' : 'NO';
          contactItem.found = `Phone: ${ph} | Email: ${em} | WhatsApp: ${wa} | Live Chat: ${lc}`;
          const hasContact = cleanPhones.length > 0 || cleanEmails.length > 0 || s.trust?.hasWhatsapp;
          contactItem.status = hasContact ? 'pass' : 'fail';
        }
      }

      // ── FIX 5: Primary CTA + Mobile CTA — if real CTAs found, never hard FAIL ─
      {
        const hasBookingCTA = [...cleanCtaButtons, ...cleanCtaLinks]
            .some(c => /appoint|book|call|whatsapp|reserv|contact|get|start|view|learn|explore/i.test(c));
        if (hasBookingCTA) {
          const aboveFold = (parsed.aboveFoldAudit as {item:string;status:string}[])
              ?.find(i => i.item === 'Primary CTA');
          if (aboveFold && aboveFold.status === 'fail') aboveFold.status = 'warn';
          const mobileCta = (parsed.mobileAudit as {item:string;status:string}[])
              ?.find(i => i.item === 'Mobile CTA');
          if (mobileCta && mobileCta.status === 'fail') mobileCta.status = 'warn';
        }
      }

      // ── FIX 6 (Issue #2): Content Flow — force real H2s into found field ──────
      {
        const cfItem = (parsed.uxAudit as {item:string;found:string}[])
            ?.find(i => i.item === 'Content Flow');
        if (cfItem && realH2s.length > 0) {
          cfItem.found = contentFlowData;
        }
      }

      // ── FIX 7 (Issue #3): reviewCount — strip if no digits before keyword ─────
      // Already fixed in scraper, but double-check: if reviewCount looks like ", client" clear it
      // (handled in scrape-route.ts — this is a safety net)

      // ── FIX 8 (Issue #9): JS-rendered/SPA detection — add notice to summary ───
      {
        if (s.isJSRendered) {
          parsed.summary = `⚠️ Note: This site uses JavaScript rendering — content audit is based on limited static HTML. Speed metrics are accurate. ` + (parsed.summary || '');
        }
      }

      setLoadingStep(4);
      setResult(parsed);
      setActiveTab('overview');

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Audit failed. Check the URL and try again.');
    }
    setLoading(false);
  }

  const scoreColor = (s: number) => s >= 80 ? '#10b981' : s >= 60 ? '#f59e0b' : '#ef4444';
  const statusColor = (s: string) => (s === 'pass' || s === 'good') ? '#10b981' : (s === 'warn') ? '#f59e0b' : '#ef4444';
  const badge = (s: string) => {
    if (s === 'pass' || s === 'good') return { label: 'PASS', bg: 'rgba(16,185,129,0.12)', color: '#10b981', border: 'rgba(16,185,129,0.25)' };
    if (s === 'warn') return { label: 'WARN', bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: 'rgba(245,158,11,0.25)' };
    return { label: 'FAIL', bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.25)' };
  };

  async function downloadReport() {
    if (!result) return;
    const r = result;
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210, H = 297, M = 14, CW = 182;
    let y = 0;

    function clean(t: string): string {
      return (t || '')
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/[^\x00-\x7F]/g, (c) => {
            const safe: Record<string, string> = { '\u2019': "'", '\u2018': "'", '\u201c': '"', '\u201d': '"', '\u2013': '-', '\u2014': '-', '\u2026': '...' };
            return safe[c] || '';
          });
    }
    function np() { doc.addPage(); y = M; }
    function cy(n: number) { if (y + n > H - 20) npWithHeader(); }
    function wrap(t: string, w: number, fs: number): string[] { doc.setFontSize(fs); return doc.splitTextToSize(clean(t), w); }
    function sc(s: number): [number, number, number] { return s >= 80 ? [16, 185, 129] : s >= 60 ? [245, 158, 11] : [239, 68, 68]; }
    function stc(s: string): [number, number, number] { return (s === 'pass' || s === 'good') ? [16, 185, 129] : s === 'warn' ? [245, 158, 11] : [239, 68, 68]; }

    // ── COVER PAGE ──
    doc.setFillColor(8, 12, 28);
    doc.rect(0, 0, W, H, 'F');
    // Orange top bar
    doc.setFillColor(249, 115, 22);
    doc.rect(0, 0, W, 3, 'F');
    // Diagonal accent
    doc.setFillColor(15, 20, 45);
    doc.rect(0, 0, W, 72, 'F');
    doc.setFillColor(249, 115, 22);
    doc.rect(0, 0, 4, 72, 'F');

    // Icon
    doc.setFillColor(249, 115, 22);
    doc.roundedRect(M, 16, 18, 18, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('CRO', M + 9, 27, { align: 'center' });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(19); doc.setFont('helvetica', 'bold');
    doc.text('Website CRO Audit', M + 24, 24);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 190, 220);
    doc.text('Conversion Rate Optimisation Report', M + 24, 32);
    doc.setFontSize(8);
    doc.text(clean(r.url), M + 8, 50);
    doc.text(clean(r.auditDate), M + 8, 59);
    if (r.industry) doc.text('Industry: ' + clean(r.industry), M + 8, 68);

    // Grade + score
    doc.setFillColor(8, 12, 28);
    doc.roundedRect(W - 52, 12, 38, 50, 4, 4, 'F');
    doc.setFillColor(249, 115, 22);
    doc.rect(W - 52, 12, 3, 50, 'F');
    doc.setTextColor(...sc(r.overallScore));
    doc.setFontSize(28); doc.setFont('helvetica', 'bold');
    doc.text(r.grade, W - 33, 38, { align: 'center' });
    doc.setFontSize(9); doc.setTextColor(180, 190, 220);
    doc.text(`${r.overallScore}/100`, W - 33, 50, { align: 'center' });
    doc.setFontSize(7); doc.setTextColor(100, 110, 140);
    doc.text('CRO GRADE', W - 33, 58, { align: 'center' });

    // Score grid
    const cats = [
      { l: 'Speed', v: r.speedScore }, { l: 'Trust', v: r.trustScore },
      { l: 'Mobile', v: r.mobileScore }, { l: 'UX', v: r.uxScore },
    ];
    let sx = M;
    cats.forEach(c => {
      doc.setFillColor(15, 20, 45);
      doc.roundedRect(sx, 84, 42, 24, 3, 3, 'F');
      doc.setFillColor(...sc(c.v)); doc.rect(sx, 84, 3, 24, 'F');
      doc.setTextColor(...sc(c.v));
      doc.setFontSize(15); doc.setFont('helvetica', 'bold');
      doc.text(String(c.v), sx + 22, 96, { align: 'center' });
      doc.setFontSize(6.5); doc.setTextColor(100, 110, 140);
      doc.text(c.l.toUpperCase(), sx + 22, 103, { align: 'center' });
      sx += 47;
    });

    // Conversion impact box
    const ciLines = wrap(r.conversionImpact || '', CW - 14, 8).slice(0, 6);
    const ciH = Math.max(36, 14 + ciLines.length * 5.5);
    doc.setFillColor(20, 12, 5);
    doc.roundedRect(M, 118, CW, ciH, 4, 4, 'F');
    doc.setFillColor(249, 115, 22); doc.rect(M, 118, 3, ciH, 'F');
    doc.setTextColor(249, 115, 22); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text('CONVERSION IMPACT', M + 8, 127);
    doc.setTextColor(220, 220, 230); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    ciLines.forEach((l: string, i: number) => doc.text(l, M + 8, 135 + i * 5.5));

    // Summary box
    const sumStart = 118 + ciH + 8;
    const sumLines = wrap(r.summary || '', CW - 14, 8).slice(0, 6);
    const sumH = Math.max(36, 14 + sumLines.length * 5.5);
    doc.setFillColor(12, 16, 35);
    doc.roundedRect(M, sumStart, CW, sumH, 4, 4, 'F');
    doc.setTextColor(100, 110, 140); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text('AUDIT SUMMARY', M + 8, sumStart + 9);
    doc.setTextColor(200, 205, 220); doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    sumLines.forEach((l: string, i: number) => doc.text(l, M + 8, sumStart + 17 + i * 5.5));

    function addFooter(p: number, t: number) {
      doc.setPage(p);
      doc.setFillColor(249, 115, 22); doc.rect(0, H - 8, W, 8, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(7);
      doc.text('Website CRO Audit Pro', M, H - 3);
      doc.text(`Page ${p} of ${t}`, W / 2, H - 3, { align: 'center' });
      doc.text(clean(r.url), W - M, H - 3, { align: 'right' });
    }

    // ── currentSection tracks active section for continuation headers ──
    let currentSection = '';

    function drawPageHeader(title: string) {
      doc.setFillColor(249, 115, 22); doc.rect(0, 0, W, 13, 'F');
      doc.setTextColor(255, 255, 255); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(title, M, 9.5);
      y = 20;
    }

    function npWithHeader() {
      doc.addPage(); y = M;
      if (currentSection) drawPageHeader(currentSection + ' (continued)');
    }

    function sectionHeader(title: string) {
      currentSection = title;
      const remaining = H - 20 - y;
      if (y <= 20 || remaining < 80) {
        doc.addPage(); y = M;
        drawPageHeader(title);
      } else {
        y += 6;
        if (y + 12 > H - 20) { doc.addPage(); y = M; drawPageHeader(title); return; }
        doc.setFillColor(15, 20, 45); doc.roundedRect(M, y, CW, 8, 1, 1, 'F');
        doc.setFillColor(249, 115, 22); doc.rect(M, y, 3, 8, 'F');
        doc.setTextColor(249, 115, 22); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
        doc.text(title, M + 7, y + 5.8);
        y += 12;
      }
    }

    // ── CRITICAL ISSUES + TOP FIXES ──
    currentSection = 'CRITICAL CONVERSION KILLERS';
    doc.addPage(); y = M;
    drawPageHeader('CRITICAL CONVERSION KILLERS');

    r.criticalIssues?.forEach((issue, idx) => {
      const whereL = wrap('WHERE: ' + (issue.where || ''), CW - 16, 7.5);
      const impL = wrap('IMPACT: ' + (issue.impact || ''), CW - 16, 7.5);
      const fixL = wrap(issue.fix || '', CW - 16, 8);
      const bh = Math.max(32, 10 + whereL.length * 5 + impL.length * 5 + fixL.length * 5 + 6);
      cy(bh + 4);
      doc.setFillColor(18, 10, 5); doc.roundedRect(M, y, CW, bh, 2, 2, 'F');
      doc.setFillColor(249, 115, 22); doc.rect(M, y, 3, bh, 'F');
      doc.setTextColor(249, 150, 80); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text(clean(`${idx + 1}. ${issue.title}`), M + 7, y + 8);
      let iy = y + 14;
      doc.setTextColor(180, 130, 80); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      whereL.forEach((l: string, i: number) => { doc.text(l, M + 7, iy + i * 5); });
      iy += whereL.length * 5;
      doc.setTextColor(239, 68, 68);
      impL.forEach((l: string, i: number) => { doc.text(l, M + 7, iy + i * 5); });
      iy += impL.length * 5 + 2;
      doc.setTextColor(16, 185, 129);
      fixL.forEach((l: string, i: number) => doc.text('> ' + l, M + 7, iy + i * 5));
      y += bh + 4;
    });

    // Top fixes header
    cy(14);
    doc.setFillColor(249, 115, 22); doc.roundedRect(M, y, CW, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('TOP PRIORITY FIXES', M + 4, y + 6.5); y += 13;

    r.topFixes?.forEach((fix, i) => {
      const lines = wrap(fix, CW - 18, 8);
      const bh = Math.max(14, 8 + lines.length * 5);
      cy(bh + 3);
      doc.setFillColor(12, 16, 35); doc.roundedRect(M, y, CW, bh, 2, 2, 'F');
      doc.setFillColor(249, 115, 22); doc.circle(M + 6.5, y + bh / 2, 3.5, 'F');
      doc.setTextColor(8, 12, 28); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text(String(i + 1), M + 6.5, y + bh / 2 + 2.5, { align: 'center' });
      doc.setTextColor(200, 205, 220); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
      lines.forEach((l: string, li: number) => doc.text(l, M + 14, y + 7 + li * 5));
      y += bh + 3;
    });

    // ── FULL CONVERSION AUDIT — smart section packing ──
    currentSection = 'FULL CONVERSION AUDIT';
    doc.addPage(); y = M;
    drawPageHeader('FULL CONVERSION AUDIT');

    const allSections = [
      { title: 'ABOVE THE FOLD', items: r.aboveFoldAudit },
      { title: 'CALL TO ACTION', items: r.ctaAudit },
      { title: 'TRUST & CREDIBILITY', items: r.trustAudit },
      { title: 'MOBILE EXPERIENCE', items: r.mobileAudit },
      { title: 'COPY & MESSAGING', items: r.copyAudit },
      { title: 'UX & PAGE STRUCTURE', items: r.uxAudit },
    ];

    allSections.forEach(section => {
      if (!section.items?.length) return;
      sectionHeader(section.title);

      section.items.forEach(item => {
        const col = stc(item.status);
        const foundL = item.found ? wrap('Found: ' + item.found, CW - 8, 7.5) : [];
        const probL = item.problem ? wrap(item.problem, CW - 8, 7.5) : [];
        const fixL = wrap(item.fix || '', CW - 8, 8);
        const bh = Math.max(20, 10 + foundL.length * 5 + probL.length * 5 + fixL.length * 5);
        cy(bh + 3);
        doc.setFillColor(12, 16, 35); doc.roundedRect(M, y, CW, bh, 2, 2, 'F');
        doc.setFillColor(...col); doc.rect(M, y, 3, bh, 'F');
        const lbl = item.status === 'pass' || item.status === 'good' ? 'PASS' : item.status === 'warn' ? 'WARN' : 'FAIL';
        doc.setFillColor(...col); doc.roundedRect(M + 5, y + 3, 14, 6, 1, 1, 'F');
        doc.setTextColor(8, 12, 28); doc.setFontSize(5.5); doc.setFont('helvetica', 'bold');
        doc.text(lbl, M + 12, y + 7.5, { align: 'center' });
        doc.setTextColor(230, 230, 240); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text(clean(item.item), M + 22, y + 8);
        let iy = y + 13;
        if (foundL.length > 0) {
          doc.setTextColor(100, 110, 140); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
          foundL.forEach((l: string, i: number) => doc.text(l, M + 5, iy + i * 5));
          iy += foundL.length * 5;
        }
        if (probL.length > 0) {
          doc.setTextColor(180, 100, 80);
          probL.forEach((l: string, i: number) => doc.text(l, M + 5, iy + i * 5));
          iy += probL.length * 5;
        }
        doc.setTextColor(16, 185, 129);
        fixL.forEach((l: string, i: number) => doc.text('> ' + l, M + 5, iy + i * 5));
        y += bh + 3;
      });
      y += 4;
    });

    // ── ACTION PLAN ──
    currentSection = 'ACTION PLAN';
    doc.addPage(); y = M;
    drawPageHeader('ACTION PLAN');

    // Speed metrics box
    doc.setFillColor(12, 16, 35); doc.roundedRect(M, y, CW, 28, 3, 3, 'F');
    doc.setFillColor(249, 115, 22); doc.rect(M, y, 3, 28, 'F');
    doc.setTextColor(249, 115, 22); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text('SPEED METRICS', M + 8, y + 8);
    const metrics = [
      `Desktop: ${r.speedMetrics?.desktop}`, `Mobile: ${r.speedMetrics?.mobile}`,
      `LCP: ${r.speedMetrics?.lcp}`, `CLS: ${r.speedMetrics?.cls}`,
      `Load Time: ${r.speedMetrics?.loadTime}`, `Page Size: ${r.speedMetrics?.pageSize}`,
    ];
    doc.setTextColor(180, 190, 220); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    metrics.forEach((m, i) => {
      const col2 = i % 3;
      const row2 = Math.floor(i / 3);
      doc.text(m, M + 8 + col2 * 60, y + 16 + row2 * 7);
    });
    y += 34;

    const groups = [
      { label: 'DO TODAY', items: r.actionPlan?.today, col: [239, 68, 68] as [number, number, number], bg: [22, 8, 8] as [number, number, number] },
      { label: 'THIS WEEK', items: r.actionPlan?.thisWeek, col: [245, 158, 11] as [number, number, number], bg: [20, 15, 5] as [number, number, number] },
      { label: 'THIS MONTH', items: r.actionPlan?.thisMonth, col: [16, 185, 129] as [number, number, number], bg: [8, 20, 15] as [number, number, number] },
    ];

    groups.forEach(g => {
      cy(16);
      doc.setFillColor(...g.col); doc.roundedRect(M, y, CW, 9, 2, 2, 'F');
      doc.setTextColor(8, 12, 28); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(g.label, M + 4, y + 6.5); y += 12;
      g.items?.forEach(a => {
        const lines = wrap(a, CW - 14, 8);
        const bh = Math.max(14, 8 + lines.length * 5);
        cy(bh + 3);
        doc.setFillColor(...g.bg); doc.roundedRect(M, y, CW, bh, 2, 2, 'F');
        doc.setTextColor(...g.col); doc.setFontSize(9); doc.text('>', M + 4, y + bh / 2 + 3);
        doc.setTextColor(200, 205, 220); doc.setFontSize(8); doc.setFont('helvetica', 'normal');
        lines.forEach((l: string, li: number) => doc.text(l, M + 11, y + 7 + li * 5));
        y += bh + 3;
      });
      y += 5;
    });

    const total = (doc as unknown as { internal: { getNumberOfPages: () => number } }).internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) addFooter(p, total);
    doc.save(`cro-audit-${clean(r.url).replace(/https?:\/\//, '').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`);
  }

  const tabs = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'fold', label: '👁 Above Fold' },
    { id: 'cta', label: '🎯 CTAs' },
    { id: 'trust', label: '🛡 Trust' },
    { id: 'mobile', label: '📱 Mobile' },
    { id: 'copy', label: '✍️ Copy' },
    { id: 'ux', label: '🧭 UX' },
    { id: 'plan', label: '⚡ Action Plan' },
  ];

  const AuditRow = ({ item }: { item: { item: string; status: string; found?: string; problem: string; fix: string } }) => {
    const b = badge(item.status);
    return (
        <div style={{ padding: '16px 20px', borderRadius: 10, background: '#0d1124', marginBottom: 10, borderLeft: `3px solid ${statusColor(item.status)}`, border: '1px solid #1a2040', borderLeftWidth: 3, borderLeftColor: statusColor(item.status), borderLeftStyle: 'solid' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 4, background: b.bg, color: b.color, border: `1px solid ${b.border}`, letterSpacing: 0.8, lineHeight: 1.5 }}>{b.label}</span>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#e8eaf6', lineHeight: 1.4 }}>{item.item}</span>
          </div>
          {item.found && <div style={{ fontSize: 12, color: '#3d4f7c', marginBottom: 5, lineHeight: 1.6 }}>Found: <span style={{ color: '#5a6fa8' }}>{item.found}</span></div>}
          <div style={{ fontSize: 13, color: '#6b7a99', marginBottom: 8, lineHeight: 1.65 }}>{item.problem}</div>
          <div style={{ fontSize: 13, color: '#10b981', fontWeight: 500, lineHeight: 1.65 }}>→ {item.fix}</div>
        </div>
    );
  };

  return (
      <div style={{ minHeight: '100vh', background: '#060a1a', fontFamily: "'Outfit', 'DM Sans', sans-serif", color: '#e8eaf6' }}>
        <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&family=Sora:wght@700;800&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px rgba(249,115,22,0.15)} 50%{box-shadow:0 0 40px rgba(249,115,22,0.3)} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #060a1a; } ::-webkit-scrollbar-thumb { background: #f97316; border-radius: 2px; }
        input::placeholder { color: #2a3558; }
        .tab-btn:hover { background: rgba(249,115,22,0.08) !important; color: #f97316 !important; }
        .audit-btn:hover { opacity: 0.9; transform: translateY(-1px); }
      `}</style>

        {/* NAV */}
        <nav style={{ background: 'rgba(6,10,26,0.96)', borderBottom: '1px solid #0f1630', padding: '0 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 60, position: 'sticky', top: 0, zIndex: 100, backdropFilter: 'blur(12px)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #f97316, #ea580c)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: 'white', fontFamily: 'Sora' }}>C</div>
            <div>
              <div style={{ fontFamily: 'Sora', fontWeight: 800, fontSize: 15, color: 'white', letterSpacing: -0.3, lineHeight: 1.3 }}>CRO Audit Pro</div>
              <div style={{ fontSize: 9, color: '#f97316', letterSpacing: 2.5, lineHeight: 1.3, fontWeight: 600 }}>CONVERSION INTELLIGENCE</div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#f97316', background: 'rgba(249,115,22,0.08)', padding: '5px 14px', borderRadius: 4, border: '1px solid rgba(249,115,22,0.2)', fontWeight: 700, letterSpacing: 0.5 }}>FREE AUDIT</div>
        </nav>

        {/* HERO */}
        {!result && !loading && (
            <div style={{ position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(249,115,22,0.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(249,115,22,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(249,115,22,0.025) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

              <div style={{ position: 'relative', padding: '90px 24px 80px', textAlign: 'center', maxWidth: 720, margin: '0 auto' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 16px', borderRadius: 3, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.18)', marginBottom: 28 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontSize: 10, color: '#f97316', fontWeight: 700, letterSpacing: 2 }}>POWERED BY GOOGLE PAGESPEED + AI ANALYSIS</span>
                </div>

                <h1 style={{ fontFamily: 'Sora', fontSize: 'clamp(36px,6vw,68px)', fontWeight: 800, color: 'white', margin: '0 0 8px', letterSpacing: -2, lineHeight: 1.08, paddingBottom: 6 }}>
                  Why Are Visitors Leaving<br />
                  <span style={{ color: '#f97316' }}>Without Converting?</span>
                </h1>
                <p style={{ fontSize: 17, color: '#3d4f7c', maxWidth: 500, margin: '20px auto 48px', lineHeight: 1.8 }}>
                  Enter any URL. Get a precise audit of every reason visitors leave without buying, calling or signing up — with exact fixes.
                </p>

                {/* INPUT */}
                <div style={{ maxWidth: 640, margin: '0 auto 44px' }}>
                  <div style={{ display: 'flex', background: '#0d1124', borderRadius: 8, border: '1px solid #1a2040', overflow: 'hidden', animation: 'glow 3s infinite' }}>
                    <input
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && runAudit()}
                        placeholder="https://yourwebsite.com"
                        style={{ flex: 1, padding: '15px 20px', border: 'none', outline: 'none', fontSize: 14, color: '#e8eaf6', background: 'transparent', lineHeight: 1.5 }}
                    />
                    <button onClick={runAudit} className="audit-btn" style={{ padding: '15px 28px', background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', color: 'white', fontSize: 14, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Sora', letterSpacing: 0.3, transition: 'all 0.2s', lineHeight: 1.5 }}>
                      Audit Now →
                    </button>
                  </div>
                  {error && <div style={{ marginTop: 10, padding: '10px 16px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 13, lineHeight: 1.6, border: '1px solid rgba(239,68,68,0.15)' }}>{error}</div>}
                  <div style={{ marginTop: 12, fontSize: 12, color: '#2a3558', lineHeight: 1.6 }}>Works on any website — SaaS, landing pages, agencies, coaches, local business, ecommerce</div>
                </div>

                {/* WHAT WE CHECK */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px,1fr))', gap: 10, maxWidth: 700, margin: '0 auto 60px' }}>
                  {[
                    { icon: '👁', t: 'Above Fold Clarity' },
                    { icon: '🎯', t: 'CTA Effectiveness' },
                    { icon: '🛡', t: 'Trust Signals' },
                    { icon: '📱', t: 'Mobile Experience' },
                    { icon: '✍️', t: 'Copy & Messaging' },
                    { icon: '⚡', t: 'Page Speed' },
                  ].map(f => (
                      <div key={f.t} style={{ padding: '12px 16px', borderRadius: 8, background: '#0d1124', border: '1px solid #0f1630', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 18, lineHeight: 1 }}>{f.icon}</span>
                        <span style={{ fontSize: 13, color: '#3d4f7c', fontWeight: 600, lineHeight: 1.4 }}>{f.t}</span>
                      </div>
                  ))}
                </div>

                {/* STATS */}
                <div style={{ display: 'flex', borderTop: '1px solid #0f1630', paddingTop: 48, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[
                    { n: '96%', d: 'of visitors never convert on a first visit' },
                    { n: '3s', d: 'is all you get before visitors leave forever' },
                    { n: '7×', d: 'more leads possible with proper CRO' },
                  ].map((s, i) => (
                      <div key={s.d} style={{ flex: 1, minWidth: 180, textAlign: 'center', padding: '0 24px', borderRight: i < 2 ? '1px solid #0f1630' : 'none' }}>
                        <div style={{ fontFamily: 'Sora', fontSize: 36, fontWeight: 800, color: '#f97316', lineHeight: 1.1, paddingBottom: 4 }}>{s.n}</div>
                        <div style={{ fontSize: 12, color: '#2a3558', lineHeight: 1.6 }}>{s.d}</div>
                      </div>
                  ))}
                </div>
              </div>
            </div>
        )}

        {/* LOADING */}
        {loading && (
            <div style={{ maxWidth: 520, margin: '80px auto 120px', padding: '0 24px', animation: 'fadeUp 0.4s ease' }}>
              <div style={{ background: '#0d1124', borderRadius: 14, padding: 48, border: '1px solid #1a2040', textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', border: '3px solid #1a2040', borderTop: '3px solid #f97316', margin: '0 auto 28px', animation: 'spin 0.8s linear infinite' }} />
                <div style={{ fontFamily: 'Sora', fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 6, lineHeight: 1.3 }}>Auditing Your Website</div>
                <div style={{ fontSize: 13, color: '#f97316', marginBottom: 32, lineHeight: 1.6 }}>{loadingSteps[loadingStep]}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, textAlign: 'left' }}>
                  {loadingSteps.map((s, i) => (
                      <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, lineHeight: 1.5 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 5, background: i < loadingStep ? '#f97316' : i === loadingStep ? 'rgba(249,115,22,0.15)' : '#0d1124', border: i === loadingStep ? '1px solid #f97316' : '1px solid #1a2040', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: i < loadingStep ? 'white' : '#f97316', flexShrink: 0, transition: 'all 0.3s' }}>
                          {i < loadingStep ? '✓' : i === loadingStep ? '●' : ''}
                        </div>
                        <span style={{ color: i <= loadingStep ? '#9aa5c4' : '#2a3558' }}>{s}</span>
                      </div>
                  ))}
                </div>
              </div>
            </div>
        )}

        {/* RESULTS */}
        {result && (
            <div style={{ maxWidth: 980, margin: '0 auto', padding: '32px 24px 80px', animation: 'fadeUp 0.4s ease' }}>

              {/* HEADER */}
              <div style={{ background: '#0d1124', borderRadius: 14, padding: '24px 28px', marginBottom: 16, border: '1px solid #1a2040', borderTop: '3px solid #f97316', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', letterSpacing: 2, marginBottom: 6, lineHeight: 1.4 }}>AUDIT COMPLETE</div>
                  <div style={{ fontFamily: 'Sora', fontSize: 18, fontWeight: 800, color: 'white', lineHeight: 1.2 }}>{result.url}</div>
                  {result.pageTitle && <div style={{ fontSize: 12, color: '#3d4f7c', marginTop: 3, lineHeight: 1.5 }}>{result.pageTitle}</div>}
                  <div style={{ fontSize: 11, color: '#2a3558', marginTop: 3, lineHeight: 1.5 }}>{result.auditDate} {result.industry && `· ${result.industry}`}</div>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ textAlign: 'center', background: '#060a1a', borderRadius: 10, padding: '12px 20px', border: '1px solid #1a2040' }}>
                    <div style={{ fontFamily: 'Sora', fontSize: 40, fontWeight: 900, color: scoreColor(result.overallScore), lineHeight: 1.05, paddingBottom: 3 }}>{result.grade}</div>
                    <div style={{ fontSize: 9, color: '#2a3558', letterSpacing: 1, lineHeight: 1.5 }}>GRADE</div>
                  </div>
                  <div style={{ textAlign: 'center', background: '#060a1a', borderRadius: 10, padding: '12px 20px', border: '1px solid #1a2040' }}>
                    <div style={{ fontFamily: 'Sora', fontSize: 40, fontWeight: 900, color: 'white', lineHeight: 1.05, paddingBottom: 3 }}>{result.overallScore}</div>
                    <div style={{ fontSize: 9, color: '#2a3558', letterSpacing: 1, lineHeight: 1.5 }}>SCORE</div>
                  </div>
                </div>
              </div>

              {/* CONVERSION IMPACT */}
              <div style={{ background: '#0d1124', borderRadius: 12, padding: '16px 20px', marginBottom: 16, border: '1px solid #1a2040', borderLeft: '3px solid #f97316', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, lineHeight: 1.4 }}>💸</span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', letterSpacing: 1.5, marginBottom: 5, lineHeight: 1.4 }}>CONVERSION IMPACT</div>
                  <div style={{ fontSize: 14, color: '#6b7a99', lineHeight: 1.75 }}>{result.conversionImpact}</div>
                </div>
              </div>

              {/* SCORE GRID */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 10, marginBottom: 16 }}>
                {[
                  { label: 'Speed', score: result.speedScore },
                  { label: 'Trust', score: result.trustScore },
                  { label: 'Mobile', score: result.mobileScore },
                  { label: 'UX', score: result.uxScore },
                  { label: 'Copy', score: result.copyScore },
                  { label: 'CTA', score: result.ctaScore },
                ].map(s => (
                    <div key={s.label} style={{ background: '#0d1124', borderRadius: 10, padding: '14px 16px', border: `1px solid ${scoreColor(s.score)}18`, textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Sora', fontSize: 26, fontWeight: 800, color: scoreColor(s.score), lineHeight: 1.1, paddingBottom: 4 }}>{s.score}</div>
                      <div style={{ fontSize: 10, color: '#2a3558', letterSpacing: 0.5, marginBottom: 8, lineHeight: 1.5 }}>{s.label.toUpperCase()}</div>
                      <div style={{ height: 3, borderRadius: 2, background: '#0f1630', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${s.score}%`, background: scoreColor(s.score), borderRadius: 2 }} />
                      </div>
                    </div>
                ))}
              </div>

              {/* SPEED METRICS */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 8, marginBottom: 16 }}>
                {[
                  { label: 'Desktop', value: String(result.speedMetrics?.desktop) },
                  { label: 'Mobile', value: String(result.speedMetrics?.mobile) },
                  { label: 'LCP', value: result.speedMetrics?.lcp },
                  { label: 'CLS', value: result.speedMetrics?.cls },
                  { label: 'Load Time', value: result.speedMetrics?.loadTime },
                  { label: 'Page Size', value: result.speedMetrics?.pageSize },
                ].map(m => (
                    <div key={m.label} style={{ background: '#0d1124', borderRadius: 8, padding: '12px 14px', border: '1px solid #0f1630', textAlign: 'center' }}>
                      <div style={{ fontFamily: 'Sora', fontSize: 18, fontWeight: 800, color: '#f97316', lineHeight: 1.2, paddingBottom: 3 }}>{m.value}</div>
                      <div style={{ fontSize: 10, color: '#2a3558', lineHeight: 1.5 }}>{m.label}</div>
                    </div>
                ))}
              </div>

              {/* TABS */}
              <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: '#0d1124', borderRadius: 10, padding: 5, border: '1px solid #1a2040', flexWrap: 'wrap' }}>
                {tabs.map(t => (
                    <button key={t.id} className="tab-btn" onClick={() => setActiveTab(t.id)} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: activeTab === t.id ? 'linear-gradient(135deg, #f97316, #ea580c)' : 'transparent', color: activeTab === t.id ? 'white' : '#3d4f7c', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', lineHeight: 1.5, letterSpacing: 0.2 }}>
                      {t.label}
                    </button>
                ))}
              </div>

              {/* OVERVIEW */}
              {activeTab === 'overview' && (
                  <div style={{ animation: 'fadeUp 0.3s ease' }}>
                    <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, marginBottom: 14, border: '1px solid #1a2040' }}>
                      <div style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, color: '#f97316', letterSpacing: 2, marginBottom: 12, background: 'rgba(249,115,22,0.08)', padding: '3px 10px', borderRadius: 3, lineHeight: 1.6 }}>AUDIT SUMMARY</div>
                      <div style={{ fontSize: 14, color: '#6b7a99', lineHeight: 1.85 }}>{result.summary}</div>
                    </div>

                    {result.criticalIssues?.length > 0 && (
                        <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, marginBottom: 14, border: '1px solid #2a1a10', borderTop: '2px solid #f97316' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
                            <span style={{ fontSize: 18, lineHeight: 1.4 }}>🚨</span>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: 1.5, lineHeight: 1.4 }}>CONVERSION KILLERS — FIX THESE FIRST</div>
                              <div style={{ fontSize: 12, color: '#2a3558', lineHeight: 1.5 }}>These are actively costing you leads and sales right now</div>
                            </div>
                          </div>
                          {result.criticalIssues.map((issue, i) => (
                              <div key={i} style={{ padding: '16px 18px', borderRadius: 8, background: '#100c08', marginBottom: 10, borderLeft: '3px solid #f97316' }}>
                                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: '#fb923c', lineHeight: 1.4 }}>{issue.title}</div>
                                <div style={{ fontSize: 12, color: '#78350f', fontWeight: 600, marginBottom: 4, lineHeight: 1.5 }}>📍 {issue.where}</div>
                                <div style={{ fontSize: 12, color: '#ef4444', fontWeight: 600, marginBottom: 8, lineHeight: 1.5 }}>Impact: {issue.impact}</div>
                                <div style={{ fontSize: 13, color: '#10b981', fontWeight: 500, lineHeight: 1.65 }}>→ {issue.fix}</div>
                              </div>
                          ))}
                        </div>
                    )}

                    {result.passed?.length > 0 && (
                        <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, border: '1px solid #1a2040' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#10b981', letterSpacing: 1.5, marginBottom: 16, lineHeight: 1.5 }}>✓ WHAT YOU'RE DOING WELL</div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
                            {result.passed.map((p, i) => (
                                <div key={i} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 8, background: '#060a1a', border: '1px solid #0f1630' }}>
                                  <span style={{ color: '#10b981', fontSize: 14, lineHeight: 1.4 }}>✓</span>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#e8eaf6', lineHeight: 1.45 }}>{p.item}</div>
                                    <div style={{ fontSize: 12, color: '#2a3558', marginTop: 2, lineHeight: 1.55 }}>{p.why}</div>
                                  </div>
                                </div>
                            ))}
                          </div>
                        </div>
                    )}
                  </div>
              )}

              {activeTab === 'fold' && (
                  <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, border: '1px solid #1a2040', animation: 'fadeUp 0.3s ease' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#3d4f7c', letterSpacing: 1.5, marginBottom: 18, lineHeight: 1.5 }}>ABOVE THE FOLD AUDIT</div>
                    {result.aboveFoldAudit?.map((item, i) => <AuditRow key={i} item={item} />)}
                  </div>
              )}

              {activeTab === 'cta' && (
                  <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, border: '1px solid #1a2040', animation: 'fadeUp 0.3s ease' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#3d4f7c', letterSpacing: 1.5, marginBottom: 18, lineHeight: 1.5 }}>CALL TO ACTION AUDIT</div>
                    {result.ctaAudit?.map((item, i) => <AuditRow key={i} item={item} />)}
                  </div>
              )}

              {activeTab === 'trust' && (
                  <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, border: '1px solid #1a2040', animation: 'fadeUp 0.3s ease' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#3d4f7c', letterSpacing: 1.5, marginBottom: 18, lineHeight: 1.5 }}>TRUST & CREDIBILITY AUDIT</div>
                    {result.trustAudit?.map((item, i) => <AuditRow key={i} item={item} />)}
                  </div>
              )}

              {activeTab === 'mobile' && (
                  <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, border: '1px solid #1a2040', animation: 'fadeUp 0.3s ease' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#3d4f7c', letterSpacing: 1.5, marginBottom: 18, lineHeight: 1.5 }}>MOBILE EXPERIENCE AUDIT</div>
                    {result.mobileAudit?.map((item, i) => <AuditRow key={i} item={item} />)}
                  </div>
              )}

              {activeTab === 'copy' && (
                  <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, border: '1px solid #1a2040', animation: 'fadeUp 0.3s ease' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#3d4f7c', letterSpacing: 1.5, marginBottom: 18, lineHeight: 1.5 }}>COPY & MESSAGING AUDIT</div>
                    {result.copyAudit?.map((item, i) => <AuditRow key={i} item={item} />)}
                  </div>
              )}

              {activeTab === 'ux' && (
                  <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, border: '1px solid #1a2040', animation: 'fadeUp 0.3s ease' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#3d4f7c', letterSpacing: 1.5, marginBottom: 18, lineHeight: 1.5 }}>UX & PAGE STRUCTURE AUDIT</div>
                    {result.uxAudit?.map((item, i) => <AuditRow key={i} item={item} />)}
                  </div>
              )}

              {activeTab === 'plan' && (
                  <div style={{ animation: 'fadeUp 0.3s ease' }}>
                    <div style={{ background: '#0d1124', borderRadius: 12, padding: 24, marginBottom: 14, border: '1px solid #1a2040', borderTop: '2px solid #f97316' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: 1.5, marginBottom: 18, lineHeight: 1.5 }}>⚡ TOP PRIORITY FIXES</div>
                      {result.topFixes?.map((fix, i) => (
                          <div key={i} style={{ display: 'flex', gap: 14, padding: '12px 16px', borderRadius: 8, background: '#060a1a', marginBottom: 8, alignItems: 'flex-start', border: '1px solid #0f1630' }}>
                            <span style={{ width: 24, height: 24, borderRadius: 5, background: '#f97316', color: 'white', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontFamily: 'Sora', lineHeight: 1 }}>{i + 1}</span>
                            <span style={{ fontSize: 14, color: '#9aa5c4', lineHeight: 1.7 }}>{fix}</span>
                          </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px,1fr))', gap: 12 }}>
                      {[
                        { label: 'DO TODAY', items: result.actionPlan?.today, color: '#ef4444', bg: '#100808', border: '#2a1010' },
                        { label: 'THIS WEEK', items: result.actionPlan?.thisWeek, color: '#f59e0b', bg: '#100e08', border: '#2a2010' },
                        { label: 'THIS MONTH', items: result.actionPlan?.thisMonth, color: '#10b981', bg: '#08100c', border: '#10281a' },
                      ].map(g => (
                          <div key={g.label} style={{ background: g.bg, borderRadius: 12, padding: 18, border: `1px solid ${g.border}` }}>
                            <div style={{ fontFamily: 'Sora', fontSize: 12, fontWeight: 800, color: g.color, letterSpacing: 1.5, marginBottom: 14, lineHeight: 1.4 }}>{g.label}</div>
                            {g.items?.map((a, i) => (
                                <div key={i} style={{ fontSize: 13, color: '#6b7a99', marginBottom: 10, display: 'flex', gap: 8, lineHeight: 1.65 }}>
                                  <span style={{ color: g.color, flexShrink: 0 }}>→</span>{a}
                                </div>
                            ))}
                          </div>
                      ))}
                    </div>
                  </div>
              )}

              {/* BUTTONS */}
              <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap' }}>
                <button onClick={downloadReport} style={{ padding: '14px 28px', borderRadius: 8, background: 'linear-gradient(135deg, #f97316, #ea580c)', border: 'none', color: 'white', fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Sora', lineHeight: 1.5 }}>
                  ↓ Download PDF Report
                </button>
                <button onClick={() => { setResult(null); setUrl(''); }} style={{ padding: '14px 28px', borderRadius: 8, background: '#0d1124', border: '1px solid #1a2040', color: '#6b7a99', fontSize: 14, fontWeight: 600, cursor: 'pointer', lineHeight: 1.5 }}>
                  ↺ Audit Another Site
                </button>
              </div>
            </div>
        )}

        {/* FOOTER */}
        {!result && (
            <div style={{ background: '#060a1a', borderTop: '1px solid #0f1630', padding: '52px 40px 32px' }}>
              <div style={{ maxWidth: 980, margin: '0 auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 32, marginBottom: 36 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg, #f97316, #ea580c)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Sora', fontWeight: 900, color: 'white', fontSize: 16 }}>C</div>
                      <span style={{ fontFamily: 'Sora', fontWeight: 800, fontSize: 15, color: 'white', lineHeight: 1.3 }}>CRO Audit Pro</span>
                    </div>
                    <p style={{ fontSize: 13, color: '#2a3558', maxWidth: 260, lineHeight: 1.75, margin: 0 }}>Complete conversion rate audits for any website. Powered by Google PageSpeed and AI.</p>
                  </div>
                  <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#1a2040', letterSpacing: 1.5, marginBottom: 14, lineHeight: 1.5 }}>WHAT WE AUDIT</div>
                      {['Above the Fold', 'CTAs & Buttons', 'Trust Signals', 'Mobile UX', 'Copy & Messaging', 'Page Structure'].map(i => (
                          <div key={i} style={{ fontSize: 13, color: '#1a2040', marginBottom: 8, lineHeight: 1.55 }}>{i}</div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#1a2040', letterSpacing: 1.5, marginBottom: 14, lineHeight: 1.5 }}>POWERED BY</div>
                      {['Google PageSpeed API', 'Gemini 2.5 Flash AI', 'Real Crawl Data', 'CRO Best Practices'].map(i => (
                          <div key={i} style={{ fontSize: 13, color: '#1a2040', marginBottom: 8, lineHeight: 1.55 }}>{i}</div>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #0f1630', paddingTop: 24, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ fontSize: 12, color: '#1a2040', lineHeight: 1.5 }}>© 2026 CRO Audit Pro · Free Conversion Analysis</div>
                  <div style={{ fontSize: 12, color: '#1a2040', lineHeight: 1.5 }}>Built for businesses that want more leads from existing traffic</div>
                </div>
              </div>
            </div>
        )}
      </div>
  );
}