'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Database,
  Search,
  Shield,
  Microscope,
  Upload,
  Download,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  RefreshCw,
  ExternalLink,
  Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn, getScoreColor, getSourceConfig, getPriorityConfig, formatDate } from '@/lib/utils';
import type { Lead, TableSort, TableFilter } from '@/lib/types';

const PAGE_SIZE = 50;

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-prospex-dim font-mono">—</span>;
  return (
    <span className={cn('font-mono text-sm font-bold', getScoreColor(score))}>
      {score}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const config = getSourceConfig(source);
  return (
    <span className={cn('badge', config.color)}>
      {config.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: 'hot' | 'warm' | 'cold' | null }) {
  if (!priority) return null;
  const config = getPriorityConfig(priority);
  return (
    <span className={cn('badge', config.bg, config.text, config.border)}>
      {config.emoji} {config.label}
    </span>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<TableSort>({ column: 'created_at', direction: 'desc' });
  const [filter, setFilter] = useState<TableFilter>({
    search: '',
    source: null,
    scoreRange: null,
    auditStatus: null,
  });
  const [bulkAction, setBulkAction] = useState<string | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .order(sort.column, { ascending: sort.direction === 'asc' })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filter.search) {
        query = query.or(`business_name.ilike.%${filter.search}%,address.ilike.%${filter.search}%,email.ilike.%${filter.search}%`);
      }
      if (filter.source) {
        query = query.eq('source', filter.source);
      }

      const { data, count, error } = await query;
      if (error) throw error;

      setLeads(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Failed to fetch leads:', error);
    } finally {
      setLoading(false);
    }
  }, [sort, filter, page]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleSort = (column: string) => {
    setSort(prev => ({
      column,
      direction: prev.column === column && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map(l => l.id)));
    }
  };

  const handleExportCSV = async () => {
    const leadsToExport = selectedIds.size > 0
      ? leads.filter(l => selectedIds.has(l.id))
      : leads;

    const headers = ['Business Name', 'Phone', 'Email', 'Website', 'Address', 'Google Rating', 'Reviews', 'Source', 'Lead Score', 'Audit Score', 'Deep Audit Score', 'Date Added'];
    const rows = leadsToExport.map(l => [
      l.business_name,
      l.phone || '',
      l.email || '',
      l.website || '',
      l.address || '',
      l.google_rating?.toString() || '',
      l.google_review_count?.toString() || '',
      l.source,
      l.lead_score?.toString() || '',
      l.audit_score?.toString() || '',
      l.deep_audit_score?.toString() || '',
      formatDate(l.created_at),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prospex-leads-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    // Log activity
    await supabase.from('activity_log').insert({
      action_type: 'export',
      description: `Exported ${leadsToExport.length} leads to CSV`,
    });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} leads? This cannot be undone.`)) return;

    const { error } = await supabase
      .from('leads')
      .delete()
      .in('id', Array.from(selectedIds));

    if (!error) {
      setSelectedIds(new Set());
      fetchLeads();
    }
  };

  const handleRunAudit = async (leadId: string) => {
    try {
      const response = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      if (response.ok) {
        fetchLeads();
      }
    } catch (error) {
      console.error('Audit failed:', error);
    }
  };

  const handleGHLPush = async (leadId: string) => {
    try {
      const response = await fetch('/api/ghl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId }),
      });
      if (response.ok) {
        fetchLeads();
      }
    } catch (error) {
      console.error('GHL push failed:', error);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const SortIcon = ({ column }: { column: string }) => {
    if (sort.column !== column) return <ChevronUp className="w-3 h-3 text-prospex-dim opacity-0 group-hover:opacity-50" />;
    return sort.direction === 'asc'
      ? <ChevronUp className="w-3 h-3 text-prospex-cyan" />
      : <ChevronDown className="w-3 h-3 text-prospex-cyan" />;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-mono font-bold text-prospex-text flex items-center gap-3">
            <Database className="w-6 h-6 text-prospex-cyan" />
            Lead Database
          </h1>
          <p className="text-sm text-prospex-dim mt-1">
            {totalCount.toLocaleString()} leads
            {selectedIds.size > 0 && (
              <span className="text-prospex-cyan"> · {selectedIds.size} selected</span>
            )}
          </p>
        </div>
        <button onClick={fetchLeads} className="btn-ghost" title="Refresh">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-prospex-dim" />
          <input
            type="text"
            placeholder="Search leads..."
            value={filter.search}
            onChange={(e) => setFilter(prev => ({ ...prev, search: e.target.value }))}
            className="input pl-9"
          />
        </div>

        {/* Source Filter */}
        <select
          value={filter.source || ''}
          onChange={(e) => setFilter(prev => ({ ...prev, source: e.target.value || null }))}
          className="input w-auto"
        >
          <option value="">All Sources</option>
          <option value="google_maps">Google Maps</option>
          <option value="yelp">Yelp</option>
          <option value="fresha">Fresha</option>
        </select>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <>
            <div className="w-px h-6 bg-prospex-border" />
            <button onClick={handleExportCSV} className="btn-primary text-xs">
              <Download className="w-3.5 h-3.5" /> Export ({selectedIds.size})
            </button>
            <button onClick={handleBulkDelete} className="btn-danger text-xs">
              <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.size})
            </button>
          </>
        )}

        {selectedIds.size === 0 && (
          <button onClick={handleExportCSV} className="btn-ghost text-xs">
            <Download className="w-3.5 h-3.5" /> Export All
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={leads.length > 0 && selectedIds.size === leads.length}
                    onChange={toggleSelectAll}
                    className="rounded border-prospex-border bg-prospex-bg"
                  />
                </th>
                <th
                  className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase cursor-pointer group"
                  onClick={() => handleSort('business_name')}
                >
                  <span className="flex items-center gap-1">Business <SortIcon column="business_name" /></span>
                </th>
                <th
                  className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase cursor-pointer group"
                  onClick={() => handleSort('source')}
                >
                  <span className="flex items-center gap-1">Source <SortIcon column="source" /></span>
                </th>
                <th
                  className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase cursor-pointer group"
                  onClick={() => handleSort('lead_score')}
                >
                  <span className="flex items-center gap-1">Score <SortIcon column="lead_score" /></span>
                </th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase">
                  Priority
                </th>
                <th
                  className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase cursor-pointer group"
                  onClick={() => handleSort('google_rating')}
                >
                  <span className="flex items-center gap-1">Rating <SortIcon column="google_rating" /></span>
                </th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase">
                  Audit
                </th>
                <th className="text-left px-3 py-3 text-xs font-mono text-prospex-dim uppercase">
                  GHL
                </th>
                <th className="text-right px-3 py-3 text-xs font-mono text-prospex-dim uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-16">
                    <div className="w-6 h-6 border-2 border-prospex-cyan/30 border-t-prospex-cyan rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-prospex-dim font-mono mt-3">Loading leads...</p>
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-16">
                    <Database className="w-10 h-10 text-prospex-dim mx-auto mb-3" />
                    <p className="text-sm text-prospex-dim font-mono">No leads found</p>
                    <Link href="/search" className="btn-primary mt-4 inline-flex">
                      <Search className="w-4 h-4" /> Start Searching
                    </Link>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className="table-row">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        className="rounded border-prospex-border bg-prospex-bg"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="text-sm font-medium text-prospex-text hover:text-prospex-cyan transition-colors"
                      >
                        {lead.business_name}
                      </Link>
                      <p className="text-xs text-prospex-dim mt-0.5 truncate max-w-[250px]">
                        {lead.address || lead.phone || 'No contact info'}
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <SourceBadge source={lead.source} />
                    </td>
                    <td className="px-3 py-3">
                      <ScoreBadge score={lead.lead_score} />
                    </td>
                    <td className="px-3 py-3">
                      <PriorityBadge priority={lead.lead_priority} />
                    </td>
                    <td className="px-3 py-3">
                      {lead.google_rating ? (
                        <span className="text-sm font-mono text-prospex-text">
                          {lead.google_rating.toFixed(1)}
                          <span className="text-prospex-dim text-xs ml-1">({lead.google_review_count})</span>
                        </span>
                      ) : (
                        <span className="text-xs text-prospex-dim">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {lead.audit_status === 'complete' ? (
                        <span className="badge bg-prospex-green/20 text-prospex-green border-prospex-green/40">
                          <Check className="w-3 h-3" /> {lead.audit_score}
                        </span>
                      ) : lead.audit_status === 'running' ? (
                        <span className="badge bg-prospex-amber/20 text-prospex-amber border-prospex-amber/40">
                          <RefreshCw className="w-3 h-3 animate-spin" /> Running
                        </span>
                      ) : (
                        <span className="text-xs text-prospex-dim">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {lead.ghl_contact_id ? (
                        <span className="badge bg-prospex-green/20 text-prospex-green border-prospex-green/40">
                          <Check className="w-3 h-3" /> Pushed
                        </span>
                      ) : (
                        <span className="text-xs text-prospex-dim">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {lead.website && lead.audit_status !== 'complete' && (
                          <button
                            onClick={() => handleRunAudit(lead.id)}
                            className="p-1.5 rounded hover:bg-prospex-amber/20 text-prospex-dim hover:text-prospex-amber transition-colors"
                            title="Run Audit"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {!lead.ghl_contact_id && (
                          <button
                            onClick={() => handleGHLPush(lead.id)}
                            className="p-1.5 rounded hover:bg-prospex-green/20 text-prospex-dim hover:text-prospex-green transition-colors"
                            title="Push to GHL"
                          >
                            <Upload className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <Link
                          href={`/leads/${lead.id}`}
                          className="p-1.5 rounded hover:bg-prospex-cyan/20 text-prospex-dim hover:text-prospex-cyan transition-colors"
                          title="View Details"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-prospex-border">
            <p className="text-xs text-prospex-dim font-mono">
              Page {page + 1} of {totalPages} · {totalCount} total
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-ghost p-1.5 disabled:opacity-30"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="btn-ghost p-1.5 disabled:opacity-30"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
