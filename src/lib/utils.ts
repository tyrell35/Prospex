import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Lead, AuditData } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-prospex-green';
  if (score >= 60) return 'text-prospex-cyan';
  if (score >= 40) return 'text-prospex-amber';
  return 'text-prospex-red';
}

export function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-prospex-green/20 border-prospex-green/40';
  if (score >= 60) return 'bg-prospex-cyan/20 border-prospex-cyan/40';
  if (score >= 40) return 'bg-prospex-amber/20 border-prospex-amber/40';
  return 'bg-prospex-red/20 border-prospex-red/40';
}

export function getGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

export function getPriority(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

export function getPriorityConfig(priority: 'hot' | 'warm' | 'cold') {
  switch (priority) {
    case 'hot':
      return { label: 'HOT', emoji: '🔥', bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40' };
    case 'warm':
      return { label: 'WARM', emoji: '☀️', bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/40' };
    case 'cold':
      return { label: 'COLD', emoji: '❄️', bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/40' };
  }
}

export function getSourceConfig(source: string) {
  switch (source) {
    case 'google_maps':
      return { label: 'Google Maps', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' };
    case 'yelp':
      return { label: 'Yelp', color: 'bg-red-500/20 text-red-400 border-red-500/40' };
    case 'fresha':
      return { label: 'Fresha', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' };
    default:
      return { label: source, color: 'bg-gray-500/20 text-gray-400 border-gray-500/40' };
  }
}

export function calculateLeadScore(lead: Partial<Lead>): { score: number; grade: string; priority: 'hot' | 'warm' | 'cold' } {
  let score = 0;

  // Contact Completeness (20 pts)
  if (lead.phone) score += 5;
  if (lead.email) score += 10;
  if (lead.website) score += 5;

  // Website Audit Issues (30 pts) — more issues = higher score = better prospect
  if (lead.audit_data) {
    const audit = lead.audit_data as AuditData;
    if (audit.ssl_check === false) score += 3;
    if (audit.mobile_score !== null && audit.mobile_score < 50) score += 3;
    if (audit.speed_score !== null && audit.speed_score < 50) score += 3;
    if (audit.has_social_media === false) score += 3;
    if (audit.has_click_to_call === false) score += 3;
    if (audit.has_video === false) score += 2;
    if (audit.has_chatbot === false) score += 3;
    if (audit.has_booking === false) score += 3;
    if (audit.has_meta_description === false) score += 2;
    if (audit.has_h1 === false) score += 2;
    if (audit.has_analytics === false) score += 2;
    if (audit.has_schema === false) score += 1;
  }

  // Review Quality (20 pts)
  if (lead.google_rating !== null && lead.google_rating !== undefined) {
    if (lead.google_rating < 4.0) score += 10;
    else if (lead.google_rating < 4.5) score += 5;
  }
  if (lead.google_review_count !== null && lead.google_review_count !== undefined) {
    if (lead.google_review_count < 20) score += 10;
    else if (lead.google_review_count < 50) score += 5;
  }

  // Online Presence Gaps (15 pts)
  if (lead.audit_data) {
    const audit = lead.audit_data as AuditData;
    if (audit.has_social_media === false) score += 5;
    if (audit.has_booking === false) score += 5;
    if (audit.has_chatbot === false) score += 5;
  }

  // Cap at 100
  score = Math.min(score, 100);

  return {
    score,
    grade: getGrade(score),
    priority: getPriority(score),
  };
}
