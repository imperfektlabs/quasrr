'use client'

import { Children, useEffect, useMemo, useRef, useState } from 'react'

type MediaRailProps = {
  children: React.ReactNode
  className?: string
}

export function MediaRail({ children, className }: MediaRailProps) {
  const items = useMemo(() => Children.toArray(children), [children])
  const containerRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const visibleIndices = useRef<Set<number>>(new Set())
  const rafRef = useRef<number | null>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)

  const updateFocus = () => {
    const container = containerRef.current
    if (!container) return
    const containerRect = container.getBoundingClientRect()
    const centerX = containerRect.left + containerRect.width / 2
    const candidates = visibleIndices.current.size > 0
      ? Array.from(visibleIndices.current)
      : items.map((_, index) => index)

    let bestIndex = focusedIndex
    let bestDistance = Number.POSITIVE_INFINITY

    for (const index of candidates) {
      const element = itemRefs.current[index]
      if (!element) continue
      const rect = element.getBoundingClientRect()
      const itemCenter = rect.left + rect.width / 2
      const distance = Math.abs(itemCenter - centerX)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = index
      }
    }

    setFocusedIndex(bestIndex)
  }

  const scheduleUpdate = () => {
    if (rafRef.current !== null) return
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null
      updateFocus()
    })
  }

  useEffect(() => {
    scheduleUpdate()
  }, [items.length])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    visibleIndices.current.clear()

    // No mousewheel interception - let browser handle all scrolling natively
    // Horizontal scrolling: SHIFT + wheel, trackpad gesture, or touch swipe
    // Vertical page scroll always works

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const indexAttr = entry.target.getAttribute('data-rail-index')
          const index = indexAttr ? Number(indexAttr) : Number.NaN
          if (Number.isNaN(index)) continue
          if (entry.isIntersecting) {
            visibleIndices.current.add(index)
          } else {
            visibleIndices.current.delete(index)
          }
        }
        scheduleUpdate()
      },
      {
        root: container,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    )

    itemRefs.current.forEach((node) => {
      if (node) observer.observe(node)
    })

    const handleScroll = () => scheduleUpdate()
    container.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', scheduleUpdate)

    return () => {
      observer.disconnect()
      container.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', scheduleUpdate)
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [items.length])

  return (
    <div
      ref={containerRef}
      className={['media-rail', className].filter(Boolean).join(' ')}
      role="list"
    >
      {items.map((child, index) => {
        const key = typeof child === 'object' && child !== null && 'key' in child
          ? (child as { key?: string | number | null }).key ?? index
          : index

        return (
          <div
            key={key}
            ref={(node) => {
              itemRefs.current[index] = node
            }}
            className="media-rail__item"
            data-rail-index={index}
            data-focused={index === focusedIndex ? 'true' : 'false'}
            role="listitem"
          >
            {child}
          </div>
        )
      })}
    </div>
  )
}
