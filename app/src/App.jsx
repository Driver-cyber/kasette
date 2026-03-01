import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginScreen from './screens/LoginScreen'

const HomeScreen      = lazy(() => import('./screens/HomeScreen'))
const IntakeScreen    = lazy(() => import('./screens/IntakeScreen'))
const PlaybackScreen  = lazy(() => import('./screens/PlaybackScreen'))
const WorkspaceScreen = lazy(() => import('./screens/WorkspaceScreen'))
const DiscoveryScreen = lazy(() => import('./screens/DiscoveryScreen'))

function ScreenLoader() {
  return (
    <div className="flex items-center justify-center bg-walnut" style={{ height: '100dvh' }}>
      <div className="w-8 h-8 rounded-full border-2 border-amber border-t-transparent animate-spin" />
    </div>
  )
}

function AuthGate({ children }) {
  const { session } = useAuth()

  // Still checking auth state
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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
