// Matchers de DOM (toBeInTheDocument, toBeRequired, ...) e limpeza entre testes.
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Node 26 traz um `localStorage` EXPERIMENTAL próprio, e ele sombreia o do
// jsdom: o getter global existe, mas devolve `undefined` enquanto o processo
// não recebe --localstorage-file. O sintoma engana — `window.localStorage`
// aparece como undefined e parece que o jsdom não carregou, quando na verdade
// ele carregou e guardou o objeto real em `_localStorage`.
//
// Sem isto, todo teste de guarda de token do cliente falha com
// "Cannot read properties of undefined (reading 'clear')" e a investigação vai
// para o lado errado. `sessionStorage` não é sombreado — só o local.
// ---------------------------------------------------------------------------
const doJsdom = (globalThis as unknown as { _localStorage?: Storage })._localStorage;
if (doJsdom && !globalThis.localStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: doJsdom,
    configurable: true,
    writable: false,
  });
}

// jsdom não implementa scrollIntoView (nem layout, de onde ele viria). A página
// de agendamento chama isso a cada passo escolhido, pra guiar o olho de quem
// está agendando — sem o stub, todo teste que seleciona um serviço morre com
// "scrollIntoView is not a function", que não tem nada a ver com o que se está
// testando. Vazio de propósito: o comportamento em si é visual e não há o que
// asserir sobre ele aqui.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    /* jsdom não tem layout; nada a fazer */
  };
}

// Sem isto, o componente de um teste continua montado no teste seguinte e as
// asserções passam a enxergar dois elementos iguais — falha confusa e que
// aparece só quando a suíte cresce.
afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// useFormState/useFormStatus vêm do react-dom que o NEXT empacota, e não do
// react-dom instalado: fora do Next eles simplesmente não existem
// ("useFormState is not a function"). Todo componente do painel que tem
// formulário depende deles.
//
// Estava duplicado em dois arquivos de teste; este é o TERCEIRO, e a regra do
// projeto é subir para um lugar comum no terceiro caso. O resto do react-dom é
// preservado com importActual — substituir o módulo inteiro quebraria o render.
// ---------------------------------------------------------------------------
vi.mock('react-dom', async (original) => {
  const real = await original<typeof import('react-dom')>();
  return {
    ...real,
    // Assinatura real: [estado, dispatch]. O estado inicial basta, porque
    // nenhum teste de componente aqui chega a submeter de verdade.
    useFormState: (_acao: unknown, inicial: unknown) => [inicial, vi.fn()],
    useFormStatus: () => ({ pending: false }),
  };
});
