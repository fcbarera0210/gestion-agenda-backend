import { setGlobalOptions } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { availability as availabilityHandler } from './availability';
import { invalidateCacheForDocument } from './utils';

setGlobalOptions({ region: 'southamerica-east1', memory: '256MiB', minInstances: 0 });
export {
  getAppointments,
  getAppointmentsForClient,
  addAppointment,
  updateAppointment,
  deleteAppointment,
  sendConfirmationEmail,
  createBooking,
} from './appointments';
export {
  getClients,
  getClientByEmail,
  addClient,
  updateClient,
  deleteClient,
  getClientHistory,
} from './clients';
export { getServices, addService, updateService, deleteService, getServiceHistory } from './services';
export { getTimeBlocks, addTimeBlock, updateTimeBlock, deleteTimeBlock } from './timeBlocks';
export { createInvitationCode, validateAndUseCode, getPendingInvitations } from './invitations';
export { inviteNewUser, getTeamMembers, updateMemberRole, deleteTeamMember } from './team';
export { getProfessionalProfile, updateWorkSchedule, updateProfile } from './settings';

export const availability = onCall(availabilityHandler);

export { cleanAvailabilityCache } from './availabilityCacheCleanup';

export const invalidateCacheOnAppointmentWrite = onDocumentWritten(
  'appointments/{appointmentId}',
  async event => {
    await invalidateCacheForDocument(
      event.data?.after?.data() || event.data?.before?.data()
    );
  }
);

export const invalidateCacheOnTimeBlockWrite = onDocumentWritten(
  'timeBlocks/{blockId}',
  async event => {
    await invalidateCacheForDocument(
      event.data?.after?.data() || event.data?.before?.data()
    );
  }
);

