import { useQuery } from '@tanstack/react-query';
import { listDevices, listUsers } from '../api/admin';
import ListScreen, { fmtDate, orDash } from './ListScreen';

export default function Devices() {
  // Same queryKey as the Users screen, so this shares one cached fetch.
  // Devices carry only a userId; an email is what an operator can act on.
  const users = useQuery({ queryKey: ['/admin/users'], queryFn: listUsers });
  const ownerOf = (userId: string) => users.data?.find((u) => u.id === userId)?.email ?? userId;

  return (
    <ListScreen
      title="Devices"
      endpoint="/admin/devices"
      query={listDevices}
      empty="No devices are registered yet — none has paired with the gateway."
      head={
        <tr>
          <th>Platform</th>
          <th>Name</th>
          <th>Owner</th>
          <th>Last seen</th>
          <th>Created</th>
        </tr>
      }
    >
      {(devices) =>
        devices.map((d) => (
          <tr key={d.id}>
            <td>{d.platform}</td>
            <td>{orDash(d.name)}</td>
            <td>{ownerOf(d.userId)}</td>
            <td>{fmtDate(d.lastSeenAt)}</td>
            <td>{fmtDate(d.createdAt)}</td>
          </tr>
        ))
      }
    </ListScreen>
  );
}
