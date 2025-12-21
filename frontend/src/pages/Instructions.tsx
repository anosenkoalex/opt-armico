import { useState, useContext, createContext, ReactNode } from 'react';
import { Layout, Typography, Card, Menu, Space, Form, Input, Select, Checkbox, Button } from 'antd';

const { Sider, Content } = Layout;
const { Title, Paragraph, Text } = Typography;

type Role = 'admin' | 'user';

type SectionKey =
  | 'overview'
  | 'login'
  | 'dashboard'
  | 'users'
  | 'workplaces'
  | 'assignments'
  | 'planner'
  | 'statistics'
  | 'faq'
  | 'reference';

interface Section {
  key: SectionKey;
  menuLabel: string;
  title: string;
  description: string;
  body: JSX.Element;
  screenshotNote?: string;
}

const SectionNavContext = createContext<(key: SectionKey) => void>(() => {});

interface OpenSectionButtonProps {
  target: SectionKey;
  children: ReactNode;
}

const OpenSectionButton = ({ target, children }: OpenSectionButtonProps) => {
  const openSection = useContext(SectionNavContext);

  return (
    <Button
      type="link"
      size="small"
      style={{ padding: 0 }}
      onClick={() => openSection(target)}
    >
      {children}
    </Button>
  );
};

const adminSections: Section[] = [
  {
    key: 'overview',
    menuLabel: '1. Общее описание системы',
    title: 'Общее описание системы Grant Thornton CRM',
    description:
      'Краткое описание того, для чего используется Grant Thornton CRM: сотрудники, рабочие места, график, отчётные часы и административные функции.',
    body: (
      <>
        <Paragraph>
          <Text strong>Grant Thornton CRM</Text> — внутренняя система учёта и
          управления:
        </Paragraph>
        <ul>
          <li>сотрудниками и их ролями (администратор, менеджер, пользователь);</li>
          <li>рабочими местами (проекты, точки, компании, офисы);</li>
          <li>назначениями сотрудников на рабочие места и их сменами;</li>
          <li>фактически отработанными часами (отчёты сотрудников по дням);</li>
          <li>статистикой и сводками по сотрудникам и объектам.</li>
        </ul>

        <Title level={4}>Основные разделы админской части</Title>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 900,
              borderRadius: 12,
              border: '1px solid #f0f0f0',
            }}
            bodyStyle={{ padding: 20 }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 12,
              }}
            >
              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text strong>Пользователи</Text>
                <Paragraph style={{ marginBottom: 4, marginTop: 4 }}>
                  Список сотрудников, роли и доступы.
                </Paragraph>
                <OpenSectionButton target="users">Открыть раздел</OpenSectionButton>
              </div>
              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text strong>Рабочие места</Text>
                <Paragraph style={{ marginBottom: 4, marginTop: 4 }}>
                  Объекты, точки, проекты для назначения людей.
                </Paragraph>
                <OpenSectionButton target="workplaces">Открыть раздел</OpenSectionButton>
              </div>
              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text strong>Назначения</Text>
                <Paragraph style={{ marginBottom: 4, marginTop: 4 }}>
                  Привязка сотрудников к рабочим местам и сменам.
                </Paragraph>
                <OpenSectionButton target="assignments">Открыть раздел</OpenSectionButton>
              </div>
              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text strong>Планировщик</Text>
                <Paragraph style={{ marginBottom: 4, marginTop: 4 }}>
                  Наглядный календарь смен по людям и объектам.
                </Paragraph>
                <OpenSectionButton target="planner">Открыть раздел</OpenSectionButton>
              </div>
              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text strong>Моё расписание</Text>
                <Paragraph style={{ marginBottom: 4, marginTop: 4 }}>
                  Личный кабинет сотрудника: смены, запросы, отчёты по часам.
                </Paragraph>
                <OpenSectionButton target="mySchedule">Открыть раздел</OpenSectionButton>
              </div>
              <div
                style={{
                  border: '1px solid #f0f0f0',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <Text strong>Статистика</Text>
                <Paragraph style={{ marginBottom: 4, marginTop: 4 }}>
                  Сводка по часам и сменам, сравнение плана и факта.
                </Paragraph>
                <OpenSectionButton target="statistics">Открыть раздел</OpenSectionButton>
              </div>
            </div>
          </Card>
        </div>

        <ul>
          <li>
            <Text strong>Главная</Text> — приветствие и обзор, точка входа после
            авторизации для администратора/менеджера.
          </li>
          <li>
            <Text strong>Пользователи</Text> — создание и управление сотрудниками,
            назначение ролей, сброс паролей.
          </li>
          <li>
            <Text strong>Рабочие места</Text> — список точек/проектов, куда назначаются
            сотрудники.
          </li>
          <li>
            <Text strong>Назначения и Планировщик</Text> — управление графиком и сменами.
          </li>
          <li>
            <Text strong>Моё расписание</Text> — личный кабинет сотрудника (для роли USER),
            где он видит свои смены и заполняет отчёты по часам.
          </li>
          <li>
            <Text strong>Статистика</Text> — отчёты по часам и сменам по сотрудникам и
            рабочим местам, включая отчётные часы.
          </li>
          <li>
            <Text strong>Запросы корректировок</Text> — список запросов сотрудников на
            изменение расписания.
          </li>
          <li>
            <Text strong>Dev-панель</Text> — служебные инструменты (используется только
            разработчиком/техподдержкой).
          </li>
        </ul>

        <Title level={4}>Типичный процесс работы</Title>
        <ol>
          <li>Администратор создаёт сотрудников и рабочие места.</li>
          <li>Через «Планировщик» формируется график смен по сотрудникам.</li>
          <li>Сотрудники видят свои смены в «Моём расписании» и отчитываются по часам.</li>
          <li>Администратор контролирует и анализирует данные в «Статистике».</li>
          <li>
            При необходимости обрабатываются запросы на корректировку смен и назначений.
          </li>
        </ol>
      </>
    ),
    screenshotNote:
      'Скрин общей главной страницы (Dashboard) + общий вид бокового меню с разделами.',
  },
  {
    key: 'login',
    menuLabel: '2. Вход в систему и роли',
    title: 'Вход в систему и роли пользователей',
    description:
      'Как зайти в систему, как работает редирект по ролям и что видит каждый тип пользователя.',
    body: (
      <>
        <Title level={4}>Страница входа</Title>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 420,
              borderRadius: 12,
              border: '1px solid #f0f0f0',
              boxShadow: '0 12px 24px rgba(0,0,0,0.08)',
            }}
            bodyStyle={{ padding: 24 }}
          >
            <Title level={5} style={{ textAlign: 'center', marginBottom: 16 }}>
              Вход в Grant Thornton CRM
            </Title>
            <Form layout="vertical">
              <Form.Item label="E-mail">
                <Input placeholder="user@example.com" />
              </Form.Item>
              <Form.Item label="Пароль">
                <Input.Password placeholder="Введите пароль" />
              </Form.Item>
              <Form.Item>
                <Checkbox>Запомнить меня</Checkbox>
              </Form.Item>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 8,
                }}
              >
                <Button type="link" size="small" style={{ padding: 0 }}>
                  Забыли пароль?
                </Button>
                <Button type="primary">Войти</Button>
              </div>
            </Form>
          </Card>
        </div>

        <Paragraph>
          Вход в систему Grant Thornton CRM осуществляется по адресу, который выдали
          администраторы (например:{' '}
          <Text code>https://grant-thornton.online</Text>).
        </Paragraph>
        <ul>
          <li>
            Пользователь вводит <Text strong>e-mail</Text> и <Text strong>пароль</Text>.
          </li>
          <li>При успешном входе система определяет роль пользователя.</li>
          <li>
            В зависимости от роли выполняется автоматический переход на нужную страницу.
          </li>
        </ul>

        <Title level={4}>Автоматический переход после входа</Title>
        <ul>
          <li>
            Роль <Text code>USER</Text> — сразу переадресуется в раздел{' '}
            <Text code>Моё расписание</Text>.
          </li>
          <li>
            Роли <Text code>MANAGER</Text> и <Text code>SUPER_ADMIN</Text> — на{' '}
            <Text code>Главную (Dashboard)</Text>.
          </li>
        </ul>

        <Title level={4}>Роли пользователей и права</Title>
        <ul>
          <li>
            <Text strong>SUPER_ADMIN</Text> — полный доступ ко всем разделам, включая
            Dev-панель и системные настройки.
          </li>
          <li>
            <Text strong>MANAGER</Text> — управление назначениями, планировщиком и
            статистикой, доступ к пользователям и рабочим местам (по договорённости).
          </li>
          <li>
            <Text strong>USER</Text> — доступ только к разделу «Моё расписание», заполнение
            отчётов по часам и просмотр личной статистики.
          </li>
        </ul>

        <Title level={4}>Главная (Dashboard)</Title>
        <Paragraph>
          После входа администратор/менеджер попадает на главную страницу (Dashboard), где
          в дальнейшем можно разместить:
        </Paragraph>
        <ul>
          <li>краткое приветствие;</li>
          <li>быстрые ссылки на основные разделы;</li>
          <li>виджеты или статистику «по верхам» (можно добавить в будущем).</li>
        </ul>
      </>
    ),
    screenshotNote:
      'Скрин страницы логина (форма входа) + скрин после входа для администратора (Dashboard).',
  },

{
  key: 'dashboard',
  menuLabel: '3. Главная (Dashboard)',
  title: 'Главная страница (Dashboard)',
  description:
    'Стартовая страница администратора и менеджера: сводные показатели и последние события.',
  body: (
    <>
      <Title level={4}>Кто видит Dashboard</Title>
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
        <Card
          style={{
            width: 980,
            borderRadius: 12,
            border: '1px solid #f0f0f0',
          }}
          bodyStyle={{ padding: 20 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <Card
                  style={{
                    flex: 1,
                    minWidth: 180,
                    borderRadius: 10,
                    border: '1px solid #f0f0f0',
                  }}
                  bodyStyle={{ padding: 12 }}
                >
                  <Text type="secondary">Активных назначений</Text>
                  <Title level={4} style={{ margin: 0 }}>
                    128
                  </Title>
                </Card>
                <Card
                  style={{
                    flex: 1,
                    minWidth: 180,
                    borderRadius: 10,
                    border: '1px solid #f0f0f0',
                  }}
                  bodyStyle={{ padding: 12 }}
                >
                  <Text type="secondary">Сотрудников</Text>
                  <Title level={4} style={{ margin: 0 }}>
                    42
                  </Title>
                </Card>
                <Card
                  style={{
                    flex: 1,
                    minWidth: 180,
                    borderRadius: 10,
                    border: '1px solid #f0f0f0',
                  }}
                  bodyStyle={{ padding: 12 }}
                >
                  <Text type="secondary">Рабочих мест</Text>
                  <Title level={4} style={{ margin: 0 }}>
                    15
                  </Title>
                </Card>
              </div>
              <Card
                style={{
                  borderRadius: 10,
                  border: '1px solid #f0f0f0',
                }}
                bodyStyle={{ padding: 12 }}
              >
                <Text strong>Последние события</Text>
                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <div style={{ padding: '4px 0' }}>
                    Иванов Иван назначен на OFFICE-01 с 01.03.2025
                  </div>
                  <div style={{ padding: '4px 0' }}>
                    Запрос на корректировку от Петрова Петра одобрен
                  </div>
                  <div style={{ padding: '4px 0' }}>
                    Создано новое рабочее место: REMOTE-01 — Удалённый проект
                  </div>
                </div>
              </Card>
            </div>
            <div>
              <Card
                style={{
                  borderRadius: 10,
                  border: '1px solid #f0f0f0',
                }}
                bodyStyle={{ padding: 12 }}
              >
                <Text strong>Пример вида для MANAGER</Text>
                <Paragraph style={{ marginTop: 8, fontSize: 13 }}>
                  Для менеджера можно оставить только ленту событий без больших карточек
                  показателей. Это делает интерфейс проще и фокусирует внимание на
                  ежедневных изменениях.
                </Paragraph>
              </Card>
            </div>
          </div>
        </Card>
      </div>

      <ul>
        <li>
          Роль <Text code>USER</Text> не имеет доступа к Dashboard и после входа
          автоматически перенаправляется в раздел <Text strong>«Моё расписание»</Text>.
        </li>
        <li>
          Роли <Text code>MANAGER</Text> и <Text code>SUPER_ADMIN</Text> попадают на
          Dashboard сразу после входа.
        </li>
      </ul>

      <Title level={4}>Dashboard для SUPER_ADMIN</Title>
      <Paragraph>
        Для администратора отображаются карточки со сводными показателями и блок
        «Последние события».
      </Paragraph>
      <ul>
        <li>
          <Text strong>Активные назначения</Text> — количество действующих назначений.
          Клик ведёт в раздел <Text code>Назначения</Text>.
        </li>
        <li>
          <Text strong>Сотрудники</Text> — общее количество пользователей. Клик ведёт
          в раздел <Text code>Пользователи</Text>.
        </li>
        <li>
          <Text strong>Рабочие места</Text> — количество рабочих мест (объектов). Клик
          ведёт в раздел <Text code>Рабочие места</Text>.
        </li>
      </ul>

      <Title level={4}>Последние события</Title>
      <Paragraph>
        В блоке «Последние события» отображается лента обновлений (назначения,
        корректировки, изменения справочников). Клик по событию переводит в
        соответствующий раздел системы.
      </Paragraph>

      <Title level={4}>Dashboard для MANAGER</Title>
      <Paragraph>
        Для менеджера показывается упрощённая лента событий (Feed) без карточек
        сводных показателей администратора.
      </Paragraph>
    </>
  ),
  screenshotNote:
    'Скрин Dashboard для SUPER_ADMIN (карточки + последние события). Скрин Dashboard для MANAGER (лента Feed).',
},
  {
    key: 'users',
    menuLabel: '4. Пользователи',
    title: 'Раздел «Пользователи»',
    description:
      'Создание и управление сотрудниками: ФИО, контакты, роли и быстрый просмотр, есть ли у человека активные назначения.',
    body: (
      <>
        <Title level={4}>Кто видит раздел «Пользователи»</Title>
        <Paragraph>
          Раздел доступен только администраторам с ролью{' '}
          <Text code>SUPER_ADMIN</Text>. Если зайти под обычным сотрудником или
          менеджером, система покажет страницу «Нет доступа» (ошибка 403).
        </Paragraph>

        <Title level={4}>Общий вид и верхняя панель</Title>
        <Paragraph>
          Вверху страницы отображаются заголовок и кнопка создания пользователя:
        </Paragraph>
        <ul>
          <li>
            <Text strong>Заголовок</Text> — название раздела, обычно «Пользователи».
          </li>
          <li>
            <Text strong>Кнопка «Добавить пользователя»</Text> — открывает окно
            создания нового сотрудника.
          </li>
        </ul>

        <Title level={4}>Фильтры над таблицей</Title>
        <Paragraph>Под заголовком находятся фильтры, которые сразу обновляют список:</Paragraph>
        <ul>
          <li>
            <Text strong>Фильтр по роли</Text> — выпадающий список с ролями{' '}
            <Text code>USER</Text> (обычный сотрудник) и{' '}
            <Text code>MANAGER</Text> (менеджер). Пользователи с ролью
            администратора (<Text code>SUPER_ADMIN</Text>) в таблицу не попадают.
          </li>
          <li>
            <Text strong>Поиск</Text> — строка поиска по имени или e-mail. Позволяет
            быстро найти нужного человека и содержит кнопку очистки ввода.
          </li>
        </ul>
        <Paragraph>
          При изменении фильтров или строки поиска список автоматически обновляется,
          а пагинация возвращается на первую страницу.
        </Paragraph>

        <Title level={4}>Список пользователей (таблица)</Title>
        <Paragraph>
          В таблице показаны все пользователи, кроме администраторов (<Text code>SUPER_ADMIN</Text>).
          Это сделано для того, чтобы случайно не удалить технические учётные записи.
        </Paragraph>
        <Paragraph>Основные колонки таблицы:</Paragraph>
        <ul>
          <li>
            <Text strong>ФИО</Text> — отображается полное имя сотрудника. Если
            ФИО ещё не заполнено, вместо него показывается e-mail пользователя.
          </li>
          <li>
            <Text strong>E-mail</Text> — основной логин пользователя. На этот адрес
            уходят письма с паролем и уведомления.
          </li>
          <li>
            <Text strong>Телефон</Text> — контактный номер. Если номер не указан,
            отображается прочерк «—».
          </li>
          <li>
            <Text strong>Роль</Text> — показывается в понятном виде:
            «Сотрудник», «Менеджер» или «Администратор».
          </li>
        </ul>
        <Paragraph>
          Для удобства администрирования система подсвечивает тех сотрудников, у
          которых ещё нет активных назначений:
        </Paragraph>
        <ul>
          <li>
            если у обычного сотрудника нет ни одного текущего назначения, его
            имя подсвечивается зелёным цветом, а рядом появляется зелёный тег{' '}
            <Text strong>«Нет назначений»</Text>;
          </li>
          <li>
            это быстрый способ понять, кого ещё не поставили ни на один объект
            или проект.
          </li>
        </ul>

        <Title level={4}>Действия с пользователем</Title>
        <Paragraph>
          В последней колонке таблицы находятся кнопки действий. Они позволяют
          управлять конкретным сотрудником:
        </Paragraph>
        <ul>
          <li>
            <Text strong>«Редактировать»</Text> — открывает окно редактирования
            пользователя с уже заполненными полями (ФИО, e-mail, роль, телефон).
            После изменения данных нужно нажать «Сохранить», и запись обновится
            в таблице.
          </li>
          <li>
            <Text strong>«Отправить пароль»</Text> — отправляет сотруднику письмо
            с доступом на его e-mail. После нажатия система покажет уведомление,
            получилось отправить письмо или произошла ошибка.
          </li>
          <li>
            <Text strong>«Удалить»</Text> — открывает окно с подтверждением. Если
            вы подтверждаете удаление, пользователь удаляется из списка, а таблица
            автоматически обновляется.
          </li>
        </ul>

        <Title level={4}>Пример: модальное окно создания сотрудника</Title>
        <Paragraph>
          Ниже показан пример того, как выглядит окно создания нового сотрудника
          в интерфейсе. В реальной системе это стандартная форма, здесь она
          приведена как статический макет для ориентира.
        </Paragraph>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 480,
              boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
              borderRadius: 12,
              border: '1px solid #f0f0f0',
            }}
            bodyStyle={{ padding: 24 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <Title level={5} style={{ margin: 0 }}>
                Создать сотрудника
              </Title>
              <span style={{ fontSize: 18, opacity: 0.4 }}>×</span>
            </div>
            <Form layout="vertical">
              <Form.Item label="ФИО">
                <Input placeholder="Например, Иванов Иван Иванович" />
              </Form.Item>
              <Form.Item label="E-mail">
                <Input placeholder="user@example.com" />
              </Form.Item>
              <Form.Item label="Роль">
                <Select
                  placeholder="Выберите роль"
                  options={[
                    { label: 'Сотрудник (USER)', value: 'USER' },
                    { label: 'Менеджер (MANAGER)', value: 'MANAGER' },
                    { label: 'Администратор (SUPER_ADMIN)', value: 'SUPER_ADMIN' },
                  ]}
                />
              </Form.Item>
              <Form.Item>
                <Checkbox defaultChecked>
                  Отправить письмо с паролем на указанный e-mail
                </Checkbox>
              </Form.Item>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <Button>Отмена</Button>
                <Button type="primary">Сохранить</Button>
              </div>
            </Form>
          </Card>
        </div>
      </>
    ),
    screenshotNote:
      '1) Скрин списка пользователей с фильтрами и тегом «Нет назначений». 2) Скрин модального окна создания/редактирования пользователя.',
  },
  {
    key: 'workplaces',
    menuLabel: '5. Рабочие места',
    title: 'Раздел «Рабочие места»',
    description:
      'Создание, редактирование и управление рабочими местами, просмотр назначений по месту и работа с цветовой маркировкой.',
    body: (
      <>
        <Title level={4}>Назначение раздела</Title>
        <Paragraph>
          Раздел <Text strong>«Рабочие места»</Text> служит для описания точек, где сотрудники
          могут работать: филиалы, локации, проекты, сменные посты и т.д. Каждое рабочее место
          может иметь свои назначения сотрудников и собственный цвет для визуального
          отличия в графиках.
        </Paragraph>

        <Title level={4}>Доступ к разделу</Title>
        <Paragraph>
          Раздел доступен только администраторам (обычно роли <Text strong>SUPER_ADMIN</Text>).
          При отсутствии организации или прав доступа пользователь увидит служебное сообщение
          вместо таблицы рабочих мест.
        </Paragraph>

        <Title level={4}>Список рабочих мест</Title>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 720,
              borderRadius: 12,
              border: '1px solid #f0f0f0',
            }}
            bodyStyle={{ padding: 16 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <Input
                placeholder="Поиск по коду или названию"
                style={{ maxWidth: 260 }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <Select
                  placeholder="Статус"
                  style={{ width: 160 }}
                  options={[
                    { label: 'Все', value: 'all' },
                    { label: 'Активные', value: 'active' },
                    { label: 'Архивные', value: 'archived' },
                  ]}
                />
                <Button type="primary">Создать рабочее место</Button>
              </div>
            </div>
            <div
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflow: 'hidden',
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 120px 80px',
                  background: '#fafafa',
                  padding: '8px 12px',
                  fontWeight: 500,
                }}
              >
                <span>Код</span>
                <span>Название</span>
                <span>Статус</span>
                <span style={{ textAlign: 'right' }}>Действия</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 1fr 120px 80px',
                  padding: '8px 12px',
                  borderTop: '1px solid #f0f0f0',
                  cursor: 'pointer',
                }}
              >
                <span>OFFICE-01</span>
                <span>Офис на Абая</span>
                <span>Активно</span>
                <span style={{ textAlign: 'right' }}>
                  <Button type="link" size="small">
                    Открыть
                  </Button>
                </span>
              </div>
            </div>
          </Card>
        </div>

        <Paragraph>В основной таблице отображается список всех рабочих мест организации:</Paragraph>
        <ul>
          <li>
            <Text strong>Поиск по названию/коду</Text> — строка поиска для быстрого
            нахождения нужного рабочего места по части кода или названия.
          </li>
          <li>
            <Text strong>Фильтр по статусу</Text> — позволяет скрывать архивные/неактивные
            места, оставляя только актуальные.
          </li>
          <li>
            <Text strong>Основные столбцы</Text>: Код, Название, Статус, Цвет (иконка или сам цвет)
            и Действия.
          </li>
          <li>
            <Text strong>Клик по строке</Text> (если не попадать по кнопкам/ссылкам внутри) открывает
            модальное окно с назначениями на это рабочее место — это быстрый способ посмотреть,
            кто и когда здесь работает, без перехода в другие разделы.
          </li>
        </ul>

        <Title level={4}>Создание/редактирование рабочего места</Title>
        <Paragraph>
          По кнопке <Text strong>«Создать рабочее место»</Text> открывается форма с полями:
        </Paragraph>
        <ul>
          <li>
            <Text strong>Код</Text> — уникальный короткий идентификатор места (латиница/цифры).
            Используется в таблицах и в заголовках модалок, например <Text code>CODE — Название</Text>.
          </li>
          <li>
            <Text strong>Название</Text> — человекочитаемое название рабочего места (филиал, проект и т.д.).
          </li>
          <li>
            <Text strong>Статус</Text> — активно/архив. Архивные места не используются для новых назначений,
            но остаются в истории и статистике.
          </li>
          <li>
            <Text strong>Цвет рабочего места</Text> — выбирается через color‑picker (поле с выбором цвета).
            Этот цвет используется для визуального отличия рабочего места в графиках и планировщике
            (блоки/ячейки по этому месту будут подсвечены выбранным цветом).
          </li>
        </ul>
        <Paragraph>
          При редактировании рабочего места администратор может изменить название, цвет и статус.
          Изменение кода желательно делать только при необходимости, так как он может использоваться
          во внешних интеграциях или внутренних ссылках.
        </Paragraph>

        <Title level={4}>Действия в таблице рабочих мест</Title>
        <Paragraph>В столбце «Действия» доступны основные кнопки:</Paragraph>
        <ul>
          <li>
            <Text strong>«Открыть»</Text> — открывает модальное окно
            <Text strong>«Назначения на это рабочее место»</Text>. Это такой же эффект, как и
            клик по строке таблицы: можно быстро увидеть всех людей, назначенных на данное место,
            и их периоды работы.
          </li>
          <li>
            <Text strong>«Редактировать»</Text> — открывает форму редактирования выбранного рабочего места
            с уже заполненными полями (код, название, статус, цвет).
          </li>
          <li>
            <Text strong>«Удалить»</Text> (если предусмотрено) — переводит рабочее место в архив или
            удаляет его из активного списка. Полное удаление обычно не рекомендуется, чтобы не терять
            связь с прошлыми назначениями и статистикой.
          </li>
        </ul>

        <Title level={4}>Модальное окно «Назначения на это рабочее место»</Title>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 720,
              borderRadius: 12,
              boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
              border: '1px solid #f0f0f0',
            }}
            bodyStyle={{ padding: 16 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Title level={5} style={{ margin: 0 }}>
                Рабочее место: OFFICE-01 — Офис на Абая
              </Title>
              <span style={{ fontSize: 18, opacity: 0.4 }}>×</span>
            </div>
            <Paragraph style={{ marginBottom: 12 }}>
              Назначения на это рабочее место
            </Paragraph>
            <div
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflow: 'hidden',
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 110px 120px',
                  background: '#fafafa',
                  padding: '8px 12px',
                  fontWeight: 500,
                }}
              >
                <span>Сотрудник</span>
                <span>Период</span>
                <span>Статус</span>
                <span>Смены</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.4fr 1fr 110px 120px',
                  padding: '8px 12px',
                  borderTop: '1px solid #f0f0f0',
                }}
              >
                <span>Иванов Иван</span>
                <span>01.03.2025 → 31.03.2025</span>
                <span>Активно</span>
                <span>
                  12 дн. / 96 ч
                  <span style={{ opacity: 0.6, marginLeft: 4 }}>(наведите для деталей)</span>
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, fontSize: 12, opacity: 0.7 }}>
              Страница 1 из 3
            </div>
          </Card>
        </div>

        <Paragraph>
          По клику на строку рабочего места или кнопке <Text strong>«Открыть»</Text> открывается
          отдельное модальное окно со списком назначений, привязанных к этому месту.
        </Paragraph>
        <Paragraph>Структура модального окна:</Paragraph>
        <ul>
          <li>
            <Text strong>Заголовок</Text> вида <Text code>«Рабочее место: CODE — Название»</Text> —
            сразу видно, с каким местом сейчас работаем.
          </li>
          <li>
            <Text strong>Подзаголовок</Text> — текст о том, что ниже приведены назначения именно для
            этого рабочего места.
          </li>
          <li>
            <Text strong>Таблица назначений</Text> с колонками:
            <ul>
              <li>
                <Text strong>Сотрудник</Text> — ФИО или email сотрудника, назначенного на это место.
              </li>
              <li>
                <Text strong>Период</Text> — отображается интервал действия назначения
                (с даты по дату). Если в назначении есть детализированные смены, период может
                вычисляться по первой и последней смене.
              </li>
              <li>
                <Text strong>Статус</Text> — активное назначение или уже архивное.
              </li>
              <li>
                <Text strong>Смены</Text> — краткая сводка по сменам внутри назначения для этого места.
                Обычно показан текст вида <Text code>«N дн. / X ч»</Text>, где N — количество дней,
                а X — суммарное количество часов по всем сменам.
              </li>
            </ul>
          </li>
          <li>
            <Text strong>Детали смен (popover)</Text> — при наведении на сводку «Смены»
            открывается всплывающее окно со списком смен по датам:
            <ul>
              <li>каждый день отдельной строкой: дата, интервал времени (с–по) и тип смены;</li>
              <li>рядом могут отображаться часы по каждой смене и общий итог по назначению.</li>
            </ul>
            Это позволяет не уходить в раздел «Назначения», чтобы посмотреть, как именно
            сотрудник работает на этом месте по дням.
          </li>
          <li>
            <Text strong>Пагинация</Text> — если назначений на это место много, внизу модального окна
            есть переключатель страниц (страница / количество на странице). Менеджер может листать
            список назначений, не закрывая модалку.
          </li>
        </ul>

        <Title level={4}>Архивация рабочих мест</Title>
        <Paragraph>
          Если рабочее место временно не используется, его можно перевести в статус «архив».
          В этом случае оно:
        </Paragraph>
        <ul>
          <li>не доступно для новых назначений в разделах «Назначения» и «Планировщик»;</li>
          <li>продолжает отображаться в истории и статистике, если по нему были назначения;</li>
          <li>может быть возвращено в актив, если снова начинает использоваться.</li>
        </ul>
        <Paragraph>
          Полное удаление рабочих мест обычно не рекомендуется, так как это может разорвать связь
          с прошлыми назначениями и затруднить анализ статистики.
        </Paragraph>
      </>
    ),
    screenshotNote:
      'Рекомендуемые скрины: 1) Таблица рабочих мест с поиском, фильтром по статусу и кнопкой «Создать рабочее место». 2) Форма создания/редактирования рабочего места с полем выбора цвета. 3) Модальное окно «Рабочее место: CODE — Название» со списком назначений и popover по сменам. 4) Пример клика по строке рабочего места и открытия модалки.',
  },
  {
    key: 'assignments',
    menuLabel: '6. Назначения',
    title: 'Раздел «Назначения»',
    description:
      'Создание, редактирование и контроль назначений сотрудников, обработка запросов, корректировок и работа с корзиной.',
    body: (
      <>
        <Title level={4}>Назначение раздела</Title>
        <Paragraph>
          Раздел <Text strong>«Назначения»</Text> используется для управления тем, кто из
          сотрудников на каком рабочем месте работает, в какие даты и по какому графику.
          Здесь же обрабатываются заявки сотрудников на новые назначения и запросы на
          корректировку уже существующих назначений.
        </Paragraph>

        <Title level={4}>Доступ к разделу</Title>
        <Paragraph>
          Раздел доступен только ролям <Text strong>SUPER_ADMIN</Text> и{' '}
          <Text strong>MANAGER</Text>. Обычный сотрудник при попытке открыть страницу
          увидит сообщение об отсутствии прав (status 403).
        </Paragraph>

        <Title level={4}>Верхняя панель</Title>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 900,
              borderRadius: 12,
              border: '1px solid #f0f0f0',
            }}
            bodyStyle={{ padding: 16 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button type="default">Назначения</Button>
                <Button>Корзина</Button>
                <Button>Запросы на назначение (3)</Button>
                <Button>Запросы на корректировку (5)</Button>
              </div>
              <Button type="primary">Добавить назначение</Button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Select
                placeholder="Сотрудник"
                style={{ minWidth: 180 }}
                options={[{ label: 'Все сотрудники', value: 'all' }]}
              />
              <Select
                placeholder="Рабочее место"
                style={{ minWidth: 200 }}
                options={[{ label: 'Все места', value: 'all' }]}
              />
              <Select
                placeholder="Статус"
                style={{ minWidth: 140 }}
                options={[
                  { label: 'Только активные', value: 'active' },
                  { label: 'Только архивные', value: 'archived' },
                ]}
              />
              <Input placeholder="Фильтр по периоду / дате" style={{ minWidth: 220 }} />
              <div style={{ marginLeft: 'auto', fontSize: 13, opacity: 0.8 }}>
                Свободных сотрудников: <Text strong>4</Text>
                <Button type="link" size="small" style={{ paddingLeft: 4 }}>
                  Показать
                </Button>
              </div>
            </div>
          </Card>
        </div>

        <Paragraph>
          В верхней части страницы находятся основные переключатели и действия:
        </Paragraph>
        <ul>
          <li>
            <Text strong>«Назначения»</Text> — основной режим. Отображаются все действующие
            и архивные назначения. В этом режиме можно создавать и редактировать
            назначения, завершать их, уведомлять сотрудников и переходить к запросам
            корректировок.
          </li>
          <li>
            <Text strong>«Корзина»</Text> — режим просмотра удалённых назначений.
            В этом режиме недоступно создание и редактирование, но можно восстановить или
            окончательно удалить назначения, а также выгрузить их в Excel (CSV).
          </li>
          <li>
            <Text strong>«Запросы на назначение»</Text> — кнопка открывает отдельное окно
            для последовательной обработки заявок сотрудников на новые назначения.
            На кнопке отображается счётчик невыполненных запросов.
          </li>
          <li>
            <Text strong>«Запросы на корректировку»</Text> — кнопка с числом открытых
            запросов на изменение расписания. По клику переводит в отдельный раздел
            со списком всех запросов корректировки.
          </li>
          <li>
            <Text strong>«Добавить назначение»</Text> — доступно в режиме «Назначения».
            Открывает модальное окно создания нового назначения с выбором сотрудника,
            рабочего места, периода и графика смен.
          </li>
        </ul>

        <Title level={4}>Фильтры и индикатор свободных сотрудников</Title>
        <Paragraph>Под верхней панелью расположены фильтры и служебная информация:</Paragraph>
        <ul>
          <li>
            <Text strong>Фильтр по сотруднику</Text> — выпадающий список всех сотрудников
            с ролью USER. В подсказке для каждого показывается, сколько у него активных
            назначений (0 / 1 / 2+). При выборе фильтрует таблицу по выбранному сотруднику.
          </li>
          <li>
            <Text strong>Фильтр по рабочему месту</Text> — список активных рабочих мест.
            При выборе показывает только назначения по выбранному рабочему месту.
          </li>
          <li>
            <Text strong>Фильтр по статусу</Text> — позволяет отфильтровать{' '}
            <Text code>ACTIVE</Text> / <Text code>ARCHIVED</Text> в основном режиме.
          </li>
          <li>
            <Text strong>Фильтр по периоду</Text> — выбор диапазона дат и времени (с
            тайм-пикером). Ограничивает выборку назначений по пересечению с указанным
            периодом.
          </li>
          <li>
            Справа отображается строка вида{' '}
            <Text strong>«Свободных сотрудников: N»</Text>. Это сотрудники с ролью USER,
            у которых <Text strong>нет активных назначений</Text>. Рядом ссылка-кнопка{' '}
            <Text strong>«Показать»</Text> — открывает модальное окно со списком таких
            сотрудников (ФИО и email), чтобы менеджер мог быстро подобрать кого-то
            «свободного» для нового назначения.
          </li>
        </ul>

        <Title level={4}>Таблица назначений</Title>
        <Paragraph>В режиме «Назначения» таблица содержит следующие колонки:</Paragraph>
        <ul>
          <li>
            <Text strong>Сотрудник</Text> — ФИО или email сотрудника. Если у сотрудника
            в момент создания/редактирования уже есть два активных назначения, здесь
            может появиться оранжевый тег{' '}
            <Text code>«У сотрудника уже 2 активных назначения»</Text>, чтобы визуально
            предупредить менеджера.
          </li>
          <li>
            <Text strong>Рабочее место</Text> — отображается код и название в формате{' '}
            <Text code>CODE — Название</Text>.
          </li>
          <li>
            <Text strong>Период</Text> — дата начала и конца назначения в формате{' '}
            <Text code>DD.MM.YYYY → DD.MM.YYYY</Text>. Это кликабельная ссылка: при нажатии
            открывается модальное окно редактирования назначения.
          </li>
          <li>
            <Text strong>Статус</Text> — тег со значением <Text code>ACTIVE</Text> (зелёный)
            или <Text code>ARCHIVED</Text> (серый). Если по назначению есть хотя бы один
            PENDING-запрос на корректировку, рядом появляется дополнительный оранжевый тег{' '}
            <Text code>«Есть запрос корректировки»</Text>. По клику по соответствующей ссылке
            в действиях можно открыть отдельное окно сравнения графиков.
          </li>
          <li>
            <Text strong>Действия</Text> — набор ссылок:
            <ul>
              <li>
                <Text strong>«Редактировать»</Text> — открывает модальное окно
                редактирования выбранного назначения.
              </li>
              <li>
                <Text strong>«Завершить»</Text> — доступно для активных назначений.
                После подтверждения помечает назначение завершённым (ARCHIVED).
              </li>
              <li>
                <Text strong>«Уведомить»</Text> — доступно для активных назначений,
                у которых указан email сотрудника. Показывает подтверждающее окно с
                кратким описанием (кого и по какому месту уведомляем) и отправляет
                уведомление по email. Если email отсутствует, кнопка отключена.
              </li>
              <li>
                <Text strong>«Запрос корректировки»</Text> (или аналогичная подпись) —
                появляется, если по назначению существуют запросы корректировки. Открывает
                модалку сравнения исходного и предложенного графика.
              </li>
              <li>
                <Text strong>«Удалить»</Text> — доступно для архивных назначений.
                После подтверждения перемещает назначение в корзину (не окончательное удаление).
              </li>
            </ul>
          </li>
        </ul>

        <Title level={4}>Режим «Корзина»</Title>
        <Paragraph>
          В режиме <Text strong>«Корзина»</Text> таблица показывает только удалённые
          назначения. Вместо стандартных действий доступны:
        </Paragraph>
        <ul>
          <li>
            В каждой строке — ссылка <Text strong>«Восстановить»</Text>, которая
            возвращает назначение из корзины в основной список.
          </li>
          <li>
            Слева от строк работают чекбоксы множественного выбора. В верхней панели
            появляются дополнительные кнопки:
            <ul>
              <li>
                <Text strong>«Скачать выбранные»</Text> — выгружает только отмеченные
                назначения в CSV-файл (удобно как бэкап перед очисткой корзины).
              </li>
              <li>
                <Text strong>«Удалить выбранные»</Text> — безвозвратное удаление
                выбранных назначений из корзины.
              </li>
              <li>
                <Text strong>«Скачать и удалить»</Text> — сначала формирует CSV-файл
                с выбранными назначениями, затем сразу удаляет их из корзины.
              </li>
            </ul>
          </li>
        </ul>

        <Title level={4}>Модальное окно «Создать / редактировать назначение»</Title>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 900,
              borderRadius: 12,
              boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
              border: '1px solid #f0f0f0',
            }}
            bodyStyle={{ padding: 20 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Title level={5} style={{ margin: 0 }}>
                Назначение сотрудника
              </Title>
              <span style={{ fontSize: 18, opacity: 0.4 }}>×</span>
            </div>
            <Form layout="vertical">
              <Form.Item label="Сотрудник">
                <Select
                  placeholder="Выберите сотрудника"
                  options={[{ label: 'Иванов Иван', value: '1' }]}
                />
              </Form.Item>
              <Form.Item label="Рабочее место">
                <Select
                  placeholder="Выберите рабочее место"
                  options={[{ label: 'OFFICE-01 — Офис на Абая', value: 'OFFICE-01' }]}
                />
              </Form.Item>
              <Form.Item label="Период назначения">
                <Input placeholder="01.03.2025 → 31.03.2025" />
              </Form.Item>
              <Form.Item label="График смен по дням">
                <div
                  style={{
                    border: '1px solid #f0f0f0',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Input placeholder="Общее время: 09:00–18:00" style={{ maxWidth: 220 }} />
                    <Checkbox defaultChecked>Применить ко всем датам</Checkbox>
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '140px 1fr',
                      gap: 8,
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>01.03.2025</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Input placeholder="09:00–18:00" style={{ maxWidth: 160 }} />
                      <Select
                        style={{ minWidth: 160 }}
                        defaultValue="DEFAULT"
                        options={[
                          { label: 'Обычная смена', value: 'DEFAULT' },
                          { label: 'Офис', value: 'OFFICE' },
                          { label: 'Удалёнка', value: 'REMOTE' },
                          { label: 'Выходной / больничный', value: 'DAY_OFF' },
                        ]}
                      />
                      <Button size="small">Добавить интервал</Button>
                    </div>
                  </div>
                </div>
              </Form.Item>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <Button>Отмена</Button>
                <Button type="primary">Сохранить</Button>
              </div>
            </Form>
          </Card>
        </div>

        <Paragraph>
          Это базовая форма, которая используется как для создания нового назначения,
          так и для редактирования существующего. В режиме одобрения запроса на
          назначение она заполняется автоматически данными из заявки.
        </Paragraph>
        <ul>
          <li>
            <Text strong>Сотрудник</Text> — выпадающий список пользователей с ролью USER.
            В режиме одобрения запроса поле заблокировано и уже содержит инициатора заявки.
          </li>
          <li>
            <Text strong>Рабочее место</Text> — выбор рабочего места. В режиме одобрения
            заявки — предзаполнено и при необходимости может быть изменено вручную.
          </li>
          <li>
            <Text strong>Статус</Text> — по умолчанию ACTIVE. При одобрении запроса
            статус фиксируется как активный.
          </li>
          <li>
            <Text strong>Период</Text> — выбор диапазона дат (без времени). При изменении
            диапазона автоматически пересобирается список дат в блоке «График смен».
            В режиме одобрения запроса период уже заполнен по данным заявки.
          </li>
        </ul>
        <Paragraph>
          Ниже расположен блок <Text strong>«График смен по дням»</Text>:
        </Paragraph>
        <ul>
          <li>
            Вверху — общий тайм-пикер для всех дней и чекбокс «Применить ко всем датам».
            При выборе времени и включённом чекбоксе указанный интервал копируется во
            все дни внизу.
          </li>
          <li>
            Для каждого дня из выбранного диапазона создаётся секция с датой и списком
            интервалов. Внутри:
            <ul>
              <li>Интервалы времени (RangePicker по времени).</li>
              <li>
                Тип смены — выпадающий список: «Обычная смена», «Офис», «Удалёнка»,
                «Day off / больничный».
              </li>
              <li>
                Кнопка «Добавить интервал» — добавляет ещё один промежуток в течение дня.
              </li>
              <li>
                Кнопка «Удалить» рядом с интервалом — удаляет конкретный интервал
                (если интервалов несколько).
              </li>
            </ul>
          </li>
          <li>
            При сохранении система собирает общий диапазон startsAt/endsAt и массив смен
            по дням. Если ни один день не содержит заполненных интервалов, сохранение
            не разрешается.
          </li>
        </ul>

        <Title level={4}>Обработка «Запросов на назначение»</Title>
        <Paragraph>
          Кнопка «Запросы на назначение» открывает отдельное модальное окно, внутри
          которого запросы показываются по одному:
        </Paragraph>
        <ul>
          <li>
            Сверху выводится счётчик вида «Запрос 1 из N» и стрелки для переключения
            между заявками (если их несколько).
          </li>
          <li>
            В карточке запроса показываются: сотрудник, рабочее место, период
            (с даты по дату) и список предложенных интервалов по дням (если сотрудник
            их указал в комментарии).
          </li>
          <li>
            Кнопка «Одобрить» закрывает это окно и открывает модалку назначения,
            предзаполненную данными из заявки (сотрудник, рабочее место, период,
            интервалы смен).
          </li>
          <li>
            Кнопка «Отказать» открывает подтверждение и при согласии помечает запрос
            как отклонённый без создания назначения. Заявка исчезает из списка.
          </li>
          <li>
            Если сервер сообщает, что запрос уже был обработан (например, другим менеджером),
            система локально убирает его из списка и показывает соответствующее уведомление.
          </li>
        </ul>

        <Title level={4}>Модалка запросов корректировок по назначению</Title>
        <Paragraph>
          При наличии запросов на корректировку по конкретному назначению в таблице
          действий появляется отдельная ссылка, открывающая модалку сравнения графиков.
        </Paragraph>
        <Paragraph>
          В этой модалке для выбранного назначения отображаются две колонки:
        </Paragraph>
        <ul>
          <li>
            «Назначенный график (было)» — по датам выводятся интервалы, которые сейчас
            закреплены за сотрудником: время и статус смены.
          </li>
          <li>
            «Предложенная корректировка (стало)» — по тем же датам показываются
            интервалы и статусы, которые сотрудник предлагает в запросах. Если по дате
            нет изменений — явно показывается, что изменений нет.
          </li>
        </ul>
        <Paragraph>
          Ниже выводится краткое текстовое резюме того, по каким датам сотрудник менял
          только время, только статус или и то, и другое. Внизу две кнопки:
        </Paragraph>
        <ul>
          <li>«Одобрить» — последовательно одобряет все отображаемые запросы.</li>
          <li>«Отклонить» — последовательно отклоняет все запросы.</li>
        </ul>
      </>
    ),
    screenshotNote:
      'Рекомендуемые скрины: 1) Общий вид раздела «Назначения» с фильтрами и верхней панелью. 2) Индикатор «Свободных сотрудников» и модалка со списком. 3) Таблица назначений с тегом «Есть запрос корректировки». 4) Модалка создания/редактирования назначения с блоком «График смен по дням». 5) Окно «Запросы на назначение» с карточкой заявки. 6) Модалка сравнения графика при запросах корректировки. 7) Режим «Корзина» с массовыми действиями (скачать / удалить / скачать и удалить).',
  },
  {
    key: 'planner',
    menuLabel: '7. Планировщик и «Моё расписание»',
    title: 'Планировщик и личный кабинет сотрудника «Моё расписание»',
    description:
      'Как администратор видит общий график, а сотрудник — свою страницу «Моё расписание» с графиком, запросами и личной статистикой.',
    body: (
      <>
        <Title level={4}>1. Личный кабинет сотрудника — «Моё расписание»</Title>
        <Paragraph>
          Страница <Text strong>«Моё расписание»</Text> — это личный кабинет сотрудника.
          Здесь собраны:
        </Paragraph>
        <ul>
          <li>его текущие назначения и рабочее место;</li>
          <li>запрос на новое назначение;</li>
          <li>запрос на корректировку уже существующего графика;</li>
          <li>отчёт по фактически отработанным часам;</li>
          <li>мини-планировщик со всеми сотрудниками;</li>
          <li>личная статистика по часам и дням.</li>
        </ul>

        <Title level={5}>Карточка «Моё расписание»</Title>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 900,
              borderRadius: 12,
              border: '1px solid #f0f0f0',
            }}
            bodyStyle={{ padding: 20 }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <Title level={5} style={{ margin: 0 }}>
                Моё расписание
              </Title>
              <Button type="link" size="small">
                Сменить пароль
              </Button>
            </div>
            <Paragraph style={{ marginBottom: 12 }}>
              Текущее рабочее место: <Text strong>OFFICE-01 — Офис на Абая</Text>
            </Paragraph>
            <div
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflow: 'hidden',
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 120px 160px',
                  background: '#fafafa',
                  padding: '8px 12px',
                  fontWeight: 500,
                }}
              >
                <span>Рабочее место</span>
                <span>Интервал</span>
                <span>Статус</span>
                <span>Действия</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 120px 160px',
                  padding: '8px 12px',
                  borderTop: '1px solid #f0f0f0',
                }}
              >
                <span>OFFICE-01 — Офис на Абая</span>
                <span>
                  <Button type="link" size="small" style={{ padding: 0 }}>
                    01.03.2025 → 31.03.2025
                  </Button>
                </span>
                <span>Активно</span>
                <span>
                  <Button type="link" size="small">
                    Запросить корректировку расписания
                  </Button>
                </span>
              </div>
            </div>
          </Card>
        </div>

        <Paragraph>
          В верхнем блоке страницы отображается карточка <Text strong>«Моё расписание»</Text>.
          В правой части заголовка есть кнопка{' '}
          <Text strong>«Сменить пароль»</Text>, которая открывает модалку смены пароля.
        </Paragraph>
        <Paragraph>Содержимое карточки зависит от того, привязан ли сотрудник к рабочему месту:</Paragraph>
        <ul>
          <li>
            Если сотрудник привязан к рабочему месту — показывается блок
            <Text strong>«Текущее рабочее место»</Text> с кодом и названием.
          </li>
          <li>
            Ниже — таблица его назначений с колонками:
            <ul>
              <li>
                <Text strong>Рабочее место</Text> — название (или идентификатор, если названия нет).
              </li>
              <li>
                <Text strong>Интервал</Text> — кнопка-ссылка с диапазоном дат назначения. По клику
                открывается модалка <Text strong>«Детали назначения»</Text>.
              </li>
              <li>
                <Text strong>Статус</Text> — цветной тег: Активно / Архив / Ожидает / Отклонено.
              </li>
              <li>
                <Text strong>Действия по назначению</Text> — для активных назначений доступна
                кнопка <Text strong>«Запросить корректировку расписания»</Text>.
              </li>
            </ul>
          </li>
          <li>
            Строки таблицы кликабельны: по клику на строку или на интервал открывается модалка
            с детальным расписанием по дням.
          </li>
          <li>
            Если назначений пока нет — показывается информационный экран с подсказкой обратиться
            к администратору.
          </li>
          <li>
            Если сотрудник вообще не привязан к рабочему месту — вместо таблицы выводится
            сообщение: <Text strong>«Вы не привязаны к рабочему месту»</Text>.
          </li>
        </ul>

        <Title level={5}>Модалка «Детали назначения»</Title>
        <Paragraph>
          Открывается при клике по строке назначения или по ссылке в колонке «Интервал».
          В заголовке указано название рабочего места.
        </Paragraph>
        <Paragraph>Внутри:</Paragraph>
        <ul>
          <li>список смен по дням в виде списка;</li>
          <li>для каждой строки — дата, время начала и конца смены, количество часов;</li>
          <li>смены отсортированы по дате и времени;</li>
          <li>если по назначению нет ни слотов, ни смен — показывается заглушка «Для этого назначения нет смен».</li>
        </ul>

        <Title level={5}>Модалка «Запрос на корректировку расписания»</Title>
        <Paragraph>
          Кнопка <Text strong>«Запросить корректировку расписания»</Text> доступна
          только для активных назначений. По нажатию открывается модалка, где сотрудник
          может предложить новые интервалы работы.
        </Paragraph>
        <ul>
          <li>
            Интервалы автоматически подставляются из текущего расписания (по слотам или сменам).
          </li>
          <li>
            Сотрудник может добавлять дни и дополнительные интервал(ы) внутри дня, менять время
            и тип смены (обычная, офис, удалёнка, выходной/больничный).
          </li>
          <li>
            Система не даёт отправить интервалы, у которых время окончания раньше времени начала.
          </li>
          <li>
            При отправке формируется понятный текстовый комментарий для администратора:
            по каждой дате указаны время и тип смены.
          </li>
        </ul>
        <Paragraph>
          После успешной отправки модалка закрывается, а запрос появляется на стороне
          администратора в разделе «Запросы корректировок».
        </Paragraph>

        <Title level={5}>Модалка смены пароля</Title>
        <Paragraph>
          Кнопка <Text strong>«Сменить пароль»</Text> в верхней карточке открывает модальное окно
          с формой:
        </Paragraph>
        <ul>
          <li>текущий пароль;</li>
          <li>новый пароль;</li>
          <li>подтверждение нового пароля.</li>
        </ul>
        <Paragraph>
          Перед отправкой система проверяет, что новый пароль совпадает с подтверждением.
          В случае ошибки выводится текстовое пояснение. При успехе пользователь видит сообщение
          об успешной смене пароля.
        </Paragraph>

        <Title level={4}>2. Блок «Запрос назначения»</Title>
        <Paragraph>
          Под основной карточкой расположен блок <Text strong>«Запрос назначения»</Text>.
          Он нужен, когда сотруднику нужно получить новое назначение или изменить рабочее место.
        </Paragraph>
        <ul>
          <li>
            Вверху — краткое описание, в каких случаях использовать запрос (нет назначений или
            требуется новое место).
          </li>
          <li>
            Если у пользователя уже есть запросы без решения — показывается информационный баннер
            с количеством таких запросов, а кнопка отправки нового запроса отключается.
          </li>
          <li>
            Если последний запрос был отклонён и с момента отклонения прошло не больше недели —
            показывается жёлтое предупреждение с датой отклонённого запроса. Пользователь может
            его закрыть; состояние запоминается в браузере.
          </li>
          <li>
            Кнопка <Text strong>«Запросить назначение»</Text> открывает модалку с формой
            запроса нового назначения.
          </li>
        </ul>

        <Title level={5}>Модалка «Запрос назначения»</Title>
        <Paragraph>
          Модальное окно <Text strong>«Запрос назначения»</Text> по структуре похоже на форму
          создания назначения у администратора, но работает как просьба от сотрудника.
        </Paragraph>
        <ul>
          <li>
            <Text strong>Рабочее место</Text> — выпадающий список активных мест. По умолчанию
            подставляется текущее место сотрудника (если есть) или первое доступное из списка.
          </li>
          <li>
            <Text strong>Период</Text> — выбор диапазона дат (RangePicker). По нему строится
            список дней, для которых сотрудник задаёт интервалы работы.
          </li>
          <li>
            <Text strong>Общий интервал времени</Text> — таймпикер «для всех дат».
            При включённой опции «Применить ко всем датам» система автоматически
            создаёт одинаковые интервалы для каждого дня выбранного периода.
          </li>
          <li>
            <Text strong>Дни и интервалы</Text> — ниже отображаются все дни периода.
            Для каждого дня можно:
            <ul>
              <li>изменить время начала и окончания смены;</li>
              <li>изменить тип смены (обычная, офис, удалёнка, выходной);</li>
              <li>добавить дополнительные интервалы на тот же день;</li>
              <li>удалить отдельный интервал.</li>
            </ul>
          </li>
          <li>
            При попытке отправки система проверяет, что для всех интервалов время окончания
            позже времени начала. Если есть ошибки — выводится предупреждение.
          </li>
          <li>
            Для администратора автоматически формируется текстовый комментарий со списком дат,
            интервалов и типов смен — он прикрепляется к запросу.
          </li>
        </ul>
        <Paragraph>
          После успешной отправки запрос появляется в разделе «Запросы на назначения»
          у администратора, а на карточке «Запрос назначения» у сотрудника видно, что
          запрос уже отправлен и находится на рассмотрении.
        </Paragraph>

        <Title level={4}>3. Блок «Отчёт по отработанным часам»</Title>
        <Paragraph>
          Рядом с «Запросом назначения» расположен блок <Text strong>«Отчёт по отработанным часам»</Text>.
          Здесь сотрудник фиксирует, сколько часов он фактически отработал в тот или иной день.
        </Paragraph>
        <ul>
          <li>
            В тексте подсказки объясняется, что отчёт нужно заполнять каждый рабочий день.
          </li>
          <li>
            Если на сегодня есть активные назначения — показывается тег с количеством назначений.
          </li>
          <li>
            Кнопка <Text strong>«Заполнить отчёт»</Text> открывает модалку с формой отчёта.
          </li>
        </ul>

        <Title level={5}>Модалка отчёта по часам</Title>
        <Paragraph>Форма максимально простая:</Paragraph>
        <ul>
          <li>
            <Text strong>Дата</Text> — по умолчанию подставляется сегодня. Можно выбрать любой день.
          </li>
          <li>
            <Text strong>Количество часов</Text> — числовое поле (в часах). Проверяется, что значение
            не отрицательное и корректно введено.
          </li>
          <li>
            При открытии модалки система подгружает ранее сохранённые отчёты за месяц выбранной даты
            и подставляет сохранённые часы (если для этого дня отчёт уже был).
          </li>
          <li>
            После сохранения данные отправляются на сервер, локально обновляются и используются
            в личной статистике (блок «Моя статистика»).
          </li>
        </ul>

        <Title level={4}>4. Мини-планировщик «График назначений (все сотрудники)»</Title>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 900,
              borderRadius: 12,
              border: '1px solid #f0f0f0',
            }}
            bodyStyle={{ padding: 16 }}
          >
            <div style={{ marginBottom: 12 }}>
              <Text strong>График назначений (все сотрудники)</Text>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '180px repeat(7, 1fr)',
                fontSize: 12,
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div style={{ background: '#fafafa', padding: 6 }}>Сотрудник</div>
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                <div key={d} style={{ background: '#fafafa', padding: 6, textAlign: 'center' }}>
                  {d}
                </div>
              ))}
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }}>Иванов Иван</div>
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ background: '#e6f7ff', borderRadius: 4, padding: '2px 4px' }}>
                  OFFICE-01
                </div>
              </div>
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ background: '#e6f7ff', borderRadius: 4, padding: '2px 4px' }}>
                  OFFICE-01
                </div>
              </div>
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }}>Петров Пётр</div>
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }}>
                <div style={{ background: '#fff7e6', borderRadius: 4, padding: '2px 4px' }}>
                  REMOTE-01
                </div>
              </div>
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
              <div style={{ padding: 6, borderTop: '1px solid #f0f0f0' }} />
            </div>
            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.8 }}>
              Цвет блока соответствует цвету рабочего места (настраивается в разделе «Рабочие места»).
            </div>
          </Card>
        </div>

        <Paragraph>
          Ниже на странице расположен компактный планировщик{' '}
          <Text strong>«График назначений (все сотрудники)»</Text>. Он показывает все активные
          назначения по сотрудникам за выбранный период.
        </Paragraph>
        <ul>
          <li>
            Слева — колонка с сотрудниками. Каждый сотрудник занимает строку, высота которой
            зависит от количества перекрывающихся назначений.
          </li>
          <li>
            Справа — сетка по дням. В каждой строке рисуются цветные блоки назначений.
          </li>
          <li>
            Цвет блока берётся из цвета рабочего места (настраивается в разделе «Рабочие места»).
          </li>
          <li>
            Если назначение длится несколько дней, блок растягивается на соответствующее число
            ячеек по горизонтали.
          </li>
          <li>
            Период для сетки подбирается автоматически по минимальной и максимальной дате
            назначений, но может быть изменён через выбор дат (в коде это делается автоматически,
            без отдельного UI-фильтра для пользователя).
          </li>
          <li>
            Назначения сотрудника всегда выводятся вверху списка (строка текущего пользователя
            поднимается выше остальных, чтобы он видел себя первым).
          </li>
        </ul>
        <Paragraph>
          Этот мини-планировщик позволяет сотруднику видеть не только свои смены, но и занятость
          других коллег по дням и рабочим местам.
        </Paragraph>

        <Title level={4}>5. Блок «Моя статистика»</Title>
        <Paragraph>
          Внизу страницы располагается блок <Text strong>«Моя статистика»</Text> — личный вид
          раздела статистики только для текущего пользователя.
        </Paragraph>
        <ul>
          <li>
            Сотрудник выбирает период (диапазон дат). Период нельзя оставить пустым — по умолчанию
            берётся текущий месяц.
          </li>
          <li>
            Система подтягивает агрегированные данные статистики только по этому пользователю.
          </li>
          <li>
            Показываются ключевые показатели: всего часов по сменам, всего отчётных часов,
            ориентировочное количество рабочих дней.
          </li>
          <li>
            Ниже — компактная таблица по одному сотруднику (самому пользователю) в формате,
            аналогичном разделу «Статистика».
          </li>
          <li>
            Если по выбранному периоду данных нет — выводится аккуратная заглушка «Нет данных».
          </li>
        </ul>

        <Paragraph>
          В результате страница <Text strong>«Моё расписание»</Text> полностью закрывает потребности
          обычного сотрудника: посмотреть свои назначения, запросить новое назначение или
          корректировку графика, передать фактические часы работы, увидеть общий график по коллегам
          и свою личную статистику.
        </Paragraph>
      </>
    ),
    screenshotNote:
      'Рекомендуемые скрины: 1) Верхняя часть «Моё расписание» с текущим рабочим местом и таблицей назначений. 2) Модалка «Детали назначения» с разбивкой по дням. 3) Модалка «Запрос на корректировку расписания». 4) Карточка и модалка «Запрос назначения». 5) Карточка и модалка «Отчёт по отработанным часам». 6) Мини-планировщик «График назначений (все сотрудники)». 7) Блок «Моя статистика» с выбранным периодом и суммарными часами.',
  },
  {
    key: 'statistics',
    menuLabel: '8. Статистика и отчётные часы',
    title: 'Раздел «Статистика» и отчётные часы',
    description:
      'Как смотреть сводку по часам и сменам, чем отличаются часы по сменам от отчётных часов WorkReport и как пользоваться фильтрами, детализацией и календарём.',
    body: (
      <>
        <Title level={4}>Общий смысл раздела</Title>
        <Paragraph>
          Раздел <Text strong>«Статистика назначений»</Text> показывает сводку по
          сотрудникам за выбранный период:
        </Paragraph>
        <ul>
          <li>сколько дней сотрудник работал;</li>
          <li>сколько часов набежало по сменам (из назначений);</li>
          <li>сколько часов сотрудник сам отчитался в таблице «Отчёт по часам»;</li>
          <li>по каким рабочим местам и в какие диапазоны дат были назначения.</li>
        </ul>

        <Title level={4}>Фильтры в верхней части страницы</Title>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16, marginBottom: 24 }}>
          <Card
            style={{
              width: 900,
              borderRadius: 12,
              border: '1px solid #f0f0f0',
            }}
            bodyStyle={{ padding: 16 }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              <Select placeholder="Сотрудник" style={{ minWidth: 200 }} />
              <Select placeholder="Рабочее место" style={{ minWidth: 220 }} />
              <Input placeholder="Период: 01.03.2025 → 31.03.2025" style={{ minWidth: 260 }} />
              <Select
                placeholder="Тип смены"
                style={{ minWidth: 160 }}
                options={[
                  { label: 'Все смены', value: 'all' },
                  { label: 'Обычные', value: 'DEFAULT' },
                  { label: 'Офис', value: 'OFFICE' },
                  { label: 'Удалёнка', value: 'REMOTE' },
                  { label: 'Выходные / больничные', value: 'DAY_OFF' },
                ]}
              />
              <Button type="primary">Показать</Button>
            </div>
            <div
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                overflow: 'hidden',
                fontSize: 13,
              }}
            >
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 140px 140px 140px',
                  background: '#fafafa',
                  padding: '8px 12px',
                  fontWeight: 500,
                }}
              >
                <span>Сотрудник</span>
                <span>Часы по сменам</span>
                <span>Часы по отчётам</span>
                <span>Дней работы</span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 140px 140px 140px',
                  padding: '8px 12px',
                  borderTop: '1px solid #f0f0f0',
                }}
              >
                <span>Иванов Иван</span>
                <span>168 ч</span>
                <span>160 ч</span>
                <span>21</span>
              </div>
            </div>
          </Card>
        </div>

        <Paragraph>Вверху расположена форма с фильтрами:</Paragraph>
        <ul>
          <li>
            <Text strong>Сотрудник</Text> — выпадающий список со всеми пользователями
            системы (ФИО или e-mail). Позволяет сузить статистику до одного человека.
          </li>
          <li>
            <Text strong>Рабочее место</Text> — список рабочих мест, которые реально
            встречаются в строках статистики за выбранный период. Удобно смотреть
            нагрузку только по одному объекту.
          </li>
          <li>
            <Text strong>Статус</Text> — фильтр по статусу назначения:{' '}
            <Text code>Активно</Text> или <Text code>В архиве</Text>. Можно оставить
            пустым — тогда учитываются все.
          </li>
          <li>
            <Text strong>Период</Text> — <Text code>RangePicker</Text> с датами «с» и
            «по». По умолчанию подставляется текущий месяц (с начала и до конца).
          </li>
          <li>
            <Text strong>Тип смены</Text> — мультивыбор по{' '}
            <Text code>ShiftKind</Text>:
            <ul>
              <li>Обычная смена (DEFAULT);</li>
              <li>Офис (OFFICE);</li>
              <li>Удалёнка (REMOTE);</li>
              <li>Выходной / Day off (DAY_OFF).</li>
            </ul>
            Если ничего не выбрано — учитываются все типы смен.
          </li>
        </ul>
        <Paragraph>
          При изменении любого фильтра таблица автоматически пересчитывается под новые
          условия (с запросом к API по дате / сотруднику / рабочему месту, а статус и тип
          смены фильтруются на фронте).
        </Paragraph>

        <Title level={4}>Таблица сотрудников</Title>
        <Paragraph>
          Основной блок страницы — таблица по сотрудникам. Каждая строка соответствует
          одному пользователю.
        </Paragraph>

        <Paragraph>Колонки таблицы:</Paragraph>
        <ul>
          <li>
            <Text strong>Сотрудник</Text> — ФИО или e-mail сотрудника. Это{' '}
            <Text strong>ссылка</Text>: при клике открывается модальное окно{' '}
            <Text strong>«Детализация по сотруднику»</Text>.
          </li>
          <li>
            <Text strong>Назначения</Text> — текстовое резюме по рабочим местам и
            датам за выбранный период. Формат:
            <br />
            <Text code>«Название рабочего места DD.MM.YYYY–DD.MM.YYYY; …»</Text>
            <br />
            Если у сотрудника несколько рабочих мест или несвязные диапазоны — они
            перечисляются через «;».
          </li>
          <li>
            <Text strong>Рабочих дней</Text> — количество уникальных календарных дней,
            в которые у сотрудника была хотя бы одна смена за выбранный период.
          </li>
          <li>
            <Text strong>Количество часов</Text> — суммарная длительность всех смен
            (по <Text code>AssignmentShift</Text>) за период. Значение считается в
            часах, приводится к двум знакам после запятой, например{' '}
            <Text code>56.75</Text>.
          </li>
          <li>
            <Text strong>Количество отчётных часов</Text> — сумма часов из{' '}
            <Text code>WorkReport</Text> за тот же период.
            <ul>
              <li>
                Если по сотруднику есть отчёты, значение показывается как{' '}
                <Text strong>ссылка</Text>.
              </li>
              <li>
                При клике открывается календарь с отчётными часами по дням (см. ниже).
              </li>
              <li>
                Если отчётов нет — отображается <Text code>—</Text>.
              </li>
            </ul>
          </li>
        </ul>

        <Title level={4}>Детализация по сотруднику (модалка по клику на имя)</Title>
        <Paragraph>
          Клик по имени сотрудника в таблице открывает модальное окно{' '}
          <Text strong>«Детализация по сотруднику»</Text>.
        </Paragraph>
        <Paragraph>Внутри — таблица всех смен этого сотрудника за период:</Paragraph>
        <ul>
          <li>
            <Text strong>Дата</Text> — дата смены, по фактическому{' '}
            <Text code>startsAt</Text>, формат <Text code>DD.MM.YYYY</Text>.
          </li>
          <li>
            <Text strong>Рабочее место</Text> — название рабочего места (если нет —
            пустая строка).
          </li>
          <li>
            <Text strong>Тип смены</Text> — человеко-читаемое название по{' '}
            <Text code>ShiftKind</Text> (Обычная смена / Офис / Удалёнка /
            Выходной).
          </li>
          <li>
            <Text strong>Время</Text> — интервал вида{' '}
            <Text code>HH:mm → HH:mm</Text> по <Text code>startsAt</Text> и{' '}
            <Text code>endsAt</Text>.
          </li>
          <li>
            <Text strong>Статус назначения</Text> — «Активно» или «В архиве»,
            исходя из <Text code>assignmentStatus</Text>.
          </li>
          <li>
            <Text strong>Часы</Text> — длительность смены в часах. Значение так же
            округлено до двух знаков.
          </li>
        </ul>
        <Paragraph>
          Внутри модалки строки отсортированы так, чтобы сверху были активные
          назначения, а в рамках одного статуса — раньше по дате и времени.
        </Paragraph>

        <Title level={4}>
          Календарь отчётных часов (по клику на «Количество отчётных часов»)
        </Title>
        <Paragraph>
          Клик по числу в колонке <Text strong>«Количество отчётных часов»</Text>{' '}
          открывает отдельную модалку с календарём.
        </Paragraph>
        <Paragraph>Как это выглядит и работает:</Paragraph>
        <ul>
          <li>
            Заголовок модалки: <Text code>«Отчётные часы: ФИО»</Text> (если ФИО есть) или
            просто «Отчётные часы».
          </li>
          <li>
            Внутри — компактный календарь (<Text code>fullscreen = false</Text>), где
            каждая ячейка — день.
          </li>
          <li>
            Для каждого дня, по которому есть записи <Text code>WorkReport</Text>, под
            числом дня показывается количество часов, например{' '}
            <Text code>«8 ч»</Text>.
          </li>
          <li>
            Дни <Text strong>вне выбранного периода</Text> (левее/правее выбранного
            Date Range) визуально «приглушены» (пониженная прозрачность), но при этом
            календарь всё равно остаётся целостным.
          </li>
          <li>
            Если отчётных часов за период нет — в модалке показывается текст{' '}
            <Text code>«Нет отчётных часов за выбранный период.»</Text>.
          </li>
        </ul>

        <Paragraph>
          Этот календарь позволяет быстро визуально оценить, по каким дням человек
          сдавал отчёты и сколько часов по факту поставил, без копания в таблицах.
        </Paragraph>

        <Title level={4}>Связка «часы по сменам» и «отчётные часы»</Title>
        <Paragraph>
          Важно понимать разницу между двумя типами часов в статистике:
        </Paragraph>
        <ul>
          <li>
            <Text strong>Количество часов</Text> — считается по сменам (
            <Text code>AssignmentShift</Text>): это «план», или то, что было
            запланировано и проведено в графике.
          </li>
          <li>
            <Text strong>Количество отчётных часов</Text> — сумма из{' '}
            <Text code>WorkReport</Text>, то есть то, что сам сотрудник внёс как факт.
          </li>
        </ul>
        <Paragraph>
          Сравнение этих двух колонок позволяет видеть расхождения между планом и
          фактом и оперативно разбираться, где не сходятся часы.
        </Paragraph>
      </>
    ),
    screenshotNote:
      '1) Скрин общей таблицы статистики (сотрудники, назначение, рабочие дни, часы и кликабельные отчётные часы). 2) Скрин модалки «Детализация по сотруднику». 3) Скрин модалки с календарём отчётных часов по сотруднику.',
  },
  {
    key: 'faq',
    menuLabel: '9. Частые сценарии (FAQ)',
    title: 'Частые сценарии (FAQ)',
    description:
      'Набор типичных сценариев работы в Grant Thornton CRM: от назначения сотрудника до проверки отчётных часов и работы с запросами.',
    body: (
      <>
        <Paragraph>
          Ниже собраны типичные сценарии, которые чаще всего возникают в работе. Этот
          список можно дополнять по мере эксплуатации системы.
        </Paragraph>

        <Title level={4}>Сценарий 1. Как назначить сотрудника на рабочее место</Title>
        <ol>
          <li>Перейти в раздел <Text strong>«Планировщик»</Text>.</li>
          <li>Найти сотрудника в левой части таблицы.</li>
          <li>Выбрать нужный диапазон дат по горизонтали.</li>
          <li>Создать назначение: выбрать рабочее место и тип смены.</li>
          <li>Сохранить. Смена появится в планировщике и «Моём расписании» сотрудника.</li>
        </ol>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12, marginBottom: 24 }}>
          <Card
            style={{
              width: 780,
              borderRadius: 12,
              border: '1px solid #fff1b8',
              background: '#fffbe6',
            }}
            bodyStyle={{ padding: 16 }}
          >
            <Text strong>Памятка по назначению сотрудника</Text>
            <ul style={{ marginTop: 8, paddingLeft: 20, fontSize: 13 }}>
              <li>Всегда проверяйте, что у сотрудника нет другого активного назначения на эти же даты.</li>
              <li>Убедитесь, что рабочее место активно и не в архиве.</li>
              <li>После сохранения назначения откройте «Моё расписание» сотрудника и проверьте, что смены появились.</li>
            </ul>
          </Card>
        </div>


        <Title level={4}>
          Сценарий 2. Как сотруднику заполнить отчёт по отработанным часам
        </Title>
        <ol>
          <li>Сотрудник заходит в раздел <Text strong>«Моё расписание»</Text>.</li>
          <li>
            Нажимает кнопку <Text code>Заполнить отчёт</Text> в блоке «Отчёт по
            отработанным часам».
          </li>
          <li>В открывшемся календаре выбирает нужный день.</li>
          <li>Вводит фактическое количество часов.</li>
          <li>Сохраняет. Часы попадают в журнал «Отчёт по часам» и отражаются в статистике.</li>
        </ol>

        <Title level={4}>Сценарий 3. Как администратору проверить общую сводку по часам</Title>
        <ol>
          <li>Открыть раздел <Text strong>«Статистика»</Text>.</li>
          <li>Выбрать период (например, месяц).</li>
          <li>
            При необходимости указать фильтр по сотруднику или рабочему месту, чтобы
            сузить выборку.
          </li>
          <li>
            Сравнить колонки «Количество часов» и «Количество отчётных часов» — так видно
            расхождения между планом и фактом.
          </li>
        </ol>

        <Title level={4}>
          Сценарий 4. Как обработать запрос сотрудника на корректировку расписания
        </Title>
        <ol>
          <li>Перейти в раздел <Text strong>«Запросы корректировок»</Text>.</li>
          <li>Найти заявку со статусом PENDING.</li>
          <li>Открыть детали: комментарий сотрудника, желаемые даты/часы.</li>
          <li>
            При одобрении — внести изменения в планировщик/назначения и поставить статус
            APPROVED.
          </li>
          <li>При отказе — указать причину и поставить статус REJECTED.</li>
        </ol>

        <Title level={4}>Сценарий 5. Как добавить нового сотрудника в систему</Title>
        <ol>
          <li>Открыть раздел <Text strong>«Пользователи»</Text>.</li>
          <li>Нажать <Text code>Добавить пользователя</Text>.</li>
          <li>Заполнить e-mail, ФИО и выбрать роль.</li>
          <li>Сохранить и передать пользователю доступ.</li>
        </ol>

        <Title level={4}>Dev-панель</Title>
        <Paragraph>
          <Text strong>Dev-панель</Text> предназначена для технических операций (генерация
          тестовых данных, проверка интеграций и т.п.). Доступ к ней должен быть только у
          разработчика или ответственного администратора. Обычным пользователям и
          менеджерам этот раздел не обязателен.
        </Paragraph>
      </>
    ),
    screenshotNote:
      'Набор скринов с последовательностью действий по сценариям: 1) Назначение смены в планировщике. 2) Заполнение отчёта по часам. 3) Просмотр статистики. 4) Обработка запроса корректировки. 5) Создание пользователя. При желании можно оформить это как отдельные пошаговые картинки.',
  },

  {
    key: 'reference',
    menuLabel: '10. Справочник и роли',
    title: 'Справочник статусов, типов смен и доступов по ролям',
    description:
      'Краткий справочник по статусам назначений и запросов, типам смен, а также по тому, какие разделы доступны разным ролям.',
    body: (
      <>
        <Title level={4}>Статусы назначений</Title>
        <Paragraph>
          В системе используется несколько статусов назначений. Они помогают понимать,
          участвует ли назначение в текущем графике и статистике, или это уже история.
        </Paragraph>
        <ul>
          <li>
            <Text strong>ACTIVE</Text> — активное назначение. Учитывается в графиках,
            планировщике и статистике. Сотрудник видит его в разделе «Моё расписание»,
            по нему можно отправлять запросы на корректировку.
          </li>
          <li>
            <Text strong>ARCHIVED</Text> — архивное назначение. Назначение завершено и
            отображается только для истории. В планировщике и активных графиках не участвует,
            но может учитываться в статистике за прошлые периоды.
          </li>
        </ul>

        <Title level={4}>Статусы запросов</Title>
        <Paragraph>
          Для запросов на назначение и на корректировку расписания используются единые
          статусы:
        </Paragraph>
        <ul>
          <li>
            <Text strong>PENDING</Text> — запрос ожидает решения. Отображается в списке
            запросов у администратора/менеджера и может быть одобрен или отклонён.
          </li>
          <li>
            <Text strong>APPROVED</Text> — запрос одобрен. Для запросов на назначение —
            по ним обычно создаётся назначение. Для запросов корректировки — график
            приводится к предложенному сотрудником варианту.
          </li>
          <li>
            <Text strong>REJECTED</Text> — запрос отклонён. Сотрудник видит факт отклонения
            и может, при необходимости, отправить новый запрос с другими параметрами.
          </li>
        </ul>

        <Title level={4}>Типы смен (ShiftKind)</Title>
        <Paragraph>
          Для смен может задаваться тип — это помогает в статистике и при анализе занятости.
        </Paragraph>
        <ul>
          <li>
            <Text strong>DEFAULT</Text> — обычная смена без дополнительной спецификации.
          </li>
          <li>
            <Text strong>OFFICE</Text> — офисная смена (работа в офисе/на точке).
          </li>
          <li>
            <Text strong>REMOTE</Text> — удалённая смена.
          </li>
          <li>
            <Text strong>DAY_OFF</Text> — выходной/больничный день. В графике отображается,
            но при подсчёте рабочих часов учитывается по отдельным правилам (в зависимости
            от настроек статистики).
          </li>
        </ul>

        <Title level={4}>Дополнительные понятия</Title>
        <ul>
          <li>
            <Text strong>Корзина назначений</Text> — раздел, где хранятся удалённые
            назначения. Из корзины можно либо восстановить назначение, либо выгрузить
            и окончательно удалить. Используется для контроля истории и аккуратного
            удаления записи.
          </li>
          <li>
            <Text strong>Свободные сотрудники</Text> — сотрудники без активных назначений.
            Их список доступен в разделе «Назначения» и помогает быстро подобрать людей
            под новые рабочие места.
          </li>
          <li>
            <Text strong>Отчёт по часам</Text> — отдельные записи о фактически
            отработанных часах сотрудников. Эти данные используются в статистике как «факт»
            и сопоставляются с плановыми сменами из назначений.
          </li>
        </ul>

        <Title level={4}>Доступы по ролям</Title>
        <Paragraph>
          Ниже приведена упрощённая схема доступа к основным разделам в зависимости от роли.
          В конкретной инсталляции правила могут быть расширены, но базовая логика такая:
        </Paragraph>

        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 16 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #eee', padding: 8, textAlign: 'left' }}>Раздел / функция</th>
              <th style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>USER</th>
              <th style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>MANAGER</th>
              <th style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>SUPER_ADMIN</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #eee', padding: 8 }}>Пользователи</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>—</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>просмотр / ограниченное редактирование</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>полный доступ</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #eee', padding: 8 }}>Рабочие места</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>—</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>просмотр / создание назначений</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>полный доступ</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #eee', padding: 8 }}>Назначения</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>—</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>управление назначениями и запросами</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>управление назначениями и запросами</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #eee', padding: 8 }}>Планировщик</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>ограниченный доступ (через «Моё расписание», если включено)</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>полный доступ</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>полный доступ</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #eee', padding: 8 }}>Моё расписание</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>да (только своё)</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>да (при необходимости)</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>да</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #eee', padding: 8 }}>Статистика</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>личная статистика</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>общая статистика по людям и местам</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>полный доступ</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #eee', padding: 8 }}>Запросы на назначения</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>отправка запросов</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>обработка запросов</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>обработка запросов</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #eee', padding: 8 }}>Запросы корректировок</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>отправка запросов</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>обработка запросов</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>обработка запросов</td>
            </tr>
            <tr>
              <td style={{ border: '1px solid #eee', padding: 8 }}>Dev-панель</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>—</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>—</td>
              <td style={{ border: '1px solid #eee', padding: 8, textAlign: 'center' }}>да</td>
            </tr>
          </tbody>
        </table>

        <Paragraph style={{ marginTop: 24 }}>
          Этот раздел можно использовать как шпаргалку: если появляется новый сотрудник
          или менеджер, ему достаточно открыть «Справочник и роли», чтобы понять, какие
          статусные метки он увидит в интерфейсе и какие разделы ему должны быть доступны.
        </Paragraph>
      </>
    ),
    screenshotNote:
      'Рекомендуемые скрины: 1) Примеры разных статусов назначений и запросов в интерфейсе. 2) Окно выбора типа смены в модалке. 3) Скриншот таблицы доступов по ролям (можно сделать в виде отдельного изображения).',
  },
];

const InstructionsPage = () => {
  const [role] = useState<Role>('admin'); // позже можно добавить переключатель "Админ / Сотрудник"
  const [activeKey, setActiveKey] = useState<SectionKey>('overview');

  const sections = role === 'admin' ? adminSections : adminSections; // пока только админская версия
  const activeSection =
    sections.find((section) => section.key === activeKey) ?? sections[0];

  return (
    <Layout style={{ background: 'transparent', padding: 24 }}>
      <Content>
        <Card style={{ marginBottom: 16 }} bodyStyle={{ padding: 24 }}>
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Title level={3} style={{ marginBottom: 0 }}>
              Инструкция по системе «Grant Thornton CRM»
            </Title>
            <Paragraph style={{ marginBottom: 0, maxWidth: 900 }}>
              Здесь собрана документация по основным разделам системы. В левой части
              страницы выберите нужный раздел инструкции. По мере развития CRM текст можно
              дополнять, а в отмеченные блоки — вставлять скриншоты.
            </Paragraph>
          </Space>
        </Card>

        <Layout
          style={{
            background: 'transparent',
            minHeight: 400,
          }}
        >
          <Sider
            width={320}
            breakpoint="lg"
            collapsedWidth={0}
            theme="dark"
            style={{
              marginRight: 16,
              background: '#001529',
              borderRadius: 8,
              overflow: 'hidden',
              border: 'none',
            }}
          >
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.12)',
              }}
            >
              <Title
                level={5}
                style={{
                  margin: 0,
                  color: '#fff',
                }}
              >
                Разделы инструкции
              </Title>
              <Text
                style={{
                  color: 'rgba(255, 255, 255, 255, 0.65)',
                }}
              >
                Для администратора Grant Thornton CRM
              </Text>
            </div>

            <Menu
              mode="inline"
              theme="dark"
              selectedKeys={[activeSection.key]}
              onClick={(info) => setActiveKey(info.key as SectionKey)}
              items={sections.map((section) => ({
                key: section.key,
                label: section.menuLabel,
              }))}
            />
          </Sider>

          <Content>
            <Card bodyStyle={{ padding: 24 }} style={{ borderRadius: 8 }}>
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                <div>
                  <Title level={4} style={{ marginBottom: 4 }}>
                    {activeSection.title}
                  </Title>
                  <Text type="secondary">{activeSection.description}</Text>
                </div>

                <SectionNavContext.Provider value={setActiveKey}>
                  <div>{activeSection.body}</div>
                </SectionNavContext.Provider>

                {activeSection.screenshotNote && (
                  <div
                    style={{
                      marginTop: 16,
                      padding: 16,
                      borderRadius: 8,
                      border: '1px dashed #d9d9d9',
                      background: '#fafafa',
                    }}
                  >
                    <Text type="secondary">
                      {activeSection.screenshotNote}
                    </Text>
                  </div>
                )}
              </Space>
            </Card>
          </Content>
        </Layout>
      </Content>
    </Layout>
  );
};

export default InstructionsPage;