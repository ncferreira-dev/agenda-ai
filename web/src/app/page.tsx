import { redirect } from 'next/navigation';

// Raiz do site: a splash de boas-vindas mora em /painel/login (junto com o
// formulário, na mesma tela). Redirect no servidor — não depende de JS.
export default function Home() {
  redirect('/painel/login');
}
