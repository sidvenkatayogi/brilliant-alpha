import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth/AuthContext'
import { ProtectedRoute } from './auth/ProtectedRoute'
import Login from './auth/Login'
import Signup from './auth/Signup'
import Dashboard from './screens/Dashboard'
import LessonRoute from './screens/LessonRoute'
import CompletionScreen from './screens/CompletionScreen'
import Profile from './screens/Profile'

export default function App() {
  const { user, loading } = useAuth()

  return (
    <Routes>
      {/* Auth routes redirect home when already signed in. */}
      <Route path="/login" element={user && !loading ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/signup" element={user && !loading ? <Navigate to="/" replace /> : <Signup />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lesson/:lessonId"
        element={
          <ProtectedRoute>
            <LessonRoute />
          </ProtectedRoute>
        }
      />
      <Route
        path="/lesson/:lessonId/complete"
        element={
          <ProtectedRoute>
            <CompletionScreen />
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
