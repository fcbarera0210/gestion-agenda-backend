import { logger } from 'firebase-functions/v2';
import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './utils';
import type { BreakPeriod, DaySchedule, Professional, Service } from './types';
import {
  addMinutes,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay
} from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

export const availability = async (
request: CallableRequest
) => {
  try {
    const { date, professionalId, serviceId } = request.data;
    logger.info('availability params', { date, professionalId, serviceId });

    if (!date || !professionalId || !serviceId) {
      throw new HttpsError(
        'invalid-argument',
        'Faltan parámetros requeridos'
      );
    }
const cacheDate = date;
    const cacheDocRef = db
      .collection('availabilityCache')
      .doc(`${professionalId}_${serviceId}_${cacheDate}`);

    const profDocRef = db.collection('professionals').doc(professionalId);
    const profDocSnap = await profDocRef.get();

    if (!profDocSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Profesional o servicio no encontrado'
      );
    }

    const professional = profDocSnap.data() as Professional;
    const professionalTimeZone =
      (professional as any).timeZone || (professional as any).timezone;

    const nowUtc = new Date();
    const nowForComparison = professionalTimeZone
? fromZonedTime(
          formatInTimeZone(
            nowUtc,
            professionalTimeZone,
            "yyyy-MM-dd'T'HH:mm:ssXXX"
          ),
          professionalTimeZone
        )
      : nowUtc;
    const currentDateInZone = professionalTimeZone
      ? formatInTimeZone(nowUtc, professionalTimeZone, 'yyyy-MM-dd')
      : nowUtc.toISOString().split('T')[0];

    const selectedDate = professionalTimeZone
      ? fromZonedTime(`${date}T00:00:00`, professionalTimeZone)
      : new Date(`${date}T00:00:00`);
    const zonedSelectedDate = professionalTimeZone
      ? toZonedTime(selectedDate, professionalTimeZone)
      : selectedDate;
const isSameDay = cacheDate === currentDateInZone;

    const cacheDoc = await cacheDocRef.get();
    if (cacheDoc.exists && !isSameDay) {
      logger.info('availability cache hit');
      const cached = cacheDoc.data();
      return cached?.slots || [];
    }

    const serviceDocRef = db.collection('services').doc(serviceId);
    const serviceDocSnap = await serviceDocRef.get();

    if (!serviceDocSnap.exists) {
      throw new HttpsError(
        'not-found',
        'Profesional o servicio no encontrado'
      );
    }

    const service = serviceDocSnap.data() as Service;
    const slotStep = service.slotStep ?? professional.slotStep ?? 15;
    const dayOfWeek = [
      'domingo',
      'lunes',
      'martes',
      'miércoles',
      'jueves',
      'viernes',
      'sábado'
    ][zonedSelectedDate.getDay()];
    const daySchedule =
      professional.workSchedule?.[dayOfWeek] as DaySchedule | undefined;

    if (!daySchedule || !daySchedule.isActive) {
      return [];
    }

    const startOfSelectedDayZoned = startOfDay(zonedSelectedDate);
    const endOfSelectedDayZoned = endOfDay(zonedSelectedDate);
    const startOfSelectedDay = professionalTimeZone
      ? fromZonedTime(startOfSelectedDayZoned, professionalTimeZone)
      : startOfSelectedDayZoned;
    const endOfSelectedDay = professionalTimeZone
      ? fromZonedTime(endOfSelectedDayZoned, professionalTimeZone)
      : endOfSelectedDayZoned;

    const appointmentsQuery = db
      .collection('appointments')
      .where('professionalId', '==', professionalId)
      .where('start', '>=', Timestamp.fromDate(startOfSelectedDay))
      .where('start', '<=', Timestamp.fromDate(endOfSelectedDay))
      .where('status', '!=', 'cancelled')
      .select('start', 'end', 'status');

    const timeBlocksQuery = db
      .collection('timeBlocks')
      .where('professionalId', '==', professionalId)
      .where('start', '>=', Timestamp.fromDate(startOfSelectedDay))
      .where('start', '<=', Timestamp.fromDate(endOfSelectedDay))
      .select('start', 'end');

    const [appointmentsSnapshot, timeBlocksSnapshot] = await Promise.all([
      appointmentsQuery.get(),
      timeBlocksQuery.get()
    ]);

    const activeAppointments = appointmentsSnapshot.docs
      .filter(d => d.data().status !== 'cancelled')
      .map(d => ({ start: d.data().start.toDate(), end: d.data().end.toDate() }));

    const existingEvents = [
      ...activeAppointments,
      ...timeBlocksSnapshot.docs.map(d => ({ start: d.data().start.toDate(), end: d.data().end.toDate() })),
      ...(daySchedule?.breaks ?? []).map(({ start, end }: BreakPeriod) => ({
        start: addMinutes(
          startOfSelectedDay,
          parseInt(start.split(':')[0]) * 60 + parseInt(start.split(':')[1])
        ),
        end: addMinutes(
          startOfSelectedDay,
          parseInt(end.split(':')[0]) * 60 + parseInt(end.split(':')[1])
        )
      }))
    ];

    existingEvents.sort((a, b) => a.start.getTime() - b.start.getTime());

    const availableSlots: Date[] = [];
    const { start, end } = daySchedule.workHours;
    const startMinutes = parseInt(start.split(':')[0]) * 60 + parseInt(start.split(':')[1]);
    const endMinutes = parseInt(end.split(':')[0]) * 60 + parseInt(end.split(':')[1]);
    let currentTime = addMinutes(startOfSelectedDay, startMinutes);
    const endTime = addMinutes(startOfSelectedDay, endMinutes);
    const serviceDuration = service.duration;
    let i = 0;
    while (isBefore(currentTime, endTime)) {
      const slotEnd = addMinutes(currentTime, serviceDuration);
      if (isAfter(slotEnd, endTime)) break;

      while (i < existingEvents.length && !isAfter(existingEvents[i].end, currentTime)) {
        i++;
      }

      let isOverlapping = false;
      for (let j = i; j < existingEvents.length; j++) {
        const event = existingEvents[j];
        if (!isBefore(event.start, slotEnd)) break;
        if (isBefore(currentTime, event.end) && isAfter(slotEnd, event.start)) {
          isOverlapping = true;
          break;
        }
      }

      const isFutureSlot =
        !isSameDay || isAfter(currentTime, nowForComparison);

      if (!isOverlapping && isFutureSlot) {
        availableSlots.push(new Date(currentTime));
      }

      currentTime = addMinutes(currentTime, slotStep);
    }

    const result = availableSlots.map(s => s.toISOString());
    logger.info('availability result', result);
    if (!isSameDay) {
      await cacheDocRef.set({
        professionalId,
        serviceId,
        date: cacheDate,
        slots: result,
        createdAt: Timestamp.now(),
      });
    }
    return result;
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      'internal',
      'Error interno del servidor'
    );
  }
};

