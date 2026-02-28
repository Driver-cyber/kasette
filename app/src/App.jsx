import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginScreen from './screens/LoginScreen'
import HomeScreen from './screens/HomeScreen'
import IntakeScreen from './screens/IntakeScreen'
import PlaybackScreen from './screens/PlaybackScreen'
import WorkspaceScreen from './screens/WorkspaceScreen'

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
      <Routes>
        <Route path="/" element={<HomeScreen />} />
        <Route path="/intake" element={<IntakeScreen />} />
        <Route path="/scrapbook/:id" element={<PlaybackScreen />} />
        <Route path="/scrapbook/:id/edit" element={<WorkspaceScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
