// Importa a função createClient da biblioteca oficial do Supabase.
// Essa função permite criar uma conexão entre a aplicação
// e o banco de dados e os serviços do Supabase.
import { createClient } from '@supabase/supabase-js';

// Armazena a URL do projeto no Supabase.
// Ela identifica qual projeto será acessado pela aplicação.
const supabaseUrl = 'https://dzhfqsftxdkauwgrxgdf.supabase.co';

// Armazena a chave pública (publishable key) do projeto.
// Essa chave permite que a aplicação se conecte ao Supabase.
// As permissões de acesso aos dados devem ser controladas
// pelas políticas de segurança configuradas no banco de dados (RLS).
const supabaseKey = 'sb_publishable_ZBEoCCMdz62UE_6HQEGQPg_93RWIrvR';

// Cria e exporta a instância do cliente Supabase.
// Assim, outros arquivos do projeto podem importar essa instância
// para consultar, inserir, atualizar ou excluir dados do banco.
export const supabase = createClient(supabaseUrl, supabaseKey);