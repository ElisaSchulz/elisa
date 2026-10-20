// Configuração do site. Este arquivo é público: só coloque aqui dados que podem ser vistos por qualquer pessoa.
// A chave "anon" do Supabase foi feita para ficar no navegador. Quem protege os dados são as regras (RLS)
// definidas em supabase/schema.sql. NUNCA coloque aqui a chave "service_role".

export const CONFIG = {
  // Supabase: Project Settings > API
  SUPABASE_URL: '',       // ex.: 'https://abcdefgh.supabase.co'
  SUPABASE_ANON_KEY: '',  // a chave "anon public"

  // Instagram: deixe vazio enquanto o perfil não estiver pronto (os botões ficam escondidos)
  INSTAGRAM_HANDLE: '',   // ex.: 'elisaschulz' (sem @)
};

// Conteúdos mostrados quando o Supabase ainda não está configurado (ou fica fora do ar).
// Depois de configurado, os conteúdos passam a vir da tabela "conteudos", editável pela área logada.
export const CONTEUDOS_PADRAO = [
  {
    titulo: 'Os papers que mudaram o seu dinheiro',
    descricao: 'Dez artigos acadêmicos que transformaram a forma como o mundo investe, explicados em uma página cada. Sem fórmulas, com exemplos do dia a dia.',
    tipo: 'ebook',
    arquivo_url: 'conteudos/os-papers-que-mudaram-o-seu-dinheiro.pdf',
    capa_url: 'assets/img/capa-papers.png',
    cor: 'terracota',
    destaque: true,
  },
];

export const supabaseConfigurado = () => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
