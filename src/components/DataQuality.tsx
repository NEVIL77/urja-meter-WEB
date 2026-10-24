import type { Repair, ReusedCode } from '../api';
import { LEVEL_LABEL } from '../format';

interface Props {
  repairs: Repair[];
  reusedCodes: ReusedCode[];
  onSelectMeter: (id: string) => void;
  onSelectPath: (path: string) => void;
}

/** What the API fixed in the portal's data, and what it could not decide. */
export function DataQuality({ repairs, reusedCodes, onSelectMeter, onSelectPath }: Props) {
  return (
    <div className="dq">
      <h3>{repairs.length} hierarchy records repaired</h3>
      <p>
        Every meter carries its own copy of its place in the network, and some copies are damaged. All meters on a
        transformer share one path, so each damaged copy was repaired from the others on the same transformer.
      </p>
      <table>
        <thead>
          <tr>
            <th>Meter</th>
            <th>Field</th>
            <th>Portal sent</th>
            <th>Used</th>
          </tr>
        </thead>
        <tbody>
          {repairs.map((r) => (
            <tr key={`${r.meterId}-${r.level}-${r.field}`}>
              <td>
                <button className="link mono" onClick={() => onSelectMeter(r.meterId)}>
                  {r.meterId}
                </button>
              </td>
              <td>
                {LEVEL_LABEL[r.level]} {r.field}
              </td>
              <td className={r.portalValue ? 'was' : 'blank'}>{r.portalValue || 'blank'}</td>
              <td>{r.resolvedTo}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>{reusedCodes.length} codes used under more than one parent</h3>
      <p>
        A feeder should hang off one substation, yet the portal files the same codes in different branches. Whether that
        means codes are only unique within their parent, or the data is wrong, the portal cannot say, so the tree keys
        each node by its full path instead.
      </p>
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Appears under</th>
          </tr>
        </thead>
        <tbody>
          {reusedCodes.map((c) => (
            <tr key={`${c.level}-${c.code}`}>
              <td>
                <span className="mono">{c.code}</span>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {LEVEL_LABEL[c.level]}
                </div>
              </td>
              <td>
                {c.parents.map((p) => (
                  <div key={p}>
                    <button className="link mono" style={{ fontSize: 12.5 }} onClick={() => onSelectPath(`${p}/${c.code}`)}>
                      {p}
                    </button>
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
