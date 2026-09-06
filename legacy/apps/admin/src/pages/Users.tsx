import { listUsers } from '../api/admin';
import ListScreen, { fmtDate, orDash } from './ListScreen';

export default function Users() {
  return (
    <ListScreen
      title="Users"
      endpoint="/api/admin/users"
      query={listUsers}
      empty="No users have registered yet."
      head={
        <tr>
          <th>Email</th>
          <th>Display name</th>
          <th>Role</th>
          <th>Status</th>
          <th>Created</th>
          <th>Last login</th>
        </tr>
      }
    >
      {(users) =>
        users.map((u) => (
          <tr key={u.id}>
            <td>{u.email}</td>
            <td>{orDash(u.displayName)}</td>
            <td>{u.role}</td>
            <td>
              <span className={`pill pill-${u.status}`}>{u.status}</span>
            </td>
            <td>{fmtDate(u.createdAt)}</td>
            <td>{fmtDate(u.lastLoginAt)}</td>
          </tr>
        ))
      }
    </ListScreen>
  );
}
