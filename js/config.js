// Multiplayer backend settings.
// - Leave supabaseUrl empty to use the local dev server (node server/dev-server.mjs).
// - For play across different Wi-Fi networks, create a free Supabase project, deploy
//   supabase/ (see README "Online multiplayer"), and paste the Project URL and the
//   public "anon" key here. The anon key is designed to be public; the secret
//   service-role key must NEVER go in this file.
export const MP_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  devApi: '', // '' = same server that serves the game
};
