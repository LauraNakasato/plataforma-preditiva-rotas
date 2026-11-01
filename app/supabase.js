import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dzhfqsftxdkauwgrxgdf.supabase.co';
const supabaseKey = 'sb_publishable_ZBEoCCMdz62UE_6HQEGQPg_93RWIrvR';

export const supabase = createClient(supabaseUrl, supabaseKey);