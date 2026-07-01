import { redirect } from 'next/navigation';
import { getMe, listVerticais } from '@/lib/panel-api';
import { OnboardingWizard } from './OnboardingWizard';

export const dynamic = 'force-dynamic';

// Onboarding "qual é o seu negócio?" (Fase 3b). Fica FORA do route group (app)
// pra não herdar o gate de layout (evita loop de redirect). Exige sessão.
export default async function OnboardingPage() {
  const me = await getMe();
  if (!me) redirect('/painel/login');
  // Já passou pelo onboarding: não repete.
  if (me.business.onboardedAt) redirect('/painel');

  const { verticais, skins } = await listVerticais();

  return (
    <OnboardingWizard
      ownerName={me.owner.name}
      business={me.business}
      verticais={verticais}
      skins={skins}
    />
  );
}
