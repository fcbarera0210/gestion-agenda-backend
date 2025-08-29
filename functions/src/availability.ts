import * as functions from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { db } from './utils';
import type { BreakPeriod, DaySchedule, Professional, Service } from './types';
import {
  setHours,
  setMinutes,
  addMinutes,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay
} from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

export const availability = functions.https.onCall(async request => {
  try {
    const { date, professionalId, serviceId } = request.data;
    functions.logger.info('availability params', { date, professionalId, serviceId });

    if (!date || !professionalId || !serviceId) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Faltan parámetros requeridos'
      );
    }

    const selectedDate = new Date(date);
    const dayOfWeek = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][selectedDate.getDay()];

    const profDocRef = db.collection('professionals').doc(professionalId);
    const serviceDocRef = db.collection('services').doc(serviceId);
    const [profDocSnap, serviceDocSnap] = await Promise.all([profDocRef.get(), serviceDocRef.get()]);

    if (!profDocSnap.exists || !serviceDocSnap.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'Profesional o servicio no encontrado'
      );
    }

    const professional = profDocSnap.data() as Professional;
    const service = serviceDocSnap.data() as Service;
    const daySchedule = professional.workSchedule?.[dayOfWeek] as DaySchedule | undefined;

    if (!daySchedule || !daySchedule.isActive) {
      return [];
    }

    const professionalTimeZone =
      (professional as any).timeZone || (professional as any).timezone;
    const now = professionalTimeZone
      ? toZonedTime(new Date(), professionalTimeZone)
      : new Date();
    const isSameDay = selectedDate.toDateString() === now.toDateString();

    const startOfSelectedDay = startOfDay(selectedDate);
    const endOfSelectedDay = endOfDay(selectedDate);

    const appointmentsQuery = db
      .collection('appointments')
      .where('professionalId', '==', professionalId)
      .where('start', '>=', Timestamp.fromDate(startOfSelectedDay))
      .where('start', '<=', Timestamp.fromDate(endOfSelectedDay));

    const timeBlocksQuery = db
      .collection('timeBlocks')
      .where('professionalId', '==', professionalId)
      .where('start', '>=', Timestamp.fromDate(startOfSelectedDay))
      .where('start', '<=', Timestamp.fromDate(endOfSelectedDay));

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
        start: setMinutes(
          setHours(startOfSelectedDay, parseInt(start.split(':')[0])),
          parseInt(start.split(':')[1])
        ),
        end: setMinutes(
          setHours(startOfSelectedDay, parseInt(end.split(':')[0])),
          parseInt(end.split(':')[1])
        )
      }))
    ];

    const availableSlots: Date[] = [];
    const { start, end } = daySchedule.workHours;
    let currentTime = setMinutes(setHours(startOfSelectedDay, parseInt(start.split(':')[0])), parseInt(start.split(':')[1]));
    const endTime = setMinutes(setHours(startOfSelectedDay, parseInt(end.split(':')[0])), parseInt(end.split(':')[1]));
    const serviceDuration = service.duration;

    while (isBefore(currentTime, endTime)) {
      const slotEnd = addMinutes(currentTime, serviceDuration);
      if (isAfter(slotEnd, endTime)) break;

      const isOverlapping = existingEvents.some(event =>
        isBefore(currentTime, event.end) && isAfter(slotEnd, event.start)
      );

      const isFutureSlot = !isSameDay || isAfter(currentTime, now);

      if (!isOverlapping && isFutureSlot) {
        availableSlots.push(new Date(currentTime));
      }

      currentTime = addMinutes(currentTime, 15);
    }

    const result = availableSlots.map(s => s.toISOString());
    functions.logger.info('availability result', result);
    return result;
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError(
      'internal',
      'Error interno del servidor'
    );
  }
});

