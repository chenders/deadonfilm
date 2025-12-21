// Common UI and pagination types

export type ViewMode = "list" | "timeline"

export interface PaginationInfo {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
}
