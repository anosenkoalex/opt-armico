import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: {
        login: {
          title: 'Sign in to Armico',
          email: 'Email',
          password: 'Password',
          submit: 'Sign in',
        },
        layout: {
          dashboard: 'Dashboard',
          workplaces: 'Workplaces',
          assignments: 'Assignments',
          myPlace: 'My place',
          logout: 'Log out',
          welcome: 'Welcome',
        },
        dashboard: {
          title: 'Workplaces overview',
          create: 'Create workplace',
          assignmentsLink: 'Go to assignments calendar',
          empty: 'No workplaces yet.',
        },
        workplaces: {
          title: 'Workplaces',
          capacity: 'Capacity',
          address: 'Address',
        },
        assignments: {
          title: 'Assignments',
          user: 'User',
          workplace: 'Workplace',
          timeframe: 'Timeframe',
          empty: 'No assignments yet.',
        },
        myPlace: {
          title: 'My current workplace',
          noAssignment: 'You have no active assignment right now.',
          startsAt: 'Starts at',
          endsAt: 'Ends at',
        },
        common: {
          loading: 'Loading…',
          error: 'Something went wrong',
          language: 'Language',
        },
      },
    },
    ru: {
      translation: {
        login: {
          title: 'Вход в Armico',
          email: 'Email',
          password: 'Пароль',
          submit: 'Войти',
        },
        layout: {
          dashboard: 'Дашборд',
          workplaces: 'Рабочие места',
          assignments: 'Назначения',
          myPlace: 'Моё место',
          logout: 'Выйти',
          welcome: 'Здравствуйте',
        },
        dashboard: {
          title: 'Обзор рабочих мест',
          create: 'Создать рабочее место',
          assignmentsLink: 'Перейти к календарю назначений',
          empty: 'Рабочих мест пока нет.',
        },
        workplaces: {
          title: 'Рабочие места',
          capacity: 'Вместимость',
          address: 'Адрес',
        },
        assignments: {
          title: 'Назначения',
          user: 'Пользователь',
          workplace: 'Рабочее место',
          timeframe: 'Интервал',
          empty: 'Назначений нет.',
        },
        myPlace: {
          title: 'Моё текущее рабочее место',
          noAssignment: 'Сейчас у вас нет активного назначения.',
          startsAt: 'Начало',
          endsAt: 'Окончание',
        },
        common: {
          loading: 'Загрузка…',
          error: 'Произошла ошибка',
          language: 'Язык',
        },
      },
    },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
