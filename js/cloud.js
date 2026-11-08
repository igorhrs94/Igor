/* Nosso Bolso — camada de nuvem (Supabase).
 * Expõe window.NBCloud.create(config) quando a configuração está preenchida.
 */
(function () {
  'use strict';

  const AUTH_ERRORS = [
    [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
    [/already registered|already been registered/i, 'Este e-mail já tem conta. Use “Entrar”.'],
    [/email not confirmed/i, 'Confirme seu e-mail (veja a caixa de entrada) antes de entrar.'],
    [/password should be at least|password.*(short|characters)/i, 'A senha precisa ter pelo menos 6 caracteres.'],
    [/rate limit|too many/i, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'],
    [/invalid.*email|unable to validate email/i, 'E-mail inválido.'],
    [/failed to fetch|network/i, 'Sem conexão com a nuvem. Verifique sua internet.'],
    [/same.*password|different from the old/i, 'A nova senha deve ser diferente da anterior.'],
  ];
  const friendly = (err) => {
    const msg = (err && (err.message || err.error_description)) || String(err);
    const hit = AUTH_ERRORS.find(([re]) => re.test(msg));
    return new Error(hit ? hit[1] : msg);
  };
  const check = ({ data, error }) => { if (error) throw friendly(error); return data; };

  // app (camelCase) <-> banco (snake_case)
  const txToRow = (h, t) => ({
    household_id: h, id: t.id, type: t.type, description: t.description, amount: t.amount, date: t.date,
    category_id: t.categoryId || null, paid_by: t.paidBy, split: t.split || null, to_person: t.to || null,
    note: t.note || '', created_at: Math.round(t.createdAt || 0), updated_at: new Date().toISOString(),
  });
  const txFromRow = (r) => ({
    id: r.id, type: r.type, description: r.description, amount: Number(r.amount), date: r.date,
    categoryId: r.category_id, paidBy: r.paid_by, split: r.split, to: r.to_person, note: r.note || '',
    createdAt: Number(r.created_at) || 0,
  });
  const catToRow = (h, c, i) => ({
    household_id: h, id: c.id, icon: c.icon, name: c.name, color: c.color, nature: c.nature,
    budget: Number(c.budget) || 0, position: i,
  });
  const catFromRow = (r) => ({ id: r.id, icon: r.icon, name: r.name, color: r.color, nature: r.nature, budget: Number(r.budget) || 0 });

  function create(config) {
    const client = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    let channel = null;
    const redirectTo = location.protocol.startsWith('http') ? location.origin + location.pathname : undefined;

    return {
      // ---------- Conta
      async session() { return check(await client.auth.getSession()).session; },
      onAuth(cb) { client.auth.onAuthStateChange((event, session) => setTimeout(() => cb(event, session), 0)); },
      async signIn(email, password) { return check(await client.auth.signInWithPassword({ email, password })); },
      async signUp(email, password) {
        return check(await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }));
      },
      async signOut() { this.unsubscribe(); check(await client.auth.signOut()); },
      async resetPassword(email) { return check(await client.auth.resetPasswordForEmail(email, { redirectTo })); },
      async updatePassword(password) { return check(await client.auth.updateUser({ password })); },

      // ---------- Espaço do casal
      async load() {
        const d = check(await client.rpc('get_household_data'));
        if (!d) return null;
        return {
          householdId: d.household.id,
          inviteCode: d.household.invite_code,
          settings: d.household.settings || {},
          members: d.members || [],
          categories: (d.categories || []).map(catFromRow),
          transactions: (d.transactions || []).map(txFromRow),
        };
      },
      async createHousehold(settings) { return check(await client.rpc('create_household', { p_settings: settings })); },
      async joinHousehold(code) { return check(await client.rpc('join_household', { p_code: code })); },
      async leaveHousehold() { this.unsubscribe(); return check(await client.rpc('leave_household')); },

      // ---------- Escritas
      async upsertTxs(h, txs) {
        if (txs.length) check(await client.from('transactions').upsert(txs.map((t) => txToRow(h, t))));
      },
      async deleteTx(h, id) { check(await client.from('transactions').delete().eq('household_id', h).eq('id', id)); },
      async upsertCats(h, cats, allCats) {
        const rows = cats.map((c) => catToRow(h, c, Math.max(0, allCats.indexOf(c))));
        if (rows.length) check(await client.from('categories').upsert(rows));
      },
      async deleteCat(h, id) { check(await client.from('categories').delete().eq('household_id', h).eq('id', id)); },
      async saveSettings(h, settings) { check(await client.from('households').update({ settings }).eq('id', h)); },
      async replaceAll(state) {
        check(await client.rpc('replace_household_data', {
          p_settings: state.settings,
          p_categories: state.categories.map((c, i) => catToRow(null, c, i)),
          p_transactions: state.transactions.map((t) => txToRow(null, t)),
        }));
      },

      // ---------- Tempo real: avisa quando o par altera algo
      subscribe(onChange) {
        this.unsubscribe();
        channel = client.channel('nosso-bolso');
        ['households', 'household_members', 'categories', 'transactions'].forEach((table) =>
          channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange()));
        channel.subscribe();
      },
      unsubscribe() { if (channel) { client.removeChannel(channel); channel = null; } },
    };
  }

  window.NBCloud = {
    isConfigured(cfg) { return !!(cfg && cfg.SUPABASE_URL && cfg.SUPABASE_KEY && window.supabase); },
    create,
  };
})();
