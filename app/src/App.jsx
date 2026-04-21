import { lazy, Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { UploadProvider, useUpload } from './context/UploadContext'
import { loadFFmpeg } from './lib/remux'
import LoginScreen from './screens/LoginScreen'
import InstallPrompt from './components/InstallPrompt'
import ErrorBoundary from './components/ErrorBoundary'
import Reel from './components/Reel'

const HomeScreen            = lazy(() => import('./screens/HomeScreen'))
const IntakeScreen          = lazy(() => import('./screens/IntakeScreen'))
const PlaybackScreen        = lazy(() => import('./screens/PlaybackScreen'))
const WorkspaceScreen       = lazy(() => import('./screens/WorkspaceScreen'))
const DiscoveryScreen       = lazy(() => import('./screens/DiscoveryScreen'))
const SignupScreen          = lazy(() => import('./screens/SignupScreen'))
const ShareScreen           = lazy(() => import('./screens/ShareScreen'))
const SettingsScreen        = lazy(() => import('./screens/SettingsScreen'))
const ScrapbookDetailScreen = lazy(() => import('./screens/ScrapbookDetailScreen'))
const FilmFestScreen        = lazy(() => import('./screens/RemixScreen'))
const ResetPasswordScreen   = lazy(() => import('./screens/ResetPasswordScreen'))

const FF_READY_KEY = 'cassette_ff_ready'

function UploadBanner() {
  const { isActive, completedClips, totalClips, cancel } = useUpload()
  if (!isActive) return null

  const remaining = totalClips - completedClips
  const pct = totalClips > 0 ? (completedClips / totalClips) * 100 : 0

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-2.5 border-b border-walnut-light"
      style={{ background: 'rgba(26,15,8,0.97)' }}
    >
      <Reel size={18} />
      <div className="flex-1">
        <div className="flex justify-between mb-1">
          <span className="text-amber text-[11px] font-bold font-sans">
            Uploading {remaining} more clip{remaining !== 1 ? 's' : ''}
          </span>
          <span className="text-rust text-[10px] font-sans">{Math.round(pct)}%</span>
        </div>
        <div className="h-[2px] bg-walnut-light rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #F2A24A, #E8855A)' }}
          />
        </div>
      </div>
      <button
        onClick={cancel}
        className="text-rust/50 text-[11px] font-semibold font-sans active:opacity-70 ml-1"
      >
        Cancel
      </button>
    </div>
  )
}

function ScreenLoader() {
  return (
    <div className="flex items-center justify-center bg-walnut" style={{ height: '100dvh' }}>
      <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
    </div>
  )
}

function InitScreen() {
  return (
    <div className="flex flex-col items-center justify-center bg-walnut gap-8 px-8 text-center" style={{ height: '100dvh' }}>
      <p className="font-display italic text-amber text-5xl tracking-tight">cassette</p>
      <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      <div>
        <p className="text-wheat font-semibold text-[15px] mb-1.5">Setting up your experience</p>
        <p className="text-rust text-sm leading-relaxed">
          Downloading video tools.<br />This only happens once.
        </p>
      </div>
    </div>
  )
}

function AppInit({ children }) {
  const isFirstTime = !localStorage.getItem(FF_READY_KEY)
  const [ready, setReady] = useState(!isFirstTime)

  useEffect(() => {
    loadFFmpeg()
      .catch(() => {})
      .finally(() => {
        localStorage.setItem(FF_READY_KEY, '1')
        setReady(true)
      })
  }, [])

  if (!ready) return <InitScreen />
  return children
}

function AuthGate({ children }) {
  const { session } = useAuth()
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)

  useEffect(() => {
    if (session) {
      // User just logged in, check if we should show install prompt
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      const hasDismissed = localStorage.getItem('installPromptDismissed')
      
      if (!isStandalone && !hasDismissed) {
        // Small delay so it doesn't overlap with any auth redirects
        setTimeout(() => setShowInstallPrompt(true), 500)
      }
    }
  }, [session])

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-walnut">
        <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!session) return <LoginScreen />
  
  return (
    <>
      {showInstallPrompt && (
        <InstallPrompt onDismiss={() => setShowInstallPrompt(false)} />
      )}
      {children}
    </>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<ScreenLoader />}>
      <Routes>
        {/* Public */}
        <Route path="/signup" element={<SignupScreen />} />
        <Route path="/reset-password" element={<ResetPasswordScreen />} />

        {/* Protected */}
        <Route path="/*" element={
          <AuthGate>
            <Routes>
              <Route path="/" element={<HomeScreen />} />
              <Route path="/intake" element={<IntakeScreen />} />
              <Route path="/scrapbook/:id" element={<ScrapbookDetailScreen />} />
              <Route path="/scrapbook/:id/watch" element={<PlaybackScreen />} />
              <Route path="/scrapbook/:id/edit" element={<WorkspaceScreen />} />
              <Route path="/scrapbook/:id/share" element={<ShareScreen />} />
              <Route path="/discover" element={<DiscoveryScreen />} />
              <Route path="/remix" element={<FilmFestScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AuthGate>
        } />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <UploadProvider>
            <UploadBanner />
            <AppInit>
              <AppRoutes />
            </AppInit>
          </UploadProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
