/* Configuração da nuvem (Supabase).
 *
 * Deixe em branco para usar o app só neste aparelho (modo local).
 * Para sincronizar entre o casal, crie um projeto gratuito em https://supabase.com
 * e copie os valores de Project Settings → API (veja o README).
 *
 * A chave pública ("publishable" ou "anon") pode ficar no código: quem protege os
 * dados são as regras de segurança criadas pelo arquivo supabase/schema.sql.
 * NUNCA coloque aqui a chave "secret" / "service_role".
 */
window.NOSSO_BOLSO_CONFIG = {
  SUPABASE_URL: '',  // ex.: 'https://abcdefghijkl.supabase.co'
  SUPABASE_KEY: '',  // ex.: 'sb_publishable_...' ou a chave 'anon' (eyJ...)
};
