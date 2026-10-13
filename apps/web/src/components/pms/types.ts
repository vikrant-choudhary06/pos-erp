export type HotelProperty = {
  id: string;
  outletId: string;
  name: string;
  businessDate: string;
  outlet: { name: string; timezone: string };
};
export type RoomType = {
  id: string;
  name: string;
  capacity: number;
  nightlyRate: string;
  taxPercent: string;
};
export type HotelRoom = {
  occupied?: boolean;
  id: string;
  number: string;
  floor: string | null;
  status: 'READY' | 'DIRTY' | 'CLEANING' | 'MAINTENANCE';
  note: string | null;
  roomType: RoomType;
};
export type Reservation = {
  id: string;
  arrival: string;
  departure: string;
  guests: number;
  nightlyRate: string;
  taxPercent: string;
  status: 'RESERVED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';
  allowRoomCharges: boolean;
  room: HotelRoom;
  guest: { name: string; phone: string; email: string | null };
};
export type Folio = Reservation & {
  balance: number;
  checkoutBalance: number;
  estimatedBalance: number;
  entries: {
    id: string;
    kind: string;
    description: string;
    amount: string;
    taxAmount: string;
    createdAt: string;
    method: string | null;
    reference: string | null;
  }[];
};
export const reservationLabels: Record<Reservation['status'], string> = {
  RESERVED: 'Reserved',
  CHECKED_IN: 'Checked in',
  CHECKED_OUT: 'Checked out',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};
export const roomLabels: Record<HotelRoom['status'], string> = {
  READY: 'Ready',
  DIRTY: 'Needs cleaning',
  CLEANING: 'Cleaning',
  MAINTENANCE: 'Maintenance',
};
