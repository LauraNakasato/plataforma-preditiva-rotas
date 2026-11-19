// Importa a função createClient da biblioteca oficial do Supabase.
// Essa função permite criar uma conexão entre a aplicação
// e o banco de dados e os serviços do Supabase.
import { createClient } from '@supabase/supabase-js';

// Armazena a URL do projeto no Supabase.
// Ela identifica qual projeto será acessado pela aplicação.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://dzhfqsftxdkauwgrxgdf.supabase.co';

// Armazena a chave de acesso do projeto.
// Prioriza a chave administrativa service_role (no servidor) se disponível,
// ou a chave pública/anon.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || 'sb_publishable_ZBEoCCMdz62UE_6HQEGQPg_93RWIrvR';

// Cria e exporta a instância do cliente Supabase.
// Assim, outros arquivos do projeto podem importar essa instância
// para consultar, inserir, atualizar ou excluir dados do banco.
export const supabase = createClient(supabaseUrl, supabaseKey);