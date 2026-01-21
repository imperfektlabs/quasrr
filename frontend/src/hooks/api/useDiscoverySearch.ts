/**
 * Discovery search hook
 * Manages search state, URL synchronization, and search execution
 */

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type {
  SearchType,
  SearchFilterType,
  SearchStatusFilter,
  SearchSortField,
  SearchSortDirection,
  DiscoveryResult,
  SearchResponse,
} from '@/types'
import { getBackendUrl } from '@/utils/backend'

export type DiscoverySearchResult = {
  // Input
  searchQuery: string
  setSearchQuery: (q: string) => void
  activeQuery: string

  // Filters
  filterType: SearchFilterType
  setFilterType: (type: SearchFilterType) => void
  filterStatus: SearchStatusFilter
  setFilterStatus: (status: SearchStatusFilter) => void
  sortField: SearchSortField
  setSortField: (field: SearchSortField) => void
  sortDirection: SearchSortDirection
  setSortDirection: (dir: SearchSortDirection) => void
  page: number
  setPage: (p: number) => void

  // Results
  searchResults: SearchResponse | null
  searching: boolean
  submittingSearch: boolean
  searchError: string | null
  selectedResult: DiscoveryResult | null
  setSelectedResult: (r: DiscoveryResult | null) => void

  // Actions
  submitSearch: (customQuery?: string) => Promise<void>
  handleSearch: (e: React.FormEvent) => void

  // Refs
  searchInputRef: React.RefObject<HTMLInputElement>
}

const PAGE_SIZE = 10

/**
 * Manage discovery search state with URL sync
 * Handles search input, filters, pagination, and result management
 */
export function useDiscoverySearch(): DiscoverySearchResult {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Search query & execution
  const [searchQuery, setSearchQuery] = useState('')
  const [activeQuery, setActiveQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [submittingSearch, setSubmittingSearch] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null)
  const [selectedResult, setSelectedResult] = useState<DiscoveryResult | null>(null)

  // Search filters & pagination
  const [filterType, setFilterType] = useState<SearchFilterType>('all')
  const [filterStatus, setFilterStatus] = useState<SearchStatusFilter>('all')
  const [sortField, setSortField] = useState<SearchSortField>('relevance')
  const [sortDirection, setSortDirection] = useState<SearchSortDirection>('desc')
  const [page, setPage] = useState(1)

  // Refs
  const urlSyncRef = useRef<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  // URL Sync: Parse URL params and update state
  useEffect(() => {
    const query = searchParams.get('q') || ''
    const pageParam = searchParams.get('page')
    const typeParam = searchParams.get('type') as SearchFilterType | null
    const statusParam = searchParams.get('status') as SearchStatusFilter | null
    const sortByParam = searchParams.get('sort_by') as SearchSortField | null
    const sortDirParam = searchParams.get('sort_dir') as SearchSortDirection | null

    if (query) {
      setSearchQuery(query)
      setActiveQuery(query)
    }

    if (pageParam) {
      const parsedPage = parseInt(pageParam, 10)
      if (!isNaN(parsedPage) && parsedPage > 0) {
        setPage(parsedPage)
      }
    }

    if (typeParam) setFilterType(typeParam)
    if (statusParam) setFilterStatus(statusParam)
    if (sortByParam) setSortField(sortByParam)
    if (sortDirParam) setSortDirection(sortDirParam)
  }, [searchParams])

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Run search when query or filters change
  useEffect(() => {
    if (activeQuery) {
      runSearch(activeQuery, page)
    }
  }, [activeQuery, page, filterType, filterStatus, sortField, sortDirection])

  // Update URL when state changes
  useEffect(() => {
    if (!activeQuery) return

    const params = new URLSearchParams()
    params.set('q', activeQuery)
    if (page > 1) params.set('page', page.toString())
    if (filterType !== 'all') params.set('type', filterType)
    if (filterStatus !== 'all') params.set('status', filterStatus)
    if (sortField !== 'relevance') params.set('sort_by', sortField)
    if (sortDirection !== 'desc') params.set('sort_dir', sortDirection)

    const next = `/?${params.toString()}`

    // Prevent infinite loop by comparing with last value
    if (urlSyncRef.current === next) return
    urlSyncRef.current = next

    router.replace(next, { scroll: false })
  }, [activeQuery, page, filterType, filterStatus, sortField, sortDirection, router])

  const runSearch = async (query: string, nextPage: number) => {
    setSearching(true)
    setSearchError(null)

    try {
      const backendUrl = getBackendUrl()
      const params = new URLSearchParams({
        query,
        page: nextPage.toString(),
        page_size: PAGE_SIZE.toString(),
      })

      if (filterType !== 'all') params.set('type', filterType)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (sortField !== 'relevance') params.set('sort_by', sortField)
      if (sortDirection !== 'desc') params.set('sort_dir', sortDirection)

      const res = await fetch(`${backendUrl}/search?${params.toString()}`)

      if (!res.ok) {
        const errorData = await res.json()
        setSearchError(errorData.detail || 'Search failed')
        setSearchResults(null)
        return
      }

      const data = await res.json()
      setSearchResults(data)
    } catch (e) {
      setSearchError('Network error during search')
      setSearchResults(null)
    } finally {
      setSearching(false)
      setSubmittingSearch(false)
    }
  }

  const submitSearch = async (customQuery?: string) => {
    const queryToUse = customQuery || searchQuery
    if (!queryToUse.trim()) return

    setSubmittingSearch(true)
    setActiveQuery(queryToUse.trim())
    setPage(1)
    setSelectedResult(null)

    // Reset to first page
    const params = new URLSearchParams()
    params.set('q', queryToUse.trim())
    if (filterType !== 'all') params.set('type', filterType)
    if (filterStatus !== 'all') params.set('status', filterStatus)
    if (sortField !== 'relevance') params.set('sort_by', sortField)
    if (sortDirection !== 'desc') params.set('sort_dir', sortDirection)

    router.replace(`/?${params.toString()}`, { scroll: false })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    submitSearch()
  }

  return {
    searchQuery,
    setSearchQuery,
    activeQuery,
    filterType,
    setFilterType,
    filterStatus,
    setFilterStatus,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    page,
    setPage,
    searchResults,
    searching,
    submittingSearch,
    searchError,
    selectedResult,
    setSelectedResult,
    submitSearch,
    handleSearch,
    searchInputRef,
  }
}
