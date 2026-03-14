import { lazy, Suspense, useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { loadFFmpeg } from './lib/remux'
import LoginScreen from './screens/LoginScreen'

const HomeScreen      = lazy(() => import('./screens/HomeScreen'))
const IntakeScreen    = lazy(() => import('./screens/IntakeScreen'))
const PlaybackScreen  = lazy(() => import('./screens/PlaybackScreen'))
const WorkspaceScreen = lazy(() => import('./screens/WorkspaceScreen'))
const DiscoveryScreen = lazy(() => import('./screens/DiscoveryScreen'))

const FF_READY_KEY = 'cassette_ff_ready'

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

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-screen bg-walnut">
        <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!session) return <LoginScreen />
  return children
}

function AppRoutes() {
  return (
    <AuthGate>
      <Suspense fallback={<ScreenLoader />}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/intake" element={<IntakeScreen />} />
          <Route path="/scrapbook/:id" element={<PlaybackScreen />} />
          <Route path="/scrapbook/:id/edit" element={<WorkspaceScreen />} />
          <Route path="/discover" element={<DiscoveryScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AuthGate>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppInit>
          <AppRoutes />
        </AppInit>
      </AuthProvider>
    </BrowserRouter>
  )
}
