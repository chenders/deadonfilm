/**
 * React Query hooks for Google Search Console admin analytics.
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult } from "@tanstack/react-query"

// ============================================================================
// Types
// ============================================================================

export interface GscStatus {
  configured: boolean
  siteUrl: string | null
}

export interface PerformanceDataPoint {
  date: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface PerformanceResponse {
  source: "api" | "db"
  startDate: string
  endDate: string
  data: PerformanceDataPoint[]
  totals: {
    clicks: number
    impressions: number
    ctr: number
    position: number
  }
}

export interface TopQueryItem {
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface TopQueryResponse {
  source: "api" | "db"
  startDate: string
  endDate: string
  data: TopQueryItem[]
}

export interface TopPageItem {
  page_url: string
  page_type?: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface TopPageResponse {
  source: "api" | "db"
  startDate: string
  endDate: string
  data: TopPageItem[]
}

export interface PageTypePerformance {
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface PageTypeResponse {
  source: "api" | "db"
  startDate: string
  endDate: string
  data: Record<string, PageTypePerformance>
}

export interface SitemapContent {
  type: string
  submitted: number
  indexed: number
}

export interface SitemapInfo {
  path: string
  lastSubmitted: string | null
  lastDownloaded: string | null
  isPending: boolean
  isIndex: boolean
  warnings: number
  errors: number
  contents: SitemapContent[]
}

export interface SitemapsResponse {
  configured: boolean
  data: SitemapInfo[]
}

export interface UrlInspectionResult {
  url: string
  indexingState: string
  pageFetchState: string
  robotsTxtState: string
  lastCrawlTime: string | null
  crawledAs: string | null
  verdict: string
}

export interface IndexingStatusItem {
  date: string
  total_submitted: number
  total_indexed: number
  index_details: Record<string, { submitted: number; indexed: number }>
}

export interface IndexingResponse {
  startDate: string
  endDate: string
  data: IndexingStatusItem[]
}

export interface GscAlert {
  id: number
  alert_type: string
  severity: string
  message: string
  details: Record<string, unknown>
  acknowledged: boolean
  acknowledged_at: string | null
  created_at: string
}

export interface AlertsResponse {
  data: GscAlert[]
}

export interface SnapshotResult {
  success: boolean
  snapshot: {
    performanceDays: number
    queries: number
    pages: number
    pageTypes: number
    indexing: { totalSubmitted: number; totalIndexed: number }
  }
}

// ============================================================================
// Fetch Functions
// ============================================================================

async function fetchGscStatus(): Promise<GscStatus> {
  const response = await fetch("/admin/api/gsc/status", { credentials: "include" })
  if (!response.ok) throw new Error("Failed to fetch GSC status")
  return response.json()
}

async function fetchPerformance(days: number): Promise<PerformanceResponse> {
  const response = await fetch(`/admin/api/gsc/performance?days=${days}`, {
    credentials: "include",
  })
  if (!response.ok) throw new Error("Failed to fetch search performance")
  return response.json()
}

async function fetchTopQueries(days: number, limit: number): Promise<TopQueryResponse> {
  const response = await fetch(`/admin/api/gsc/top-queries?days=${days}&limit=${limit}`, {
    credentials: "include",
  })
  if (!response.ok) throw new Error("Failed to fetch top queries")
  return response.json()
}

async function fetchTopPages(days: number, limit: number): Promise<TopPageResponse> {
  const response = await fetch(`/admin/api/gsc/top-pages?days=${days}&limit=${limit}`, {
    credentials: "include",
  })
  if (!response.ok) throw new Error("Failed to fetch top pages")
  return response.json()
}

async function fetchPageTypes(days: number): Promise<PageTypeResponse> {
  const response = await fetch(`/admin/api/gsc/page-types?days=${days}`, {
    credentials: "include",
  })
  if (!response.ok) throw new Error("Failed to fetch page type performance")
  return response.json()
}

async function fetchSitemaps(): Promise<SitemapsResponse> {
  const response = await fetch("/admin/api/gsc/sitemaps", { credentials: "include" })
  if (!response.ok) throw new Error("Failed to fetch sitemaps")
  return response.json()
}

async function fetchIndexing(days: number): Promise<IndexingResponse> {
  const response = await fetch(`/admin/api/gsc/indexing?days=${days}`, {
    credentials: "include",
  })
  if (!response.ok) throw new Error("Failed to fetch indexing status")
  return response.json()
}

async function fetchAlerts(acknowledged?: boolean): Promise<AlertsResponse> {
  const params = new URLSearchParams()
  if (acknowledged !== undefined) params.append("acknowledged", String(acknowledged))
  const queryString = params.toString()
  const url = `/admin/api/gsc/alerts${queryString ? `?${queryString}` : ""}`
  const response = await fetch(url, { credentials: "include" })
  if (!response.ok) throw new Error("Failed to fetch alerts")
  return response.json()
}

async function postInspectUrl(url: string): Promise<UrlInspectionResult> {
  const response = await fetch("/admin/api/gsc/inspect-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  })
  if (!response.ok) throw new Error("Failed to inspect URL")
  return response.json()
}

async function postSnapshot(): Promise<SnapshotResult> {
  const response = await fetch("/admin/api/gsc/snapshot", {
    method: "POST",
    credentials: "include",
  })
  if (!response.ok) throw new Error("Failed to create snapshot")
  return response.json()
}

async function postAcknowledgeAlert(alertId: number): Promise<void> {
  const response = await fetch(`/admin/api/gsc/alerts/${alertId}/acknowledge`, {
    method: "POST",
    credentials: "include",
  })
  if (!response.ok) throw new Error("Failed to acknowledge alert")
}

// ============================================================================
// Hooks
// ============================================================================

const STALE_TIME = 60_000 // 1 minute

export function useGscStatus(): UseQueryResult<GscStatus> {
  return useQuery({
    queryKey: ["admin", "gsc", "status"],
    queryFn: fetchGscStatus,
    staleTime: STALE_TIME,
  })
}

export function useSearchPerformance(days = 30): UseQueryResult<PerformanceResponse> {
  return useQuery({
    queryKey: ["admin", "gsc", "performance", days],
    queryFn: () => fetchPerformance(days),
    staleTime: STALE_TIME,
  })
}

export function useTopQueries(days = 30, limit = 50): UseQueryResult<TopQueryResponse> {
  return useQuery({
    queryKey: ["admin", "gsc", "top-queries", days, limit],
    queryFn: () => fetchTopQueries(days, limit),
    staleTime: STALE_TIME,
  })
}

export function useTopPages(days = 30, limit = 50): UseQueryResult<TopPageResponse> {
  return useQuery({
    queryKey: ["admin", "gsc", "top-pages", days, limit],
    queryFn: () => fetchTopPages(days, limit),
    staleTime: STALE_TIME,
  })
}

export function usePageTypePerformance(days = 30): UseQueryResult<PageTypeResponse> {
  return useQuery({
    queryKey: ["admin", "gsc", "page-types", days],
    queryFn: () => fetchPageTypes(days),
    staleTime: STALE_TIME,
  })
}

export function useSitemaps(): UseQueryResult<SitemapsResponse> {
  return useQuery({
    queryKey: ["admin", "gsc", "sitemaps"],
    queryFn: fetchSitemaps,
    staleTime: STALE_TIME,
  })
}

export function useIndexingStatus(days = 90): UseQueryResult<IndexingResponse> {
  return useQuery({
    queryKey: ["admin", "gsc", "indexing", days],
    queryFn: () => fetchIndexing(days),
    staleTime: STALE_TIME,
  })
}

export function useGscAlerts(acknowledged?: boolean): UseQueryResult<AlertsResponse> {
  return useQuery({
    queryKey: ["admin", "gsc", "alerts", acknowledged],
    queryFn: () => fetchAlerts(acknowledged),
    staleTime: STALE_TIME,
  })
}

export function useInspectUrl() {
  return useMutation({
    mutationFn: postInspectUrl,
  })
}

export function useGscSnapshot() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: postSnapshot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "gsc"] })
    },
  })
}

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: postAcknowledgeAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "gsc", "alerts"] })
    },
  })
}
