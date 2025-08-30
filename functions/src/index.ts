import * as functions from 'firebase-functions';
import { availability as availabilityHandler } from './availability';

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

export const availability = functions
  .region('southamerica-east1')
  .runWith({ minInstances: 1, memory: '256MB' })
  .https.onCall(availabilityHandler);

export { cleanAvailabilityCache } from './availabilityCacheCleanup';

