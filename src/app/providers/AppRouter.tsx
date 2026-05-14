import { Suspense, lazy } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'

import { useAuth } from '@/app/providers/useAuth'
import { appRoutes } from '@/shared/config/routes'

const HomePage = lazy(async () =>
  import('@/pages/home/ui/HomePage').then((module) => ({
    default: module.HomePage,
  })),
)
const ExcursionsPage = lazy(async () =>
  import('@/pages/excursions/ui/ExcursionsPage').then((module) => ({
    default: module.ExcursionsPage,
  })),
)
const ExcursionPage = lazy(async () =>
  import('@/pages/excursion/ui/ExcursionPage').then((module) => ({
    default: module.ExcursionPage,
  })),
)
const SignInPage = lazy(async () =>
  import('@/pages/sign-in/ui/SignInPage').then((module) => ({
    default: module.SignInPage,
  })),
)
const ProfilePage = lazy(async () =>
  import('@/pages/profile/ui/ProfilePage').then((module) => ({
    default: module.ProfilePage,
  })),
)
const NotFoundPage = lazy(async () =>
  import('@/pages/not-found/ui/NotFoundPage').then((module) => ({
    default: module.NotFoundPage,
  })),
)
const AdminPage = lazy(async () =>
  import('@/pages/admin/ui/AdminPage').then((module) => ({
    default: module.AdminPage,
  })),
)

export function AppRouter() {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route path={appRoutes.home} element={<HomePage />} />
        <Route path={appRoutes.signIn} element={<SignInPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path={appRoutes.excursions} element={<ExcursionsPage />} />
          <Route path={appRoutes.excursion()} element={<ExcursionPage />} />
          <Route path={appRoutes.profile} element={<ProfilePage />} />
          <Route path={appRoutes.savedRoutes} element={<ProfilePage />} />
        </Route>
        <Route element={<AdminRoute />}>
          <Route path={appRoutes.admin} element={<AdminPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

function ProtectedRoute() {
  const { isLoading, session } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return null
  }

  if (!session?.isAuthenticated || !session.profile) {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}` }}
        to={appRoutes.signIn}
      />
    )
  }

  return <Outlet />
}

// Admin-only route: requires both auth and role === 'admin'.
// Non-admin authenticated users get redirected to their profile so they don't
// see a confusing sign-in screen they can't get past.
function AdminRoute() {
  const { isLoading, session } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return null
  }

  if (!session?.isAuthenticated || !session.profile) {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}` }}
        to={appRoutes.signIn}
      />
    )
  }

  if (session.profile.role !== 'admin') {
    return <Navigate replace to={appRoutes.profile} />
  }

  return <Outlet />
}
