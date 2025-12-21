import { Navigate, useRoutes } from 'react-router-dom';
import Dashboard from '../pages/Dashboard.js';
import Login from '../pages/Login.js';
import MyPlace from '../pages/MyPlace.js';
import WorkplacesPage from '../pages/Workplaces.js';
import AssignmentsPage from '../pages/Assignments.js';
import PlannerPage from '../pages/Planner.js';
import UsersPage from '../pages/Users.js';
import UsersCreatePage from '../pages/UsersCreate.js';
import DevPage from '../pages/DevPage.js';
import StatisticsPage from '../pages/Statistics.js';
import AssignmentAdjustmentsPage from '../pages/AssignmentAdjustments.js';
import AppLayout from '../components/Layout.js';
import { useAuth } from '../context/AuthContext.js';
import InstructionsPage from '../pages/Instructions.js'; // <-- страница инструкции

const ProtectedRoute = () => {
  const { token } = useAuth();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
};

const AppRoutes = () => {
  const { token, user } = useAuth();

  // Куда по умолчанию редиректим залогиненного пользователя
  const defaultPath = user?.role === 'USER' ? '/my-place' : '/dashboard';

  const element = useRoutes([
    // 🔹 Страница инструкции — ОТДЕЛЬНО, без AppLayout и без проверки токена
    {
      path: '/instructions',
      element: <InstructionsPage />,
    },

    {
      path: '/login',
      // если уже залогинен — отправляем по роли
      element: token ? <Navigate to={defaultPath} replace /> : <Login />,
    },
    {
      path: '/',
      element: <ProtectedRoute />,
      children: [
        // корневой маршрут → редирект по роли
        { index: true, element: <Navigate to={defaultPath} replace /> },

        // общий дашборд
        { path: 'dashboard', element: <Dashboard /> },

        // страница сотрудника
        { path: 'my-place', element: <MyPlace /> },

        // админские/менеджерские страницы
        { path: 'workplaces', element: <WorkplacesPage /> },
        { path: 'assignments', element: <AssignmentsPage /> },
        { path: 'planner', element: <PlannerPage /> },
        { path: 'users', element: <UsersPage /> },
        { path: 'users/create', element: <UsersCreatePage /> },
        { path: 'statistics', element: <StatisticsPage /> },

        // страница запросов корректировок
        { path: 'schedule-adjustments', element: <AssignmentAdjustmentsPage /> },

        // dev-панель
        { path: 'dev', element: <DevPage /> },
      ],
    },
    // любой левый URL → тоже по роли
    { path: '*', element: <Navigate to={defaultPath} replace /> },
  ]);

  return element;
};

export default AppRoutes;