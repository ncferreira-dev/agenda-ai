export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

export interface Professional {
  id: string;
  name: string;
  photoUrl: string | null;
  serviceIds: string[];
}

export interface BusinessPage {
  business: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    maxAdvanceDays: number;
    address: string | null;
    serviceMode: 'PRESENCIAL' | 'REMOTO' | 'HIBRIDO';
    meetingUrl: string | null;
    closedWeekdays: number[]; // dias fechados por bloqueio recorrente do negócio (0=dom … 6=sáb)
    // Branding (Nível 1) — opcionais.
    logoUrl: string | null;
    coverUrl: string | null;
    accentColor: string | null;
    about: string | null;
    instagramUrl: string | null;
    themePreset: string | null; // pele visual: clean | bold | suave
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

export interface MyAppointment {
  id: string;
  service: string;
  professional: string;
  startAt: string;
  status: string;
}

export interface BookingResult {
  id: string;
  service: string;
  professional: string;
  startAt: string;
}
