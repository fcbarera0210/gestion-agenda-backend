import * as functions from 'firebase-functions';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { BreakPeriod, DaySchedule, Professional, Service } from '../src/types';
import {
  setHours,
  setMinutes,
  addMinutes,
  isBefore,
  isAfter,
  startOfDay,
  endOfDay
} from 'date-fns';

initializeApp();
const db = getFirestore();

export const availability = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const { date, professionalId, serviceId } = req.body;

    if (!date || !professionalId || !serviceId) {
      res.status(400).send('Faltan parámetros requeridos');
      return;
    }

    const selectedDate = new Date(date);
    const dayOfWeek = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][selectedDate.getDay()];

    const profDocRef = db.collection('professionals').doc(professionalId);
    const serviceDocRef = db.collection('services').doc(serviceId);
    const [profDocSnap, serviceDocSnap] = await Promise.all([profDocRef.get(), serviceDocRef.get()]);

    if (!profDocSnap.exists || !serviceDocSnap.exists) {
      res.status(404).send('Profesional o servicio no encontrado');
      return;
    }

    const professional = profDocSnap.data() as Professional;
    const service = serviceDocSnap.data() as Service;
    const daySchedule = professional.workSchedule?.[dayOfWeek] as DaySchedule | undefined;

    if (!daySchedule || !daySchedule.isActive) {
      res.status(200).json([]);
      return;
    }

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

      const isFutureSlot = isAfter(currentTime, new Date());

      if (!isOverlapping && isFutureSlot) {
        availableSlots.push(new Date(currentTime));
      }

      currentTime = addMinutes(currentTime, 15);
    }

    res.status(200).json(availableSlots);
  } catch (error) {
    console.error('Error calculating availability:', error);
    res.status(500).send('Error interno del servidor');
  }
});

