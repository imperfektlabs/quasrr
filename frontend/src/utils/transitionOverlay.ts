const OVERLAY_ID = 'quasrr-route-transition-overlay'
const STYLE_ID = 'quasrr-route-transition-overlay-style'

type OverlayOptions = {
  title?: string
  subtitle?: string
}

function ensureOverlayStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
@keyframes quasrrOverlaySpin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@keyframes quasrrOverlayZoom {
  from { transform: scale(0.9) rotate(0deg); }
  to { transform: scale(1.1) rotate(360deg); }
}
`
  document.head.appendChild(style)
}

export function showRouteTransitionOverlay(options: OverlayOptions = {}) {
  if (typeof document === 'undefined') return
  ensureOverlayStyle()

  const title = options.title || 'Opening library title...'
  const subtitle = options.subtitle || 'Adding to library if needed'

  let overlay = document.getElementById(OVERLAY_ID)
  if (!overlay) {
    overlay = document.createElement('div')
    overlay.id = OVERLAY_ID
    overlay.className = 'fixed inset-0 z-[140] flex items-center justify-center'
    overlay.style.background = 'rgba(2, 6, 23, 0.82)'
    overlay.style.backdropFilter = 'blur(18px) saturate(125%)'
    overlay.style.webkitBackdropFilter = 'blur(18px) saturate(125%)'
    overlay.innerHTML = `
      <div class="glass-panel rounded-lg p-8 text-center max-w-md">
        <div class="flex flex-col items-center gap-4 mb-4">
          <img
            src="/reel.png"
            alt="Loading"
            class="w-20 h-20 brightness-0 invert"
            style="animation: quasrrOverlaySpin 2s linear infinite, quasrrOverlayZoom 2.5s ease-in-out infinite alternate;"
          />
          <div data-overlay-title class="text-white text-lg"></div>
        </div>
        <p data-overlay-subtitle class="text-gray-400 text-sm"></p>
      </div>
    `
    document.body.appendChild(overlay)
  }

  const titleEl = overlay.querySelector('[data-overlay-title]')
  if (titleEl) titleEl.textContent = title
  const subtitleEl = overlay.querySelector('[data-overlay-subtitle]')
  if (subtitleEl) subtitleEl.textContent = subtitle
}

export function hideRouteTransitionOverlay() {
  if (typeof document === 'undefined') return
  const overlay = document.getElementById(OVERLAY_ID)
  overlay?.remove()
}
