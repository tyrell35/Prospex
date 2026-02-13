import { NextRequest, NextResponse } from 'next/server';

// Helper to get API keys (env vars first, then Supabase settings)
function getKey(envKey: string): string {
  return process.env[envKey] || '';
}

async function scrapeGoogleMaps(niche: string, location: string): Promise<any[]> {
  const apiKey = getKey('OUTSCRAPER_API_KEY');
  if (!apiKey) throw new Error('Outscraper API key not configured. Add it in Settings.');

  const query = `${niche} ${location}`;
  const url = `https://api.app.outscraper.com/maps/search-v3?query=${encodeURIComponent(query)}&limit=30&async=false`;

  const response = await fetch(url, {
    headers: { 'X-API-KEY': apiKey },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Outscraper API error: ${error}`);
  }

  const data = await response.json();
  const results = data?.data?.[0] || [];

  return results.map((item: any) => ({
    business_name: item.name || 'Unknown',
    address: item.full_address || item.address || null,
    phone: item.phone || null,
    email: item.email || null,
    website: item.site || item.website || null,
    google_rating: item.rating || null,
    google_review_count: item.reviews || null,
    google_maps_url: item.google_maps_url || null,
    source: 'google_maps' as const,
  }));
}

async function scrapeYelp(niche: string, location: string): Promise<any[]> {
  const apiToken = getKey('APIFY_API_TOKEN');
  if (!apiToken) throw new Error('Apify API token not configured. Add it in Settings.');

  // Using Apify's Yelp Scraper actor
  const actorId = 'yin/yelp-scraper';
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchTerms: [niche],
      locations: [location],
      maxItems: 30,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Apify Yelp error: ${error}`);
  }

  const data = await response.json();

  return (data || []).map((item: any) => ({
    business_name: item.name || item.bizName || 'Unknown',
    address: item.address || item.fullAddress || null,
    phone: item.phone || null,
    email: item.email || null,
    website: item.website || item.bizUrl || null,
    google_rating: item.rating || null,
    google_review_count: item.reviewCount || null,
    google_maps_url: null,
    source: 'yelp' as const,
  }));
}

async function scrapeFresha(niche: string, location: string): Promise<any[]> {
  const apiToken = getKey('APIFY_API_TOKEN');
  if (!apiToken) throw new Error('Apify API token not configured. Add it in Settings.');

  // Using Apify's generic web scraper for Fresha
  const actorId = 'apify/web-scraper';
  const searchUrl = `https://www.fresha.com/search?query=${encodeURIComponent(niche)}&location=${encodeURIComponent(location)}`;

  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apiToken}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startUrls: [{ url: searchUrl }],
      pageFunction: `async function pageFunction(context) {
        const { $, request } = context;
        const results = [];
        $('[data-qa="search-result-card"]').each((i, el) => {
          results.push({
            name: $(el).find('[data-qa="venue-card-name"]').text().trim(),
            address: $(el).find('[data-qa="venue-card-address"]').text().trim(),
            rating: parseFloat($(el).find('[data-qa="venue-card-rating"]').text()) || null,
            reviewCount: parseInt($(el).find('[data-qa="venue-card-reviews"]').text()) || null,
          });
        });
        return results;
      }`,
      maxPagesPerCrawl: 1,
    }),
  });

  if (!response.ok) {
    // Fresha scraping might not always work — return empty rather than error
    return [];
  }

  const data = await response.json();

  return (data || []).flat().filter((item: any) => item.name).map((item: any) => ({
    business_name: item.name || 'Unknown',
    address: item.address || null,
    phone: null,
    email: null,
    website: null,
    google_rating: item.rating || null,
    google_review_count: item.reviewCount || null,
    google_maps_url: null,
    source: 'fresha' as const,
  }));
}

export async function POST(request: NextRequest) {
  try {
    const { niche, location, source } = await request.json();

    if (!niche || !location) {
      return NextResponse.json({ error: 'Niche and location are required' }, { status: 400 });
    }

    let results: any[] = [];

    if (source === 'google_maps' || source === 'all') {
      try {
        const gmResults = await scrapeGoogleMaps(niche, location);
        results = [...results, ...gmResults];
      } catch (err: any) {
        if (source !== 'all') throw err;
        console.error('Google Maps scrape failed:', err.message);
      }
    }

    if (source === 'yelp' || source === 'all') {
      try {
        const yelpResults = await scrapeYelp(niche, location);
        results = [...results, ...yelpResults];
      } catch (err: any) {
        if (source !== 'all') throw err;
        console.error('Yelp scrape failed:', err.message);
      }
    }

    if (source === 'fresha' || source === 'all') {
      try {
        const freshaResults = await scrapeFresha(niche, location);
        results = [...results, ...freshaResults];
      } catch (err: any) {
        if (source !== 'all') throw err;
        console.error('Fresha scrape failed:', err.message);
      }
    }

    // De-duplicate by business name
    const seen = new Set<string>();
    const unique = results.filter(r => {
      const key = r.business_name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ results: unique, count: unique.length });
  } catch (err: any) {
    console.error('Scrape error:', err);
    return NextResponse.json({ error: err.message || 'Scraping failed' }, { status: 500 });
  }
}
