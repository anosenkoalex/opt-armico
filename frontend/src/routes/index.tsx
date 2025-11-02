import { Navigate, useRoutes } from 'react-router-dom';
import Dashboard from '../pages/Dashboard.js';
import Login from '../pages/Login.js';
import MyPlace from '../pages/MyPlace.js';
import WorkplacesPage from '../pages/Workplaces.js';
import AssignmentsPage from '../pages/Assignments.js';
import PlannerPage from '../pages/Planner.js';
import AppLayout from '../components/Layout.js';
import { useAuth } from '../context/AuthContext.js';

const ProtectedRoute = () => {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
};

const AppRoutes = () => {
  const { token } = useAuth();

  const element = useRoutes([
    {
      path: '/login',
      element: token ? <Navigate to="/dashboard" replace /> : <Login />,
    },
    {
      path: '/',
      element: <ProtectedRoute />,
      children: [
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', element: <Dashboard /> },
        { path: 'my-place', element: <MyPlace /> },
        { path: 'workplaces', element: <WorkplacesPage /> },
        { path: 'assignments', element: <AssignmentsPage /> },
        { path: 'planner', element: <PlannerPage /> },
      ],
    },
    { path: '*', element: <Navigate to="/dashboard" replace /> },
  ]);

  return element;
};

export default AppRoutes;
