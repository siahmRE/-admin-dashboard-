// Loaded AFTER config.js and the Supabase CDN script tag in every page.
// Creates one shared client, available as `window.sb`.
window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
