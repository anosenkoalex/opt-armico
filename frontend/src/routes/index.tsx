import { Navigate, useRoutes } from 'react-router-dom';
import Login from '../pages/Login.js';
import Dashboard from '../pages/Dashboard.js';
import Workplaces from '../pages/Workplaces.js';
import Assignments from '../pages/Assignments.js';
import MyPlace from '../pages/MyPlace.js';
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
      element: token ? <Navigate to="/" replace /> : <Login />,
    },
    {
      path: '/',
      element: <ProtectedRoute />,
      children: [
        { index: true, element: <Dashboard /> },
        { path: 'workplaces', element: <Workplaces /> },
        { path: 'assignments', element: <Assignments /> },
        { path: 'my-place', element: <MyPlace /> },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ]);

  return element;
};

export default AppRoutes;
