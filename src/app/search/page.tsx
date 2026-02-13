'use client';

import { useState } from 'react';
import {
  Search,
  MapPin,
  Globe,
  Loader2,
  Check,
  Database,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, getSourceConfig } from '@/lib/utils';
import type { ScrapeResult } from '@/lib/types';

export default function SearchPage() {
  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [source, setSource] = useState<'google_maps' | 'yelp' | 'fresha' | 'all'>('google_maps');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ScrapeResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());

  const handleSearch = async () => {
    if (!niche.trim() || !location.trim()) {
      setError('Please enter both a niche and location');
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setSaved(false);
    setSelectedResults(new Set());

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ niche, location, source }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }

      setResults(data.results || []);
      // Select all by default
      setSelectedResults(new Set(data.results?.map((_: ScrapeResult, i: number) => i) || []));

      if (data.results?.length === 0) {
        setError('No results found. Try a different niche or location.');
      }
    } catch (err: any) {
      setError(err.message || 'Search failed. Check your API keys in Settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAll = async () => {
    if (results.length === 0) return;

    const resultsToSave = selectedResults.size > 0
      ? results.filter((_, i) => selectedResults.has(i))
      : results;

    setSaving(true);
    try {
      // Upsert leads — de-duplicate by business_name + address
      for (const result of resultsToSave) {
        const { data: existing } = await supabase
          .from('leads')
          .select('id')
          .eq('business_name', result.business_name)
          .eq('source', result.source)
          .maybeSingle();

        if (existing) {
          // Update existing
          await supabase
            .from('leads')
            .update({
              phone: result.phone || undefined,
              email: result.email || undefined,
              website: result.website || undefined,
              google_rating: result.google_rating || undefined,
              google_review_count: result.google_review_count || undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          // Insert new
          await supabase.from('leads').insert({
            business_name: result.business_name,
            address: result.address,
            phone: result.phone,
            email: result.email,
            website: result.website,
            google_rating: result.google_rating,
            google_review_count: result.google_review_count,
            google_maps_url: result.google_maps_url,
            source: result.source,
          });
        }
      }

      // Log activity
      await supabase.from('activity_log').insert({
        action_type: 'scrape',
        description: `Scraped ${resultsToSave.length} leads for "${niche}" in "${location}" from ${source}`,
      });

      setSaved(true);
    } catch (err: any) {
      setError('Failed to save leads: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleResult = (index: number) => {
    setSelectedResults(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedResults.size === results.length) {
      setSelectedResults(new Set());
    } else {
      setSelectedResults(new Set(results.map((_, i) => i)));
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
          <Search className="w-6 h-6 text-prospex-cyan" />
          Lead Search
        </h1>
        <p className="text-sm text-prospex-dim mt-1">Find businesses from Google Maps, Yelp, and Fresha</p>
      </div>

      {/* Search Form */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-mono text-prospex-dim uppercase mb-1.5">Niche</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim" />
              <input
                type="text"
                placeholder="e.g. med spa"
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="input pl-9"
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-mono text-prospex-dim uppercase mb-1.5">Location</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim" />
              <input
                type="text"
                placeholder="e.g. London, UK"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="input pl-9"
              />
            </div>
          </div>
          <div className="md:col-span-1">
            <label className="block text-xs font-mono text-prospex-dim uppercase mb-1.5">Source</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value as any)}
              className="input"
            >
              <option value="google_maps">Google Maps</option>
              <option value="yelp">Yelp</option>
              <option value="fresha">Fresha</option>
              <option value="all">All Sources</option>
            </select>
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="btn-primary w-full py-2.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  Search
                </>
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-prospex-red/10 border border-prospex-red/30 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-prospex-red shrink-0" />
            <p className="text-sm text-prospex-red">{error}</p>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-prospex-border flex items-center justify-between">
            <div>
              <h2 className="font-mono font-semibold text-prospex-text text-sm">
                {results.length} Results Found
              </h2>
              <p className="text-xs text-prospex-dim mt-0.5">
                {selectedResults.size} selected
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={toggleAll} className="btn-ghost text-xs">
                {selectedResults.size === results.length ? 'Deselect All' : 'Select All'}
              </button>
              <button
                onClick={handleSaveAll}
                disabled={saving || saved || selectedResults.size === 0}
                className={cn(saved ? 'btn-success' : 'btn-primary', 'text-xs')}
              >
                {saving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                ) : saved ? (
                  <><Check className="w-3.5 h-3.5" /> Saved to Database</>
                ) : (
                  <><Database className="w-3.5 h-3.5" /> Save Selected ({selectedResults.size})</>
                )}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="w-10 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={selectedResults.size === results.length}
                      onChange={toggleAll}
                      className="rounded"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Business</th>
                  <th className="text-left px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Phone</th>
                  <th className="text-left px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Website</th>
                  <th className="text-left px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Rating</th>
                  <th className="text-left px-3 py-2.5 text-xs font-mono text-prospex-dim uppercase">Source</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, index) => (
                  <tr
                    key={index}
                    className={cn(
                      'table-row cursor-pointer',
                      selectedResults.has(index) && 'bg-prospex-cyan/5'
                    )}
                    onClick={() => toggleResult(index)}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedResults.has(index)}
                        onChange={() => toggleResult(index)}
                        className="rounded"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-sm font-medium text-prospex-text">{result.business_name}</p>
                      <p className="text-xs text-prospex-dim truncate max-w-[200px]">{result.address || '—'}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-prospex-muted font-mono">{result.phone || '—'}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      {result.website ? (
                        <span className="text-xs text-prospex-cyan truncate block max-w-[150px]">{result.website.replace(/https?:\/\/(www\.)?/, '')}</span>
                      ) : (
                        <span className="text-xs text-prospex-dim">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {result.google_rating ? (
                        <span className="text-xs font-mono text-prospex-text">
                          {result.google_rating.toFixed(1)} <span className="text-prospex-dim">({result.google_review_count})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-prospex-dim">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {(() => {
                        const config = getSourceConfig(result.source);
                        return <span className={cn('badge', config.color)}>{config.label}</span>;
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state when no search performed */}
      {!loading && results.length === 0 && !error && (
        <div className="card p-12 text-center">
          <Search className="w-12 h-12 text-prospex-dim mx-auto mb-3" />
          <p className="text-sm text-prospex-dim font-mono">Enter a niche and location to find leads</p>
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
            {['med spa', 'aesthetic clinic', 'beauty salon', 'dental clinic', 'hair salon'].map(example => (
              <button
                key={example}
                onClick={() => setNiche(example)}
                className="badge bg-prospex-surface border-prospex-border text-prospex-muted hover:text-prospex-cyan hover:border-prospex-cyan/30 cursor-pointer transition-colors"
              >
                <Plus className="w-3 h-3" /> {example}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
