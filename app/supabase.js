// Importa a função createClient da biblioteca oficial do Supabase.
// Essa função permite criar uma conexão entre a aplicação
// e o banco de dados e os serviços do Supabase.
import { createClient } from '@supabase/supabase-js';

// Obtém a URL e a chave do projeto a partir das variáveis de ambiente.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('[Supabase] Aviso: Variáveis de ambiente NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY não configuradas.');
}

// Cria e exporta a instância do cliente Supabase.
// Utiliza fallback de placeholder neutro para evitar quebras estáticas de compilação
// caso o ambiente ainda não tenha sido injetado.
export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseKey || 'placeholder'
);