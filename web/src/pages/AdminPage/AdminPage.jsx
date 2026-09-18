import { useCallback, useState } from 'react';
import { getUsers, createUser, updateUser, deleteUser, getArtists } from '../../api/endpoints.js';
import { useAuth } from '../../auth/useAuth.js';
import { useBrand } from '../../brand/BrandContext.jsx';
import { useApiQuery } from '../../hooks/useApiQuery.js';
import { Section } from '../../components/primitives/Section.jsx';
import { DataTable } from '../../components/primitives/DataTable.jsx';
import { Badge } from '../../components/primitives/Badge.jsx';
import { Button } from '../../components/primitives/Button.jsx';
import { ConfirmAction } from '../../components/primitives/ConfirmAction.jsx';
import { TextInput, SelectInput, CheckGroup } from '../../components/primitives/Field.jsx';
import { LoadingScreen } from '../../components/primitives/LoadingScreen.jsx';
import { ErrorState } from '../../components/primitives/ErrorState.jsx';
import { CommandConsole } from '../../components/ai/CommandConsole.jsx';
import { ExportControls } from '../../components/reports/ExportControls.jsx';
import styles from './AdminPage.module.css';

/**
 * Team management (legacy `AdminView`).
 *
 * The grantable keys are the 8 nav permissions from PHASE_4A_HANDOFF.md §10 — the legacy
 * `ALL_PAGES` list had only 5 because the other three views were orphaned out of navigation.
 * `all` is not grantable here: it is what an admin already has.
 *
 * pageAccess is NAV VISIBILITY ONLY. The server authorizes every request on its own, so a
 * grant here can never widen what an account is actually allowed to do.
 */
const GRANTABLE = ['overview', 'roster', 'anr_room', 'ai_lab', 'marketing', 'fans', 'operations', 'admin'];
const ROLES = ['admin', 'artist', 'viewer'];
const BLANK = { id: null, name: '', email: '', password: '', role: 'viewer', artistAccess: 'none', pageAccess: ['overview'] };

export function AdminPage() {
  const { token, user } = useAuth();
  const { text, formatters } = useBrand();

  const usersQuery = useCallback(({ signal }) => getUsers(token, { signal }), [token]);
  const { data, loading, error, refetch } = useApiQuery(usersQuery);
  const rosterQuery = useCallback(({ signal }) => getArtists(token, { signal }), [token]);
  const { data: roster } = useApiQuery(rosterQuery);

  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [rowError, setRowError] = useState(null);

  if (loading && !data) return <LoadingScreen />;
  if (error && !data) return <ErrorState variant="fullscreen" message={error.message} status={error.status} onRetry={refetch} />;

  const users = Array.isArray(data) ? data : [];
  const editing = form.id !== null;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      if (editing) {
        const payload = { name: form.name, role: form.role, artistAccess: form.artistAccess, pageAccess: form.pageAccess };
        // An empty field means "leave the password alone", so it is omitted rather than sent blank.
        if (form.password) payload.password = form.password;
        await updateUser(token, form.id, payload);
      } else {
        await createUser(token, {
          email: form.email,
          password: form.password,
          name: form.name,
          role: form.role,
          artistAccess: form.artistAccess,
          pageAccess: form.pageAccess,
        });
      }
      setForm(BLANK);
      refetch();
    } catch (failure) {
      setFormError(failure);
    } finally {
      setBusy(false);
    }
  }

  async function remove(target) {
    setRowError(null);
    try {
      await deleteUser(token, target.id);
      if (form.id === target.id) setForm(BLANK);
      refetch();
    } catch (failure) {
      setRowError(failure);
    }
  }

  const columns = [
    { key: 'name', header: text.adminColName },
    { key: 'email', header: text.adminColEmail, mono: true },
    { key: 'role', header: text.adminColRole, render: (row) => <Badge tone={row.role === 'admin' ? 'accent' : 'neutral'}>{row.role}</Badge> },
    {
      key: 'pageAccess', header: text.adminColAccess,
      render: (row) => (
        <span className={styles.grants}>
          {(row.pageAccess ?? []).length === 0
            ? <span className={styles.muted}>{formatters.dash}</span>
            : row.pageAccess.map((perm) => <Badge key={perm} tone={perm === 'all' ? 'accent' : 'muted'}>{perm}</Badge>)}
        </span>
      ),
    },
    {
      key: 'actions', header: '', align: 'right',
      render: (row) => (
        <span className={styles.rowActions}>
          <Button onClick={() => setForm({ ...BLANK, ...row, password: '', pageAccess: row.pageAccess ?? [] })}>{text.adminEdit}</Button>
          {/* The server refuses self-deletion on one of its two delete handlers only; the UI
              never offers it, and the server stays the authority either way. */}
          {row.email !== user?.email && (
            <ConfirmAction label={text.remove} prompt={text.adminDeleteConfirm} onConfirm={() => remove(row)} />
          )}
        </span>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <CommandConsole artists={roster?.artists ?? []} compact />

      <Section title={text.adminTeam} note={`${users.length}`} actions={<ExportControls />}>
        {rowError && <ErrorState variant="panel" message={rowError.message} status={rowError.status} />}
        <DataTable columns={columns} rows={users} rowKey={(row) => row.id} />
      </Section>

      <Section title={editing ? text.adminEditTitle : text.adminCreateTitle} actions={editing ? <Button onClick={() => setForm(BLANK)}>{text.cancel}</Button> : null}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.fields}>
            <TextInput label={text.adminName} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            <TextInput
              label={text.adminEmail}
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
              disabled={editing}
            />
            <TextInput
              label={editing ? text.adminPasswordKeep : text.adminPassword}
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required={!editing}
              minLength={editing ? undefined : 8}
            />
            <SelectInput
              label={text.adminRole}
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              options={ROLES.map((value) => ({ value, label: value.toUpperCase() }))}
            />
            <SelectInput
              label={text.adminArtistAccess}
              value={form.artistAccess}
              onChange={(event) => setForm({ ...form, artistAccess: event.target.value })}
              options={[
                { value: 'none', label: 'NONE' },
                { value: 'all', label: 'ALL' },
                ...(roster?.artists ?? []).map((artist) => ({ value: artist.id, label: artist.name })),
              ]}
            />
          </div>

          <CheckGroup
            label={text.adminPermissions}
            hint={text.adminPermissionsNote}
            options={GRANTABLE.map((value) => ({ value, label: value }))}
            value={form.pageAccess}
            onChange={(pageAccess) => setForm({ ...form, pageAccess })}
          />

          {formError && <ErrorState variant="panel" message={formError.message} status={formError.status} />}
          <div>
            <Button type="submit" variant="primary" busy={busy}>{editing ? text.update : text.create}</Button>
          </div>
        </form>
      </Section>
    </div>
  );
}
