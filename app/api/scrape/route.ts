import { NextRequest, NextResponse } from 'next/server';
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { url } = await req.json();
        if (!url) return NextResponse.json({ ok: false, error: 'URL required' }, { status: 400 });

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; CROAuditBot/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!res.ok) return NextResponse.json({ ok: false, error: `Page fetch failed: ${res.status}` }, { status: 500 });

        const html = await res.text();

        // ISSUE #9 FIX: Detect JS-rendered / SPA sites
        const bodyStart = html.indexOf('<body');
        const bodyContent = bodyStart > -1 ? html.slice(bodyStart, bodyStart + 8000) : html.slice(0, 8000);
        const strippedBody = bodyContent
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        const isJSRendered = strippedBody.length < 200;

        function extract(pattern: RegExp, src: string, group = 1): string {
            const m = src.match(pattern);
            return m ? m[group].replace(/<[^>]+>/g, '').trim() : '';
        }
        function extractAll(pattern: RegExp, src: string, group = 1): string[] {
            const results: string[] = [];
            let m;
            const re = new RegExp(pattern.source, 'gi');
            while ((m = re.exec(src)) !== null) {
                // ISSUE #4 FIX: Strip class/id attribute values bleeding into text
                const val = m[group]
                    .replace(/<[^>]+>/g, '')
                    .replace(/\b(?:class|id|style|data-[a-z-]+)=["'][^"']*["']/gi, '')
                    .trim();
                if (val && val.length > 2 && val.length < 200) results.push(val);
                if (results.length >= 50) break;
            }
            return [...new Set(results)];
        }

        const title = extract(/<title[^>]*>([^<]+)<\/title>/i, html);
        const metaDesc = extract(/meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i, html);
        const h1s = extractAll(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html);
        const h2s = extractAll(/<h2[^>]*>([\s\S]*?)<\/h2>/i, html);
        const h3s = extractAll(/<h3[^>]*>([\s\S]*?)<\/h3>/i, html).slice(0, 8);

        const ctaKeywords = /book|buy|get|start|try|join|sign|subscribe|contact|appointment|order|shop|call|quote|free|now|today|view|explore|learn|discover/i;
        const allButtonMatches: string[] = [];
        const allAnchorTexts: string[] = [];
        let bm; const btnRe = /<button[^>]*>([\s\S]*?)<\/button>/gi;
        while ((bm = btnRe.exec(html)) !== null) {
            const v = bm[1].replace(/<[^>]+>/g, '').trim();
            if (v && v.length > 1 && v.length < 80) allButtonMatches.push(v);
        }
        let am; const ancRe = /<a[^>]*>([\s\S]*?)<\/a>/gi;
        while ((am = ancRe.exec(html)) !== null) {
            const v = am[1].replace(/<[^>]+>/g, '').trim();
            if (v && v.length > 1 && v.length < 80) allAnchorTexts.push(v);
        }
        // ISSUE #1 FIX: Dedup CTA arrays
        const ctaButtons = [...new Set([
            ...allButtonMatches.filter(b => ctaKeywords.test(b)),
            ...allAnchorTexts.filter(a => ctaKeywords.test(a) && a.length < 40)
        ])].slice(0, 12);
        const ctaLinks = [...new Set(allAnchorTexts.filter(l => ctaKeywords.test(l)))].slice(0, 10);

        // ISSUE #5 FIX: Pick the nav block with the MOST <a> tags (main nav, not utility nav)
        let bestNavSection = '';
        let bestNavCount = 0;
        const navRe = /<nav[^>]*>([\s\S]*?)<\/nav>/gi;
        let navMatch;
        while ((navMatch = navRe.exec(html)) !== null) {
            const navContent = navMatch[1];
            const linkCount = (navContent.match(/<a /gi) || []).length;
            if (linkCount > bestNavCount) {
                bestNavCount = linkCount;
                bestNavSection = navContent;
            }
        }
        const navItems = extractAll(/<a[^>]*>([\s\S]*?)<\/a>/i, bestNavSection).slice(0, 12);

        // ISSUE #8 FIX: Strip Wix/CDN asset URLs before phone extraction
        const htmlNoAssets = html
            .replace(/https?:\/\/[^\s"'<>]+\.(png|jpg|jpeg|gif|webp|svg|woff|woff2|ttf|eot|css|js|json)[^\s"'<>]*/gi, '')
            .replace(/\/v\d+\/fill\/w_\d+,h_\d+[^\s"'<>]*/gi, '')
            .replace(/wixstatic\.com\/[^\s"'<>]*/gi, '')
            .replace(/static\.[^\s"'<>]+\/media\/[^\s"'<>]*/gi, '');
        // Strip tel: hrefs to avoid double-counting
        const htmlNoTel = htmlNoAssets.replace(/tel:[^\s"'<>]*/gi, '');

        const rawPhoneMatches = (htmlNoTel.match(/(\(?\+\d[\d\s\-()+]{5,14}\d|\b0\d[\d\s\-()]{5,13}\d)/g) || [])
            .filter(p => { const d = p.replace(/\D/g, ''); return d.length >= 7 && d.length <= 15; })
            .map(p => p.trim());

        // Deduplicate by last-8-digit fingerprint
        const seenPhoneDigits = new Set<string>();
        const phones: string[] = [];
        for (const p of rawPhoneMatches) {
            const digits = p.replace(/\D/g, '');
            const fp = digits.slice(-8);
            if (!seenPhoneDigits.has(fp)) {
                seenPhoneDigits.add(fp);
                phones.push(p);
            }
            if (phones.length >= 3) break;
        }

        // ISSUE #1 FIX: Dedup emails
        const rawEmails = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
        const emails = [...new Set(rawEmails)].slice(0, 2);

        const formCount = (html.match(/<form/gi) || []).length;
        const inputCount = (html.match(/<input/gi) || []).length;
        const textareaCount = (html.match(/<textarea/gi) || []).length;

        const hasPrices = /rs\.?\s*[\d,]+|lkr|usd|\$|£|€|price|pricing/i.test(html);
        const hasTestimonials = /testimonial|review|client said|customer said|what.*say/i.test(html);
        const hasNamedTestimonials = /Google Review|Trustpilot|verified buyer/i.test(html);

        // ISSUE #3 FIX: reviewCount must start with a digit
        const reviewRaw = html.match(/[\d,]+\+?\s*(glowing\s*)?(google\s*)?(reviews?|ratings?|customers?|clients?)\b/i)?.[0] || '';
        const hasReviewCount = /^\d/.test(reviewRaw.trim()) ? reviewRaw : '';

        const hasCertification = /iso|certified|award|accredited/i.test(html);
        const hasWhatsapp = /whatsapp/i.test(html);
        const hasLiveChat = /livechat|live.chat|tawk|intercom|drift|crisp|zendesk/i.test(html);
        const hasVideo = /<video|youtube\.com\/embed|vimeo\.com/i.test(html);
        const hasGallery = /gallery|portfolio/i.test(html);
        const hasFaq = /faq|frequently asked/i.test(html);
        const hasMap = /google.*map|maps\.google|gmap/i.test(html);

        // ISSUE #7 FIX: Social — require actual profile URLs, not share/intent links
        const socialLinks = {
            facebook:  /facebook\.com\/(pages\/|profile\.php\?|[a-zA-Z0-9.]{3,}\/)/i.test(html),
            instagram: /instagram\.com\/[a-zA-Z0-9._]{2,}/i.test(html),
            twitter:   /(?:twitter|x)\.com\/(?!intent\/|share\?|hashtag)[a-zA-Z0-9_]{2,}/i.test(html),
            youtube:   /youtube\.com\/(channel\/|c\/|user\/|@)[a-zA-Z0-9_\-]{2,}/i.test(html),
            linkedin:  /linkedin\.com\/(company|in)\/[a-zA-Z0-9_\-]{2,}/i.test(html),
        };

        const totalImgs = (html.match(/<img/gi) || []).length;
        const imgsWithAlt = (html.match(/<img[^>]+alt=["'][^"']+["']/gi) || []).length;
        const hasSchema = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);

        // ISSUE #4 FIX: visibleText already uses strippedBody (class attrs stripped above)
        const visibleText = strippedBody.slice(0, 2000);

        return NextResponse.json({
            ok: true,
            data: {
                title, metaDesc, h1s, h2s, h3s,
                ctaButtons, ctaLinks, navItems,
                phones, emails,
                forms: { count: formCount, inputs: inputCount, textareas: textareaCount },
                trust: {
                    hasPrices, hasTestimonials, hasNamedTestimonials,
                    reviewCount: hasReviewCount,
                    hasCertification, hasWhatsapp, hasLiveChat,
                    hasVideo, hasGallery, hasFaq, hasMap,
                    social: socialLinks,
                },
                images: { total: totalImgs, withAlt: imgsWithAlt },
                hasSchema, visibleText, isJSRendered,
            }
        });

    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.error('Scrape route error:', msg);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
}