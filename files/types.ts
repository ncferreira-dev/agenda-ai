export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface Professional {
  id: string;
  name: string;
  serviceIds: string[];
}

export interface BusinessPage {
  business: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    maxAdvanceDays: number;
  };
  services: Service[];
  professionals: Professional[];
}

export interface Slot {
  startAt: string; // ISO
  label: string; // "14:30"
}

export interface ProfessionalAvailability {
  professionalId: string;
  professionalName: string;
  slots: Slot[];
}

export interface BookingResult {
  id: string;
  service: string;
  professional: string;
  startAt: string;
}
