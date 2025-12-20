import { useEffect, useMemo, useState } from 'react';
import { Calendar, InputNumber, Modal, Spin, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

const { Text } = Typography;

export type WorkReportCalendarDay = {
  /** Дата в формате YYYY-MM-DD */
  date: string;
  /** Сколько часов уже сохранено (если null — ещё не заполняли) */
  hours: number | null;
  /** Есть ли на эту дату назначение — подсвечиваем в календаре */
  hasAssignment?: boolean;
};

type WorkReportCalendarModalProps = {
  /** Открыта ли модалка */
  open: boolean;
  /** Закрытие модалки */
  onClose: () => void;

  /**
   * Данные по дням для текущего месяца.
   * Можно смело передавать список по месяцу, компонент сам превратит в map.
   */
  days: WorkReportCalendarDay[];

  /**
   * Лоадер снаружи — если ты подгружаешь данные для месяца асинхронно.
   * Тогда при true показывается спиннер вместо календаря.
   */
  loading?: boolean;

  /**
   * Сохранение часов для конкретного дня.
   * Сюда ты вешаешь запрос на бэк: create/update отчёта.
   * Компонент сам ждёт Promise и крутит спиннер на кнопке ОК.
   */
  onSaveDay: (date: string, hours: number | null) => Promise<void> | void;

  /**
   * Коллбек при переключении месяца в календаре.
   * Можно подгружать отчёты/назначения только для нужного месяца.
   */
  onMonthChange?: (from: string, to: string) => void;
};

type InternalDayMap = Record<string, WorkReportCalendarDay>;

export const WorkReportCalendarModal = ({
  open,
  onClose,
  days,
  loading = false,
  onSaveDay,
  onMonthChange,
}: WorkReportCalendarModalProps) => {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const [selectedDate, setSelectedDate] = useState<Dayjs>(dayjs());
  const [selectedHours, setSelectedHours] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // map для быстрого доступа по дате
  const dayMap: InternalDayMap = useMemo(() => {
    const map: InternalDayMap = {};
    for (const d of days) {
      map[d.date] = d;
    }
    return map;
  }, [days]);

  // когда открываем модалку или прилетают новые дни — ставим выбранную дату / часы
  useEffect(() => {
    if (!open) return;

    const todayKey = dayjs().format('YYYY-MM-DD');
    const today = dayMap[todayKey];

    if (today) {
      setSelectedDate(dayjs(todayKey));
      setSelectedHours(today.hours ?? null);
    } else {
      // если на сегодня нет данных — берём первую доступную дату из props
      const first = days[0];
      if (first) {
        setSelectedDate(dayjs(first.date));
        setSelectedHours(first.hours ?? null);
        setCurrentMonth(dayjs(first.date).startOf('month'));
      } else {
        // вообще ничего нет — просто ставим сегодня
        setSelectedDate(dayjs());
        setSelectedHours(null);
        setCurrentMonth(dayjs().startOf('month'));
      }
    }
  }, [open, dayMap, days]);

  const handleSelect = (value: Dayjs) => {
    setSelectedDate(value);
    const key = value.format('YYYY-MM-DD');
    const info = dayMap[key];
    setSelectedHours(info ? info.hours ?? null : null);
  };

  const handlePanelChange = (value: Dayjs) => {
    setCurrentMonth(value);

    if (onMonthChange) {
      const from = value.startOf('month').format('YYYY-MM-DD');
      const to = value.endOf('month').format('YYYY-MM-DD');
      onMonthChange(from, to);
    }
  };

  const handleSave = async () => {
    const dateKey = selectedDate.format('YYYY-MM-DD');

    // можно разрешить 0 часов, поэтому проверяем именно на null
    if (selectedHours === null) {
      // никаких сообщений внутри — ты можешь сам повесить в родителе
      // здесь просто не даём отправить пустое значение
      return;
    }

    try {
      setSaving(true);
      await onSaveDay(dateKey, selectedHours);
    } finally {
      setSaving(false);
    }
  };

  const dateCellRender = (value: Dayjs) => {
    const key = value.format('YYYY-MM-DD');
    const info = dayMap[key];

    if (!info) return null;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {info.hasAssignment && (
          <Tag color="processing" style={{ marginRight: 0 }}>
            Назначение
          </Tag>
        )}
        {info.hours != null && (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {info.hours} ч
          </Text>
        )}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      onOk={handleSave}
      okText="Сохранить"
      confirmLoading={saving}
      width={900}
      title="Отчёт по отработанным часам"
      destroyOnClose
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 32 }}>
          <Spin />
        </div>
      ) : (
        <>
          <p>
            Выберите дату в календаре и укажите количество фактически
            отработанных часов. Дни с назначениями подсвечены меткой{' '}
            <Tag color="processing" style={{ margin: 0 }}>
              Назначение
            </Tag>
            .
          </p>

          <Calendar
            fullscreen={false}
            value={selectedDate}
            onSelect={handleSelect}
            onPanelChange={handlePanelChange}
            dateCellRender={dateCellRender}
          />

          <div
            style={{
              marginTop: 16,
              paddingTop: 8,
              borderTop: '1px solid #f0f0f0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div>
              <Text type="secondary">Дата:</Text>{' '}
              <Text strong>{selectedDate.format('DD.MM.YYYY')}</Text>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text>Отработано часов:</Text>
              <InputNumber
                min={0}
                max={24}
                value={selectedHours as number | null}
                onChange={(v) => setSelectedHours(v ?? null)}
              />
            </div>
          </div>
        </>
      )}
    </Modal>
  );
};