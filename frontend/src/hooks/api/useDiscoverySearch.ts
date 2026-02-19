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

const PAGE_SIZE = 12

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
  const [sortField, setSortField] = useState<SearchSortField>('added')
  const [sortDirection, setSortDirection] = useState<SearchSortDirection>('desc')
  const [page, setPage] = useState(1)

  // Refs
  const urlSyncRef = useRef<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const getSortParam = (field: SearchSortField): string | null => {
    if (field === 'added' || field === 'relevance') return null
    return field
  }

  // URL Sync: Parse URL params and update state
  useEffect(() => {
    const query = searchParams.get('q') || ''
    const typeParam = searchParams.get('type') as SearchFilterType | null
    const statusParam = searchParams.get('status') as SearchStatusFilter | null
    const sortByParam = searchParams.get('sort_by') as SearchSortField | null
    const sortDirParam = searchParams.get('sort_dir') as SearchSortDirection | null

    if (query) {
      setSearchQuery(query)
      setActiveQuery(query)
    }


    if (typeParam) setFilterType(typeParam)
    if (statusParam) setFilterStatus(statusParam)
    if (sortByParam) {
      if (sortByParam === 'relevance') setSortField('added')
      else if (sortByParam === 'rating') setSortField('imdbRating')
      else if (sortByParam === 'year') setSortField('releaseDate')
      else setSortField(sortByParam)
    }
    if (sortDirParam) setSortDirection(sortDirParam)
  }, [searchParams])

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // Run search when query or filters change
  useEffect(() => {
    if (activeQuery) {
      runSearch(activeQuery)
    }
  }, [activeQuery, filterType, filterStatus, sortField, sortDirection])

  // Update URL when state changes
  useEffect(() => {
    if (!activeQuery) return

    const params = new URLSearchParams()
    params.set('q', activeQuery)
    if (filterType !== 'all') params.set('type', filterType)
    if (filterStatus !== 'all') params.set('status', filterStatus)
    const sortParam = getSortParam(sortField)
    if (sortParam) params.set('sort_by', sortParam)
    if (sortDirection !== 'desc') params.set('sort_dir', sortDirection)

    const next = `/?${params.toString()}`

    // Prevent infinite loop by comparing with last value
    if (urlSyncRef.current === next) return
    urlSyncRef.current = next

    router.replace(next, { scroll: false })
  }, [activeQuery, filterType, filterStatus, sortField, sortDirection, router])

  const runSearch = async (query: string) => {
    setSearching(true)
    setSearchError(null)

    try {
      const backendUrl = getBackendUrl()
      const params = new URLSearchParams({
        query,
        page_size: PAGE_SIZE.toString(),
      })

      if (filterType !== 'all') params.set('type', filterType)
      if (filterStatus !== 'all') params.set('status', filterStatus)
      const sortParam = getSortParam(sortField)
      if (sortParam) params.set('sort_by', sortParam)
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
    const trimmedQuery = queryToUse.trim()
    if (!trimmedQuery) return

    setSubmittingSearch(true)
    setActiveQuery(trimmedQuery)
    setPage(1)
    setSelectedResult(null)

    // Reset to first page
    const params = new URLSearchParams()
    params.set('q', trimmedQuery)
    if (filterType !== 'all') params.set('type', filterType)
    if (filterStatus !== 'all') params.set('status', filterStatus)
    const sortParam = getSortParam(sortField)
    if (sortParam) params.set('sort_by', sortParam)
    if (sortDirection !== 'desc') params.set('sort_dir', sortDirection)

    router.replace(`/?${params.toString()}`, { scroll: false })

    // If the query is unchanged, the activeQuery effect won't fire.
    // Run search explicitly so loading state always resolves.
    if (trimmedQuery === activeQuery) {
      await runSearch(trimmedQuery)
    }
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
